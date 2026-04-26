import type { Editor, TLShape, TLShapeId } from 'tldraw';
import { getSvgAsImage } from 'tldraw';

/**
 * Build a PNG data URL from the *new* shapes added between two store
 * snapshots. Used by the eyes-closed handle so each hold captures only the
 * strokes the creator drew during that hold — not the seeded artboards or
 * earlier sketches.
 *
 * Returns an empty string when there's nothing to snapshot (no new shapes,
 * editor unavailable, or export failed). The caller treats empty-string as
 * "no sketch" and falls back to voice-only intent.
 */
export interface SketchSnapshotOptions {
  /** Max output width in pixels. Capped to keep the dispatch payload small. */
  maxWidth?: number;
  /** Max output height in pixels. Same rationale. */
  maxHeight?: number;
  /** Optional explicit shape ids to include — overrides delta computation. */
  shapeIds?: ReadonlyArray<TLShapeId>;
}

const DEFAULT_MAX_WIDTH = 1024;
const DEFAULT_MAX_HEIGHT = 1024;

export interface SketchSnapshotTracker {
  /** Snapshot the set of shape ids on the page right now. */
  start(): void;
  /** Take a snapshot of shapes added since the last `start()`. */
  capture(options?: SketchSnapshotOptions): Promise<string>;
}

export function createSketchSnapshotTracker(
  getEditor: () => Editor | null | undefined
): SketchSnapshotTracker {
  let baseline: Set<TLShapeId> = new Set();

  return {
    start() {
      const editor = getEditor();
      if (!editor) {
        baseline = new Set();
        return;
      }
      baseline = new Set(
        editor.getCurrentPageShapes().map((s: TLShape) => s.id as TLShapeId)
      );
    },
    async capture(options) {
      const editor = getEditor();
      if (!editor) return '';
      const shapes = editor.getCurrentPageShapes();
      const newShapes = shapes
        .filter((s: TLShape) => !baseline.has(s.id as TLShapeId))
        // Frames are seed artboards — never include them in the sketch
        // snapshot even if the creator's hold opened a fresh frame somehow.
        .filter((s: TLShape) => s.type !== 'frame');
      const ids =
        options?.shapeIds && options.shapeIds.length > 0
          ? [...options.shapeIds]
          : newShapes.map((s: TLShape) => s.id as TLShapeId);
      if (ids.length === 0) return '';

      try {
        const svg = await editor.getSvgString(ids, {
          background: false,
          padding: 16,
          scale: 1,
        });
        if (!svg) return '';
        const w = Math.min(svg.width, options?.maxWidth ?? DEFAULT_MAX_WIDTH);
        const h = Math.min(svg.height, options?.maxHeight ?? DEFAULT_MAX_HEIGHT);
        const blob = await getSvgAsImage(svg.svg, {
          width: w,
          height: h,
          type: 'png',
        });
        if (!blob) return '';
        return await blobToDataUrl(blob);
      } catch {
        return '';
      }
    },
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(blob);
  });
}

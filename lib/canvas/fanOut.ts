import type { Editor, TLShape } from 'tldraw';
import { AssetRecordType, createShapeId } from 'tldraw';
import type { AspectRatio } from '@/lib/providers/image/types';

/**
 * The set of aspect ratios provider adapters accept, ordered so the search
 * in pickAspectRatio is deterministic. Keeps us honest about what we can
 * ask the image gen for — AspectRatio union stays the source of truth.
 */
const CANDIDATES: ReadonlyArray<{ id: AspectRatio; ratio: number }> = [
  { id: '1:1', ratio: 1 },
  { id: '4:5', ratio: 4 / 5 },
  { id: '3:4', ratio: 3 / 4 },
  { id: '2:3', ratio: 2 / 3 },
  { id: '9:16', ratio: 9 / 16 },
  { id: '4:3', ratio: 4 / 3 },
  { id: '3:2', ratio: 3 / 2 },
  { id: '16:9', ratio: 16 / 9 },
];

/**
 * Pick the closest supported aspect ratio for an artboard. Falls back to 1:1
 * on zero / invalid dimensions so seeded frames always have an answer.
 */
export function pickAspectRatio(w: number, h: number): AspectRatio {
  if (!w || !h || w <= 0 || h <= 0) return '1:1';
  const target = w / h;
  let best: AspectRatio = '1:1';
  let bestDelta = Infinity;
  for (const c of CANDIDATES) {
    const delta = Math.abs(target - c.ratio);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = c.id;
    }
  }
  return best;
}

export interface DropInFrameParams {
  url: string;
  width: number;
  height: number;
  mimeType?: string;
  label?: string;
}

/**
 * Drop a generated image into a specific tldraw frame, sized to fill it.
 * Uses tldraw's native `reparentShapes` so the image becomes a first-class
 * child of the frame — move the frame, the image moves; z-order is intrinsic
 * to the container. Returns the new shape id, or null if the frame can't be
 * resolved (stale id, etc.).
 */
export function dropImageInFrame(
  editor: Editor,
  frameId: string,
  params: DropInFrameParams
): string | null {
  const frame = editor.getShape(frameId as never) as
    | (TLShape & { props: { w: number; h: number } })
    | undefined;
  if (!frame || frame.type !== 'frame') return null;

  const assetId = AssetRecordType.createId();
  editor.createAssets([
    {
      id: assetId,
      type: 'image',
      typeName: 'asset',
      props: {
        name: params.label ?? 'generated',
        src: params.url,
        w: params.width,
        h: params.height,
        mimeType: params.mimeType ?? 'image/png',
        isAnimated: false,
      },
      meta: {},
    },
  ]);

  const shapeId = createShapeId();
  editor.createShape({
    id: shapeId,
    type: 'image',
    x: frame.x,
    y: frame.y,
    props: {
      assetId,
      w: frame.props.w,
      h: frame.props.h,
    },
  });

  // Parent the image under the frame so they move as a unit and the frame's
  // clip / z-context applies. tldraw's reparentShapes is the idiomatic call.
  editor.reparentShapes([shapeId], frameId as never);

  return shapeId;
}

export interface FrameTarget {
  id: string;
  w: number;
  h: number;
}

/**
 * Dispatch one generation per frame in parallel. The caller supplies a
 * `perFrame` function that runs the actual fetch + canvas drop for a single
 * frame; dispatchFanOut picks the aspect ratio for each and aggregates
 * results via `Promise.allSettled` so one failure doesn't cancel the rest.
 * Settled results are returned so the caller can surface per-frame errors.
 */
export async function dispatchFanOut(
  frames: ReadonlyArray<FrameTarget>,
  perFrame: (target: FrameTarget, aspectRatio: AspectRatio) => Promise<void>
): Promise<Array<PromiseSettledResult<void>>> {
  if (frames.length === 0) return [];
  const promises = frames.map((f) => perFrame(f, pickAspectRatio(f.w, f.h)));
  return Promise.allSettled(promises);
}

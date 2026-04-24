import {
  createShapeId,
  toRichText,
  type Editor,
  type TLShape,
} from 'tldraw';
import {
  buildGuardedLayoutPlan,
  type GuardedLayoutPlan,
  type LayoutAvoidanceRegion,
  type LayoutFrame,
  type LayoutRect,
} from '@/lib/canvas/layoutGuard';
import { getFrameShapes } from '@/lib/canvas/focusFrame';
import { resolveSafeZonePresetId } from '@/lib/canvas/safeZones';

export const DEFAULT_MANAGED_LAYOUT_COPY = [
  'Spring Reset Duo',
  '新品晨光修护组合',
  'shop the drop',
].join('\n');

export interface ApplyGuardedCopyLayoutOptions {
  copy?: string;
  locale?: string;
  dynamicAdjustment?: boolean;
}

export interface ApplyGuardedCopyLayoutResult {
  plan: GuardedLayoutPlan;
  shapeIds: string[];
}

function shapeMeta(shape: TLShape): Record<string, unknown> {
  return (shape.meta ?? {}) as Record<string, unknown>;
}

function frameFromShape(shape: TLShape): LayoutFrame | null {
  if (shape.type !== 'frame') return null;
  const props = shape.props as { w?: number; h?: number; name?: string };
  if (!props.w || !props.h) return null;
  return {
    id: String(shape.id),
    label: props.name,
    w: props.w,
    h: props.h,
    preset: resolveSafeZonePresetId({
      props,
      meta: shapeMeta(shape),
    }),
  };
}

function boundsToRect(bounds: unknown): LayoutRect | null {
  if (!bounds || typeof bounds !== 'object') return null;
  const b = bounds as {
    x?: number;
    y?: number;
    w?: number;
    h?: number;
    minX?: number;
    minY?: number;
    width?: number;
    height?: number;
  };
  const x = typeof b.minX === 'number' ? b.minX : b.x;
  const y = typeof b.minY === 'number' ? b.minY : b.y;
  const w = typeof b.width === 'number' ? b.width : b.w;
  const h = typeof b.height === 'number' ? b.height : b.h;
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof w !== 'number' ||
    typeof h !== 'number'
  ) {
    return null;
  }
  return { x, y, w, h };
}

function clipToFrame(rect: LayoutRect, frame: LayoutFrame): LayoutRect | null {
  const left = Math.max(0, rect.x);
  const top = Math.max(0, rect.y);
  const right = Math.min(frame.w, rect.x + rect.w);
  const bottom = Math.min(frame.h, rect.y + rect.h);
  const clipped = { x: left, y: top, w: right - left, h: bottom - top };
  return clipped.w > 1 && clipped.h > 1 ? clipped : null;
}

function localImageRect(
  editor: Editor,
  frameShape: TLShape,
  imageShape: TLShape
): LayoutRect | null {
  const frameBounds = boundsToRect(editor.getShapePageBounds(frameShape.id));
  const imageBounds = boundsToRect(editor.getShapePageBounds(imageShape.id));
  if (!frameBounds || !imageBounds) return null;
  return {
    x: imageBounds.x - frameBounds.x,
    y: imageBounds.y - frameBounds.y,
    w: imageBounds.w,
    h: imageBounds.h,
  };
}

function overlapsFrame(rect: LayoutRect, frame: LayoutFrame): boolean {
  return (
    rect.x < frame.w &&
    rect.x + rect.w > 0 &&
    rect.y < frame.h &&
    rect.y + rect.h > 0
  );
}

function imageAvoidanceRegions(params: {
  editor: Editor;
  frame: LayoutFrame;
  frameShape: TLShape;
  imageShape: TLShape;
  index: number;
}): LayoutAvoidanceRegion[] {
  const { editor, frame, frameShape, imageShape, index } = params;
  const local = localImageRect(editor, frameShape, imageShape);
  if (!local || !overlapsFrame(local, frame)) return [];

  const meta = shapeMeta(imageShape);
  const provider = String(meta.aetherSegmentationProvider ?? '');
  const source = provider === 'sam3' ? 'sam3' : 'heuristic';
  const regions: LayoutAvoidanceRegion[] = [];
  const push = (
    kind: LayoutAvoidanceRegion['kind'],
    rect: LayoutRect,
    label: string
  ) => {
    const clipped = clipToFrame(rect, frame);
    if (!clipped) return;
    regions.push({
      id: `${frame.id}:image-${index}:${kind}`,
      frameId: frame.id,
      kind,
      source,
      rect: clipped,
      label,
    });
  };

  if (meta.aetherCutout) {
    push('person', local, source === 'sam3' ? 'SAM3 subject cutout' : 'subject cutout');
    return regions;
  }

  push(
    'face',
    {
      x: local.x + local.w * 0.29,
      y: local.y + local.h * 0.08,
      w: local.w * 0.42,
      h: local.h * 0.28,
    },
    'face-safe focal area'
  );
  push(
    'brand',
    {
      x: local.x + local.w * 0.56,
      y: local.y + local.h * 0.68,
      w: local.w * 0.32,
      h: local.h * 0.16,
    },
    'brand mark guard'
  );

  return regions;
}

export function collectGuardedLayoutFrames(editor: Editor): LayoutFrame[] {
  return getFrameShapes(editor)
    .map(frameFromShape)
    .filter((frame): frame is LayoutFrame => frame !== null);
}

export function collectCanvasAvoidanceRegions(editor: Editor): LayoutAvoidanceRegion[] {
  const frameShapes = getFrameShapes(editor);
  const imageShapes = editor.getCurrentPageShapes().filter((shape) => shape.type === 'image');
  const regions: LayoutAvoidanceRegion[] = [];

  for (const frameShape of frameShapes) {
    const frame = frameFromShape(frameShape);
    if (!frame) continue;
    imageShapes.forEach((imageShape, index) => {
      regions.push(
        ...imageAvoidanceRegions({
          editor,
          frame,
          frameShape,
          imageShape,
          index,
        })
      );
    });
  }

  return regions;
}

function deletePreviousManagedCopy(editor: Editor) {
  const ids = editor
    .getCurrentPageShapes()
    .filter((shape) => shapeMeta(shape).aetherRole === 'managed-copy')
    .map((shape) => shape.id);
  if (ids.length > 0) editor.deleteShapes(ids as never);
}

function placeTextShape(
  editor: Editor,
  frameShape: TLShape,
  placement: GuardedLayoutPlan['placements'][number]
): string | null {
  const frameBounds = boundsToRect(editor.getShapePageBounds(frameShape.id));
  if (!frameBounds) return null;

  const shapeId = createShapeId();
  const baseFontSize = 44;
  const scale = placement.fontSize / baseFontSize;

  editor.createShape({
    id: shapeId,
    type: 'text',
    x: frameBounds.x + placement.box.x,
    y: frameBounds.y + placement.box.y,
    props: {
      richText: toRichText(placement.lines.join('\n')),
      color: 'black',
      size: 'xl',
      font: 'sans',
      textAlign: 'start',
      autoSize: false,
      scale,
      w: Math.max(1, placement.box.w / scale),
    },
    meta: {
      aetherRole: 'managed-copy',
      aetherLayoutGuard: true,
      aetherLocale: placement.locale,
      aetherAvoidedRegionIds: placement.avoidedRegionIds,
      aetherCollidingRegionIds: placement.collidingRegionIds,
    },
  } as never);

  editor.reparentShapes([shapeId], frameShape.id as never);
  return String(shapeId);
}

export function applyGuardedCopyLayoutToCanvas(
  editor: Editor,
  options: ApplyGuardedCopyLayoutOptions = {}
): ApplyGuardedCopyLayoutResult {
  const frames = collectGuardedLayoutFrames(editor);
  const avoidanceRegions = collectCanvasAvoidanceRegions(editor);
  const plan = buildGuardedLayoutPlan({
    frames,
    copy: options.copy ?? DEFAULT_MANAGED_LAYOUT_COPY,
    locale: options.locale,
    dynamicAdjustment: options.dynamicAdjustment ?? true,
    avoidanceRegions,
  });
  const frameById = new Map(getFrameShapes(editor).map((shape) => [String(shape.id), shape]));
  const shapeIds: string[] = [];

  editor.markHistoryStoppingPoint('apply guarded copy layout');
  deletePreviousManagedCopy(editor);

  for (const placement of plan.placements) {
    const frameShape = frameById.get(placement.frameId);
    if (!frameShape) continue;
    const shapeId = placeTextShape(editor, frameShape, placement);
    if (shapeId) shapeIds.push(shapeId);
  }

  return { plan, shapeIds };
}

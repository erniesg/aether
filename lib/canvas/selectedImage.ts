import type { Editor } from 'tldraw';
import type { IndexKey, TLImageAsset, TLImageShape } from 'tldraw';

export interface SelectedImageInfo {
  shapeId: string;
  assetId: string;
  sourceUrl: string;
  intrinsicWidth: number;
  intrinsicHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
  parentId: string;
  index: IndexKey;
  meta: Record<string, unknown>;
  screenBounds: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

export function getSelectedImageInfo(editor: Editor): SelectedImageInfo | null {
  const selected = editor.getOnlySelectedShape();
  if (!selected || selected.type !== 'image') return null;

  const shape = selected as TLImageShape & { meta?: Record<string, unknown> };
  if (!shape.props.assetId) return null;

  const asset = editor.getAsset(shape.props.assetId) as TLImageAsset | undefined;
  if (!asset || asset.type !== 'image') return null;
  if (!asset.props.src) return null;

  const bounds = editor.getShapePageBounds(shape.id);
  if (!bounds) return null;

  const viewport = editor.getViewportScreenBounds();
  const topLeft = editor.pageToScreen({ x: bounds.x, y: bounds.y });
  const bottomRight = editor.pageToScreen({
    x: bounds.x + bounds.w,
    y: bounds.y + bounds.h,
  });

  return {
    shapeId: shape.id,
    assetId: shape.props.assetId,
    sourceUrl:
      typeof shape.meta?.aetherOriginalSrc === 'string'
        ? shape.meta.aetherOriginalSrc
        : asset.props.src,
    intrinsicWidth: asset.props.w,
    intrinsicHeight: asset.props.h,
    x: shape.x,
    y: shape.y,
    width: shape.props.w,
    height: shape.props.h,
    parentId: shape.parentId,
    index: shape.index,
    meta: shape.meta ?? {},
    screenBounds: {
      x: topLeft.x - viewport.x,
      y: topLeft.y - viewport.y,
      w: bottomRight.x - topLeft.x,
      h: bottomRight.y - topLeft.y,
    },
  };
}

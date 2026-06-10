import type { Editor } from 'tldraw';
import { AssetRecordType, createShapeId } from 'tldraw';

export interface DropVideoParams {
  url: string;
  width: number;
  height: number;
  mimeType?: string;
  label?: string;
  /** MotionBrief id for provenance, when the video came from the motion lane. */
  briefId?: string;
}

/**
 * Drop a rendered video onto the tldraw canvas as a native video shape.
 * Mirrors dropImageOnCanvas: centered in the viewport, scaled to fit.
 */
export function dropVideoOnCanvas(editor: Editor, params: DropVideoParams): string {
  const assetId = AssetRecordType.createId();
  editor.createAssets([
    {
      id: assetId,
      type: 'video',
      typeName: 'asset',
      props: {
        name: params.label ?? 'motion',
        src: params.url,
        w: params.width,
        h: params.height,
        mimeType: params.mimeType ?? 'video/mp4',
        isAnimated: true,
      },
      meta: {},
    },
  ]);

  const viewport = editor.getViewportPageBounds();
  const maxDim = Math.min(viewport.w, viewport.h) * 0.7;
  const scale = Math.min(1, maxDim / Math.max(params.width, params.height));
  const w = params.width * scale;
  const h = params.height * scale;
  const x = viewport.midX - w / 2;
  const y = viewport.midY - h / 2;

  const shapeId = createShapeId();
  editor.createShape({
    id: shapeId,
    type: 'video',
    x,
    y,
    props: { assetId, w, h },
    meta: {
      aetherRole: 'motion-asset',
      ...(params.briefId ? { aetherMotionBriefId: params.briefId } : {}),
    },
  });

  editor.select(shapeId);
  editor.zoomToSelection({ animation: { duration: 240 } });
  return shapeId;
}

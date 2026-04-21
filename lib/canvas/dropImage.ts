import type { Editor } from 'tldraw';
import { AssetRecordType, createShapeId } from 'tldraw';

export interface DropImageParams {
  url: string;
  width: number;
  height: number;
  mimeType?: string;
  label?: string;
}

/**
 * Drop a generated image onto the tldraw canvas as an image shape. Centers
 * it in the current viewport and scales it to fit if it's larger than the
 * viewport's major dimension.
 */
export function dropImageOnCanvas(editor: Editor, params: DropImageParams): string {
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
    type: 'image',
    x,
    y,
    props: { assetId, w, h },
  });

  editor.select(shapeId);
  editor.zoomToSelection({ animation: { duration: 240 } });
  return shapeId;
}

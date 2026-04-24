import type { Editor } from 'tldraw';
import { AssetRecordType, createShapeId } from 'tldraw';
import type { SelectedImageInfo } from '@/lib/canvas/selectedImage';

export interface PlaceSpatialPreviewParams {
  previewImageUrl: string;
  width: number;
  height: number;
  label?: string;
  providerId?: string;
  format: 'particle-field' | 'gaussian-splat';
}

export function placeSpatialPreviewOnCanvas(
  editor: Editor,
  target: SelectedImageInfo,
  params: PlaceSpatialPreviewParams
): string {
  const assetId = AssetRecordType.createId();
  const shapeId = createShapeId();

  editor.markHistoryStoppingPoint('spatialize image');
  editor.createAssets([
    {
      id: assetId,
      type: 'image',
      typeName: 'asset',
      props: {
        name: params.label ?? `${params.format} draft`,
        src: params.previewImageUrl,
        w: params.width,
        h: params.height,
        mimeType: 'image/svg+xml',
        isAnimated: false,
      },
      meta: {
        aetherRole: 'spatial-preview-asset',
        aetherProviderId: params.providerId ?? 'draft',
      },
    },
  ]);

  editor.createShape({
    id: shapeId,
    type: 'image',
    x: target.x + target.width + 40,
    y: target.y,
    props: {
      assetId,
      w: target.width,
      h: target.height,
    },
    meta: {
      aetherRole: 'spatial-preview',
      aetherSourceShapeId: target.shapeId,
      aetherSpatialFormat: params.format,
      aetherSpatialProvider: params.providerId ?? 'draft',
    },
  } as never);
  editor.select(shapeId);
  return shapeId;
}

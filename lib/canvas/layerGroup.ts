import { AssetRecordType } from 'tldraw';
import type { Editor } from 'tldraw';
import type { DecomposeResult } from './decomposeToLayers';

/**
 * Place a decomposed layer pair on the canvas: the original image shape
 * becomes the background plate; the subject cutout stacks above it at the
 * same rect (SAM cutouts are full-frame with transparent surroundings, so
 * the rects coincide — the bbox travels in meta for future tightening).
 *
 * Layers are linked by `aetherLayerGroupId` meta rather than a tldraw group
 * so frame parenting and per-layer selection keep working untouched.
 */

export interface LayerTarget {
  shapeId: string;
  sourceUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parentId: string;
  meta: Record<string, unknown>;
}

export interface PlacedLayers {
  backgroundShapeId: string;
  subjectShapeId: string;
  layerGroupId: string;
}

export function placeDecomposedLayers(
  editor: Editor,
  target: LayerTarget,
  result: DecomposeResult
): PlacedLayers {
  const layerGroupId = `layers-${target.shapeId}`;

  editor.markHistoryStoppingPoint('split layers');

  const backgroundAssetId = AssetRecordType.createId();
  const subjectAssetId = AssetRecordType.createId();
  editor.createAssets([
    {
      id: backgroundAssetId,
      type: 'image',
      typeName: 'asset',
      props: {
        name: 'background plate',
        src: result.background.url,
        w: result.width,
        h: result.height,
        mimeType: 'image/png',
        isAnimated: false,
      },
      meta: { aetherRole: 'layer-background-asset' },
    },
    {
      id: subjectAssetId,
      type: 'image',
      typeName: 'asset',
      props: {
        name: 'subject cutout',
        src: result.subject.url,
        w: result.width,
        h: result.height,
        mimeType: 'image/png',
        isAnimated: false,
      },
      meta: { aetherRole: 'layer-subject-asset' },
    },
  ]);

  editor.updateShape({
    id: target.shapeId as never,
    type: 'image',
    props: { assetId: backgroundAssetId },
    meta: {
      ...target.meta,
      aetherRole: 'layer-background',
      aetherLayerGroupId: layerGroupId,
      aetherOriginalSrc: target.sourceUrl,
      aetherEditProvider: result.providers.edit.id,
      aetherEditModel: result.providers.edit.model,
    },
  } as never);

  const subjectShapeId = `shape:${layerGroupId}-subject`;
  editor.createShape({
    id: subjectShapeId as never,
    type: 'image',
    parentId: target.parentId as never,
    x: target.x,
    y: target.y,
    props: {
      assetId: subjectAssetId,
      w: target.width,
      h: target.height,
    },
    meta: {
      aetherRole: 'layer-subject',
      aetherLayerGroupId: layerGroupId,
      aetherOriginalSrc: target.sourceUrl,
      aetherSegmentationProvider: result.providers.segmentation.id,
      aetherSegmentationModel: result.providers.segmentation.model,
      ...(result.subject.bbox ? { aetherSubjectBbox: result.subject.bbox } : {}),
    },
  } as never);

  editor.select(subjectShapeId as never);

  return {
    backgroundShapeId: target.shapeId,
    subjectShapeId,
    layerGroupId,
  };
}

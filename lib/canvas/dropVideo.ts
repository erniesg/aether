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
  motionProjectId?: string;
  exportId?: string;
  sourceAssetId?: string;
  posterAssetId?: string;
  subtitleAssetId?: string;
  transcriptAssetId?: string;
  sourceManifestAssetId?: string;
  exportPackManifestId?: string;
  targetLabel?: string;
}

export interface DropVideoArtboardResult {
  frameId: string;
  shapeId: string;
}

/**
 * Drop a rendered video onto the tldraw canvas as a native video shape.
 * Mirrors dropImageOnCanvas: centered in the viewport, scaled to fit.
 */
export function dropVideoOnCanvas(editor: Editor, params: DropVideoParams): string {
  const assetId = AssetRecordType.createId();
  const meta = motionAssetMeta(params);
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
      meta,
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
    meta,
  });

  editor.select(shapeId);
  editor.zoomToSelection({ animation: { duration: 240 } });
  return shapeId;
}

/**
 * Place a rendered video in its own native frame so the export returns as an
 * inspectable canvas artifact instead of floating over an unrelated format.
 */
export function dropVideoArtboardOnCanvas(
  editor: Editor,
  params: DropVideoParams
): DropVideoArtboardResult {
  const meta = motionAssetMeta(params);
  const frames = editor
    .getCurrentPageShapes()
    .filter((shape) => shape.type === 'frame') as Array<{
    id: string;
    x: number;
    y: number;
    props: { w: number; h: number };
  }>;
  const rightEdge = Math.max(0, ...frames.map((frame) => frame.x + frame.props.w));
  const frameId = createShapeId();
  const frameX = rightEdge + (frames.length > 0 ? 160 : 0);
  const frameY = frames[0]?.y ?? 0;
  editor.createShape({
    id: frameId,
    type: 'frame',
    x: frameX,
    y: frameY,
    props: {
      w: params.width,
      h: params.height,
      name: params.label ?? params.targetLabel ?? 'Video export',
    },
    meta,
  });

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
      meta,
    },
  ]);

  const shapeId = createShapeId();
  editor.createShape({
    id: shapeId,
    type: 'video',
    parentId: frameId,
    x: 0,
    y: 0,
    props: { assetId, w: params.width, h: params.height },
    meta,
  });
  editor.select(shapeId);
  editor.zoomToSelection({ animation: { duration: 240 } });
  return { frameId, shapeId };
}

function motionAssetMeta(params: DropVideoParams): Record<string, string> {
  return compactMeta({
    aetherRole: 'motion-asset',
    aetherMotionBriefId: params.briefId,
    aetherMotionProjectId: params.motionProjectId,
    aetherMotionExportId: params.exportId,
    aetherMotionSourceAssetId: params.sourceAssetId,
    aetherMotionPosterAssetId: params.posterAssetId,
    aetherMotionSubtitleAssetId: params.subtitleAssetId,
    aetherMotionTranscriptAssetId: params.transcriptAssetId,
    aetherMotionSourceManifestAssetId: params.sourceManifestAssetId,
    aetherMotionExportPackManifestId: params.exportPackManifestId,
    aetherMotionTargetLabel: params.targetLabel,
  });
}

function compactMeta(meta: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(meta).filter((entry): entry is [string, string] => Boolean(entry[1]))
  );
}

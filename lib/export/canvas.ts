'use client';

import type { Editor, TLShapeId } from 'tldraw';

type RasterExportFormat = 'png' | 'jpeg';

async function resolveFrameExport(
  editor: Editor,
  artboardId: string
): Promise<{ id: TLShapeId; bounds: NonNullable<ReturnType<Editor['getShapePageBounds']>> } | null> {
  const frame = editor.getShape(artboardId as TLShapeId) as
    | { id: TLShapeId; type: string }
    | undefined;
  if (!frame || frame.type !== 'frame') return null;

  const bounds = editor.getShapePageBounds(frame.id);
  if (!bounds) return null;
  return { id: frame.id, bounds };
}

export async function renderArtboardRasterBase64FromCanvas(
  editor: Editor,
  artboardId: string,
  format: RasterExportFormat
): Promise<string | null> {
  const frame = await resolveFrameExport(editor, artboardId);
  if (!frame) return null;

  try {
    const result = await editor.toImageDataUrl([frame.id], {
      format,
      background: false,
      padding: 0,
      bounds: frame.bounds,
      scale: 1,
      pixelRatio: 1,
      quality: format === 'jpeg' ? 0.92 : undefined,
    });
    const comma = result.url.indexOf(',');
    return comma >= 0 ? result.url.slice(comma + 1) : null;
  } catch {
    return null;
  }
}

export async function renderArtboardPngBase64FromCanvas(
  editor: Editor,
  artboardId: string
): Promise<string | null> {
  return renderArtboardRasterBase64FromCanvas(editor, artboardId, 'png');
}

export async function renderArtboardJpegBase64FromCanvas(
  editor: Editor,
  artboardId: string
): Promise<string | null> {
  return renderArtboardRasterBase64FromCanvas(editor, artboardId, 'jpeg');
}

export async function renderArtboardSvgFromCanvas(
  editor: Editor,
  artboardId: string
): Promise<{ svg: string; width?: number; height?: number } | null> {
  const frame = await resolveFrameExport(editor, artboardId);
  if (!frame) return null;

  try {
    const result = await editor.getSvgString([frame.id], {
      background: false,
      padding: 0,
      bounds: frame.bounds,
      scale: 1,
    });
    if (!result?.svg) return null;
    return {
      svg: result.svg,
      width: result.width,
      height: result.height,
    };
  } catch {
    return null;
  }
}

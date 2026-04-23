import { buildExportPack } from '@/lib/export/pack';
import { exportRequestSchema } from './schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function decodePngBase64(value: string): Uint8Array {
  const payload = value.startsWith('data:')
    ? value.split(',').slice(1).join(',')
    : value;
  const buf = Buffer.from(payload, 'base64');
  // Slice off a fresh Uint8Array so no shared-buffer artifacts reach jszip.
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

function fileSafeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'workspace';
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid JSON body');
  }

  const parsed = exportRequestSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('; ');
    return jsonError(400, message);
  }

  const { workspaceId, artboardIds, artboards, pinnedSkills, brandTokens } =
    parsed.data;

  const byId = new Map(artboards.map((board) => [board.id, board]));
  const missing = artboardIds.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    return jsonError(400, `artboard payload missing for ids: ${missing.join(', ')}`);
  }

  try {
    const { zip } = await buildExportPack({
      workspaceId,
      artboards: artboardIds.map((id) => {
        const input = byId.get(id)!;
        return {
          id: input.id,
          label: input.label,
          aspectRatio: input.aspectRatio,
          prompt: input.prompt,
          capabilityRunIds: input.capabilityRunIds,
          provider: input.provider,
          model: input.model,
          png: decodePngBase64(input.pngBase64),
          // Prefer the human label (e.g. "IG Post") for the slug; tldraw ids
          // like "shape:abc123" slugify to noise. Builder falls back to id if
          // the label is empty / all-whitespace.
          filenameHint: input.label.trim() || input.id,
        };
      }),
      pinnedSkills,
      brandTokens,
    });

    const filename = `aether-${fileSafeId(workspaceId)}.zip`;
    // JSZip returns Uint8Array<ArrayBufferLike>; DOM BodyInit wants
    // ArrayBufferView<ArrayBuffer>. The cast is safe — the buffer is freshly
    // allocated by jszip, not a SharedArrayBuffer view.
    return new Response(zip as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(500, `export failed: ${message}`);
  }
}

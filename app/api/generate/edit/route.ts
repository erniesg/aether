import { NextResponse } from 'next/server';
import { applyGuidanceToRequest } from '@/lib/providers/image/applyGuidance';
import { parseEditRequest } from '@/lib/providers/image/editRequest';
import { resolveEditableProvider } from '@/lib/providers/image/registry';
import type { ImageEditRequest } from '@/lib/providers/image/types';
import { ImageGenError, ProviderUnavailableError } from '@/lib/providers/image/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function jsonError(status: number, error: string, code?: string) {
  return NextResponse.json(code ? { ok: false, error, code } : { ok: false, error }, { status });
}

/**
 * POST /api/generate/edit
 *
 * Precise image edit path. Accepts:
 *   - prompt         required
 *   - sourceUrl      required — the image to edit (http(s) or data:image/*)
 *   - maskUrl        optional — when provided, edit is region-scoped; when
 *                    absent, the full image is re-imagined from the prompt
 *   - preset         optional — safe-zone preset whose guidance is folded
 *                    into the prompt and negative prompt
 *   - focusArea, negativeZones — same semantics as /api/generate
 *   - providerId, model, seed, n, aspectRatio — routing hints
 *
 * Returns { ok: true, provider, model, images, latencyMs } or a JSON error.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid JSON body');
  }

  const parsed = parseEditRequest(body);
  if ('error' in parsed) return jsonError(400, parsed.error);

  let provider;
  try {
    provider = resolveEditableProvider(parsed.providerId, parsed.model);
  } catch (err) {
    if (err instanceof ProviderUnavailableError) {
      return jsonError(503, err.message, 'provider_unavailable');
    }
    throw err;
  }

  const model = parsed.model ?? provider.listModels()[0];
  if (!model) return jsonError(500, 'no model available on chosen provider');

  const baseEdit: ImageEditRequest = {
    prompt: parsed.prompt,
    sourceUrl: parsed.sourceUrl,
    maskUrl: parsed.maskUrl,
    aspectRatio: parsed.aspectRatio,
    seed: parsed.seed,
    n: parsed.n,
  };
  const edit = applyGuidanceToRequest(baseEdit, {
    preset: parsed.preset ?? null,
    focusArea: parsed.focusArea,
    negativeZones: parsed.negativeZones,
  });

  try {
    const result = await provider.edit!(edit, { model });
    return NextResponse.json({
      ok: true,
      provider: { id: provider.id, model, displayName: provider.displayName },
      latencyMs: result.latencyMs,
      images: result.images.map((img) => ({
        url: img.url,
        width: img.width,
        height: img.height,
        mimeType: img.mimeType,
        dataUrl: img.dataUrl,
      })),
    });
  } catch (err) {
    if (err instanceof ImageGenError) {
      return jsonError(502, err.message, 'image_gen_failed');
    }
    if (err instanceof ProviderUnavailableError) {
      return jsonError(503, err.message, 'provider_unavailable');
    }
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(500, message);
  }
}

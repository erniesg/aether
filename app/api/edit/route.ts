import { NextResponse } from 'next/server';
import { resolveEditProvider } from '@/lib/providers/image/registry';
import {
  ImageGenError,
  ProviderUnavailableError,
} from '@/lib/providers/image/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Mask-fill / instruction edit endpoint. Pairs with /api/segment: the
 * segment preview's maskDataUrl rides in as `maskUrl` (white = region to
 * edit) and the resolved adapter fills behind the subject. Provider choice
 * follows the edit registry — never hardcoded here.
 */

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function jsonError(status: number, error: string, code?: string) {
  return NextResponse.json(
    { ok: false, error, ...(code ? { code } : {}) },
    { status }
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid JSON body');
  }
  if (!isObject(body)) return jsonError(400, 'body must be an object');

  const sourceUrl = typeof body.sourceUrl === 'string' ? body.sourceUrl.trim() : '';
  if (!sourceUrl) return jsonError(400, 'sourceUrl is required');

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) return jsonError(400, 'prompt is required');

  const maskUrl = typeof body.maskUrl === 'string' && body.maskUrl ? body.maskUrl : undefined;
  const providerId = typeof body.provider === 'string' && body.provider ? body.provider : undefined;
  const modelHint = typeof body.model === 'string' && body.model ? body.model : undefined;
  const width = typeof body.width === 'number' && body.width > 0 ? body.width : undefined;
  const height = typeof body.height === 'number' && body.height > 0 ? body.height : undefined;

  try {
    const provider = resolveEditProvider(providerId, modelHint);
    const model = modelHint ?? '';
    const result = await provider.edit!(
      {
        prompt,
        sourceUrl,
        maskUrl,
        size: width && height ? { w: width, h: height } : undefined,
      },
      { model }
    );
    const image = result.images[0];
    if (!image) return jsonError(502, 'provider returned no image');
    return NextResponse.json({
      ok: true,
      image,
      provider: { id: result.provider, model: result.model },
      latencyMs: result.latencyMs,
    });
  } catch (error) {
    // Name-based checks survive module-instance duplication (tests reset
    // modules; bundlers can split chunks) where instanceof would not.
    const name = error instanceof Error ? error.name : '';
    if (error instanceof ProviderUnavailableError || name === 'ProviderUnavailableError') {
      return jsonError(503, (error as Error).message, 'provider_unavailable');
    }
    if (error instanceof ImageGenError || name === 'ImageGenError') {
      return jsonError(502, (error as Error).message, 'edit_failed');
    }
    return jsonError(
      500,
      error instanceof Error ? error.message : 'unexpected edit failure'
    );
  }
}

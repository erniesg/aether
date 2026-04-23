import { NextResponse } from 'next/server';
import { resolveVisionProvider } from '@/lib/providers/vision/registry';
import { VisionError, VisionUnavailableError } from '@/lib/providers/vision/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function jsonError(status: number, error: string, code?: string) {
  return NextResponse.json(code ? { ok: false, error, code } : { ok: false, error }, { status });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid JSON body');
  }

  if (typeof body !== 'object' || body === null) {
    return jsonError(400, 'body must be an object');
  }

  const b = body as Record<string, unknown>;
  const sourceUrl = typeof b.sourceUrl === 'string' ? b.sourceUrl.trim() : '';
  const providerId = typeof b.providerId === 'string' ? b.providerId : undefined;
  const model = typeof b.model === 'string' ? b.model : undefined;

  if (!sourceUrl) {
    return jsonError(400, 'sourceUrl is required');
  }

  try {
    const provider = resolveVisionProvider(providerId, model);
    const result = await provider.analyze(
      {
        sourceUrl,
        maxElements: 6,
      },
      { model: model ?? provider.listModels()[0] ?? provider.id }
    );

    return NextResponse.json({
      ok: true,
      provider: {
        id: result.provider,
        model: result.model,
      },
      inventory: result.inventory,
      raw: result.raw,
    });
  } catch (error) {
    if (error instanceof VisionUnavailableError) {
      return jsonError(503, error.message, 'provider_unavailable');
    }

    if (error instanceof VisionError) {
      return jsonError(502, error.message, 'vision_failed');
    }

    const message = error instanceof Error ? error.message : String(error);
    return jsonError(500, message);
  }
}

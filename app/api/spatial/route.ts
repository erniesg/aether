import { NextResponse } from 'next/server';
import {
  KNOWN_SPATIAL_PROVIDER_IDS,
  listSpatialProviders,
  resolveSpatialProvider,
} from '@/lib/providers/spatial/registry';
import type {
  SpatialMode,
  SpatialProviderStatus,
} from '@/lib/providers/spatial/types';
import {
  SpatialError,
  SpatialUnavailableError,
} from '@/lib/providers/spatial/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function jsonError(
  status: number,
  error: string,
  code?: string,
  extras?: { providers?: SpatialProviderStatus[] }
) {
  return NextResponse.json(
    {
      ok: false,
      error,
      ...(code ? { code } : {}),
      ...(extras?.providers ? { providers: extras.providers } : {}),
    },
    { status }
  );
}

function parseMode(value: unknown): SpatialMode | null {
  return value === 'splat-from-image' ? value : null;
}

function parsePositiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    providers: listSpatialProviders(),
  });
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
  const providerId = typeof b.providerId === 'string' ? b.providerId : undefined;
  const model = typeof b.model === 'string' ? b.model : undefined;
  const sourceUrl = typeof b.sourceUrl === 'string' ? b.sourceUrl.trim() : '';
  const prompt = typeof b.prompt === 'string' ? b.prompt.trim() : undefined;
  const mode = parseMode(b.mode);
  const width = parsePositiveNumber(b.width);
  const height = parsePositiveNumber(b.height);
  const seed = parsePositiveNumber(b.seed);

  if (!sourceUrl) {
    return jsonError(400, 'sourceUrl is required');
  }

  if (!mode) {
    return jsonError(400, 'mode must be splat-from-image');
  }

  if (
    providerId &&
    !KNOWN_SPATIAL_PROVIDER_IDS.includes(
      providerId as (typeof KNOWN_SPATIAL_PROVIDER_IDS)[number]
    )
  ) {
    return jsonError(
      400,
      `providerId must be one of ${KNOWN_SPATIAL_PROVIDER_IDS.join(', ')}`
    );
  }

  try {
    const provider = resolveSpatialProvider(providerId, model);
    const result = await provider.generate(
      {
        sourceUrl,
        mode,
        prompt,
        seed,
        size: width && height ? { w: width, h: height } : undefined,
      },
      { model: model ?? provider.listModels()[0] ?? provider.id }
    );

    return NextResponse.json({
      ok: true,
      provider: {
        id: result.provider,
        model: result.model,
      },
      asset: {
        splatUrl: result.splatUrl,
        previewUrl: result.previewUrl,
        format: result.format,
        gaussianCount: result.gaussianCount,
      },
      // Publication gate — the capability exposing this primitive is still in
      // review. The UI surfaces the asset on the canvas and leaves a pending
      // review chip on the right rail until a human promotes it.
      review: {
        status: 'pending',
        reason:
          'spatial primitive is newly authored; requires human review before team publication',
      },
      raw: result.raw,
    });
  } catch (err) {
    if (err instanceof SpatialUnavailableError) {
      return jsonError(503, err.message, 'provider_unavailable', {
        providers: listSpatialProviders(),
      });
    }

    if (err instanceof SpatialError) {
      return jsonError(502, err.message, 'spatial_failed');
    }

    const message = err instanceof Error ? err.message : String(err);
    return jsonError(500, message);
  }
}

import { NextResponse } from 'next/server';
import {
  KNOWN_SPATIAL_PROVIDER_IDS,
  listSpatialProviders,
  resolveSpatialProvider,
} from '@/lib/providers/spatial/registry';
import type { SpatialFormat, SpatialProviderStatus, SpatialQuality } from '@/lib/providers/spatial/types';
import {
  SpatialBuildError,
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

function parsePositiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function parseFormat(value: unknown): SpatialFormat | null {
  return value === 'particle-field' || value === 'gaussian-splat' ? value : null;
}

function parseQuality(value: unknown): SpatialQuality | undefined | null {
  if (value === undefined) return undefined;
  return value === 'draft' || value === 'standard' || value === 'high' ? value : null;
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
  const width = parsePositiveNumber(b.width);
  const height = parsePositiveNumber(b.height);
  const format = parseFormat(b.format ?? 'particle-field');
  const quality = parseQuality(b.quality);

  if (!sourceUrl) {
    return jsonError(400, 'sourceUrl is required');
  }

  if (
    providerId &&
    !KNOWN_SPATIAL_PROVIDER_IDS.includes(providerId as (typeof KNOWN_SPATIAL_PROVIDER_IDS)[number])
  ) {
    return jsonError(
      400,
      `providerId must be one of ${KNOWN_SPATIAL_PROVIDER_IDS.join(', ')}`
    );
  }

  if (!width || !height) {
    return jsonError(400, 'width and height are required');
  }

  if (!format) {
    return jsonError(400, 'format must be one of particle-field, gaussian-splat');
  }

  if (quality === null) {
    return jsonError(400, 'quality must be one of draft, standard, high');
  }

  try {
    const provider = resolveSpatialProvider(providerId, model);
    const result = await provider.build(
      {
        sourceUrl,
        width,
        height,
        prompt,
        format,
        quality,
      },
      { model: model ?? provider.listModels()[0] ?? provider.id }
    );

    return NextResponse.json({
      ok: true,
      provider: {
        id: result.provider,
        model: result.model,
      },
      preview: {
        imageDataUrl: result.previewImageUrl,
        width,
        height,
      },
      result: {
        format: result.format,
        sceneSpec: result.sceneSpec,
        latencyMs: result.latencyMs,
        sceneUrl: result.sceneUrl,
        sceneFormat: result.sceneFormat,
        gaussianCount: result.gaussianCount,
      },
      raw: result.raw,
    });
  } catch (err) {
    if (err instanceof SpatialUnavailableError) {
      return jsonError(503, err.message, 'provider_unavailable', {
        providers: listSpatialProviders(),
      });
    }

    if (err instanceof SpatialBuildError) {
      return jsonError(502, err.message, 'spatial_build_failed');
    }

    const message = err instanceof Error ? err.message : String(err);
    return jsonError(500, message);
  }
}

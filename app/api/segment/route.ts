import { NextResponse } from 'next/server';
import {
  KNOWN_SEGMENTATION_PROVIDER_IDS,
  listSegmentationProviders,
  resolveSegmentationProvider,
} from '@/lib/providers/segmentation/registry';
import type {
  SegmentationMode,
  SegmentationProviderStatus,
} from '@/lib/providers/segmentation/types';
import {
  SegmentationError,
  SegmentationUnavailableError,
} from '@/lib/providers/segmentation/types';
import {
  buildMaskedImageDataUrl,
  fetchAsDataUrl,
} from '@/lib/segment/dataUrl';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function jsonError(
  status: number,
  error: string,
  code?: string,
  extras?: { providers?: SegmentationProviderStatus[] }
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

function parseMode(value: unknown): SegmentationMode | null {
  return value === 'removebg' || value === 'cutout' || value === 'unmask'
    ? value
    : null;
}

function parsePositiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    providers: listSegmentationProviders(),
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

  if (!sourceUrl) {
    return jsonError(400, 'sourceUrl is required');
  }

  if (!mode) {
    return jsonError(400, 'mode must be one of removebg, cutout, unmask');
  }

  if (
    providerId &&
    !KNOWN_SEGMENTATION_PROVIDER_IDS.includes(
      providerId as (typeof KNOWN_SEGMENTATION_PROVIDER_IDS)[number]
    )
  ) {
    return jsonError(
      400,
      `providerId must be one of ${KNOWN_SEGMENTATION_PROVIDER_IDS.join(', ')}`
    );
  }

  if (!width || !height) {
    return jsonError(400, 'width and height are required');
  }

  try {
    const provider = resolveSegmentationProvider(providerId, model);
    const result = await provider.segment(
      {
        sourceUrl,
        mode,
        prompt,
        size: { w: width, h: height },
      },
      { model: model ?? provider.listModels()[0] ?? provider.id }
    );

    const [sourceDataUrl, maskDataUrl] = await Promise.all([
      fetchAsDataUrl(sourceUrl),
      fetchAsDataUrl(result.maskUrl),
    ]);

    const alphaCutoutDataUrl = result.alphaCutoutUrl
      ? await fetchAsDataUrl(result.alphaCutoutUrl)
      : buildMaskedImageDataUrl({
          sourceDataUrl,
          maskDataUrl,
          width: result.width,
          height: result.height,
          invertMask: mode === 'unmask',
        });

    return NextResponse.json({
      ok: true,
      provider: {
        id: result.provider,
        model: result.model,
      },
      preview: {
        sourceDataUrl,
        maskDataUrl,
        cutoutDataUrl: alphaCutoutDataUrl,
        width: result.width,
        height: result.height,
        bbox: result.bbox,
        invertMask: mode === 'unmask',
      },
      raw: result.raw,
    });
  } catch (err) {
    if (err instanceof SegmentationUnavailableError) {
      return jsonError(503, err.message, 'provider_unavailable', {
        providers: listSegmentationProviders(),
      });
    }

    if (err instanceof SegmentationError) {
      return jsonError(502, err.message, 'segmentation_failed');
    }

    const message = err instanceof Error ? err.message : String(err);
    return jsonError(500, message);
  }
}

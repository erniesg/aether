import { NextResponse } from 'next/server';
import {
  KNOWN_SEGMENTATION_PROVIDER_IDS,
  listSegmentationProviders,
  resolveSegmentationProvider,
} from '@/lib/providers/segmentation/registry';
import type {
  SegmentationBoxPrompt,
  SegmentationMode,
  SegmentationPointPrompt,
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
import { resolveInpaintProvider } from '@/lib/providers/inpaint/registry';
import {
  InpaintError,
  InpaintUnavailableError,
} from '@/lib/providers/inpaint/types';

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

function parseCoordinate(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function parseBoxPrompt(value: unknown): SegmentationBoxPrompt | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null) return null;

  const candidate = value as Record<string, unknown>;
  const x = parseCoordinate(candidate.x);
  const y = parseCoordinate(candidate.y);
  const w = parsePositiveNumber(candidate.w);
  const h = parsePositiveNumber(candidate.h);

  if (x === undefined || y === undefined || w === undefined || h === undefined) {
    return null;
  }

  return { x, y, w, h };
}

function parsePointPrompts(
  value: unknown
): SegmentationPointPrompt[] | null | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return null;

  const points: SegmentationPointPrompt[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) return null;
    const candidate = item as Record<string, unknown>;
    const x = parseCoordinate(candidate.x);
    const y = parseCoordinate(candidate.y);
    const label =
      candidate.label === 'fg' || candidate.label === 'bg'
        ? candidate.label
        : undefined;

    if (x === undefined || y === undefined || label === undefined) {
      return null;
    }

    points.push({ x, y, label });
  }

  return points;
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
  const box = parseBoxPrompt(b.box);
  const points = parsePointPrompts(b.points);
  const width = parsePositiveNumber(b.width);
  const height = parsePositiveNumber(b.height);
  // bgInpaint=true tells us to ALSO fire the inpaint provider so the
  // canvas can drop two complementary layers: cutout (subject) on top,
  // background (subject region filled by LAMA) underneath. Default off
  // so existing callers / smoke tests keep their existing single-image
  // response shape. Failure of inpaint is fail-soft — segment still
  // succeeds and returns the cutout, with bgInpaintError surfaced for UI.
  const bgInpaint = b.bgInpaint === true;
  const inpaintProviderId =
    typeof b.inpaintProviderId === 'string' ? b.inpaintProviderId : undefined;
  const inpaintModel =
    typeof b.inpaintModel === 'string' ? b.inpaintModel : undefined;

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

  if (box === null) {
    return jsonError(400, 'box must be an object with x, y, w, h');
  }

  if (points === null) {
    return jsonError(400, 'points must be an array of { x, y, label }');
  }

  try {
    const provider = resolveSegmentationProvider(providerId, model);
    const result = await provider.segment(
      {
        sourceUrl,
        mode,
        prompt,
        box,
        points,
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

    // Optional bg inpaint: feed the source + mask into LAMA so the canvas
    // can drop two layers — subject cutout (top) + reconstructed bg
    // (bottom). Fail-soft per attempt: a missing REPLICATE_API_TOKEN /
    // model error must not break the cutout response.
    let bgInpaintDataUrl: string | undefined;
    let bgInpaintError: string | undefined;
    let bgInpaintProvider:
      | { id: string; model: string }
      | undefined;
    if (bgInpaint) {
      try {
        const inpaintProvider = resolveInpaintProvider(
          inpaintProviderId,
          inpaintModel
        );
        const inpaintResult = await inpaintProvider.inpaint(
          {
            sourceUrl,
            maskUrl: result.maskUrl,
            size: { w: result.width, h: result.height },
          },
          { model: inpaintModel ?? inpaintProvider.listModels()[0] ?? inpaintProvider.id }
        );
        bgInpaintDataUrl = await fetchAsDataUrl(inpaintResult.imageUrl);
        bgInpaintProvider = {
          id: inpaintResult.provider,
          model: inpaintResult.model,
        };
      } catch (err) {
        if (err instanceof InpaintUnavailableError) {
          bgInpaintError = err.message;
        } else if (err instanceof InpaintError) {
          bgInpaintError = err.message;
        } else {
          bgInpaintError = err instanceof Error ? err.message : String(err);
        }
        // eslint-disable-next-line no-console
        console.warn(`[api/segment] bgInpaint failed: ${bgInpaintError}`);
      }
    }

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
        ...(bgInpaintDataUrl ? { bgInpaintDataUrl } : {}),
        ...(bgInpaintError ? { bgInpaintError } : {}),
        ...(bgInpaintProvider ? { bgInpaintProvider } : {}),
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

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
  SegmentationProvider,
  SegmentationProviderId,
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
import {
  encodeSegmentEvent,
  inferSegmentMode,
  type SegmentStreamEvent,
} from '@/lib/segment/stream';

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

function streamError(
  runId: string,
  status: number,
  error: string,
  code?: string,
  providers?: SegmentationProviderStatus[]
) {
  const event: SegmentStreamEvent = {
    type: 'segment.failed',
    at: Date.now(),
    runId,
    error,
    ...(code ? { code } : {}),
    ...(providers ? { providers } : {}),
  };
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encodeSegmentEvent(event));
      controller.close();
    },
  });
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

function generateRunId(): string {
  return `seg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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
  const clientRunId = typeof b.runId === 'string' ? b.runId : undefined;

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

  const runId = clientRunId ?? generateRunId();

  let provider: SegmentationProvider;
  try {
    provider = resolveSegmentationProvider(providerId, model);
  } catch (err) {
    if (err instanceof SegmentationUnavailableError) {
      return streamError(
        runId,
        503,
        err.message,
        'provider_unavailable',
        listSegmentationProviders()
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    return streamError(runId, 500, message);
  }

  const resolvedModel = model ?? provider.listModels()[0] ?? provider.id;
  const streamMode = inferSegmentMode({
    verb: mode,
    hasPoints: Array.isArray(points) && points.length > 0,
    hasBox: box !== undefined && box !== null,
    hasPrompt: typeof prompt === 'string' && prompt.length > 0,
  });

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void (async () => {
        const startedAt = Date.now();
        const emit = (event: SegmentStreamEvent) => {
          controller.enqueue(encodeSegmentEvent(event));
        };

        emit({
          type: 'segment.started',
          at: Date.now(),
          runId,
          provider: {
            id: provider.id,
            displayName: provider.displayName,
            model: resolvedModel,
          },
          mode: streamMode,
          verb: mode,
        });

        try {
          emit({
            type: 'segment.progress',
            at: Date.now(),
            runId,
            phase: 'inference',
          });

          const result = await provider.segment(
            {
              sourceUrl,
              mode,
              prompt,
              box: box ?? undefined,
              points: points ?? undefined,
              size: { w: width, h: height },
            },
            { model: resolvedModel }
          );

          emit({
            type: 'segment.progress',
            at: Date.now(),
            runId,
            phase: 'postprocess',
          });

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

          const providerRef = {
            id: result.provider as SegmentationProviderId,
            displayName: provider.displayName,
            model: result.model,
          };

          emit({
            type: 'segment.completed',
            at: Date.now(),
            runId,
            provider: providerRef,
            latencyMs: Date.now() - startedAt,
            outputs: {
              maskUrl: result.maskUrl,
              ...(mode === 'unmask'
                ? { backgroundFillUrl: alphaCutoutDataUrl }
                : { cutoutUrl: alphaCutoutDataUrl }),
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
          });

          controller.close();
        } catch (err) {
          const code =
            err instanceof SegmentationUnavailableError
              ? 'provider_unavailable'
              : err instanceof SegmentationError
              ? 'segmentation_failed'
              : 'unknown_error';
          const message = err instanceof Error ? err.message : String(err);
          emit({
            type: 'segment.failed',
            at: Date.now(),
            runId,
            error: message,
            code,
            ...(err instanceof SegmentationUnavailableError
              ? { providers: listSegmentationProviders() }
              : {}),
          });
          controller.close();
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

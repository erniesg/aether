import { NextResponse } from 'next/server';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CLAUDE_MODEL, planGenerate } from '@/lib/agent/generate';
import { encodeGenerateEvent } from '@/lib/generate/stream';
import { listAvailableProviders, resolveProvider } from '@/lib/providers/image/registry';
import type {
  AspectRatio,
  GeneratedImage,
  ImageGenRequest,
  ImageGenResult,
  ImageRef,
} from '@/lib/providers/image/types';
import { ImageGenError, ProviderUnavailableError } from '@/lib/providers/image/types';
import { applyGuidanceToRequest } from '@/lib/providers/image/applyGuidance';
import type {
  CompositionGuidanceInput,
  NegativeZoneInput,
  NormalizedRect,
} from '@/lib/providers/image/guidance';
import { SAFE_ZONE_PRESETS, type SafeZonePresetId } from '@/lib/canvas/safeZones';
import {
  recordRunFail,
  recordRunFinish,
  recordRunStart,
  uploadGeneratedAssetToConvexStorage,
} from '@/lib/convex/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_RATIOS = ['1:1', '9:16', '16:9', '4:3', '3:4', '4:5', '2:3', '3:2'] as const;
const INLINE_IMAGE_ARCHIVE_THRESHOLD_CHARS = 200_000;

type AllowedAspectRatio = (typeof ALLOWED_RATIOS)[number];

interface GenerateTargetInput {
  id?: string;
  label?: string;
  aspectRatio?: string;
  width?: number;
  height?: number;
  preset?: unknown;
  focusArea?: unknown;
  negativeZones?: unknown;
  guidanceRef?: unknown;
}

interface GenerateTarget {
  id: string;
  label?: string;
  aspectRatio: AllowedAspectRatio;
  size?: { w: number; h: number };
  preset?: SafeZonePresetId;
  focusArea?: NormalizedRect;
  negativeZones?: ReadonlyArray<NegativeZoneInput>;
  /** Optional data:image/* PNG encoding the safe-zone as a visual cue. */
  guidanceRef?: string;
}

function parseGuidanceRefUrl(value: unknown): string | undefined {
  return typeof value === 'string' && value.startsWith('data:image/')
    ? value
    : undefined;
}

interface StreamFrameSuccess {
  frame: {
    id: string;
    label?: string;
    index: number;
    total: number;
    aspectRatio: AllowedAspectRatio;
    size?: { w: number; h: number };
  };
  result: ImageGenResult;
  image: {
    url: string;
    width: number;
    height: number;
    mimeType: string;
  };
  anchorRef?: ImageRef;
}

function parseAspectRatio(value: unknown): AllowedAspectRatio | undefined {
  if (typeof value !== 'string') return undefined;
  return (ALLOWED_RATIOS as readonly string[]).includes(value)
    ? (value as AllowedAspectRatio)
    : undefined;
}

function parsePresetId(value: unknown): SafeZonePresetId | undefined {
  return typeof value === 'string' && value in SAFE_ZONE_PRESETS
    ? (value as SafeZonePresetId)
    : undefined;
}

function parseNormalizedRect(value: unknown): NormalizedRect | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const v = value as Record<string, unknown>;
  const fields = ['x', 'y', 'w', 'h'] as const;
  const nums = fields.map((k) => (typeof v[k] === 'number' ? (v[k] as number) : NaN));
  if (nums.some((n) => !Number.isFinite(n))) return undefined;
  const [x, y, w, h] = nums;
  return { x, y, w, h };
}

function parseNegativeZones(value: unknown): ReadonlyArray<NegativeZoneInput> | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: NegativeZoneInput[] = [];
  for (const item of value) {
    const rect = parseNormalizedRect(item);
    if (!rect) continue;
    const rec = item as Record<string, unknown>;
    const label = typeof rec.label === 'string' ? rec.label : undefined;
    out.push({ ...rect, label });
  }
  return out.length > 0 ? out : undefined;
}

function parseTargetSize(width: unknown, height: unknown): GenerateTarget['size'] {
  if (
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return undefined;
  }

  return { w: width, h: height };
}

function parseTargets(value: unknown): GenerateTarget[] | null {
  if (!Array.isArray(value)) return null;
  const targets: GenerateTarget[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const v = entry as GenerateTargetInput;
    const id = typeof v.id === 'string' && v.id.trim() ? v.id.trim() : null;
    const aspectRatio = parseAspectRatio(v.aspectRatio);
    if (!id || !aspectRatio) continue;
    targets.push({
      id,
      label: typeof v.label === 'string' && v.label.trim() ? v.label.trim() : undefined,
      aspectRatio,
      size: parseTargetSize(v.width, v.height),
      preset: parsePresetId(v.preset),
      focusArea: parseNormalizedRect(v.focusArea),
      negativeZones: parseNegativeZones(v.negativeZones),
      guidanceRef: parseGuidanceRefUrl(v.guidanceRef),
    });
  }
  return targets;
}

function jsonError(status: number, error: string, code?: string) {
  return NextResponse.json(code ? { ok: false, error, code } : { ok: false, error }, { status });
}

function parseBase64DataUrl(value: string): { mimeType: string; payload: string; ext: string } | null {
  if (!value.startsWith('data:')) return null;
  const commaIdx = value.indexOf(',');
  if (commaIdx <= 5 || commaIdx === value.length - 1) return null;
  const header = value.slice(5, commaIdx);
  if (!header.includes(';base64')) return null;
  const mimeType = header.split(';', 1)[0] || 'image/png';
  const ext = mimeType.split('/')[1]?.split('+')[0] || 'png';
  return { mimeType, payload: value.slice(commaIdx + 1), ext };
}

function fileSafeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'asset';
}

function isBase64DataUrl(value: string | undefined): value is string {
  return Boolean(value?.startsWith('data:') && value.includes(';base64,'));
}

async function generatedImageToAnchorRef(image: GeneratedImage): Promise<ImageRef | undefined> {
  if (isBase64DataUrl(image.dataUrl)) return { url: image.dataUrl, weight: 1 };
  if (isBase64DataUrl(image.url)) return { url: image.url, weight: 1 };
  if (!/^https?:\/\//i.test(image.url)) return undefined;

  try {
    const response = await fetch(image.url);
    if (!response.ok) return undefined;
    const contentType = response.headers.get('content-type') || image.mimeType || 'image/png';
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      url: `data:${contentType};base64,${buffer.toString('base64')}`,
      weight: 1,
    };
  } catch {
    return undefined;
  }
}

function adaptationPromptForTarget(basePrompt: string, target: GenerateTarget) {
  const format = [
    target.label ?? target.id,
    target.size ? `${Math.round(target.size.w)}x${Math.round(target.size.h)}` : target.aspectRatio,
  ]
    .filter(Boolean)
    .join(' · ');

  return [
    `Adapt the provided key visual into ${format}.`,
    'Preserve the same hero subject, identity, clothing, pose, product, visual style, lighting, palette, and campaign mood.',
    'Recompose only what is needed for this aspect ratio: extend the background, adjust crop, and preserve safe negative space.',
    'Do not invent a new scene or replace the hero visual.',
    `Original direction: ${basePrompt}`,
  ].join(' ');
}

async function archiveGeneratedImage(params: {
  image: GeneratedImage;
  runKey: string;
  frameId: string;
  frameLabel?: string;
  frameIndex: number;
  provider?: string;
  model?: string;
  prompt?: string;
}): Promise<GeneratedImage> {
  if (params.image.url.length <= INLINE_IMAGE_ARCHIVE_THRESHOLD_CHARS) {
    return params.image;
  }

  const parsed = parseBase64DataUrl(params.image.dataUrl ?? params.image.url);
  if (!parsed) return params.image;
  const bytes = Buffer.from(parsed.payload, 'base64');
  const convexAsset = await uploadGeneratedAssetToConvexStorage({
    bytes,
    mimeType: parsed.mimeType,
    kind: 'generated-image',
    clientRunId: params.runKey,
    frameId: params.frameId,
    frameLabel: params.frameLabel,
    provider: params.provider,
    model: params.model,
    prompt: params.prompt,
    width: params.image.width,
    height: params.image.height,
  });
  if (convexAsset) {
    return {
      ...params.image,
      url: convexAsset.url,
      dataUrl: undefined,
      mimeType: params.image.mimeType || parsed.mimeType,
    };
  }

  const runDir = fileSafeId(params.runKey);
  const fileName = `${String(params.frameIndex).padStart(2, '0')}-${fileSafeId(
    params.frameLabel ?? params.frameId
  )}.${parsed.ext}`;
  const publicDir = path.join(process.cwd(), 'public', 'generated', runDir);
  await mkdir(publicDir, { recursive: true });
  await writeFile(path.join(publicDir, fileName), bytes);

  return {
    ...params.image,
    url: `/generated/${runDir}/${fileName}`,
    dataUrl: undefined,
    mimeType: params.image.mimeType || parsed.mimeType,
  };
}

async function settleWithConcurrency<T>(
  items: ReadonlyArray<T>,
  limit: number,
  worker: (item: T, index: number) => Promise<StreamFrameSuccess>
): Promise<Array<PromiseSettledResult<StreamFrameSuccess>>> {
  const results: Array<PromiseSettledResult<StreamFrameSuccess> | undefined> =
    new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = {
          status: 'fulfilled',
          value: await worker(items[index]!, index),
        };
      } catch (reason) {
        results[index] = {
          status: 'rejected',
          reason,
        };
      }
    }
  });

  await Promise.all(workers);
  return results.filter((result): result is PromiseSettledResult<StreamFrameSuccess> =>
    Boolean(result)
  );
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    providers: listAvailableProviders(),
  });
}

export async function POST(request: Request) {
  const reqId = Math.random().toString(36).slice(2, 8);
  console.log(
    `[generate/${reqId}] POST received · ua=${request.headers
      .get('user-agent')
      ?.slice(0, 40) ?? '?'}`
  );

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    console.log(`[generate/${reqId}] rejected · invalid JSON`);
    return jsonError(400, 'invalid JSON body');
  }
  if (typeof body !== 'object' || body === null) {
    return jsonError(400, 'body must be an object');
  }

  const b = body as Record<string, unknown>;
  const prompt = typeof b.prompt === 'string' ? b.prompt.trim() : '';
  if (!prompt) {
    console.log(`[generate/${reqId}] rejected · empty prompt`);
    return jsonError(400, 'prompt is required');
  }

  const providerId = typeof b.providerId === 'string' ? b.providerId : undefined;
  const model = typeof b.model === 'string' ? b.model : undefined;
  const refs = Array.isArray(b.refs) ? (b.refs as ImageRef[]) : undefined;
  const bypassAgent = b.bypassAgent === true;
  const planOnly = b.planOnly === true;
  const clientRunId = typeof b.runId === 'string' ? b.runId : undefined;
  const aspectRatioOverride = parseAspectRatio(b.aspectRatio);
  const requestedTargets = parseTargets(b.targets);
  const defaultGuidance: CompositionGuidanceInput = {
    preset: parsePresetId(b.preset) ?? null,
    focusArea: parseNormalizedRect(b.focusArea),
    negativeZones: parseNegativeZones(b.negativeZones),
  };
  const defaultGuidanceRef = parseGuidanceRefUrl(b.guidanceRef);

  console.log(
    `[generate/${reqId}] running · provider=${providerId ?? 'auto'} model=${model ?? 'auto'} bypassAgent=${bypassAgent} planOnly=${planOnly} aspect=${aspectRatioOverride ?? 'auto'} promptLen=${prompt.length}`
  );

  if (clientRunId) {
    await recordRunStart({
      clientRunId,
      tool: 'image-gen',
      provider: providerId ?? 'auto',
      model: model ?? '',
      prompt,
      aspectRatio: aspectRatioOverride,
    });
  }

  try {
    if (planOnly) {
      const plannerAspect =
        requestedTargets && requestedTargets.length === 1
          ? requestedTargets[0].aspectRatio
          : aspectRatioOverride;
      const outcome = await planGenerate({
        prompt,
        providerId,
        model,
        refs,
        bypassAgent,
        aspectRatioOverride: plannerAspect,
      });
      console.log(
        `[generate/${reqId}] planned · provider=${outcome.provider.id} model=${outcome.provider.model} aspect=${outcome.plan.aspectRatio}`
      );
      return NextResponse.json({
        ok: true,
        plan: outcome.plan,
        provider: outcome.provider,
        debug: outcome.debug,
      });
    }

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        void (async () => {
          const startedAt = Date.now();
          let streamClosed = false;
          const plannerAspect =
            requestedTargets && requestedTargets.length === 1
              ? requestedTargets[0].aspectRatio
              : aspectRatioOverride;

          const emit = (event: Parameters<typeof encodeGenerateEvent>[0]) => {
            if (streamClosed) return false;
            try {
              controller.enqueue(encodeGenerateEvent(event));
              return true;
            } catch (error) {
              streamClosed = true;
              console.warn(
                `[generate/${reqId}] stream closed before ${event.type}`,
                error
              );
              return false;
            }
          };

          emit({
            type: 'run.started',
            at: Date.now(),
            mode:
              requestedTargets && requestedTargets.length > 1 ? 'fanout' : 'single',
            frames: {
              total: requestedTargets?.length ?? 1,
            },
          });

          if (!bypassAgent) {
            emit({
              type: 'planner.started',
              at: Date.now(),
              plannerModel: CLAUDE_MODEL,
            });
          }

          try {
            const planned = await planGenerate({
              prompt,
              providerId,
              model,
              refs,
              bypassAgent,
              aspectRatioOverride: plannerAspect,
            });

            emit({
              type: 'plan.ready',
              at: Date.now(),
              plannerMode: planned.debug.plannerMode,
              plannerModel: planned.debug.plannerModel,
              plannerError: planned.debug.plannerError,
              rewrittenPrompt: planned.plan.rewrittenPrompt,
              aspectRatio: planned.plan.aspectRatio as AspectRatio,
              rationale: planned.plan.rationale,
              provider: planned.provider,
              toolCall: planned.debug.toolCall,
            });

            const provider = resolveProvider(planned.provider.id, planned.provider.model);
            const targets =
              requestedTargets && requestedTargets.length > 0
                ? requestedTargets
                : [
                    {
                      id: 'canvas',
                      aspectRatio:
                        aspectRatioOverride ??
                        (planned.plan.aspectRatio as AllowedAspectRatio),
                    },
                  ];

            const basePrompt = planned.plan.rewrittenPrompt;
            const makeFrame = (target: GenerateTarget, index: number) =>
              ({
                id: target.id,
                label: target.label,
                index: index + 1,
                total: targets.length,
                aspectRatio: target.aspectRatio,
                size: target.size,
              }) as const;

            const generateFrame = async (
              target: GenerateTarget,
              index: number,
              framePrompt: string,
              frameRefs?: ImageRef[]
            ): Promise<StreamFrameSuccess> => {
              const frame = makeFrame(target, index);

              emit({
                type: 'frame.started',
                at: Date.now(),
                frame,
                provider: planned.provider,
              });

              try {
                console.log(
                  `[generate/${reqId}] frame started · ${frame.index}/${frame.total} ${frame.label ?? frame.id} aspect=${frame.aspectRatio} size=${target.size ? `${target.size.w}x${target.size.h}` : 'auto'} refs=${frameRefs?.length ?? 0}`
                );
                const guidanceRefUrl = target.guidanceRef ?? defaultGuidanceRef;
                const augmentedRefs: ImageRef[] | undefined = guidanceRefUrl
                  ? [{ url: guidanceRefUrl, weight: 0.3 }, ...(frameRefs ?? [])]
                  : frameRefs;
                const baseRequest: ImageGenRequest = {
                  prompt: framePrompt,
                  refs: augmentedRefs,
                  aspectRatio: target.aspectRatio,
                  size: target.size,
                  seed: planned.plan.seed,
                };
                const guidanceInput: CompositionGuidanceInput = {
                  preset: target.preset ?? defaultGuidance.preset,
                  focusArea: target.focusArea ?? defaultGuidance.focusArea,
                  negativeZones: target.negativeZones ?? defaultGuidance.negativeZones,
                };
                const request = applyGuidanceToRequest(baseRequest, guidanceInput);
                const result = await provider.generate(
                  request,
                  { model: planned.provider.model }
                );

                const first = result.images[0];
                if (!first) throw new Error('provider returned no images');
                const anchorRef = await generatedImageToAnchorRef(first);
                const archived = await archiveGeneratedImage({
                  image: first,
                  runKey: clientRunId ?? reqId,
                  frameId: frame.id,
                  frameLabel: frame.label,
                  frameIndex: frame.index,
                  provider: planned.provider.id,
                  model: planned.provider.model,
                  prompt: framePrompt,
                });
                console.log(
                  `[generate/${reqId}] frame completed · ${frame.index}/${frame.total} ${frame.label ?? frame.id} ${archived.width}x${archived.height} ${(result.latencyMs / 1000).toFixed(1)}s`
                );

                emit({
                  type: 'frame.completed',
                  at: Date.now(),
                  frame,
                  provider: planned.provider,
                  latencyMs: result.latencyMs,
                  image: {
                    url: archived.url,
                    width: archived.width,
                    height: archived.height,
                    mimeType: archived.mimeType,
                  },
                });

                return {
                  frame,
                  result,
                  image: archived,
                  anchorRef,
                };
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                console.error(
                  `[generate/${reqId}] frame failed · ${frame.index}/${frame.total} ${frame.label ?? frame.id} · ${message}`
                );
                emit({
                  type: 'frame.failed',
                  at: Date.now(),
                  frame,
                  provider: planned.provider,
                  error: message,
                  code:
                    err instanceof ProviderUnavailableError
                      ? 'provider_unavailable'
                      : err instanceof ImageGenError
                      ? 'image_gen_failed'
                      : 'unknown_error',
                });
                throw err;
              }
            };

            const anchoredFanout = targets.length > 1;
            const fanoutConcurrency = anchoredFanout
              ? Math.min(2, Math.max(1, targets.length - 1))
              : planned.provider.id === 'openai' &&
                planned.provider.model.startsWith('gpt-image-2')
              ? Math.min(2, targets.length)
              : targets.length;
            console.log(
              `[generate/${reqId}] fanout · provider=${planned.provider.id} model=${planned.provider.model} targets=${targets.length} concurrency=${fanoutConcurrency} strategy=${anchoredFanout ? 'anchored-key-visual' : 'single'}`
            );

            let settled: Array<PromiseSettledResult<StreamFrameSuccess>>;
            if (anchoredFanout) {
              const [firstTarget, ...remainingTargets] = targets;
              const firstSettled = await generateFrame(firstTarget!, 0, basePrompt, refs).then(
                (value): PromiseFulfilledResult<StreamFrameSuccess> => ({
                  status: 'fulfilled',
                  value,
                }),
                (reason): PromiseRejectedResult => ({
                  status: 'rejected',
                  reason,
                })
              );

              if (firstSettled.status === 'fulfilled') {
                const anchoredRefs = firstSettled.value.anchorRef
                  ? [firstSettled.value.anchorRef, ...(refs ?? [])]
                  : refs;
                if (!firstSettled.value.anchorRef) {
                  console.warn(
                    `[generate/${reqId}] key visual has no reusable data-url ref; provider may generate looser adaptations`
                  );
                }
                const remainingSettled = await settleWithConcurrency(
                  remainingTargets,
                  fanoutConcurrency,
                  (target, index) =>
                    generateFrame(
                      target,
                      index + 1,
                      adaptationPromptForTarget(basePrompt, target),
                      anchoredRefs
                    )
                );
                settled = [firstSettled, ...remainingSettled];
              } else {
                const message =
                  firstSettled.reason instanceof Error
                    ? firstSettled.reason.message
                    : String(firstSettled.reason);
                settled = [
                  firstSettled,
                  ...remainingTargets.map((target, offset) => {
                    const frame = makeFrame(target, offset + 1);
                    emit({
                      type: 'frame.failed',
                      at: Date.now(),
                      frame,
                      provider: planned.provider,
                      error: `key visual failed; ${target.label ?? target.id} was not generated`,
                      code: 'image_gen_failed',
                    });
                    return {
                      status: 'rejected' as const,
                      reason: new Error(
                        `key visual generation failed before ${target.label ?? target.id}: ${message}`
                      ),
                    };
                  }),
                ];
              }
            } else {
              settled = await settleWithConcurrency(targets, fanoutConcurrency, (target, index) =>
                generateFrame(target, index, basePrompt, refs)
              );
            }

            const successes: StreamFrameSuccess[] = settled.flatMap((item) =>
              item.status === 'fulfilled' ? [item.value] : []
            );
            const failed = settled.length - successes.length;
            const firstImage = successes[0]?.image;
            const elapsedMs = Date.now() - startedAt;
            const runStatus =
              failed === 0 ? 'ok' : successes.length === 0 ? 'error' : 'partial';
            const summaryError =
              failed > 0 ? `${failed} of ${targets.length} frame${failed === 1 ? '' : 's'} failed` : undefined;

            emit({
              type: 'run.completed',
              at: Date.now(),
              status: runStatus,
              frames: {
                total: targets.length,
                completed: successes.length,
                failed,
              },
              provider: planned.provider,
              rewrittenPrompt: planned.plan.rewrittenPrompt,
              rationale: planned.plan.rationale,
              aspectRatio: planned.plan.aspectRatio as AspectRatio,
              firstImageUrl: firstImage?.url,
              imageUrls: successes.map((success) => success.image.url),
              elapsedMs,
              error: summaryError,
            });

            if (clientRunId) {
              await recordRunFinish(clientRunId, {
                status: runStatus === 'ok' ? 'ok' : 'error',
                provider: planned.provider.id,
                model: planned.provider.model,
                rewrittenPrompt: planned.plan.rewrittenPrompt,
                rationale: planned.plan.rationale,
                aspectRatio: planned.plan.aspectRatio,
                imageUrl: firstImage?.url,
                outputRefs: failed === 0 ? successes.map((success) => success.image.url) : undefined,
                latencyMs: elapsedMs,
                error: summaryError,
              });
            }

            if (!streamClosed) {
              streamClosed = true;
              controller.close();
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const code =
              err instanceof ProviderUnavailableError
                ? 'provider_unavailable'
                : err instanceof ImageGenError
                ? 'image_gen_failed'
                : 'unknown_error';

            emit({
              type: 'run.completed',
              at: Date.now(),
              status: 'error',
              frames: {
                total: requestedTargets?.length ?? 1,
                completed: 0,
                failed: requestedTargets?.length ?? 1,
              },
              elapsedMs: Date.now() - startedAt,
              error: message,
            });

            if (clientRunId) {
              await recordRunFail(
                clientRunId,
                message,
                err instanceof ProviderUnavailableError
                  ? 503
                  : err instanceof ImageGenError
                  ? 502
                  : 500
              );
            }

            console.error(`[generate/${reqId}] stream error · ${code} · ${message}`);
            if (!streamClosed) {
              streamClosed = true;
              controller.close();
            }
          }
        })();
      },
      cancel() {
        console.log(`[generate/${reqId}] stream cancelled by client`);
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    if (err instanceof ProviderUnavailableError) {
      console.log(`[generate/${reqId}] 503 · ${err.message}`);
      if (clientRunId) await recordRunFail(clientRunId, err.message, 503);
      return jsonError(503, err.message, 'provider_unavailable');
    }
    if (err instanceof ImageGenError) {
      console.log(`[generate/${reqId}] 502 · ${err.message}`);
      if (clientRunId) await recordRunFail(clientRunId, err.message, 502);
      return jsonError(502, err.message, 'image_gen_failed');
    }

    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error(`[generate/${reqId}] 500 · ${message}`, stack);
    if (clientRunId) await recordRunFail(clientRunId, message, 500);
    return jsonError(500, message);
  }
}

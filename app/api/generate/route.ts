import { NextResponse } from 'next/server';
import { CLAUDE_MODEL, planGenerate } from '@/lib/agent/generate';
import { encodeGenerateEvent } from '@/lib/generate/stream';
import { resolveComposition } from '@/lib/providers/image/composition';
import { listAvailableProviders, resolveProvider } from '@/lib/providers/image/registry';
import type {
  AspectRatio,
  ImageComposition,
  ImageConstraintToken,
  ImageGenResult,
  ImageRef,
} from '@/lib/providers/image/types';
import { ImageGenError, ProviderUnavailableError } from '@/lib/providers/image/types';
import { recordRunFail, recordRunFinish, recordRunStart } from '@/lib/convex/http';
import { cropHeroToFormats } from '@/lib/canvas/cropToFormat';
import { pickRenderMode } from '@/lib/canvas/render-mode';
import type { RenderModeChoice } from '@/lib/canvas/render-mode';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_RATIOS = ['1:1', '9:16', '16:9', '4:3', '3:4', '4:5', '2:3', '3:2'] as const;
const ALLOWED_TEXT_STRATEGIES = ['none', 'baked', 'auto'] as const;
const ALLOWED_CONSTRAINTS = [
  'no-faces',
  'no-watermarks',
  'no-signatures',
  'no-unknown-brand-logos',
  'no-typography-artifacts',
  'no-nsfw-overlay-text',
] as const satisfies readonly ImageConstraintToken[];

type AllowedAspectRatio = (typeof ALLOWED_RATIOS)[number];

interface GenerateTargetInput {
  id?: string;
  label?: string;
  aspectRatio?: string;
}

interface GenerateTarget {
  id: string;
  label?: string;
  aspectRatio: AllowedAspectRatio;
}

interface StreamFrameSuccess {
  frame: {
    id: string;
    label?: string;
    index: number;
    total: number;
    aspectRatio: AllowedAspectRatio;
  };
  result: ImageGenResult;
  image: {
    url: string;
    width: number;
    height: number;
    mimeType: string;
  };
}

function parseAspectRatio(value: unknown): AllowedAspectRatio | undefined {
  if (typeof value !== 'string') return undefined;
  return (ALLOWED_RATIOS as readonly string[]).includes(value)
    ? (value as AllowedAspectRatio)
    : undefined;
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
    });
  }
  return targets;
}

function parseComposition(value: unknown):
  | { ok: true; composition?: ImageComposition }
  | { ok: false; error: string } {
  if (value === undefined) return { ok: true };
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, error: 'composition must be an object' };
  }

  const input = value as Record<string, unknown>;
  const composition: ImageComposition = {};

  if (input.textStrategy !== undefined) {
    if (
      typeof input.textStrategy !== 'string' ||
      !(ALLOWED_TEXT_STRATEGIES as readonly string[]).includes(input.textStrategy)
    ) {
      return { ok: false, error: 'composition.textStrategy is invalid' };
    }
    composition.textStrategy = input.textStrategy as ImageComposition['textStrategy'];
  }

  if (input.constraints !== undefined) {
    if (!Array.isArray(input.constraints)) {
      return { ok: false, error: 'composition.constraints must be an array' };
    }
    composition.constraints = input.constraints.filter(
      (token): token is ImageConstraintToken =>
        typeof token === 'string' &&
        (ALLOWED_CONSTRAINTS as readonly string[]).includes(token)
    );
  }

  return { ok: true, composition };
}

/**
 * Canonical pixel dimensions for each allowed aspect ratio.
 * Used to compute pixel area for hero selection (largest target = hero).
 */
const RATIO_PIXELS: Record<AllowedAspectRatio, { w: number; h: number }> = {
  '1:1':  { w: 1024, h: 1024 },
  '9:16': { w: 1080, h: 1920 },
  '16:9': { w: 1920, h: 1080 },
  '4:3':  { w: 1440, h: 1080 },
  '3:4':  { w: 1080, h: 1440 },
  '4:5':  { w: 1024, h: 1280 },
  '2:3':  { w: 1024, h: 1536 },
  '3:2':  { w: 1536, h: 1024 },
};

function parseRenderMode(value: unknown): RenderModeChoice {
  if (value === 'crop' || value === 'fanout' || value === 'auto') return value;
  // Default: crop (demo thesis — one render, many crops).
  return 'crop';
}

function jsonError(status: number, error: string, code?: string) {
  return NextResponse.json(code ? { ok: false, error, code } : { ok: false, error }, { status });
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
  const parsedComposition = parseComposition(b.composition);
  if (!parsedComposition.ok) {
    return jsonError(400, parsedComposition.error);
  }
  const composition = resolveComposition(parsedComposition.composition, undefined);
  const modeChoice = parseRenderMode(b.mode);

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
          const plannerAspect =
            requestedTargets && requestedTargets.length === 1
              ? requestedTargets[0].aspectRatio
              : aspectRatioOverride;

          const emit = (event: Parameters<typeof encodeGenerateEvent>[0]) => {
            controller.enqueue(encodeGenerateEvent(event));
          };

          emit({
            type: 'run.started',
            at: Date.now(),
            mode:
              requestedTargets && requestedTargets.length > 1
                ? (modeChoice === 'fanout' ? 'fanout' : 'crop')
                : 'single',
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

            // ── Resolve render mode ───────────────────────────────────────────
            const formatAspects = targets.map((t) => {
              const px = RATIO_PIXELS[t.aspectRatio];
              return { w: px.w, h: px.h };
            });
            const resolvedMode = pickRenderMode(formatAspects, modeChoice);

            // ── Select hero: largest target by canonical pixel area ───────────
            const heroTarget = targets.reduce((best, t) => {
              const bestPx = RATIO_PIXELS[best.aspectRatio];
              const tPx = RATIO_PIXELS[t.aspectRatio];
              return tPx.w * tPx.h > bestPx.w * bestPx.h ? t : best;
            });
            const nonHeroTargets = targets.filter((t) => t !== heroTarget);

            // ── Crop path: one render → N crops ──────────────────────────────
            if (resolvedMode === 'crop' && targets.length > 1) {
              // Step 1: generate the hero.
              const heroFrame = {
                id: heroTarget.id,
                label: heroTarget.label,
                index: 1,
                total: targets.length,
                aspectRatio: heroTarget.aspectRatio,
              } as const;

              emit({ type: 'frame.started', at: Date.now(), frame: heroFrame, provider: planned.provider });

              let heroImage: { url: string; width: number; height: number; mimeType: string };
              try {
                const heroResult = await provider.generate(
                  {
                    prompt: planned.plan.rewrittenPrompt,
                    refs,
                    aspectRatio: heroTarget.aspectRatio,
                    seed: planned.plan.seed,
                    composition,
                  },
                  { model: planned.provider.model }
                );
                const heroFirst = heroResult.images[0];
                if (!heroFirst) throw new Error('provider returned no images for hero');
                heroImage = heroFirst;

                emit({
                  type: 'frame.completed',
                  at: Date.now(),
                  frame: heroFrame,
                  provider: planned.provider,
                  latencyMs: heroResult.latencyMs,
                  image: { url: heroFirst.url, width: heroFirst.width, height: heroFirst.height, mimeType: heroFirst.mimeType },
                });
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                emit({
                  type: 'frame.failed',
                  at: Date.now(),
                  frame: heroFrame,
                  provider: planned.provider,
                  error: message,
                  code: err instanceof ProviderUnavailableError ? 'provider_unavailable' : err instanceof ImageGenError ? 'image_gen_failed' : 'unknown_error',
                });
                throw err;
              }

              // Step 2: compute crops for non-hero targets.
              const heroPx = RATIO_PIXELS[heroTarget.aspectRatio];
              const cropInputFormats = nonHeroTargets.map((t) => {
                const px = RATIO_PIXELS[t.aspectRatio];
                return { id: t.id, w: px.w, h: px.h, label: t.label };
              });
              const croppedFormats = cropHeroToFormats({
                heroAsset: { width: heroPx.w, height: heroPx.h, url: heroImage.url },
                formats: cropInputFormats,
              });

              // Emit frame events for each cropped variant.
              for (let i = 0; i < nonHeroTargets.length; i++) {
                const target = nonHeroTargets[i]!;
                const cropped = croppedFormats[i]!;
                const frame = {
                  id: target.id,
                  label: target.label,
                  index: i + 2,
                  total: targets.length,
                  aspectRatio: target.aspectRatio,
                } as const;

                emit({ type: 'frame.started', at: Date.now(), frame, provider: planned.provider });
                emit({
                  type: 'frame.completed',
                  at: Date.now(),
                  frame,
                  provider: planned.provider,
                  latencyMs: 0,
                  image: { url: heroImage.url, width: cropped.w, height: cropped.h, mimeType: heroImage.mimeType },
                });
              }

              emit({
                type: 'run.completed',
                at: Date.now(),
                status: 'ok',
                mode: 'crop',
                frames: { total: targets.length, completed: targets.length, failed: 0 },
                provider: planned.provider,
                rewrittenPrompt: planned.plan.rewrittenPrompt,
                rationale: planned.plan.rationale,
                aspectRatio: planned.plan.aspectRatio as AspectRatio,
                firstImageUrl: heroImage.url,
                elapsedMs: Date.now() - startedAt,
              });

              if (clientRunId) {
                await recordRunFinish(clientRunId, {
                  status: 'ok',
                  provider: planned.provider.id,
                  model: planned.provider.model,
                  rewrittenPrompt: planned.plan.rewrittenPrompt,
                  rationale: planned.plan.rationale,
                  aspectRatio: planned.plan.aspectRatio,
                  imageUrl: heroImage.url,
                  latencyMs: Date.now() - startedAt,
                });
              }

              controller.close();
              return;
            }

            // ── Fanout path: N separate generates (original behaviour) ────────
            const settled = await Promise.allSettled(
              targets.map(async (target, index) => {
                const frame = {
                  id: target.id,
                  label: target.label,
                  index: index + 1,
                  total: targets.length,
                  aspectRatio: target.aspectRatio,
                } as const;

                emit({
                  type: 'frame.started',
                  at: Date.now(),
                  frame,
                  provider: planned.provider,
                });

                try {
                  const result = await provider.generate(
                    {
                      prompt: planned.plan.rewrittenPrompt,
                      refs,
                      aspectRatio: target.aspectRatio,
                      seed: planned.plan.seed,
                      composition,
                    },
                    { model: planned.provider.model }
                  );

                  const first = result.images[0];
                  if (!first) throw new Error('provider returned no images');

                  emit({
                    type: 'frame.completed',
                    at: Date.now(),
                    frame,
                    provider: planned.provider,
                    latencyMs: result.latencyMs,
                    image: {
                      url: first.url,
                      width: first.width,
                      height: first.height,
                      mimeType: first.mimeType,
                    },
                  });

                  return {
                    frame,
                    result,
                    image: first,
                  };
                } catch (err) {
                  const message = err instanceof Error ? err.message : String(err);
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
              })
            );

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
              mode: targets.length > 1 ? 'fanout' : undefined,
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
                latencyMs: elapsedMs,
                error: summaryError,
              });
            }

            controller.close();
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

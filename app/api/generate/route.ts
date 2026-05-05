import { NextResponse } from 'next/server';
import { CLAUDE_MODEL, planGenerate } from '@/lib/agent/generate';
import { encodeGenerateEvent } from '@/lib/generate/stream';
import { resolveComposition } from '@/lib/providers/image/composition';
import { listAvailableProviders, resolveProvider } from '@/lib/providers/image/registry';
import { normalizeImageModelId } from '@/lib/providers/image/model-catalog';
import type {
  AspectRatio,
  ImageComposition,
  ImageConstraintToken,
  ImageGenResult,
  ImageGenProvider,
  ImageRef,
} from '@/lib/providers/image/types';
import { ImageGenError, ProviderUnavailableError } from '@/lib/providers/image/types';
import { recordRunFail, recordRunFinish, recordRunStart } from '@/lib/convex/http';
import { cropHeroToFormats } from '@/lib/canvas/cropToFormat';
import { pickRenderMode } from '@/lib/canvas/render-mode';
import type { RenderModeChoice } from '@/lib/canvas/render-mode';
import { persistGenerateAsCampaign } from '@/lib/agent/persist-generation';
import {
  buildChildFormatPrompt,
  buildHeroSeedPrompt,
  clampHeroCount,
  planHeroDirections,
  selectChildGenerationRefs,
  type HeroDirection,
} from '@/lib/generate/hero-directions';
import {
  runVisualGridQa,
  type VisualQaResult,
} from '@/lib/generate/visual-qa';
import {
  PUBLISH_PLATFORMS,
  type PublishPlatform,
} from '@/lib/providers/publisher/types';

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
  provider: PlannedProviderInfo;
  result: ImageGenResult;
  image: {
    url: string;
    width: number;
    height: number;
    mimeType: string;
  };
  visualQa?: VisualQaResult;
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

function parsePublishPlatforms(value: unknown): PublishPlatform[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const platforms = value.filter(
    (platform): platform is PublishPlatform =>
      typeof platform === 'string' &&
      (PUBLISH_PLATFORMS as readonly string[]).includes(platform)
  );
  const unique = Array.from(new Set(platforms));
  return unique.length > 0 ? unique : undefined;
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

type PublishFormatId = '1x1' | '4x5' | '9x16' | '16x9';

const ASPECT_TO_FORMAT_ID: Partial<Record<AllowedAspectRatio, PublishFormatId>> = {
  '1:1': '1x1',
  '4:5': '4x5',
  '9:16': '9x16',
  '16:9': '16x9',
};

function parseRenderMode(value: unknown): RenderModeChoice {
  if (
    value === 'crop' ||
    value === 'fanout' ||
    value === 'hero-seeded-fanout' ||
    value === 'auto'
  ) {
    return value;
  }
  // Default: crop (demo thesis — one render, many crops).
  return 'crop';
}

function shouldRetryImageGeneration(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /(?:abort|aborted|timeout|timed out|terminated|socket hang up|ECONNRESET|ETIMEDOUT|fetch failed|poll failed 5\d\d|429|visual QA rejected)/i.test(
    message
  );
}

function providerRetryAttempts(): number {
  const raw = Number(process.env.AETHER_IMAGE_PROVIDER_RETRIES ?? 2);
  if (!Number.isFinite(raw)) return 2;
  return Math.max(1, Math.min(Math.trunc(raw), 3));
}

const DEFAULT_FRAME_TIMEOUT_MS = 12 * 60_000;

class FrameGenerationTimeoutError extends ImageGenError {
  constructor(providerId: string, frameId: string, timeoutMs: number) {
    super(
      `frame ${frameId} timed out after ${Math.round(timeoutMs / 1000)}s`,
      providerId
    );
    this.name = 'FrameGenerationTimeoutError';
  }
}

function providerFrameTimeoutMs(): number {
  const raw = Number(process.env.AETHER_IMAGE_FRAME_TIMEOUT_MS ?? DEFAULT_FRAME_TIMEOUT_MS);
  if (!Number.isFinite(raw)) return DEFAULT_FRAME_TIMEOUT_MS;
  return Math.max(1, Math.min(Math.trunc(raw), 30 * 60_000));
}

async function withFrameTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  input: { providerId: string; frameId: string; timeoutMs: number }
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run(controller.signal),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(
            new FrameGenerationTimeoutError(
              input.providerId,
              input.frameId,
              input.timeoutMs
            )
          );
        }, input.timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function jsonError(status: number, error: string, code?: string) {
  return NextResponse.json(code ? { ok: false, error, code } : { ok: false, error }, { status });
}

type PlannedProviderInfo = {
  id: string;
  displayName: string;
  model: string;
};

type ProviderCandidate = {
  provider: ImageGenProvider;
  info: PlannedProviderInfo;
};

function availableProviderId(
  value: ReturnType<typeof listAvailableProviders>[number] | string
): string | undefined {
  if (typeof value === 'string') return value;
  return typeof value.id === 'string' ? value.id : undefined;
}

function firstAvailableModel(
  value: ReturnType<typeof listAvailableProviders>[number] | string,
  provider: ImageGenProvider
): string | undefined {
  if (typeof value !== 'string' && Array.isArray(value.models) && value.models[0]) {
    return value.models[0];
  }
  return provider.listModels()[0];
}

function resolveProviderCandidates(
  primary: PlannedProviderInfo,
  allowFallback: boolean
): ProviderCandidate[] {
  const provider = resolveProvider(primary.id, primary.model);
  const primaryModel = normalizeImageModelId(provider.id, primary.model || provider.listModels()[0]);
  if (!primaryModel) {
    throw new ProviderUnavailableError(primary.id, 'provider has no configured models');
  }

  const candidates: ProviderCandidate[] = [
    {
      provider,
      info: {
        id: provider.id,
        displayName: provider.displayName,
        model: primaryModel,
      },
    },
  ];
  if (!allowFallback) return candidates;

  const seen = new Set([provider.id]);
  for (const available of listAvailableProviders()) {
    const id = availableProviderId(available);
    if (!id || seen.has(id)) continue;
    try {
      const fallbackProvider = resolveProvider(id);
      const fallbackModel = firstAvailableModel(available, fallbackProvider);
      if (!fallbackModel) continue;
      seen.add(fallbackProvider.id);
      candidates.push({
        provider: fallbackProvider,
        info: {
          id: fallbackProvider.id,
          displayName: fallbackProvider.displayName,
          model: fallbackModel,
        },
      });
    } catch {
      // Availability changed between list and resolve; keep the primary path.
    }
  }

  return candidates;
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

  const providerId =
    typeof b.providerId === 'string' && b.providerId.trim().length > 0
      ? b.providerId.trim()
      : undefined;
  const model =
    typeof b.model === 'string' && b.model.trim().length > 0
      ? b.model.trim()
      : undefined;
  const allowProviderFallback = b.allowProviderFallback === true;
  const refs = Array.isArray(b.refs) ? (b.refs as ImageRef[]) : undefined;
  // When persistRun=true (UI drag-drop sets this), a successful generate
  // is recorded as a synthetic auto-mode campaign + variation row so it
  // shows up on /runs and a Discord ping with a "Post now" button fires.
  // Defaults to false so smoke tests / direct-script callers stay quiet.
  const persistRun = b.persistRun === true;
  // Drag-drop publishing intent (PromptComposer notify-mode chip). 'review'
  // is the existing default — synthetic campaign + Discord ping. 'auto-post'
  // additionally fires scheduleVariationPosts immediately after persist.
  const persistNotifyMode: 'review' | 'auto-post' =
    b.notifyMode === 'auto-post' ? 'auto-post' : 'review';
  const targetPlatforms = parsePublishPlatforms(b.targetPlatforms);
  const workspaceId =
    typeof b.workspaceId === 'string' && b.workspaceId.trim().length > 0
      ? b.workspaceId.trim()
      : undefined;
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
  const heroCount = clampHeroCount(b.heroCount ?? b.directionCount ?? 1);
  const includeProductIdentityRef = b.includeProductIdentityRef === true;
  const heroDirectionPlan = planHeroDirections({
    prompt,
    count: heroCount,
    strategy: typeof b.directionStrategy === 'string' ? b.directionStrategy : undefined,
  });
  const voiceTrace =
    b.voiceTrace && typeof b.voiceTrace === 'object' && !Array.isArray(b.voiceTrace)
      ? (b.voiceTrace as Record<string, unknown>)
      : undefined;
  const runInputs: Record<string, unknown> = {
    prompt,
    refs: Array.isArray(refs) ? refs.length : 0,
  };
  if (model) runInputs.model = model;
  if (aspectRatioOverride) runInputs.aspectRatio = aspectRatioOverride;
  if (voiceTrace) runInputs.voiceTrace = voiceTrace;

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
      inputs: runInputs,
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

          // Keepalive: gpt-image-2 /v1/images/edits with multi-MB ref
          // bytes can run 200-400s with no intermediate signal. Without
          // a heartbeat the client's stale-stream timer (WorkspaceShell
          // STREAM_STALE_MS) trips and aborts the stream. Send an SSE
          // comment line every 20s while the run is in flight; comments
          // (`:` prefix) are valid SSE that browsers accept and any
          // resetStaleTimer hook on the client treats as activity.
          const KEEPALIVE_MS = 20_000;
          const encoder = new TextEncoder();
          const keepaliveTimer = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`));
            } catch {
              // Controller already closed (run completed or client aborted).
            }
          }, KEEPALIVE_MS);
          const stopKeepalive = () => clearInterval(keepaliveTimer);
          const runStartedFrameTotal =
            modeChoice === 'hero-seeded-fanout' && requestedTargets?.length
              ? (requestedTargets.some((target) => target.aspectRatio === '1:1')
                  ? requestedTargets.length
                  : requestedTargets.length + 1) * heroDirectionPlan.directions.length
              : requestedTargets?.length ?? 1;

          emit({
            type: 'run.started',
            at: Date.now(),
            mode:
              requestedTargets && requestedTargets.length > 1
                ? modeChoice === 'hero-seeded-fanout'
                  ? 'hero-seeded-fanout'
                  : modeChoice === 'fanout'
                    ? 'fanout'
                    : 'crop'
                : 'single',
            frames: {
              total: runStartedFrameTotal,
            },
            heroDirections:
              modeChoice === 'hero-seeded-fanout'
                ? heroDirectionPlan.directions
                : undefined,
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

            const providerCandidates = resolveProviderCandidates(
              planned.provider,
              allowProviderFallback
            );
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

            async function generateFrameWithFallback(
              frame: {
                id: string;
                label?: string;
                index: number;
                total: number;
                aspectRatio: AllowedAspectRatio;
                sourceFrameId?: string;
                formatId?: PublishFormatId;
                heroDirectionId?: string;
                heroDirectionLabel?: string;
                heroDirectionIndex?: number;
                role?: 'hero-seed' | 'child-format';
              },
              aspectRatio: AllowedAspectRatio,
              overrides: {
                prompt?: string;
                refs?: ImageRef[];
                runVisualQa?: boolean;
              } = {}
            ): Promise<{
              result: ImageGenResult;
              provider: PlannedProviderInfo;
              visualQa?: VisualQaResult;
            }> {
              let lastError: unknown;
              const attempts = providerRetryAttempts();
              const timeoutMs = providerFrameTimeoutMs();
              for (const candidate of providerCandidates) {
                for (let attempt = 1; attempt <= attempts; attempt++) {
                  emit({
                    type: 'frame.started',
                    at: Date.now(),
                    frame,
                    provider: candidate.info,
                  });

                  try {
                    const result = await withFrameTimeout(
                      (signal) =>
                        candidate.provider.generate(
                          {
                            prompt: overrides.prompt ?? planned.plan.rewrittenPrompt,
                            refs: overrides.refs ?? refs,
                            aspectRatio,
                            seed: planned.plan.seed,
                            composition,
                          },
                          { model: candidate.info.model, signal }
                        ),
                      {
                        providerId: candidate.info.id,
                        frameId: frame.id,
                        timeoutMs,
                      }
                    );
                    const first = result.images[0];
                    let visualQa: VisualQaResult | undefined;
                    if (overrides.runVisualQa && first?.url) {
                      try {
                        visualQa = await runVisualGridQa(first.url);
                      } catch (qaErr) {
                        visualQa = {
                          status: 'needs-human-review',
                          reasons: [
                            qaErr instanceof Error
                              ? qaErr.message
                              : String(qaErr),
                          ],
                          metrics: {
                            width: first.width,
                            height: first.height,
                            verticalLineCount: 0,
                            horizontalLineCount: 0,
                            edgeDensity: 0,
                            gridScore: 0,
                          },
                        };
                      }
                      if (visualQa.status === 'fail') {
                        throw new ImageGenError(
                          `visual QA rejected possible collage/contact sheet: ${visualQa.reasons.join('; ')}`,
                          candidate.info.id
                        );
                      }
                    }
                    return { result, provider: candidate.info, visualQa };
                  } catch (err) {
                    lastError = err;
                    const message = err instanceof Error ? err.message : String(err);
                    const canRetry =
                      !(err instanceof FrameGenerationTimeoutError) &&
                      attempt < attempts &&
                      shouldRetryImageGeneration(err);
                    if (canRetry) {
                      console.warn(
                        `[generate/${reqId}] frame retry ${attempt}/${attempts} · ${frame.id} · ${message}`
                      );
                      continue;
                    }
                    emit({
                      type: 'frame.failed',
                      at: Date.now(),
                      frame,
                      provider: candidate.info,
                      error: message,
                      code:
                        err instanceof ProviderUnavailableError
                          ? 'provider_unavailable'
                          : err instanceof FrameGenerationTimeoutError
                          ? 'image_gen_timeout'
                          : err instanceof ImageGenError
                          ? 'image_gen_failed'
                          : 'unknown_error',
                    });
                    break;
                  }
                }
              }
              throw lastError ?? new ImageGenError('all provider attempts failed', 'auto');
            }

            function heroFrameForTarget(input: {
              target: GenerateTarget;
              direction: HeroDirection;
              directionIndex: number;
              targetIndex: number;
              perDirectionTotal: number;
              role: 'hero-seed' | 'child-format';
            }) {
              const { target, direction, directionIndex, targetIndex, perDirectionTotal, role } =
                input;
              const isSingleHero = heroDirectionPlan.directions.length === 1;
              return {
                id: isSingleHero ? target.id : `${direction.id}:${target.id}`,
                sourceFrameId: isSingleHero ? undefined : target.id,
                label: isSingleHero
                  ? target.label
                  : `${direction.label} · ${target.label ?? target.id}`,
                index: directionIndex * perDirectionTotal + targetIndex + 1,
                total: heroDirectionPlan.directions.length * perDirectionTotal,
                aspectRatio: target.aspectRatio,
                formatId: ASPECT_TO_FORMAT_ID[target.aspectRatio],
                heroDirectionId: direction.id,
                heroDirectionLabel: direction.label,
                heroDirectionIndex: directionIndex,
                role,
              } as const;
            }

            // ── Hero-seeded fanout: N hero seeds → native child formats ─────
            if (resolvedMode === 'hero-seeded-fanout' && targets.length > 1) {
              const seedTarget =
                targets.find((target) => target.aspectRatio === '1:1') ?? {
                  id: 'hero-seed',
                  label: 'Hero seed',
                  aspectRatio: '1:1' as AllowedAspectRatio,
                };
              const childTargets = targets.filter((target) => target.aspectRatio !== '1:1');
              const perDirectionTotal = 1 + childTargets.length;
              const nativePerFormatUrlsByHero: Record<
                string,
                Partial<Record<PublishFormatId, string>>
              > = {};
              const visualQaByFrame: Record<string, VisualQaResult> = {};

              const directionRuns = await Promise.all(
                heroDirectionPlan.directions.map(async (direction, directionIndex) => {
                  const successes: StreamFrameSuccess[] = [];
                  let failed = 0;
                  let resolvedProvider = planned.provider;
                  const seedFrame = heroFrameForTarget({
                    target: seedTarget,
                    direction,
                    directionIndex,
                    targetIndex: 0,
                    perDirectionTotal,
                    role: 'hero-seed',
                  });

                  let seedImage:
                    | {
                        url: string;
                        width: number;
                        height: number;
                        mimeType: string;
                      }
                    | undefined;

                  try {
                    const seedAttempt = await generateFrameWithFallback(
                      seedFrame,
                      '1:1',
                      {
                        prompt: buildHeroSeedPrompt({
                          rewrittenPrompt: planned.plan.rewrittenPrompt,
                          direction,
                        }),
                        refs,
                        runVisualQa: true,
                      }
                    );
                    resolvedProvider = seedAttempt.provider;
                    const first = seedAttempt.result.images[0];
                    if (!first) throw new Error('provider returned no images for hero seed');
                    seedImage = first;
                    if (seedAttempt.visualQa) {
                      visualQaByFrame[seedFrame.id] = seedAttempt.visualQa;
                    }
                    const seedFormat = ASPECT_TO_FORMAT_ID[seedFrame.aspectRatio];
                    if (seedFormat) {
                      nativePerFormatUrlsByHero[direction.id] = {
                        ...(nativePerFormatUrlsByHero[direction.id] ?? {}),
                        [seedFormat]: first.url,
                      };
                    }
                    emit({
                      type: 'frame.completed',
                      at: Date.now(),
                      frame: seedFrame,
                      provider: resolvedProvider,
                      latencyMs: seedAttempt.result.latencyMs,
                      image: {
                        url: first.url,
                        width: first.width,
                        height: first.height,
                        mimeType: first.mimeType,
                      },
                      visualQa: seedAttempt.visualQa,
                    });
                    successes.push({
                      frame: seedFrame,
                      provider: resolvedProvider,
                      result: seedAttempt.result,
                      image: first,
                      visualQa: seedAttempt.visualQa,
                    });
                  } catch (err) {
                    failed += 1 + childTargets.length;
                    const message = err instanceof Error ? err.message : String(err);
                    for (let childIdx = 0; childIdx < childTargets.length; childIdx += 1) {
                      const child = childTargets[childIdx]!;
                      emit({
                        type: 'frame.failed',
                        at: Date.now(),
                        frame: heroFrameForTarget({
                          target: child,
                          direction,
                          directionIndex,
                          targetIndex: childIdx + 1,
                          perDirectionTotal,
                          role: 'child-format',
                        }),
                        provider: resolvedProvider,
                        error: `hero seed failed: ${message}`,
                        code: 'image_gen_failed',
                      });
                    }
                    return { successes, failed, provider: resolvedProvider };
                  }

                  const heroSeed = seedImage;
                  if (!heroSeed) {
                    return { successes, failed: failed + childTargets.length, provider: resolvedProvider };
                  }

                  const childRefs = selectChildGenerationRefs({
                    heroSeedUrl: heroSeed.url,
                    originalRefs: refs,
                    includeProductIdentityRef,
                  });

                  const childSettled = await Promise.allSettled(
                    childTargets.map(async (target, childIdx) => {
                      const childFrame = heroFrameForTarget({
                        target,
                        direction,
                        directionIndex,
                        targetIndex: childIdx + 1,
                        perDirectionTotal,
                        role: 'child-format',
                      });
                      const childAttempt = await generateFrameWithFallback(
                        childFrame,
                        target.aspectRatio,
                        {
                          prompt: buildChildFormatPrompt({
                            rewrittenPrompt: planned.plan.rewrittenPrompt,
                            direction,
                            aspectRatio: target.aspectRatio,
                            label: target.label,
                          }),
                          refs: childRefs,
                          runVisualQa: true,
                        }
                      );
                      const first = childAttempt.result.images[0];
                      if (!first) throw new Error('provider returned no images for child format');
                      if (childAttempt.visualQa) {
                        visualQaByFrame[childFrame.id] = childAttempt.visualQa;
                      }
                      const format = ASPECT_TO_FORMAT_ID[target.aspectRatio];
                      if (format) {
                        nativePerFormatUrlsByHero[direction.id] = {
                          ...(nativePerFormatUrlsByHero[direction.id] ?? {}),
                          [format]: first.url,
                        };
                      }
                      emit({
                        type: 'frame.completed',
                        at: Date.now(),
                        frame: childFrame,
                        provider: childAttempt.provider,
                        latencyMs: childAttempt.result.latencyMs,
                        image: {
                          url: first.url,
                          width: first.width,
                          height: first.height,
                          mimeType: first.mimeType,
                        },
                        visualQa: childAttempt.visualQa,
                      });
                      return {
                        frame: childFrame,
                        provider: childAttempt.provider,
                        result: childAttempt.result,
                        image: first,
                        visualQa: childAttempt.visualQa,
                      } satisfies StreamFrameSuccess;
                    })
                  );

                  for (const item of childSettled) {
                    if (item.status === 'fulfilled') {
                      successes.push(item.value);
                      resolvedProvider = item.value.provider;
                    } else {
                      failed += 1;
                    }
                  }

                  return { successes, failed, provider: resolvedProvider };
                })
              );

              const successes = directionRuns.flatMap((run) => run.successes);
              const failed = directionRuns.reduce((sum, run) => sum + run.failed, 0);
              const firstImage = successes[0]?.image;
              const runProvider = successes[0]?.provider ?? planned.provider;
              const runStatus =
                failed === 0 ? 'ok' : successes.length === 0 ? 'error' : 'partial';
              const elapsedMs = Date.now() - startedAt;
              const summaryError =
                failed > 0
                  ? `${failed} of ${heroDirectionPlan.directions.length * perDirectionTotal} frame${failed === 1 ? '' : 's'} failed`
                  : undefined;

              let persistedCampaign:
                | {
                    campaignId: string | null;
                    variationId: string | null;
                    discordSent: boolean;
                  }
                | undefined;
              if (persistRun && successes.length > 0 && firstImage) {
                const firstDirection = heroDirectionPlan.directions.find(
                  (direction) => nativePerFormatUrlsByHero[direction.id]
                );
                const firstHeroUrls =
                  firstDirection ? nativePerFormatUrlsByHero[firstDirection.id] : undefined;
                persistedCampaign = await persistGenerateAsCampaign({
                  workspaceId,
                  baseUrl: new URL(request.url).origin,
                  prompt,
                  rewrittenPrompt: planned.plan.rewrittenPrompt,
                  refs,
                  heroImageUrl: firstHeroUrls?.['1x1'] ?? firstImage.url,
                  heroDirectionId: firstDirection?.id,
                  nativePerFormatUrls: firstHeroUrls,
                  provider: runProvider.id,
                  model: runProvider.model,
                  sourceRunId: clientRunId,
                  notifyDiscord: true,
                  notifyMode: persistNotifyMode,
                  targetPlatforms,
                });
              }

              emit({
                type: 'run.completed',
                at: Date.now(),
                status: runStatus,
                mode: 'hero-seeded-fanout',
                frames: {
                  total: heroDirectionPlan.directions.length * perDirectionTotal,
                  completed: successes.length,
                  failed,
                },
                provider: runProvider,
                rewrittenPrompt: planned.plan.rewrittenPrompt,
                rationale: planned.plan.rationale,
                aspectRatio: planned.plan.aspectRatio as AspectRatio,
                firstImageUrl: firstImage?.url,
                elapsedMs,
                error: summaryError,
                heroDirections: heroDirectionPlan.directions,
                nativePerFormatUrlsByHero,
                visualQa: visualQaByFrame,
                persistedCampaign,
              });

              if (clientRunId) {
                await recordRunFinish(clientRunId, {
                  status: runStatus === 'ok' ? 'ok' : 'error',
                  provider: runProvider.id,
                  model: runProvider.model,
                  rewrittenPrompt: planned.plan.rewrittenPrompt,
                  rationale: planned.plan.rationale,
                  aspectRatio: planned.plan.aspectRatio,
                  imageUrl: firstImage?.url,
                  latencyMs: elapsedMs,
                  error: summaryError,
                });
              }

              stopKeepalive();
              controller.close();
              return;
            }

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

              let heroImage: { url: string; width: number; height: number; mimeType: string };
              let resolvedProvider = planned.provider;
              try {
                const heroAttempt = await generateFrameWithFallback(
                  heroFrame,
                  heroTarget.aspectRatio
                );
                const heroResult = heroAttempt.result;
                resolvedProvider = heroAttempt.provider;
                const heroFirst = heroResult.images[0];
                if (!heroFirst) throw new Error('provider returned no images for hero');
                heroImage = heroFirst;

                emit({
                  type: 'frame.completed',
                  at: Date.now(),
                  frame: heroFrame,
                  provider: resolvedProvider,
                  latencyMs: heroResult.latencyMs,
                  image: { url: heroFirst.url, width: heroFirst.width, height: heroFirst.height, mimeType: heroFirst.mimeType },
                });
              } catch (err) {
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

                emit({
                  type: 'frame.completed',
                  at: Date.now(),
                  frame,
                  provider: resolvedProvider,
                  latencyMs: 0,
                  image: { url: heroImage.url, width: cropped.w, height: cropped.h, mimeType: heroImage.mimeType },
                });
              }

              let persistedCampaign:
                | {
                    campaignId: string | null;
                    variationId: string | null;
                    discordSent: boolean;
                  }
                | undefined;
              if (persistRun) {
                const aspectToFormatId: Record<string, '1x1' | '4x5' | '9x16' | '16x9'> = {
                  '1:1': '1x1',
                  '4:5': '4x5',
                  '9:16': '9x16',
                  '16:9': '16x9',
                };
                const nativePerFormatUrls: Partial<
                  Record<'1x1' | '4x5' | '9x16' | '16x9', string>
                > = {};
                const heroFormatId = aspectToFormatId[heroTarget.aspectRatio];
                if (heroFormatId) nativePerFormatUrls[heroFormatId] = heroImage.url;
                persistedCampaign = await persistGenerateAsCampaign({
                  workspaceId,
                  baseUrl: new URL(request.url).origin,
                  prompt,
                  rewrittenPrompt: planned.plan.rewrittenPrompt,
                  refs,
                  heroImageUrl: heroImage.url,
                  nativePerFormatUrls,
                  provider: resolvedProvider.id,
                  model: resolvedProvider.model,
                  sourceRunId: clientRunId,
                  aspectRatio: planned.plan.aspectRatio,
                  notifyDiscord: true,
                  notifyMode: persistNotifyMode,
                  targetPlatforms,
                });
              }

              emit({
                type: 'run.completed',
                at: Date.now(),
                status: 'ok',
                mode: 'crop',
                frames: { total: targets.length, completed: targets.length, failed: 0 },
                provider: resolvedProvider,
                rewrittenPrompt: planned.plan.rewrittenPrompt,
                rationale: planned.plan.rationale,
                aspectRatio: planned.plan.aspectRatio as AspectRatio,
                firstImageUrl: heroImage.url,
                elapsedMs: Date.now() - startedAt,
                persistedCampaign,
              });

              if (clientRunId) {
                await recordRunFinish(clientRunId, {
                  status: 'ok',
                  provider: resolvedProvider.id,
                  model: resolvedProvider.model,
                  rewrittenPrompt: planned.plan.rewrittenPrompt,
                  rationale: planned.plan.rationale,
                  aspectRatio: planned.plan.aspectRatio,
                  imageUrl: heroImage.url,
                  latencyMs: Date.now() - startedAt,
                });
              }

              stopKeepalive();
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

                try {
                  const attempt = await generateFrameWithFallback(
                    frame,
                    target.aspectRatio
                  );
                  const result = attempt.result;

                  const first = result.images[0];
                  if (!first) throw new Error('provider returned no images');

                  emit({
                    type: 'frame.completed',
                    at: Date.now(),
                    frame,
                    provider: attempt.provider,
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
                    provider: attempt.provider,
                    result,
                    image: first,
                  };
                } catch (err) {
                  throw err;
                }
              })
            );

            const successes: StreamFrameSuccess[] = settled.flatMap((item) =>
              item.status === 'fulfilled' ? [item.value] : []
            );
            const failed = settled.length - successes.length;
            const firstImage = successes[0]?.image;
            const runProvider = successes[0]?.provider ?? planned.provider;
            const elapsedMs = Date.now() - startedAt;
            const runStatus =
              failed === 0 ? 'ok' : successes.length === 0 ? 'error' : 'partial';
            const summaryError =
              failed > 0 ? `${failed} of ${targets.length} frame${failed === 1 ? '' : 's'} failed` : undefined;

            let persistedCampaign:
              | {
                  campaignId: string | null;
                  variationId: string | null;
                  discordSent: boolean;
                }
              | undefined;
            if (persistRun && successes.length > 0 && firstImage) {
              // Build per-format URLs map keyed by format id when targets
              // resolve to known aspects. The synthetic variation row's
              // hero is the first success; per-format URLs let /inspect
              // and /runs render every aspect.
              const aspectToFormatId: Record<string, '1x1' | '4x5' | '9x16' | '16x9'> = {
                '1:1': '1x1',
                '4:5': '4x5',
                '9:16': '9x16',
                '16:9': '16x9',
              };
              const nativePerFormatUrls: Partial<
                Record<'1x1' | '4x5' | '9x16' | '16x9', string>
              > = {};
              for (const s of successes) {
                const fid = aspectToFormatId[s.frame.aspectRatio];
                if (fid && s.image?.url) nativePerFormatUrls[fid] = s.image.url;
              }
              persistedCampaign = await persistGenerateAsCampaign({
                workspaceId,
                baseUrl: new URL(request.url).origin,
                prompt,
                rewrittenPrompt: planned.plan.rewrittenPrompt,
                refs,
                heroImageUrl: firstImage.url,
                nativePerFormatUrls,
                provider: runProvider.id,
                model: runProvider.model,
                sourceRunId: clientRunId,
                notifyDiscord: true,
                notifyMode: persistNotifyMode,
                targetPlatforms,
              });
            }

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
              provider: runProvider,
              rewrittenPrompt: planned.plan.rewrittenPrompt,
              rationale: planned.plan.rationale,
              aspectRatio: planned.plan.aspectRatio as AspectRatio,
              firstImageUrl: firstImage?.url,
              elapsedMs,
              error: summaryError,
              persistedCampaign,
            });

            if (clientRunId) {
              await recordRunFinish(clientRunId, {
                status: runStatus === 'ok' ? 'ok' : 'error',
                provider: runProvider.id,
                model: runProvider.model,
                rewrittenPrompt: planned.plan.rewrittenPrompt,
                rationale: planned.plan.rationale,
                aspectRatio: planned.plan.aspectRatio,
                imageUrl: firstImage?.url,
                latencyMs: elapsedMs,
                error: summaryError,
              });
            }

            stopKeepalive();
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
                total: runStartedFrameTotal,
                completed: 0,
                failed: runStartedFrameTotal,
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
            stopKeepalive();
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

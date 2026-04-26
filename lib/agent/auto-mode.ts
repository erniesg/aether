import { runMultiAgent, type MultiAgentToolStep } from './multi';
import {
  insertCampaignVariation,
  setCampaignStatus,
  startCampaign,
} from '@/lib/convex/http';
import { notifyDiscord } from '@/lib/notify/discord';

/**
 * Auto Mode orchestrator (handoff §9, v1 slice).
 *
 * One Auto-Mode lap fans out into N variations. Each variation is one
 * `runMultiAgent` session driving the existing tool surface
 * (search_signals + generate_image, with cluster/analyze available but
 * not required). The agent emits a structured JSON envelope as its final
 * text — caption, hashtags, schedule suggestion, mood note — which we
 * parse out for persistence.
 *
 * Provenance is automatic: every tool call inside the loop already writes
 * to `capabilityRun` via lib/agent/multi.ts. Each variation's
 * `agentRunIds` cross-link back to those rows so the right rail can show
 * the per-tool work that produced the variation.
 *
 * Notify modes:
 *   - 'notify'    → Discord webhook ping when the lap completes.
 *   - 'review'    → Variation rows persist with status 'ready' for user.
 *   - 'auto-post' → Same as 'review' for v1; auto-post hookup is a
 *                   future slice (would call /api/publish/schedule per
 *                   variation when complete).
 *
 * Out of scope for v1:
 *   - Multi-format crop fan-out (1:1 + 4:5 + 9:16 + 16:9). v1 produces
 *     the hero only at 1:1.
 *   - Multilingual text overlay across en/zh-Hans-SG/ms-SG/ta-SG. v1
 *     returns a single caption from the agent.
 *   - SSE progress streaming. v1 returns the lap result as a single
 *     JSON response. The endpoint can stream once the UI consumer lands.
 *   - Critique pass over references. The agent decides which to honor.
 */

export type AutoModeNotifyMode = 'notify' | 'review' | 'auto-post';
export type AutoModeTriggerKind = 'url' | 'file' | 'text';
export type AutoModeConcurrency = 'sequential' | 'parallel';

export interface AutoModeTrigger {
  kind: AutoModeTriggerKind;
  payload: string;
}

/**
 * Optional reference image for the hero render. When supplied, the
 * orchestrator passes it through to the agent's generate_image tool so
 * compatible image providers do an image-to-image render instead of
 * text-only. When the provider does not support reference images the
 * adapter degrades to text-only and notes the reference in the prompt.
 *
 * Pass exactly one of `url` (publicly fetchable) or `dataUrl` (base64).
 */
export interface AutoModeReferenceImage {
  url?: string;
  dataUrl?: string;
  /** Optional human-readable hint about what's in the reference. The
   *  orchestrator includes this in the per-variation system prompt so
   *  Claude's hero prompt for generate_image is informed by it even when
   *  the image bytes are not visible to the LLM (text-only adapters). */
  hint?: string;
}

export interface AutoModeRequest {
  baseUrl: string;
  workspaceId?: string;
  trigger: AutoModeTrigger;
  variationCount: 1 | 2 | 3 | 4;
  notifyMode: AutoModeNotifyMode;
  /** sequential = one variation at a time, with priorMoodNotes feeding the
   *  next variation's prompt for distinctness. parallel = Promise.allSettled
   *  fan-out with up-front variation seeds. Default: 'sequential'. */
  concurrency?: AutoModeConcurrency;
  /** Optional reference image for the hero render. */
  referenceImage?: AutoModeReferenceImage;
  /** Optional bound on per-variation iterations (passed to runMultiAgent). */
  maxIterationsPerVariation?: number;
}

/**
 * Up-front mood seeds used in parallel concurrency mode. Each variation
 * picks the seed at its index so all N variations are guaranteed
 * distinct without inter-variation feedback. Index = variation number - 1
 * mod seeds.length.
 */
const PARALLEL_MOOD_SEEDS = [
  'warm dawn — soft golden palette, low contrast, hopeful',
  'cool dusk — deep blues, high film grain, melancholic',
  'punchy editorial — high contrast, saturated, kinetic energy',
  'soft pastel — chalk tones, dreamy diffusion, intimate scale',
] as const;

export interface AutoModeVariationResult {
  index: number;
  status: 'ready' | 'failed';
  heroImageUrl?: string;
  caption?: string;
  hashtags?: string[];
  moodNote?: string;
  schedulePlatform?: string;
  scheduleWhenLocal?: string;
  agentSteps: MultiAgentToolStep[];
  agentFinalText: string;
  error?: string;
}

export interface AutoModeResult {
  /** Convex campaign id when persistence is enabled, otherwise null. */
  campaignId: string | null;
  variations: AutoModeVariationResult[];
  status: 'completed' | 'failed';
  notified: boolean;
}

interface VariationPromptInput {
  index: number;
  total: number;
  trigger: AutoModeTrigger;
  /** sequential mode: prior variations' moodNote text — feed forward. */
  priorMoodNotes: string[];
  /** parallel mode: up-front mood seed assigned to this variation. */
  parallelMoodSeed?: string;
  referenceImage?: AutoModeReferenceImage;
}

const VARIATION_SYSTEM_NOTE = (input: VariationPromptInput): string => {
  const lines = [
    `Auto-Mode lap. You are running variation ${input.index} of ${input.total}.`,
    '',
    `Trigger (${input.trigger.kind}): ${input.trigger.payload}`,
  ];

  if (input.referenceImage) {
    const refUrl = input.referenceImage.url ?? '<inline base64>';
    const hint = input.referenceImage.hint
      ? ` Reference notes: ${input.referenceImage.hint}.`
      : '';
    lines.push(
      '',
      `A reference image is attached for this hero render: ${refUrl}.${hint} Honour its composition and feel; do not copy it literally.`
    );
  }

  lines.push(
    '',
    'Steps:',
    '1) Call search_signals once with the trigger as seedText, platform=instagram, limit=8.',
    "2) Call generate_image once. The aspectRatio MUST be 1:1. Write a visually specific hero prompt."
  );

  if (input.parallelMoodSeed) {
    lines.push(
      `   This variation MUST lean toward this mood: ${input.parallelMoodSeed}. Other variations are running in parallel with different seeds.`
    );
  } else if (input.priorMoodNotes.length > 0) {
    lines.push(
      `   Prior variations chose these moods (do NOT repeat): ${input.priorMoodNotes.join(' | ')}.`
    );
  } else {
    lines.push('   This is the first variation — pick any cohesive mood.');
  }

  lines.push(
    '3) Output ONLY a JSON object with this shape, no other prose:',
    '{',
    '  "caption": "<60-180 char IG caption tied to the trigger>",',
    '  "hashtags": ["#tag1","#tag2","#tag3","#tag4","#tag5"],',
    '  "platform": "instagram",',
    '  "whenLocal": "<ISO8601 timestamp during a Singapore prime-time IG window in the next 36 hours>",',
    '  "moodNote": "<10-word mood label distinguishing this variation>"',
    '}'
  );

  return lines.join('\n');
};

export interface ParsedAgentEnvelope {
  caption?: string;
  hashtags?: string[];
  platform?: string;
  whenLocal?: string;
  moodNote?: string;
}

/**
 * Pull the structured JSON envelope out of the agent's free-form final text.
 * Tolerates leading/trailing prose by extracting the largest `{…}` span.
 * Returns an empty object when no parse succeeds — partial extraction is
 * acceptable for v1 since the persistence schema marks each field optional.
 */
export function parseAgentEnvelope(finalText: string): ParsedAgentEnvelope {
  if (!finalText) return {};
  const trimmed = finalText.trim();
  // Try the cleanest path first: the whole text is a JSON object.
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return pickEnvelope(parsed);
  } catch {
    // fall through to substring extraction
  }
  // Greedy substring between first `{` and last `}`. Robust enough for the
  // common case where Claude wraps JSON in a code fence or short preamble.
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first === -1 || last <= first) return {};
  const candidate = trimmed.slice(first, last + 1);
  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    return pickEnvelope(parsed);
  } catch {
    return {};
  }
}

function pickEnvelope(parsed: Record<string, unknown>): ParsedAgentEnvelope {
  const out: ParsedAgentEnvelope = {};
  if (typeof parsed.caption === 'string') out.caption = parsed.caption;
  if (Array.isArray(parsed.hashtags)) {
    out.hashtags = parsed.hashtags.filter((tag): tag is string => typeof tag === 'string');
  }
  if (typeof parsed.platform === 'string') out.platform = parsed.platform;
  if (typeof parsed.whenLocal === 'string') out.whenLocal = parsed.whenLocal;
  if (typeof parsed.moodNote === 'string') out.moodNote = parsed.moodNote;
  return out;
}

/**
 * Pull the hero image URL out of the agent's tool steps. Looks for the
 * first successful generate_image step and returns its `images[0].url` (the
 * shape /api/generate returns when the underlying provider succeeds).
 */
export function pickHeroImageUrl(steps: MultiAgentToolStep[]): string | undefined {
  for (const step of steps) {
    if (step.name !== 'generate_image' || !step.ok) continue;
    const out = step.output as Record<string, unknown> | undefined;
    const result = out?.result as Record<string, unknown> | undefined;
    const images = (result?.images as Array<Record<string, unknown>> | undefined) ?? [];
    const firstUrl = images[0]?.url;
    if (typeof firstUrl === 'string' && firstUrl.length > 0) return firstUrl;
    // /api/generate also surfaces the URL as `imageUrl` on top-level in some
    // adapters — accept that fallback too.
    const topLevelUrl = out?.imageUrl;
    if (typeof topLevelUrl === 'string' && topLevelUrl.length > 0) return topLevelUrl;
  }
  return undefined;
}

interface RunOneVariationInput {
  promptInput: VariationPromptInput;
  baseUrl: string;
  workspaceId?: string;
  maxIterationsPerVariation?: number;
  referenceImage?: AutoModeReferenceImage;
}

async function runOneVariation(
  input: RunOneVariationInput
): Promise<AutoModeVariationResult> {
  const prompt = VARIATION_SYSTEM_NOTE(input.promptInput);
  let agentStepsForVariation: MultiAgentToolStep[] = [];
  let agentFinalText = '';
  let variationError: string | undefined;

  try {
    const agentRun = await runMultiAgent({
      prompt,
      baseUrl: input.baseUrl,
      wsId: input.workspaceId,
      maxIterations: input.maxIterationsPerVariation,
      referenceImage: input.referenceImage
        ? {
            url: input.referenceImage.url,
            dataUrl: input.referenceImage.dataUrl,
          }
        : undefined,
    });
    agentStepsForVariation = agentRun.steps;
    agentFinalText = agentRun.finalText;
  } catch (err) {
    variationError = err instanceof Error ? err.message : String(err);
  }

  const envelope = parseAgentEnvelope(agentFinalText);
  const heroImageUrl = pickHeroImageUrl(agentStepsForVariation);

  return {
    index: input.promptInput.index,
    status: variationError ? 'failed' : 'ready',
    heroImageUrl,
    caption: envelope.caption,
    hashtags: envelope.hashtags,
    moodNote: envelope.moodNote,
    schedulePlatform: envelope.platform,
    scheduleWhenLocal: envelope.whenLocal,
    agentSteps: agentStepsForVariation,
    agentFinalText,
    error: variationError,
  };
}

async function persistVariation(
  campaignId: string,
  workspaceId: string | undefined,
  variation: AutoModeVariationResult
): Promise<void> {
  const agentRunIds = variation.agentSteps
    .map((step) => step.clientRunId)
    .filter((id): id is string => typeof id === 'string');

  await insertCampaignVariation({
    campaignId,
    workspaceId,
    index: variation.index,
    status: variation.status,
    heroImageUrl: variation.heroImageUrl,
    caption: variation.caption,
    hashtags: variation.hashtags,
    moodNote: variation.moodNote,
    schedulePlatform: variation.schedulePlatform,
    scheduleWhenLocal: variation.scheduleWhenLocal,
    agentRunIds,
    error: variation.error,
  });
}

export async function runAutoMode(req: AutoModeRequest): Promise<AutoModeResult> {
  const concurrency: AutoModeConcurrency = req.concurrency ?? 'sequential';

  const campaignId = await startCampaign({
    workspaceId: req.workspaceId,
    triggerKind: req.trigger.kind,
    triggerPayload: req.trigger.payload,
    variationCount: req.variationCount,
    notifyMode: req.notifyMode,
  });

  let variations: AutoModeVariationResult[];

  if (concurrency === 'parallel') {
    // Up-front seeds → no inter-variation feedback needed; run all at once.
    const tasks = Array.from({ length: req.variationCount }, (_unused, idx) => {
      const i = idx + 1;
      const moodSeed =
        PARALLEL_MOOD_SEEDS[idx % PARALLEL_MOOD_SEEDS.length];
      return runOneVariation({
        promptInput: {
          index: i,
          total: req.variationCount,
          trigger: req.trigger,
          priorMoodNotes: [],
          parallelMoodSeed: moodSeed,
          referenceImage: req.referenceImage,
        },
        baseUrl: req.baseUrl,
        workspaceId: req.workspaceId,
        maxIterationsPerVariation: req.maxIterationsPerVariation,
        referenceImage: req.referenceImage,
      });
    });
    const settled = await Promise.allSettled(tasks);
    variations = settled.map((res, idx) => {
      if (res.status === 'fulfilled') return res.value;
      const i = idx + 1;
      return {
        index: i,
        status: 'failed',
        agentSteps: [],
        agentFinalText: '',
        error: res.reason instanceof Error ? res.reason.message : String(res.reason),
      };
    });
  } else {
    // Sequential: priorMoodNotes feed forward for distinctness.
    variations = [];
    const priorMoodNotes: string[] = [];
    for (let i = 1; i <= req.variationCount; i += 1) {
      const variation = await runOneVariation({
        promptInput: {
          index: i,
          total: req.variationCount,
          trigger: req.trigger,
          priorMoodNotes: [...priorMoodNotes],
          referenceImage: req.referenceImage,
        },
        baseUrl: req.baseUrl,
        workspaceId: req.workspaceId,
        maxIterationsPerVariation: req.maxIterationsPerVariation,
        referenceImage: req.referenceImage,
      });
      if (variation.moodNote) priorMoodNotes.push(variation.moodNote);
      variations.push(variation);
    }
  }

  // Persist each variation. Sequential mode could write each row inline
  // above, but doing it after the run keeps both modes symmetric.
  if (campaignId) {
    for (const variation of variations) {
      await persistVariation(campaignId, req.workspaceId, variation);
    }
  }

  const lapStatus: 'completed' | 'failed' = variations.some(
    (v) => v.status === 'failed'
  )
    ? 'failed'
    : 'completed';
  if (campaignId) await setCampaignStatus(campaignId, lapStatus);

  let notified = false;
  if (req.notifyMode === 'notify') {
    const okCount = variations.filter((v) => v.status === 'ready').length;
    const summary = [
      `Auto Mode lap ${lapStatus} — ${okCount}/${req.variationCount} variations ready (${concurrency}).`,
      `Trigger: ${req.trigger.kind} · ${req.trigger.payload.slice(0, 80)}`,
      campaignId ? `campaign=${campaignId}` : 'campaign=local-only',
    ].join('\n');
    notified = await notifyDiscord({ content: summary });
  }

  return { campaignId, variations, status: lapStatus, notified };
}

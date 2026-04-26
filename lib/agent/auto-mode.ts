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

export interface AutoModeTrigger {
  kind: AutoModeTriggerKind;
  payload: string;
}

export interface AutoModeRequest {
  baseUrl: string;
  workspaceId?: string;
  trigger: AutoModeTrigger;
  variationCount: 1 | 2 | 3 | 4;
  notifyMode: AutoModeNotifyMode;
  /** Optional bound on per-variation iterations (passed to runMultiAgent). */
  maxIterationsPerVariation?: number;
}

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

const VARIATION_SYSTEM_NOTE = (
  index: number,
  total: number,
  trigger: AutoModeTrigger,
  priorMoodNotes: string[]
) =>
  [
    `Auto-Mode lap. You are running variation ${index} of ${total}.`,
    '',
    `Trigger (${trigger.kind}): ${trigger.payload}`,
    '',
    'Steps:',
    '1) Call search_signals once with the trigger as seedText, platform=instagram, limit=8.',
    "2) Call generate_image once. The aspectRatio MUST be 1:1. Write a visually specific hero prompt that is DISTINCT from prior variations.",
    priorMoodNotes.length > 0
      ? `Prior variations chose these moods (do not repeat): ${priorMoodNotes.join(' | ')}`
      : 'This is the first variation — pick any cohesive mood.',
    '3) Output ONLY a JSON object with this shape, no other prose:',
    '{',
    '  "caption": "<60-180 char IG caption tied to the trigger>",',
    '  "hashtags": ["#tag1","#tag2","#tag3","#tag4","#tag5"],',
    '  "platform": "instagram",',
    '  "whenLocal": "<ISO8601 timestamp during a Singapore prime-time IG window in the next 36 hours>",',
    '  "moodNote": "<10-word mood label distinguishing this variation>"',
    '}',
  ].join('\n');

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

export async function runAutoMode(req: AutoModeRequest): Promise<AutoModeResult> {
  const campaignId = await startCampaign({
    workspaceId: req.workspaceId,
    triggerKind: req.trigger.kind,
    triggerPayload: req.trigger.payload,
    variationCount: req.variationCount,
    notifyMode: req.notifyMode,
  });

  const variations: AutoModeVariationResult[] = [];
  const priorMoodNotes: string[] = [];
  let lapStatus: 'completed' | 'failed' = 'completed';

  for (let i = 1; i <= req.variationCount; i += 1) {
    const prompt = VARIATION_SYSTEM_NOTE(
      i,
      req.variationCount,
      req.trigger,
      priorMoodNotes
    );

    let agentStepsForVariation: MultiAgentToolStep[] = [];
    let agentFinalText = '';
    let variationError: string | undefined;

    try {
      const agentRun = await runMultiAgent({
        prompt,
        baseUrl: req.baseUrl,
        wsId: req.workspaceId,
        maxIterations: req.maxIterationsPerVariation,
      });
      agentStepsForVariation = agentRun.steps;
      agentFinalText = agentRun.finalText;
    } catch (err) {
      variationError = err instanceof Error ? err.message : String(err);
    }

    const envelope = parseAgentEnvelope(agentFinalText);
    const heroImageUrl = pickHeroImageUrl(agentStepsForVariation);
    if (envelope.moodNote) priorMoodNotes.push(envelope.moodNote);

    const variationStatus: AutoModeVariationResult['status'] = variationError
      ? 'failed'
      : 'ready';
    if (variationStatus === 'failed') lapStatus = 'failed';

    const agentRunIds = agentStepsForVariation
      .map((step) => step.clientRunId)
      .filter((id): id is string => typeof id === 'string');

    if (campaignId) {
      await insertCampaignVariation({
        campaignId,
        workspaceId: req.workspaceId,
        index: i,
        status: variationStatus,
        heroImageUrl,
        caption: envelope.caption,
        hashtags: envelope.hashtags,
        moodNote: envelope.moodNote,
        schedulePlatform: envelope.platform,
        scheduleWhenLocal: envelope.whenLocal,
        agentRunIds,
        error: variationError,
      });
    }

    variations.push({
      index: i,
      status: variationStatus,
      heroImageUrl,
      caption: envelope.caption,
      hashtags: envelope.hashtags,
      moodNote: envelope.moodNote,
      schedulePlatform: envelope.platform,
      scheduleWhenLocal: envelope.whenLocal,
      agentSteps: agentStepsForVariation,
      agentFinalText,
      error: variationError,
    });
  }

  if (campaignId) await setCampaignStatus(campaignId, lapStatus);

  let notified = false;
  if (req.notifyMode === 'notify') {
    const okCount = variations.filter((v) => v.status === 'ready').length;
    const summary = [
      `Auto Mode lap ${lapStatus} — ${okCount}/${req.variationCount} variations ready.`,
      `Trigger: ${req.trigger.kind} · ${req.trigger.payload.slice(0, 80)}`,
      campaignId ? `campaign=${campaignId}` : 'campaign=local-only',
    ].join('\n');
    notified = await notifyDiscord({ content: summary });
  }

  return { campaignId, variations, status: lapStatus, notified };
}

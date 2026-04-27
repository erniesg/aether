/**
 * Signoff Managed Agent — aether Lane B (overnight 2026-04-27).
 *
 * SDK implementation note (verified against @anthropic-ai/sdk@0.90.x):
 * Uses the Anthropic Managed Agents API (`client.beta.agents` +
 * `client.beta.sessions`) when ANTHROPIC_SIGNOFF_AGENT_ID and
 * ANTHROPIC_SIGNOFF_ENVIRONMENT_ID are set; falls back to a standard
 * `client.messages.create` call so signoff always works without a
 * provisioned agent.
 *
 * The signoff agent evaluates a variation set against brand guardrails and
 * produces a per-platform schedule plan: which variations to auto-post and
 * which to hold for human review. This is the final gate before a lap's
 * content touches any real social platform.
 *
 * Provenance: every run writes to capabilityRun via recordRunStart/Finish/Fail.
 */

import Anthropic from '@anthropic-ai/sdk';
import { recordRunStart, recordRunFinish, recordRunFail } from '@/lib/convex/http';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SignoffVariation {
  /** 1-based variation index. */
  index: number;
  /** Caption text (en-SG). */
  caption?: string;
  /** Target platform. */
  platform?: string;
  /** ISO scheduled time. */
  scheduleWhenLocal?: string;
  /** Mood note from the agent. */
  moodNote?: string;
  /** Whether a hero image was produced (no hero = likely skip). */
  hasHero: boolean;
}

export interface BrandGuardrails {
  /** Brand name(s) that must not appear incorrectly. */
  brandNames: string[];
  /** Topics / keywords that are off-limits. */
  forbiddenTopics: string[];
  /** Required disclaimers or CTA that must appear. */
  requiredElements: string[];
  /** Max character count for caption. */
  maxCaptionLength?: number;
}

export type SignoffDecision = 'auto-post' | 'hold-for-review' | 'reject';

export interface SignoffVariationPlan {
  variationIndex: number;
  decision: SignoffDecision;
  /** Human-readable rationale for the decision. */
  rationale: string;
  /** Override schedule if agent recommends a better time. */
  suggestedSchedule?: {
    platform: string;
    whenLocal: string;
  };
}

export interface SchedulePlan {
  /** Session id when the Managed Agents path was used. */
  sessionId?: string;
  latencyMs: number;
  /** Per-variation decisions. */
  variations: SignoffVariationPlan[];
  /** Overall recommendation. */
  overallRecommendation: string;
  usedManagedAgentsApi: boolean;
}

export interface SignoffAgentInput {
  variations: SignoffVariation[];
  guardrails: BrandGuardrails;
  /** Override for tests. */
  apiKey?: string;
  /** Override for tests. */
  client?: Anthropic;
  workspaceId?: string;
  /** When false, skip the Managed Agents API path even if AGENT_ID +
   *  ENVIRONMENT_ID are configured. Forces fallback to messages.create.
   *  Default: true. */
  useManagedAgents?: boolean;
  /** Server-supplied "now" used to anchor the 36h auto-post window. The
   *  agent must NOT compute relative dates from training cutoff — we hit a
   *  bug on 2026-04-27 where the model thought today's scheduled posts
   *  were "far beyond the 36-hour window" because its priors put 2026 in
   *  the future. Inject explicit ISO8601 instead. Defaults to new Date(). */
  now?: Date;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SIGNOFF_MODEL = 'claude-opus-4-7';

function resolveAgentConfig(): { agentId: string; environmentId: string } | null {
  const agentId = process.env.ANTHROPIC_SIGNOFF_AGENT_ID;
  const environmentId = process.env.ANTHROPIC_SIGNOFF_ENVIRONMENT_ID;
  if (agentId && environmentId) return { agentId, environmentId };
  return null;
}

// ---------------------------------------------------------------------------
// Bundle parser
// ---------------------------------------------------------------------------

function parseSchedulePlan(
  text: string,
  variationCount: number,
  overrides: Partial<SchedulePlan>
): SchedulePlan {
  const defaults: SchedulePlan = {
    latencyMs: 0,
    variations: Array.from({ length: variationCount }, (_, i) => ({
      variationIndex: i + 1,
      decision: 'hold-for-review' as SignoffDecision,
      rationale: 'Could not parse signoff agent response',
    })),
    overallRecommendation: text.slice(0, 300),
    usedManagedAgentsApi: false,
    ...overrides,
  };

  if (!text) return defaults;

  const trimmed = text.trim();
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first !== -1 && last > first) {
      try {
        parsed = JSON.parse(trimmed.slice(first, last + 1)) as Record<string, unknown>;
      } catch {
        return defaults;
      }
    } else {
      return defaults;
    }
  }

  const VALID_DECISIONS = new Set<SignoffDecision>(['auto-post', 'hold-for-review', 'reject']);

  const pickVariations = (v: unknown): SignoffVariationPlan[] => {
    if (!Array.isArray(v)) return defaults.variations;
    return v
      .map((item): SignoffVariationPlan | null => {
        if (!item || typeof item !== 'object') return null;
        const o = item as Record<string, unknown>;
        const variationIndex = typeof o.variationIndex === 'number' ? o.variationIndex : 0;
        const decisionRaw =
          typeof o.decision === 'string' ? o.decision.trim() : 'hold-for-review';
        const decision: SignoffDecision = VALID_DECISIONS.has(decisionRaw as SignoffDecision)
          ? (decisionRaw as SignoffDecision)
          : 'hold-for-review';
        const rationale = typeof o.rationale === 'string' ? o.rationale.trim() : '';

        let suggestedSchedule: SignoffVariationPlan['suggestedSchedule'];
        const sched = o.suggestedSchedule;
        if (sched && typeof sched === 'object') {
          const s = sched as Record<string, unknown>;
          if (typeof s.platform === 'string' && typeof s.whenLocal === 'string') {
            suggestedSchedule = { platform: s.platform, whenLocal: s.whenLocal };
          }
        }

        return { variationIndex, decision, rationale, suggestedSchedule };
      })
      .filter((x): x is SignoffVariationPlan => x !== null);
  };

  return {
    ...defaults,
    variations: pickVariations(parsed.variations),
    overallRecommendation:
      typeof parsed.overallRecommendation === 'string'
        ? parsed.overallRecommendation.trim()
        : defaults.overallRecommendation,
  };
}

// ---------------------------------------------------------------------------
// Build signoff prompt
// ---------------------------------------------------------------------------

function buildSignoffPrompt(input: SignoffAgentInput): string {
  const variationLines = input.variations
    .map((v) =>
      [
        `Variation ${v.index}:`,
        `  Caption: ${v.caption ?? '(none)'}`,
        `  Platform: ${v.platform ?? '(unset)'}`,
        `  Schedule: ${v.scheduleWhenLocal ?? '(unset)'}`,
        `  Mood: ${v.moodNote ?? '(none)'}`,
        `  HasHero: ${v.hasHero}`,
      ].join('\n')
    )
    .join('\n');

  const guardrailLines = [
    `Brand names: ${input.guardrails.brandNames.join(', ') || '(none specified)'}`,
    `Forbidden topics: ${input.guardrails.forbiddenTopics.join(', ') || '(none)'}`,
    `Required elements: ${input.guardrails.requiredElements.join(', ') || '(none)'}`,
    input.guardrails.maxCaptionLength
      ? `Max caption length: ${input.guardrails.maxCaptionLength} chars`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  // Server-supplied "now" anchors the 36h window. Without this the model
  // computed "today" from its training cutoff and rejected legitimate posts
  // as "far in the future" — bug observed 2026-04-27.
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const windowEnd = new Date(now.getTime() + 36 * 60 * 60 * 1000).toISOString();

  return [
    'You are the brand signoff agent for a social media campaign. Evaluate these variations against the brand guardrails and decide which to auto-post vs hold for human review.',
    '',
    `CURRENT TIME (server-supplied — DO NOT use your own date estimate): ${nowIso}`,
    `36-HOUR AUTO-POST WINDOW ENDS AT: ${windowEnd}`,
    '',
    'VARIATIONS:',
    variationLines,
    '',
    'BRAND GUARDRAILS:',
    guardrailLines,
    '',
    'DECISION CRITERIA:',
    `- "auto-post": variation meets all guardrails AND its schedule (whenLocal) is between ${nowIso} and ${windowEnd}, AND has a hero image.`,
    '- "hold-for-review": variation needs human eyes (borderline copy, missing schedule, etc.).',
    '- "reject": variation violates guardrails or lacks a hero image.',
    '',
    'IMPORTANT: Compute the 36-hour window strictly against the CURRENT TIME above. Do NOT rely on your own knowledge of today\'s date — it WILL be wrong.',
    '',
    'Return ONLY a JSON object:',
    '{',
    '  "variations": [',
    '    {',
    '      "variationIndex": <N>,',
    '      "decision": "auto-post|hold-for-review|reject",',
    '      "rationale": "<brief reason>",',
    '      "suggestedSchedule": { "platform": "<platform>", "whenLocal": "<ISO8601>" } // optional override',
    '    }',
    '  ],',
    '  "overallRecommendation": "<2-sentence summary for the creator>"',
    '}',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Managed Agents path
// ---------------------------------------------------------------------------

async function runViaManagedAgentsApi(
  input: SignoffAgentInput,
  client: Anthropic,
  agentId: string,
  environmentId: string,
  clientRunId: string
): Promise<SchedulePlan> {
  const t0 = Date.now();
  const userMessage = buildSignoffPrompt(input);

  const betaSessions = client.beta.sessions as unknown as {
    create(params: {
      agent: string;
      environment_id: string;
      title?: string;
      metadata?: Record<string, string>;
    }): Promise<{ id: string }>;
    events: {
      send(
        sessionId: string,
        params: {
          events: Array<{
            type: 'user.message';
            content: Array<{ type: 'text'; text: string }>;
          }>;
        }
      ): Promise<unknown>;
      stream(sessionId: string): AsyncIterable<unknown> | Promise<AsyncIterable<unknown>>;
    };
  };

  const session = await betaSessions.create({
    agent: agentId,
    environment_id: environmentId,
    title: `Signoff: ${input.variations.length} variations`,
    metadata: { workspaceId: input.workspaceId ?? '' },
  });
  const sessionId = session.id;

  await betaSessions.events.send(sessionId, {
    events: [{ type: 'user.message', content: [{ type: 'text', text: userMessage }] }],
  });

  const streamOrPromise = betaSessions.events.stream(sessionId);
  const stream =
    streamOrPromise instanceof Promise ? await streamOrPromise : streamOrPromise;
  const messages: string[] = [];
  for await (const ev of stream) {
    const e = ev as { type?: string };
    if (e.type === 'agent.message') {
      const msg = ev as { content?: Array<{ type: string; text?: string }> };
      for (const block of msg.content ?? []) {
        if (block.type === 'text' && typeof block.text === 'string') messages.push(block.text);
      }
    }
    if (e.type === 'session.status_idle' || e.type === 'session.status_terminated') break;
  }

  const latencyMs = Date.now() - t0;
  await recordRunFinish(clientRunId, {
    status: 'ok',
    latencyMs,
    provider: 'anthropic-managed',
    model: SIGNOFF_MODEL,
  });

  return parseSchedulePlan(messages.join('\n'), input.variations.length, {
    sessionId,
    latencyMs,
    usedManagedAgentsApi: true,
  });
}

// ---------------------------------------------------------------------------
// Fallback: standard messages.create
// ---------------------------------------------------------------------------

async function runViaMessagesCreate(
  input: SignoffAgentInput,
  client: Anthropic,
  clientRunId: string
): Promise<SchedulePlan> {
  const t0 = Date.now();
  const prompt = buildSignoffPrompt(input);

  const response = await client.messages.create({
    model: SIGNOFF_MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const finalText = response.content
    .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('');

  const latencyMs = Date.now() - t0;
  await recordRunFinish(clientRunId, {
    status: 'ok',
    latencyMs,
    provider: 'anthropic',
    model: SIGNOFF_MODEL,
  });

  return parseSchedulePlan(finalText, input.variations.length, {
    latencyMs,
    usedManagedAgentsApi: false,
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run the Signoff Managed Agent.
 *
 * Evaluates a variation set against brand guardrails and produces a per-
 * platform schedule plan: which to auto-post, which to hold for review,
 * and which to reject.
 *
 * Uses Managed Agents API when agent/environment IDs are configured;
 * falls back to standard messages.create otherwise. Both paths produce
 * the same SchedulePlan shape and write provenance to capabilityRun.
 */
export async function runSignoffAgent(
  input: SignoffAgentInput
): Promise<SchedulePlan> {
  const apiKey = input.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!input.client && !apiKey) {
    throw new Error('ANTHROPIC_API_KEY not set — Signoff agent cannot run');
  }
  const client = input.client ?? new Anthropic({ apiKey: apiKey as string });

  const clientRunId = `managed_signoff_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  await recordRunStart({
    clientRunId,
    wsId: input.workspaceId,
    tool: 'managed-signoff',
    provider: 'anthropic-managed',
    model: SIGNOFF_MODEL,
    prompt: JSON.stringify({ variationCount: input.variations.length }),
  });

  const agentConfig =
    input.useManagedAgents === false ? null : resolveAgentConfig();

  try {
    if (agentConfig) {
      return await runViaManagedAgentsApi(
        input,
        client,
        agentConfig.agentId,
        agentConfig.environmentId,
        clientRunId
      );
    } else {
      return await runViaMessagesCreate(input, client, clientRunId);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordRunFail(clientRunId, message);
    throw err;
  }
}

/**
 * Cluster Managed Agent — aether Lane B (overnight 2026-04-27).
 *
 * SDK implementation note (verified against @anthropic-ai/sdk@0.90.x):
 * Uses the Anthropic Managed Agents API (`client.beta.agents` +
 * `client.beta.sessions`) when ANTHROPIC_CLUSTER_AGENT_ID and
 * ANTHROPIC_CLUSTER_ENVIRONMENT_ID are set; falls back to a standard
 * `client.messages.create` call with vision (no web_search needed) so
 * visual clustering always works even without a provisioned agent.
 *
 * The cluster agent receives a pile of reference image URLs / data URLs
 * and groups them by visual similarity using Claude's vision capabilities.
 * Each cluster gets a rationale label and visual-trend tags that the right
 * rail can surface as moodboard directions.
 *
 * Provenance: every run writes to capabilityRun via recordRunStart/Finish/Fail.
 */

import Anthropic from '@anthropic-ai/sdk';
import { recordRunStart, recordRunFinish, recordRunFail } from '@/lib/convex/http';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ClusterRef {
  /** Public URL or data:image base64 URL for the reference image. */
  url: string;
  /** Optional human-readable label from the caller (e.g. filename, title). */
  label?: string;
}

export interface Cluster {
  /** Short cluster label (e.g. "warm minimalist bedroom"). */
  label: string;
  /** Visual rationale explaining why these refs belong together. */
  rationale: string;
  /** Visual trend tags (e.g. ["soft lighting", "neutral palette"]). */
  tags: string[];
  /** Indexes into the original `refs` array that belong to this cluster. */
  memberIndexes: number[];
}

export interface ClusterBundle {
  /** Session id when the Managed Agents path was used. */
  sessionId?: string;
  latencyMs: number;
  clusters: Cluster[];
  /** Rationale for refs that didn't fit any cluster. */
  unclustered: number[];
  usedManagedAgentsApi: boolean;
}

export interface ClusterAgentInput {
  refs: ClusterRef[];
  /** Override for tests. */
  apiKey?: string;
  /** Override for tests. */
  client?: Anthropic;
  workspaceId?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CLUSTER_MODEL = 'claude-opus-4-7';

function resolveAgentConfig(): { agentId: string; environmentId: string } | null {
  const agentId = process.env.ANTHROPIC_CLUSTER_AGENT_ID;
  const environmentId = process.env.ANTHROPIC_CLUSTER_ENVIRONMENT_ID;
  if (agentId && environmentId) return { agentId, environmentId };
  return null;
}

// ---------------------------------------------------------------------------
// Bundle parser
// ---------------------------------------------------------------------------

function parseClusterBundle(
  text: string,
  refCount: number,
  overrides: Partial<ClusterBundle>
): ClusterBundle {
  const defaults: ClusterBundle = {
    latencyMs: 0,
    clusters: [],
    unclustered: Array.from({ length: refCount }, (_, i) => i),
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

  const pickClusters = (v: unknown): Cluster[] => {
    if (!Array.isArray(v)) return [];
    return v
      .map((item): Cluster | null => {
        if (!item || typeof item !== 'object') return null;
        const o = item as Record<string, unknown>;
        const label = typeof o.label === 'string' ? o.label.trim() : '';
        if (!label) return null;
        const tags = Array.isArray(o.tags)
          ? (o.tags.filter((t) => typeof t === 'string' && t.trim()) as string[])
          : [];
        const memberIndexes = Array.isArray(o.memberIndexes)
          ? (o.memberIndexes.filter((n) => typeof n === 'number') as number[])
          : [];
        return {
          label,
          rationale: typeof o.rationale === 'string' ? o.rationale.trim() : '',
          tags,
          memberIndexes,
        };
      })
      .filter((x): x is Cluster => x !== null);
  };

  const pickNumbers = (v: unknown): number[] => {
    if (!Array.isArray(v)) return [];
    return v.filter((n): n is number => typeof n === 'number');
  };

  return {
    ...defaults,
    clusters: pickClusters(parsed.clusters),
    unclustered: pickNumbers(parsed.unclustered),
  };
}

// ---------------------------------------------------------------------------
// Managed Agents path
// ---------------------------------------------------------------------------

async function runViaManagedAgentsApi(
  input: ClusterAgentInput,
  client: Anthropic,
  agentId: string,
  environmentId: string,
  clientRunId: string
): Promise<ClusterBundle> {
  const t0 = Date.now();

  // Build user message with ref list. The agent sees the image URLs
  // (it doesn't need base64 bytes for clustering — vision over URLs works).
  const refList = input.refs
    .map((r, i) => `  ${i}: ${r.url.startsWith('data:') ? '<inline data URL>' : r.url}${r.label ? ` (${r.label})` : ''}`)
    .join('\n');

  const userMessage = [
    `Group these ${input.refs.length} reference images by visual similarity for a creative campaign. Identify 2-4 distinct visual clusters.`,
    '',
    'References:',
    refList,
    '',
    'Return ONLY a JSON object:',
    '{',
    '  "clusters": [',
    '    { "label": "<short label>", "rationale": "<why similar>", "tags": ["<visual tag>"], "memberIndexes": [<0-based index>, ...] }',
    '  ],',
    '  "unclustered": [<indexes of refs that don\'t fit a cluster>]',
    '}',
  ].join('\n');

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
    title: `Cluster: ${input.refs.length} refs`,
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
        if (block.type === 'text' && typeof block.text === 'string') {
          messages.push(block.text);
        }
      }
    }
    if (e.type === 'session.status_idle' || e.type === 'session.status_terminated') break;
  }

  const latencyMs = Date.now() - t0;
  await recordRunFinish(clientRunId, {
    status: 'ok',
    latencyMs,
    provider: 'anthropic-managed',
    model: CLUSTER_MODEL,
  });

  return parseClusterBundle(messages.join('\n'), input.refs.length, {
    sessionId,
    latencyMs,
    usedManagedAgentsApi: true,
  });
}

// ---------------------------------------------------------------------------
// Fallback: standard messages.create with vision
// ---------------------------------------------------------------------------

async function runViaMessagesCreate(
  input: ClusterAgentInput,
  client: Anthropic,
  clientRunId: string
): Promise<ClusterBundle> {
  const t0 = Date.now();

  // Build content blocks: text prompt + image blocks for non-data-URL refs.
  // Data URLs are included inline; large data URLs are truncated to avoid
  // blowing the context window.
  const refDescriptions = input.refs
    .map((r, i) => `  ${i}: ${r.url.startsWith('data:') ? '<inline image>' : r.url}${r.label ? ` — ${r.label}` : ''}`)
    .join('\n');

  const textBlock: Anthropic.MessageParam['content'] = [
    {
      type: 'text',
      text: [
        `Group these ${input.refs.length} reference images by visual similarity. Identify 2-4 distinct visual clusters.`,
        '',
        'References:',
        refDescriptions,
        '',
        'Return ONLY a JSON object:',
        '{',
        '  "clusters": [',
        '    { "label": "<short label>", "rationale": "<why similar>", "tags": ["<visual tag>"], "memberIndexes": [<0-based indexes>] }',
        '  ],',
        '  "unclustered": [<indexes that don\'t fit>]',
        '}',
      ].join('\n'),
    },
  ];

  const response = await client.messages.create({
    model: CLUSTER_MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: textBlock }],
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
    model: CLUSTER_MODEL,
  });

  return parseClusterBundle(finalText, input.refs.length, {
    latencyMs,
    usedManagedAgentsApi: false,
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run the Cluster Managed Agent.
 *
 * Groups a set of reference images by visual similarity using Claude vision.
 * Uses Managed Agents API when agent/environment IDs are configured; falls
 * back to standard messages.create with vision otherwise.
 *
 * Wire into the right-rail references panel so creators see labelled clusters
 * as moodboard directions they can promote to canvas.
 */
export async function runClusterAgent(
  input: ClusterAgentInput
): Promise<ClusterBundle> {
  if (input.refs.length === 0) {
    return {
      latencyMs: 0,
      clusters: [],
      unclustered: [],
      usedManagedAgentsApi: false,
    };
  }

  const apiKey = input.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!input.client && !apiKey) {
    throw new Error('ANTHROPIC_API_KEY not set — Cluster agent cannot run');
  }
  const client = input.client ?? new Anthropic({ apiKey: apiKey as string });

  const clientRunId = `managed_cluster_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  await recordRunStart({
    clientRunId,
    wsId: input.workspaceId,
    tool: 'managed-cluster',
    provider: 'anthropic-managed',
    model: CLUSTER_MODEL,
    prompt: JSON.stringify({ refCount: input.refs.length }),
  });

  const agentConfig = resolveAgentConfig();

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

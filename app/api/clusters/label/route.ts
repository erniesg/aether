import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const CLUSTER_LABEL_MODEL = 'claude-opus-4-7';

const SYSTEM_PROMPT = [
  'You are aether, a canvas-native creative system.',
  'Given N image clusters identified from a creator\'s reference pile, assign each a 2-3 word creative direction label.',
  '',
  'Rules:',
  '- 2 to 3 words per label. No punctuation, no emoji.',
  '- Use the vocabulary of creative direction: "soft morning light", "quiet ceramics", "raw desert".',
  '- Do not use generic words like "cluster", "group", "images".',
  '- Do not describe the images literally — name the direction a creator could follow.',
].join('\n');

const TOOL_EMIT_LABELS: Anthropic.Messages.Tool = {
  name: 'emit_labels',
  description:
    'Return the assigned creative-direction labels for every provided cluster id.',
  input_schema: {
    type: 'object',
    properties: {
      labels: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            clusterId: { type: 'string', description: 'The cluster id to label.' },
            label: {
              type: 'string',
              description: '2-3 word creative direction label, lowercase, no punctuation.',
            },
          },
          required: ['clusterId', 'label'],
        },
      },
    },
    required: ['labels'],
  } as unknown as Anthropic.Messages.Tool['input_schema'],
};

interface ClusterSample {
  clusterId: string;
  samples?: string[];
}

interface LabelOutput {
  clusterId: string;
  label: string;
}

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function parseClusters(raw: unknown): ClusterSample[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ClusterSample[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') return null;
    const e = entry as Record<string, unknown>;
    if (typeof e.clusterId !== 'string' || !e.clusterId.trim()) return null;
    const samples = Array.isArray(e.samples)
      ? (e.samples.filter((s) => typeof s === 'string') as string[])
      : undefined;
    out.push({ clusterId: e.clusterId, samples });
  }
  return out;
}

function normalizeLabel(raw: string, fallback: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return fallback;
  // Strip stray punctuation but preserve hyphens — "slow-living" is fine.
  const cleaned = trimmed.replace(/[.,!?·]+/g, '').replace(/\s+/g, ' ');
  const words = cleaned.split(' ').filter(Boolean);
  if (words.length === 0) return fallback;
  if (words.length > 3) return words.slice(0, 3).join(' ');
  return words.join(' ');
}

const FALLBACK_STOPWORDS = new Set([
  'account',
  'and',
  'author',
  'campaign',
  'creator',
  'direction',
  'generic',
  'hashtag',
  'image',
  'images',
  'intent',
  'keyword',
  'notes',
  'platform',
  'pinterest',
  'research',
  'social',
  'source',
  'tags',
  'target',
  'the',
  'tiktok',
  'url',
  'usage',
  'visual',
  'web',
  'xhs',
]);

function fallbackLabelFromSamples(samples: string[]): string | null {
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const sample of samples) {
    for (const match of sample.toLowerCase().matchAll(/[a-z][a-z0-9-]{2,}/g)) {
      const parts = match[0].replace(/^-+|-+$/g, '').split('-');
      for (const token of parts) {
        if (!token || FALLBACK_STOPWORDS.has(token) || seen.has(token)) continue;
        seen.add(token);
        tokens.push(token);
        if (tokens.length >= 3) return tokens.join(' ');
      }
    }
  }
  return tokens.length >= 2 ? tokens.join(' ') : null;
}

function fallbackLabelFor(clusterId: string, samples?: string[]): string {
  const sampled = samples && samples.length > 0 ? fallbackLabelFromSamples(samples) : null;
  if (sampled) return sampled;
  return `direction ${clusterId}`;
}

function isToolUseBlock(
  block: Anthropic.Messages.ContentBlock
): block is Anthropic.Messages.ToolUseBlock {
  return block.type === 'tool_use';
}

/**
 * POST /api/clusters/label
 *
 * Body: `{ clusters: Array<{ clusterId, samples? }> }`. Returns one 2-3 word
 * creative direction per cluster. When `ANTHROPIC_API_KEY` is absent, returns
 * deterministic fallback labels so the lens still renders in dev.
 */
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
  const clusters = parseClusters((body as { clusters?: unknown }).clusters);
  if (!clusters) {
    return jsonError(400, 'clusters must be an array of { clusterId, samples? }');
  }
  if (clusters.length === 0) {
    return NextResponse.json({ ok: true, labels: [] });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    const labels: LabelOutput[] = clusters.map((c) => ({
      clusterId: c.clusterId,
      label: fallbackLabelFor(c.clusterId, c.samples),
    }));
    return NextResponse.json({ ok: true, labels, fallback: 'no-api-key' });
  }

  try {
    const client = new Anthropic({ apiKey });
    const userPrompt = clusters
      .map(
        (c) =>
          `Cluster ${c.clusterId}: ${
            c.samples && c.samples.length > 0
              ? c.samples.join(' · ')
              : 'no samples provided'
          }`
      )
      .join('\n');

    const msg = await client.messages.create({
      model: CLUSTER_LABEL_MODEL,
      max_tokens: 512,
      system: [
        { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      ],
      tools: [TOOL_EMIT_LABELS],
      tool_choice: { type: 'tool', name: 'emit_labels' },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Assign a 2-3 word creative direction label per cluster.\n\n${userPrompt}`,
            },
          ],
        },
      ],
    });

    const toolBlock = msg.content.find(isToolUseBlock);
    if (!toolBlock || toolBlock.name !== 'emit_labels') {
      throw new Error('Claude did not emit emit_labels tool call');
    }
    const input = toolBlock.input as { labels?: unknown };
    const rawLabels = Array.isArray(input.labels) ? input.labels : [];
    const byId = new Map<string, string>();
    for (const entry of rawLabels) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      if (typeof e.clusterId !== 'string' || typeof e.label !== 'string') continue;
      byId.set(e.clusterId, normalizeLabel(e.label, fallbackLabelFor(e.clusterId)));
    }
    const labels: LabelOutput[] = clusters.map((c) => ({
      clusterId: c.clusterId,
      label: byId.get(c.clusterId) ?? fallbackLabelFor(c.clusterId, c.samples),
    }));
    return NextResponse.json({ ok: true, labels });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Fallbacks when Anthropic returns auth / quota errors — demo stays up.
    if (
      /credit balance is too low/i.test(message) ||
      /invalid_request_error/i.test(message) ||
      /authentication/i.test(message) ||
      /permission/i.test(message)
    ) {
      const labels: LabelOutput[] = clusters.map((c) => ({
        clusterId: c.clusterId,
        label: fallbackLabelFor(c.clusterId, c.samples),
      }));
      return NextResponse.json({ ok: true, labels, fallback: 'anthropic-error' });
    }
    return jsonError(500, message);
  }
}

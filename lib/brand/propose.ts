/**
 * Autonomous brand follow-up proposer.
 *
 * Fans out three workers concurrently via Promise.all:
 *   offerProposer    — drafts 1–3 OfferContext candidates
 *   campaignProposer — drafts 1–3 CampaignContext candidates
 *   coverageReviewer — flags gaps or contradictions in the snapshot + proposals
 *
 * Design notes:
 *   • Single-conversation multi-step orchestration — NOT Managed Agents.
 *   • Three named system prompts, each cached with cache_control: { type: 'ephemeral' }.
 *   • The runWorker helper is the seam for a future Managed Agents migration:
 *     extract it into a managed-agent session call when the time comes.
 *   • Fail-soft: each worker is wrapped in its own try/catch so one failure
 *     does not block the others.
 *   • Provider mandate: claude-opus-4-7 only — no OpenAI/Gemini in the agentic layer.
 */

import Anthropic from '@anthropic-ai/sdk';
import { CLAUDE_MODEL } from '@/lib/agent/generate';
import type { OfferContext, CampaignContext } from '@/lib/context/model';
import type { BrandSnapshot } from '@/lib/brand/types';
import {
  OFFER_PROPOSER_SYSTEM,
  CAMPAIGN_PROPOSER_SYSTEM,
  COVERAGE_REVIEWER_SYSTEM,
} from './proposePrompts';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface BrandFollowups {
  offers: OfferContext[];
  campaigns: CampaignContext[];
  coverage: { ok: boolean; notes: string[] };
}

/**
 * Which workers to fan out. `'all'` (the default) runs offers, campaigns, and
 * coverage. `'offers'` and `'campaigns'` run only that worker — used by the
 * "regenerate from brand" buttons on the offer / campaign rails so a single
 * rail can be re-proposed without paying for the other two.
 */
export type ProposeScope = 'all' | 'offers' | 'campaigns';

export interface ProposeBrandFollowupsOptions {
  snapshot: BrandSnapshot;
  scope?: ProposeScope;
  /** Override the Anthropic client (used in tests). */
  client?: Anthropic;
}

// ---------------------------------------------------------------------------
// Tool definitions for each worker
// ---------------------------------------------------------------------------

const OFFER_TOOL: Anthropic.Tool = {
  name: 'propose_offers',
  description: 'Emit 1–3 OfferContext drafts for the creator to accept or edit. Call exactly once.',
  input_schema: {
    type: 'object',
    properties: {
      offers: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id:        { type: 'string' },
            name:      { type: 'string' },
            summary:   { type: 'string' },
            claims:    { type: 'array', items: { type: 'string' } },
            heroAsset: { type: 'string' },
          },
          required: ['id', 'name', 'summary', 'claims', 'heroAsset'],
        },
      },
    },
    required: ['offers'],
  } as unknown as Anthropic.Tool['input_schema'],
};

const CAMPAIGN_TOOL: Anthropic.Tool = {
  name: 'propose_campaigns',
  description: 'Emit 1–3 CampaignContext drafts for the creator to accept or edit. Call exactly once.',
  input_schema: {
    type: 'object',
    properties: {
      campaigns: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id:       { type: 'string' },
            name:     { type: 'string' },
            goal:     { type: 'string' },
            audience: { type: 'string' },
            channels: { type: 'array', items: { type: 'string' } },
            cta:      { type: 'string' },
          },
          required: ['id', 'name', 'goal', 'audience', 'channels', 'cta'],
        },
      },
    },
    required: ['campaigns'],
  } as unknown as Anthropic.Tool['input_schema'],
};

const COVERAGE_TOOL: Anthropic.Tool = {
  name: 'coverage_review',
  description: 'Emit a coverage verdict for the brand proposals. Call exactly once.',
  input_schema: {
    type: 'object',
    properties: {
      ok:    { type: 'boolean' },
      notes: { type: 'array', items: { type: 'string' } },
    },
    required: ['ok', 'notes'],
  } as unknown as Anthropic.Tool['input_schema'],
};

// ---------------------------------------------------------------------------
// Worker runner — the seam for a future Managed Agents migration
//
// To migrate: replace this function body with a managed-agent session call.
// The three call-sites below stay identical.
// ---------------------------------------------------------------------------

interface WorkerParams {
  name: 'offerProposer' | 'campaignProposer' | 'coverageReviewer';
  systemPrompt: string;
  tool: Anthropic.Tool;
  userMessage: string;
  client: Anthropic;
}

async function runWorker(params: WorkerParams): Promise<Record<string, unknown>> {
  const { systemPrompt, tool, userMessage, client } = params;

  const msg = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [tool],
    tool_choice: { type: 'tool', name: tool.name },
    messages: [{ role: 'user', content: [{ type: 'text', text: userMessage }] }],
  });

  const toolBlock = msg.content.find(
    (b): b is Extract<typeof b, { type: 'tool_use' }> =>
      b.type === 'tool_use' && b.name === tool.name
  );
  if (!toolBlock) {
    throw new Error(`Worker ${params.name}: Claude did not emit a ${tool.name} tool call`);
  }
  return toolBlock.input as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Input serialiser — snapshot → human-readable message for each worker
// ---------------------------------------------------------------------------

function buildSnapshotMessage(snapshot: BrandSnapshot): string {
  const lines: string[] = ['Brand snapshot to analyse:', ''];

  if (snapshot.source.url) lines.push(`source: ${snapshot.source.url}`);

  if (snapshot.palette.length > 0) {
    lines.push('palette: ' + snapshot.palette.map((p) => `${p.hex}${p.role ? ` (${p.role})` : ''}`).join(', '));
  }
  if (snapshot.typography.length > 0) {
    lines.push('typography: ' + snapshot.typography.map((t) => `${t.family}${t.role ? ` · ${t.role}` : ''}`).join(', '));
  }
  if (snapshot.voice.samples.length > 0) {
    lines.push('voice samples:');
    for (const s of snapshot.voice.samples.slice(0, 4)) lines.push(`  "${s}"`);
  }
  if (snapshot.voice.tone && snapshot.voice.tone.length > 0) {
    lines.push('tone: ' + snapshot.voice.tone.join(', '));
  }
  if (snapshot.logos.length > 0) {
    lines.push(`logos: ${snapshot.logos.length} found`);
  }
  if (snapshot.productImages.length > 0) {
    lines.push('product images:');
    for (const p of snapshot.productImages.slice(0, 4)) {
      lines.push(`  ${p.url}${p.alt ? ` (${p.alt})` : ''}`);
    }
  }
  lines.push(`confidence: ${snapshot.confidence.toFixed(2)}`);
  return lines.join('\n');
}

function buildCoverageMessage(
  snapshot: BrandSnapshot,
  offers: OfferContext[],
  campaigns: CampaignContext[]
): string {
  return [
    buildSnapshotMessage(snapshot),
    '',
    `offers drafted: ${offers.length}`,
    offers.map((o) => `  • ${o.name}: ${o.summary}`).join('\n'),
    '',
    `campaigns drafted: ${campaigns.length}`,
    campaigns.map((c) => `  • ${c.name}: ${c.goal}`).join('\n'),
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Parsers — convert raw tool output to typed domain objects
// ---------------------------------------------------------------------------

function parseOffers(raw: Record<string, unknown>): OfferContext[] {
  if (!Array.isArray(raw.offers)) return [];
  return (raw.offers as unknown[]).flatMap((item): OfferContext[] => {
    if (!item || typeof item !== 'object') return [];
    const o = item as Record<string, unknown>;
    if (typeof o.id !== 'string' || typeof o.name !== 'string') return [];
    return [{
      id: o.id,
      name: o.name,
      summary: typeof o.summary === 'string' ? o.summary : '',
      claims: Array.isArray(o.claims) ? (o.claims as unknown[]).filter((c): c is string => typeof c === 'string') : [],
      heroAsset: typeof o.heroAsset === 'string' ? o.heroAsset : '',
    }];
  });
}

function parseCampaigns(raw: Record<string, unknown>): CampaignContext[] {
  if (!Array.isArray(raw.campaigns)) return [];
  return (raw.campaigns as unknown[]).flatMap((item): CampaignContext[] => {
    if (!item || typeof item !== 'object') return [];
    const c = item as Record<string, unknown>;
    if (typeof c.id !== 'string' || typeof c.name !== 'string') return [];
    return [{
      id: c.id,
      name: c.name,
      goal: typeof c.goal === 'string' ? c.goal : '',
      audience: typeof c.audience === 'string' ? c.audience : '',
      channels: Array.isArray(c.channels) ? (c.channels as unknown[]).filter((ch): ch is string => typeof ch === 'string') : [],
      cta: typeof c.cta === 'string' ? c.cta : '',
    }];
  });
}

function parseCoverage(raw: Record<string, unknown>): { ok: boolean; notes: string[] } {
  return {
    ok: typeof raw.ok === 'boolean' ? raw.ok : false,
    notes: Array.isArray(raw.notes)
      ? (raw.notes as unknown[]).filter((n): n is string => typeof n === 'string')
      : [],
  };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function proposeBrandFollowups(
  opts: ProposeBrandFollowupsOptions
): Promise<BrandFollowups> {
  const { snapshot, scope = 'all' } = opts;
  const client = opts.client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const snapshotMsg = buildSnapshotMessage(snapshot);

  const wantOffers = scope === 'all' || scope === 'offers';
  const wantCampaigns = scope === 'all' || scope === 'campaigns';
  const wantCoverage = scope === 'all';

  // Fan out the requested workers concurrently via Promise.all. Each worker is
  // wrapped in try/catch so one failure does not block the others. Per-rail
  // regenerate calls drop the workers they don't need so a single-rail refresh
  // doesn't pay for the other two.
  const [offerResult, campaignResult, coverageInput] = await Promise.all([
    wantOffers
      ? runWorker({
          name: 'offerProposer',
          systemPrompt: OFFER_PROPOSER_SYSTEM,
          tool: OFFER_TOOL,
          userMessage: `Propose offers for this brand.\n\n${snapshotMsg}`,
          client,
        }).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          return { offers: [], _error: msg } as Record<string, unknown>;
        })
      : Promise.resolve({ offers: [] } as Record<string, unknown>),

    wantCampaigns
      ? runWorker({
          name: 'campaignProposer',
          systemPrompt: CAMPAIGN_PROPOSER_SYSTEM,
          tool: CAMPAIGN_TOOL,
          userMessage: `Propose campaigns for this brand.\n\n${snapshotMsg}`,
          client,
        }).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          return { campaigns: [], _error: msg } as Record<string, unknown>;
        })
      : Promise.resolve({ campaigns: [] } as Record<string, unknown>),

    wantCoverage
      ? runWorker({
          name: 'coverageReviewer',
          systemPrompt: COVERAGE_REVIEWER_SYSTEM,
          tool: COVERAGE_TOOL,
          userMessage: `Review coverage for this brand snapshot.\n\n${snapshotMsg}`,
          client,
        }).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          return {
            ok: false,
            notes: [`coverage reviewer failed: ${msg}`],
          } as Record<string, unknown>;
        })
      : Promise.resolve({ ok: true, notes: [] } as Record<string, unknown>),
  ]);

  const offers = parseOffers(offerResult);
  const campaigns = parseCampaigns(campaignResult);
  const coverage = parseCoverage(coverageInput);

  return { offers, campaigns, coverage };
}

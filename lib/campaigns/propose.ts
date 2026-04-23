import Anthropic from '@anthropic-ai/sdk';
import { CLAUDE_MODEL } from '@/lib/agent/generate';
import type { SafeZonePresetId } from '@/lib/canvas/safeZones';
import { SAFE_ZONE_PRESETS } from '@/lib/canvas/safeZones';
import type { BrandSnapshot } from '@/lib/brand/types';
import type { CampaignProposal } from './types';

/**
 * Campaign proposer — asks Claude Opus 4.7 to take brand + offer (+ optional
 * signals) context and emit a proposed campaign shape. Structure mirrors
 * `lib/brand/shape.ts`: a single tool call, deterministic local fallback when
 * no key / credits / network.
 */

export const CAMPAIGN_PROPOSE_SYSTEM_PROMPT = [
  'You are the campaign strategist inside aether, a canvas-native creative system.',
  'Your job: take the creator\'s brand, their current offer, and any live signals',
  'they pinned, and propose a single campaign shape they can start from.',
  '',
  'A campaign shape is not a plan document. It is four terse fields:',
  '  • name       — 2-4 words; what this campaign is called.',
  '  • intent     — one short sentence; the strategic move this campaign pulls.',
  '  • formats    — 2-4 artboard formats the canvas should open with. Pick only',
  '                 from: ig-post, story, reel-cover, linkedin-landscape.',
  '  • tone       — 2-4 tone tokens (single words / short phrases).',
  '  • briefBody  — a first-draft brief body, 2-4 sentences, written so the',
  '                 creator can tweak it and run.',
  '',
  'Operating principles:',
  '  • You are not a chatbot. Call the propose_campaign tool exactly once, then stop.',
  '  • Reflect the brand voice in the tone tokens. Do not invent tones that clash.',
  '  • Match formats to the campaign: teasers → vertical; announcements → feed + LinkedIn.',
  '  • Keep the brief body specific — subjects, mood, pacing — not generic filler.',
].join('\n');

type Tool = Anthropic.Messages.Tool;

const VALID_FORMATS: ReadonlyArray<SafeZonePresetId> = Object.keys(
  SAFE_ZONE_PRESETS
) as SafeZonePresetId[];

export const CAMPAIGN_PROPOSE_TOOL: Tool = {
  name: 'propose_campaign',
  description:
    'Emit a structured CampaignProposal distilled from the brand + offer context. Call exactly once.',
  input_schema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: '2-4 words. What this campaign is called.',
      },
      intent: {
        type: 'string',
        description: 'One short sentence. The strategic move this campaign pulls.',
      },
      formats: {
        type: 'array',
        items: {
          type: 'string',
          enum: VALID_FORMATS as unknown as string[],
        },
        description:
          '2-4 artboard formats. Only ig-post, story, reel-cover, linkedin-landscape.',
      },
      tone: {
        type: 'array',
        items: { type: 'string' },
        description: '2-4 tone tokens — single words or short phrases.',
      },
      briefBody: {
        type: 'string',
        description:
          'First-draft brief body. 2-4 sentences. Specific about subjects, mood, pacing.',
      },
    },
    required: ['name', 'intent', 'formats', 'tone', 'briefBody'],
  } as unknown as Tool['input_schema'],
};

export interface ProposeCampaignInputs {
  brandSnapshot?: BrandSnapshot;
  offerSnapshot?: {
    name?: string;
    summary?: string;
    claims?: string[];
    heroAsset?: string;
  };
  signals?: Array<{ title: string; platform?: string; lift?: string }>;
}

export interface ProposeCampaignOptions {
  bypassAgent?: boolean;
  client?: Anthropic;
}

export async function proposeCampaign(
  inputs: ProposeCampaignInputs,
  opts: ProposeCampaignOptions = {}
): Promise<CampaignProposal> {
  if (opts.bypassAgent) return localFallback(inputs);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey && !opts.client) return localFallback(inputs);

  const client = opts.client ?? new Anthropic({ apiKey: apiKey! });
  let msg: Awaited<ReturnType<Anthropic['messages']['create']>>;
  try {
    msg = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: CAMPAIGN_PROPOSE_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: [CAMPAIGN_PROPOSE_TOOL],
      tool_choice: { type: 'tool', name: 'propose_campaign' },
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: buildInputsMessage(inputs) }],
        },
      ],
    });
  } catch (err) {
    if (shouldFallbackFromAnthropic(err)) return localFallback(inputs);
    throw err;
  }

  const toolBlock = msg.content.find(
    (b): b is Extract<typeof b, { type: 'tool_use' }> =>
      b.type === 'tool_use' && b.name === 'propose_campaign'
  );
  if (!toolBlock) throw new Error('Claude did not emit a propose_campaign tool call');
  return parseProposalToolInput(toolBlock.input);
}

export function parseProposalToolInput(value: unknown): CampaignProposal {
  if (typeof value !== 'object' || value === null) {
    throw new Error('propose_campaign tool input was not an object');
  }
  const v = value as Record<string, unknown>;
  const name = typeof v.name === 'string' ? v.name.trim() : '';
  const intent = typeof v.intent === 'string' ? v.intent.trim() : '';
  const briefBody = typeof v.briefBody === 'string' ? v.briefBody.trim() : '';
  if (!name) throw new Error('propose_campaign required: name');
  if (!intent) throw new Error('propose_campaign required: intent');
  if (!briefBody) throw new Error('propose_campaign required: briefBody');

  const formats = Array.isArray(v.formats)
    ? (v.formats as unknown[])
        .filter((f): f is string => typeof f === 'string')
        .filter((f): f is SafeZonePresetId => (VALID_FORMATS as string[]).includes(f))
    : [];
  if (formats.length === 0) {
    throw new Error('propose_campaign required: formats (non-empty)');
  }

  const tone = Array.isArray(v.tone)
    ? (v.tone as unknown[]).filter(
        (t): t is string => typeof t === 'string' && t.trim() !== ''
      )
    : [];

  return { name, intent, formats, tone, briefBody };
}

function buildInputsMessage(inputs: ProposeCampaignInputs): string {
  const lines: string[] = ['Propose a campaign shape from the context below.', ''];

  if (inputs.brandSnapshot) {
    const b = inputs.brandSnapshot;
    lines.push('brand:');
    if (b.palette.length) {
      lines.push(`  palette: ${b.palette.map((e) => e.hex).slice(0, 6).join(', ')}`);
    }
    if (b.typography.length) {
      lines.push(
        `  typography: ${b.typography.map((t) => t.family).slice(0, 4).join(', ')}`
      );
    }
    if (b.voice.samples.length) {
      lines.push(`  voice samples:`);
      for (const s of b.voice.samples.slice(0, 3)) lines.push(`    - ${s}`);
    }
    if (b.voice.tone?.length) {
      lines.push(`  voice tone: ${b.voice.tone.slice(0, 4).join(', ')}`);
    }
    lines.push('');
  }

  if (inputs.offerSnapshot) {
    const o = inputs.offerSnapshot;
    lines.push('offer:');
    if (o.name) lines.push(`  name: ${o.name}`);
    if (o.summary) lines.push(`  summary: ${o.summary}`);
    if (o.claims?.length) {
      lines.push(`  claims: ${o.claims.slice(0, 6).join(' · ')}`);
    }
    if (o.heroAsset) lines.push(`  hero asset: ${o.heroAsset}`);
    lines.push('');
  }

  if (inputs.signals && inputs.signals.length > 0) {
    lines.push('live signals:');
    for (const s of inputs.signals.slice(0, 6)) {
      const parts = [s.title, s.platform, s.lift].filter(Boolean).join(' · ');
      lines.push(`  - ${parts}`);
    }
    lines.push('');
  }

  lines.push(
    'Remember: call propose_campaign exactly once, only with formats in {ig-post, story, reel-cover, linkedin-landscape}.'
  );
  return lines.join('\n');
}

function shouldFallbackFromAnthropic(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    /ANTHROPIC_API_KEY not set/i.test(message) ||
    /credit balance is too low/i.test(message) ||
    /invalid_request_error/i.test(message) ||
    /authentication/i.test(message) ||
    /permission/i.test(message) ||
    /billing/i.test(message)
  );
}

/**
 * Deterministic fallback so tests / offline demos still return a plausible
 * proposal. Leans on the offer name + brand voice when present; otherwise
 * produces a generic launch shape.
 */
export function localFallback(inputs: ProposeCampaignInputs): CampaignProposal {
  const offerName = inputs.offerSnapshot?.name?.trim();
  const offerSummary = inputs.offerSnapshot?.summary?.trim();
  const brandTone = inputs.brandSnapshot?.voice.tone?.filter(Boolean) ?? [];

  const name = offerName ? `${offerName} launch` : 'spring launch';
  const intent = offerSummary
    ? `Introduce ${offerName ?? 'the offer'}: ${offerSummary}.`
    : 'Introduce the offer across feed, story, reel cover, and LinkedIn.';
  const formats: SafeZonePresetId[] = [
    'ig-post',
    'story',
    'reel-cover',
    'linkedin-landscape',
  ];
  const tone =
    brandTone.length > 0 ? brandTone.slice(0, 3) : ['confident', 'on-brand', 'expansive'];
  const claimLine = inputs.offerSnapshot?.claims?.slice(0, 3).join(' · ');
  const briefBody = [
    `Launch ${offerName ?? 'the offer'} across the seeded formats.`,
    claimLine ? `Lead with: ${claimLine}.` : 'Lead with the strongest product claim.',
    'Keep the key visual cohesive across the fan-out; let each format crop to fit.',
  ].join(' ');

  return { name, intent, formats, tone, briefBody };
}

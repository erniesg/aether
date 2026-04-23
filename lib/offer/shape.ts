import Anthropic from '@anthropic-ai/sdk';
import { CLAUDE_MODEL } from '@/lib/agent/generate';
import type {
  OfferHeroImage,
  OfferLaunchWindow,
  OfferPriceTier,
  OfferRawExtract,
  OfferSnapshot,
  OfferSnapshotSource,
} from './types';

/**
 * Turn a raw parser extract into a structured `OfferSnapshot`. Claude Opus
 * 4.7 does the ranking + value-prop phrasing via a single tool call; local
 * fallback kicks in when the API key / billing is unavailable.
 */

const SHAPE_SYSTEM_PROMPT = [
  'You are the offer-reader inside aether, a canvas-native creative system.',
  'Your job: take a raw scrape of an offer surface (product page, brief, or',
  'pasted rich text) and distil it into a structured OfferSnapshot a creator',
  'can use to compose a campaign.',
  '',
  'Operating principles:',
  '  • You are not a chatbot. Call the offer_snapshot tool exactly once, then stop.',
  '  • Keep claims punchy — short USPs, not sentences. 3-6 is healthy.',
  '  • Copy testimonials verbatim; do not paraphrase. Drop anything marketing-fluff.',
  '  • priceTiers only when the scrape actually contained a price. No guesses.',
  '  • launchWindow only when dates were present. Do not infer.',
  '  • Confidence 0..1. Use 0.2-0.4 when name + claims are thin; 0.6+ when name,',
  '    tagline, claims, and hero imagery all landed.',
].join('\n');

type Tool = Anthropic.Messages.Tool;

export const OFFER_SHAPE_TOOL: Tool = {
  name: 'offer_snapshot',
  description:
    'Emit a structured OfferSnapshot distilled from the raw extraction. Call exactly once.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Offer / product name.' },
      tagline: { type: 'string' },
      claims: {
        type: 'array',
        items: { type: 'string' },
        description: 'Short USP phrases — prefer 3-6 punchy claims.',
      },
      priceTiers: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            price: { type: 'string' },
            period: { type: 'string' },
          },
          required: ['label', 'price'],
        },
      },
      launchWindow: {
        type: 'object',
        properties: {
          startAt: { type: 'string' },
          endAt: { type: 'string' },
        },
      },
      proof: {
        type: 'array',
        items: { type: 'string' },
        description: 'Testimonials or stats, copied verbatim.',
      },
      heroImages: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            alt: { type: 'string' },
          },
          required: ['url'],
        },
      },
      confidence: {
        type: 'number',
        description: '0..1. Low when scrape was thin, high when name + claims + hero landed.',
      },
    },
    required: ['name', 'claims', 'heroImages', 'confidence'],
  } as unknown as Tool['input_schema'],
};

export interface ShapeOptions {
  bypassAgent?: boolean;
  client?: Anthropic;
}

export async function shapeOfferSnapshot(
  extract: OfferRawExtract,
  source: OfferSnapshotSource,
  opts: ShapeOptions = {}
): Promise<OfferSnapshot> {
  if (opts.bypassAgent) return localFallback(extract, source);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey && !opts.client) return localFallback(extract, source);

  const client = opts.client ?? new Anthropic({ apiKey: apiKey! });
  let msg: Awaited<ReturnType<Anthropic['messages']['create']>>;
  try {
    msg = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: [
        { type: 'text', text: SHAPE_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      ],
      tools: [OFFER_SHAPE_TOOL],
      tool_choice: { type: 'tool', name: 'offer_snapshot' },
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: buildExtractMessage(extract, source) }],
        },
      ],
    });
  } catch (err) {
    if (shouldFallbackFromAnthropic(err)) return localFallback(extract, source);
    throw err;
  }

  const toolBlock = msg.content.find(
    (b): b is Extract<typeof b, { type: 'tool_use' }> =>
      b.type === 'tool_use' && b.name === 'offer_snapshot'
  );
  if (!toolBlock) throw new Error('Claude did not emit an offer_snapshot tool call');
  return parseShapeToolInput(toolBlock.input, source);
}

function buildExtractMessage(extract: OfferRawExtract, source: OfferSnapshotSource): string {
  const lines: string[] = [
    `Shape this raw offer extraction into an OfferSnapshot.`,
    ``,
    `source: ${source.kind}${source.url ? ` · ${source.url}` : ''}`,
  ];
  if (extract.name) lines.push(``, `name: ${extract.name}`);
  if (extract.tagline) lines.push(`tagline: ${extract.tagline}`);
  if (extract.contextLines.length) {
    lines.push(``, `context:`);
    for (const l of extract.contextLines.slice(0, 8)) lines.push(`  - ${l}`);
  }
  if (extract.claims.length) {
    lines.push(``, `claim candidates (${extract.claims.length}):`);
    for (const c of extract.claims.slice(0, 16)) lines.push(`  - ${c}`);
  }
  if (extract.priceCandidates.length) {
    lines.push(``, `price candidates:`);
    for (const p of extract.priceCandidates.slice(0, 6)) {
      lines.push(`  - ${p.label}: ${p.price}${p.period ? ` / ${p.period}` : ''}`);
    }
  }
  if (extract.launchWindow) {
    const { startAt, endAt } = extract.launchWindow;
    lines.push(``, `launch window:`);
    if (startAt) lines.push(`  - startAt: ${startAt}`);
    if (endAt) lines.push(`  - endAt: ${endAt}`);
  }
  if (extract.proofCandidates.length) {
    lines.push(``, `proof candidates:`);
    for (const q of extract.proofCandidates.slice(0, 8)) lines.push(`  - ${q}`);
  }
  if (extract.heroImageCandidates.length) {
    lines.push(``, `hero image candidates:`);
    for (const img of extract.heroImageCandidates.slice(0, 8)) {
      lines.push(`  - ${img.url}${img.alt ? ` (alt: ${img.alt})` : ''}`);
    }
  }
  return lines.join('\n');
}

export function parseShapeToolInput(
  value: unknown,
  source: OfferSnapshotSource
): OfferSnapshot {
  if (typeof value !== 'object' || value === null) {
    throw new Error('offer_snapshot tool input was not an object');
  }
  const v = value as Record<string, unknown>;

  const name = typeof v.name === 'string' ? v.name.trim() : '';
  const tagline = typeof v.tagline === 'string' && v.tagline.trim() ? v.tagline.trim() : undefined;

  const claims = Array.isArray(v.claims)
    ? v.claims.filter((s): s is string => typeof s === 'string' && s.trim() !== '')
    : [];

  const priceTiers: OfferPriceTier[] = Array.isArray(v.priceTiers)
    ? (v.priceTiers as unknown[])
        .map((entry): OfferPriceTier | null => {
          if (typeof entry !== 'object' || entry === null) return null;
          const e = entry as Record<string, unknown>;
          const label = typeof e.label === 'string' ? e.label.trim() : '';
          const price = typeof e.price === 'string' ? e.price.trim() : '';
          if (!label || !price) return null;
          const period = typeof e.period === 'string' && e.period.trim() ? e.period.trim() : undefined;
          return period ? { label, price, period } : { label, price };
        })
        .filter((x): x is OfferPriceTier => x !== null)
    : [];

  let launchWindow: OfferLaunchWindow | undefined;
  if (v.launchWindow && typeof v.launchWindow === 'object') {
    const lw = v.launchWindow as Record<string, unknown>;
    const startAt = typeof lw.startAt === 'string' && lw.startAt.trim() ? lw.startAt.trim() : undefined;
    const endAt = typeof lw.endAt === 'string' && lw.endAt.trim() ? lw.endAt.trim() : undefined;
    if (startAt || endAt) {
      launchWindow = {
        ...(startAt ? { startAt } : {}),
        ...(endAt ? { endAt } : {}),
      };
    }
  }

  const proof = Array.isArray(v.proof)
    ? v.proof.filter((s): s is string => typeof s === 'string' && s.trim() !== '')
    : undefined;

  const heroImages: OfferHeroImage[] = Array.isArray(v.heroImages)
    ? (v.heroImages as unknown[])
        .map((entry): OfferHeroImage | null => {
          if (typeof entry !== 'object' || entry === null) return null;
          const e = entry as Record<string, unknown>;
          const url = typeof e.url === 'string' ? e.url.trim() : '';
          if (!url) return null;
          const alt = typeof e.alt === 'string' && e.alt.trim() ? e.alt.trim() : undefined;
          return alt ? { url, alt } : { url };
        })
        .filter((x): x is OfferHeroImage => x !== null)
    : [];

  const confidenceRaw = typeof v.confidence === 'number' ? v.confidence : 0;
  const confidence = Math.max(0, Math.min(1, confidenceRaw));

  return {
    name,
    ...(tagline ? { tagline } : {}),
    claims,
    ...(priceTiers.length > 0 ? { priceTiers } : {}),
    ...(launchWindow ? { launchWindow } : {}),
    ...(proof && proof.length > 0 ? { proof } : {}),
    heroImages,
    confidence,
    source,
  };
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
 * Deterministic local ranker for tests / offline runs. Picks the first
 * candidates from each stream without re-ordering.
 */
export function localFallback(
  extract: OfferRawExtract,
  source: OfferSnapshotSource
): OfferSnapshot {
  const name = extract.name?.trim() || 'Untitled offer';
  const tagline = extract.tagline?.trim();
  const claims = dedupeKeepOrder(extract.claims).slice(0, 6);
  const priceTiers = extract.priceCandidates.slice(0, 4);
  const proof = dedupeKeepOrder(extract.proofCandidates).slice(0, 4);
  const heroImages = extract.heroImageCandidates.slice(0, 6);

  const confidence = computeFallbackConfidence({ name, claims, heroImages });

  return {
    name,
    ...(tagline ? { tagline } : {}),
    claims,
    ...(priceTiers.length > 0 ? { priceTiers } : {}),
    ...(extract.launchWindow ? { launchWindow: extract.launchWindow } : {}),
    ...(proof.length > 0 ? { proof } : {}),
    heroImages,
    confidence,
    source,
  };
}

function dedupeKeepOrder<T>(arr: T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const v of arr) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

function computeFallbackConfidence(snap: {
  name: string;
  claims: string[];
  heroImages: OfferHeroImage[];
}): number {
  let score = 0;
  if (snap.name && snap.name !== 'Untitled offer') score += 0.3;
  if (snap.claims.length >= 3) score += 0.35;
  else if (snap.claims.length >= 1) score += 0.15;
  if (snap.heroImages.length >= 1) score += 0.2;
  return Math.min(1, Number(score.toFixed(2)));
}

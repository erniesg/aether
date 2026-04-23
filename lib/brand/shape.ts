import Anthropic from '@anthropic-ai/sdk';
import { CLAUDE_MODEL } from '@/lib/agent/generate';
import type {
  BrandLogo,
  BrandPaletteEntry,
  BrandProductImage,
  BrandRawExtract,
  BrandSnapshot,
  BrandSnapshotSource,
  BrandTypographyEntry,
  BrandVoice,
} from './types';
import { normalizeHex } from './extract';

/**
 * Turn a raw parser extract into a structured `BrandSnapshot`. Claude Opus
 * 4.7 does the ranking + role assignment via a single tool call; local
 * fallback kicks in when the API key / billing is unavailable.
 */

const SHAPE_SYSTEM_PROMPT = [
  'You are the brand-reader inside aether, a canvas-native creative system.',
  'Your job: take a raw scrape of a brand surface (website, repo, or files)',
  'and distil it into a structured BrandSnapshot a creator can use as input.',
  '',
  'Operating principles:',
  '  • You are not a chatbot. Call the brand_snapshot tool exactly once, then stop.',
  '  • Prefer fewer, more confident entries over exhaustive dumps. 3-6 palette',
  '    colours is healthy; more than that usually includes OS chrome / grey noise.',
  '  • Assign roles honestly. If you cannot tell which colour is primary, leave',
  '    the role empty — do not guess.',
  '  • Voice samples should be the two or three phrases that best capture how',
  '    the brand talks. Copy them verbatim; do not paraphrase.',
  '  • Confidence 0..1. Use 0.2-0.4 when the scrape is thin (few colours, no',
  '    voice samples); use 0.6+ when palette + typography + voice all landed.',
].join('\n');

type Tool = Anthropic.Messages.Tool;

export const BRAND_SHAPE_TOOL: Tool = {
  name: 'brand_snapshot',
  description:
    'Emit a structured BrandSnapshot distilled from the raw extraction. Call exactly once.',
  input_schema: {
    type: 'object',
    properties: {
      palette: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            hex: { type: 'string', description: '#rrggbb colour literal.' },
            role: {
              type: 'string',
              enum: ['primary', 'accent', 'neutral', 'bg'],
              description: 'Optional role. Omit rather than guess.',
            },
          },
          required: ['hex'],
        },
      },
      typography: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            family: { type: 'string' },
            role: {
              type: 'string',
              enum: ['display', 'body', 'mono'],
            },
          },
          required: ['family'],
        },
      },
      voice: {
        type: 'object',
        properties: {
          samples: { type: 'array', items: { type: 'string' } },
          tone: { type: 'array', items: { type: 'string' } },
        },
        required: ['samples'],
      },
      logos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            background: { type: 'string', enum: ['light', 'dark', 'either'] },
          },
          required: ['url'],
        },
      },
      productImages: {
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
        description: '0..1. Low when the scrape was thin, high when palette + type + voice landed.',
      },
    },
    required: ['palette', 'typography', 'voice', 'confidence'],
  } as unknown as Tool['input_schema'],
};

export interface ShapeOptions {
  bypassAgent?: boolean;
  client?: Anthropic;
}

export async function shapeBrandSnapshot(
  extract: BrandRawExtract,
  source: BrandSnapshotSource,
  opts: ShapeOptions = {}
): Promise<BrandSnapshot> {
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
      tools: [BRAND_SHAPE_TOOL],
      tool_choice: { type: 'tool', name: 'brand_snapshot' },
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
      b.type === 'tool_use' && b.name === 'brand_snapshot'
  );
  if (!toolBlock) throw new Error('Claude did not emit a brand_snapshot tool call');
  return parseShapeToolInput(toolBlock.input, source);
}

function buildExtractMessage(extract: BrandRawExtract, source: BrandSnapshotSource): string {
  const lines: string[] = [
    `Shape this raw brand extraction into a BrandSnapshot.`,
    ``,
    `source: ${source.kind}${source.url ? ` · ${source.url}` : ''}`,
  ];
  if (extract.contextLines.length) {
    lines.push(``, `context:`);
    for (const l of extract.contextLines.slice(0, 8)) lines.push(`  - ${l}`);
  }
  if (extract.hexes.length) {
    lines.push(``, `palette candidates (${extract.hexes.length}):`);
    for (const h of extract.hexes.slice(0, 40)) lines.push(`  - ${h}`);
  }
  if (extract.families.length) {
    lines.push(``, `type candidates:`);
    for (const f of extract.families.slice(0, 16)) lines.push(`  - ${f}`);
  }
  if (extract.voiceSamples.length) {
    lines.push(``, `voice samples:`);
    for (const s of extract.voiceSamples.slice(0, 10)) lines.push(`  - ${s}`);
  }
  if (extract.logoCandidates.length) {
    lines.push(``, `logo candidates:`);
    for (const l of extract.logoCandidates.slice(0, 6)) lines.push(`  - ${l}`);
  }
  if (extract.productImageCandidates.length) {
    lines.push(``, `product image candidates:`);
    for (const p of extract.productImageCandidates.slice(0, 8)) {
      lines.push(`  - ${p.url}${p.alt ? ` (alt: ${p.alt})` : ''}`);
    }
  }
  return lines.join('\n');
}

export function parseShapeToolInput(
  value: unknown,
  source: BrandSnapshotSource
): BrandSnapshot {
  if (typeof value !== 'object' || value === null) {
    throw new Error('brand_snapshot tool input was not an object');
  }
  const v = value as Record<string, unknown>;

  const palette = Array.isArray(v.palette)
    ? (v.palette as unknown[])
        .map((entry): BrandPaletteEntry | null => {
          if (typeof entry !== 'object' || entry === null) return null;
          const e = entry as Record<string, unknown>;
          const hex = typeof e.hex === 'string' ? normalizeHex(e.hex) : null;
          if (!hex) return null;
          const role =
            typeof e.role === 'string' &&
            (e.role === 'primary' || e.role === 'accent' || e.role === 'neutral' || e.role === 'bg')
              ? e.role
              : undefined;
          return role ? { hex, role } : { hex };
        })
        .filter((x): x is BrandPaletteEntry => x !== null)
    : [];

  const typography: BrandTypographyEntry[] = Array.isArray(v.typography)
    ? (v.typography as unknown[])
        .map((entry): BrandTypographyEntry | null => {
          if (typeof entry !== 'object' || entry === null) return null;
          const e = entry as Record<string, unknown>;
          const family = typeof e.family === 'string' ? e.family.trim() : '';
          if (!family) return null;
          const role =
            typeof e.role === 'string' &&
            (e.role === 'display' || e.role === 'body' || e.role === 'mono')
              ? e.role
              : undefined;
          return role ? { family, role } : { family };
        })
        .filter((x): x is BrandTypographyEntry => x !== null)
    : [];

  const voice: BrandVoice = (() => {
    const vv = v.voice;
    if (typeof vv !== 'object' || vv === null) return { samples: [] };
    const vr = vv as Record<string, unknown>;
    const samples = Array.isArray(vr.samples)
      ? vr.samples.filter((s): s is string => typeof s === 'string' && s.trim() !== '')
      : [];
    const tone = Array.isArray(vr.tone)
      ? vr.tone.filter((s): s is string => typeof s === 'string' && s.trim() !== '')
      : undefined;
    return tone && tone.length > 0 ? { samples, tone } : { samples };
  })();

  const logos: BrandLogo[] = Array.isArray(v.logos)
    ? (v.logos as unknown[])
        .map((entry): BrandLogo | null => {
          if (typeof entry !== 'object' || entry === null) return null;
          const e = entry as Record<string, unknown>;
          const url = typeof e.url === 'string' ? e.url : '';
          if (!url) return null;
          const background =
            typeof e.background === 'string' &&
            (e.background === 'light' || e.background === 'dark' || e.background === 'either')
              ? e.background
              : undefined;
          return background ? { url, background } : { url };
        })
        .filter((x): x is BrandLogo => x !== null)
    : [];

  const productImages: BrandProductImage[] = Array.isArray(v.productImages)
    ? (v.productImages as unknown[])
        .map((entry): BrandProductImage | null => {
          if (typeof entry !== 'object' || entry === null) return null;
          const e = entry as Record<string, unknown>;
          const url = typeof e.url === 'string' ? e.url : '';
          if (!url) return null;
          const alt = typeof e.alt === 'string' ? e.alt : undefined;
          return alt ? { url, alt } : { url };
        })
        .filter((x): x is BrandProductImage => x !== null)
    : [];

  const confidenceRaw = typeof v.confidence === 'number' ? v.confidence : 0;
  const confidence = Math.max(0, Math.min(1, confidenceRaw));

  return { palette, typography, voice, logos, productImages, confidence, source };
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
 * Deterministic local ranker for tests / offline runs. Ranks colours by
 * frequency of appearance in the raw extract — hexes that showed up first
 * (CSS custom properties, theme-color meta) rank above later-scanned noise.
 */
export function localFallback(
  extract: BrandRawExtract,
  source: BrandSnapshotSource
): BrandSnapshot {
  const palette: BrandPaletteEntry[] = dedupeKeepOrder(extract.hexes)
    .slice(0, 6)
    .map((hex, i) => {
      const role =
        i === 0 ? 'primary' : i === 1 ? 'accent' : i === 2 ? 'neutral' : i === 3 ? 'bg' : undefined;
      return role ? { hex, role } : { hex };
    });

  const typography: BrandTypographyEntry[] = dedupeKeepOrder(extract.families)
    .slice(0, 3)
    .map((family, i) => {
      const role = i === 0 ? 'display' : i === 1 ? 'body' : 'mono';
      return { family, role };
    });

  const voice: BrandVoice = {
    samples: dedupeKeepOrder(extract.voiceSamples).slice(0, 3),
  };

  const logos: BrandLogo[] = dedupeKeepOrder(extract.logoCandidates)
    .slice(0, 3)
    .map((url) => ({ url }));

  const productImages: BrandProductImage[] = extract.productImageCandidates.slice(0, 6);

  const confidence = computeFallbackConfidence({ palette, typography, voice });

  return { palette, typography, voice, logos, productImages, confidence, source };
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
  palette: BrandPaletteEntry[];
  typography: BrandTypographyEntry[];
  voice: BrandVoice;
}): number {
  let score = 0;
  if (snap.palette.length >= 3) score += 0.35;
  else if (snap.palette.length >= 1) score += 0.15;
  if (snap.typography.length >= 2) score += 0.3;
  else if (snap.typography.length >= 1) score += 0.15;
  if (snap.voice.samples.length >= 2) score += 0.25;
  else if (snap.voice.samples.length >= 1) score += 0.1;
  return Math.min(1, Number(score.toFixed(2)));
}

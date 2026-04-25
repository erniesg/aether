/**
 * Sketch → SemanticCreativeComponent (issue #107).
 *
 * Reads a rough tldraw sketch + brand context + references + format targets
 * and asks Claude Opus 4.7 to emit the typed creative primitive that drives
 * every downstream renderer (#105 prompt, #106 crop, #90 text-apply, #108
 * propagation). Forced tool-use guarantees a structured output the type
 * system can trust.
 *
 * The vision call uses prompt caching on the system prompt so subsequent
 * sketch invocations in the same session pay the discounted cache-hit rate.
 *
 * Falls back to a centered-hero default component when Anthropic is
 * unreachable (no API key, billing, transient 5xx) so the rest of the
 * pipeline (#105 + #106) can still demo from a hand-authored seed.
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  FormatTarget,
  SafeZone,
  SemanticCreativeComponent,
} from '@/lib/types/semantic-component';

export const CLAUDE_MODEL = 'claude-opus-4-7';

const SYSTEM_PROMPT = [
  'You are the planning brain inside aether — a canvas-native creative system whose pitch is "creative is responsive by default."',
  'Your job: read a rough sketch + brand context + format targets and emit a SemanticCreativeComponent — a single typed creative primitive that drives one hero render plus N free format crops plus editable text overlays.',
  '',
  'Mental model:',
  '- ONE hero render at the largest needed size; safe zones reserved in the prompt let us crop to every format without re-generation.',
  '- Text is NEVER baked into the image; copy lives in editable overlay layers downstream.',
  '- Coordinates everywhere are normalized [0,1] in the source hero frame (origin top-left). They survive crop math.',
  '- The primary subject anchor must be small enough to fit inside the narrowest target aspect ratio.',
  '',
  'Operating principles:',
  '- Read what the sketch is actually showing. Don\'t invent a different scene.',
  '- Reflect the brand voice + palette + mood when you describe the hero.',
  '- Reserve safe zones (negative space) where text overlays will sit. Default: an upper strip for headline, a lower strip for CTA, both 15-25% of frame height.',
  '- The primary cropPriorities region must be ≤ the narrowest format aspect (so it survives every crop).',
  '- Be terse. The component is a contract, not a presentation.',
].join('\n');

interface ProposeComponentToolInput {
  hero: { description: string };
  product?: { description?: string };
  offer?: { weight: 'aggressive' | 'soft' };
  mood: { keywords: string[] };
  safeZones: Array<{
    purpose: 'headline' | 'subhead' | 'body' | 'caption' | 'cta' | 'logo' | 'product' | 'hero';
    bbox: { x: number; y: number; w: number; h: number };
    mustSurviveAllCrops?: boolean;
  }>;
  cropPriorities: {
    primary: { x: number; y: number; w: number; h: number };
    secondary?: { x: number; y: number; w: number; h: number };
  };
}

const TOOL_PROPOSE_COMPONENT: Anthropic.Messages.Tool = {
  name: 'propose_creative_component',
  description:
    'Emit a SemanticCreativeComponent for this sketch + brief. Coordinates are normalized [0,1] in the source hero frame.',
  input_schema: {
    type: 'object',
    properties: {
      hero: {
        type: 'object',
        properties: {
          description: { type: 'string', description: 'Visual subject of the hero render. Specific, paintable, under 220 chars.' },
        },
        required: ['description'],
      },
      product: {
        type: 'object',
        properties: { description: { type: 'string' } },
      },
      offer: {
        type: 'object',
        properties: {
          weight: { type: 'string', enum: ['aggressive', 'soft'], description: 'Tonal urgency of the offer.' },
        },
        required: ['weight'],
      },
      mood: {
        type: 'object',
        properties: {
          keywords: { type: 'array', items: { type: 'string' }, description: 'Mood adjectives. 3-6 items.' },
        },
        required: ['keywords'],
      },
      safeZones: {
        type: 'array',
        description: 'Regions to reserve as flat negative space; text overlays land here downstream.',
        items: {
          type: 'object',
          properties: {
            purpose: {
              type: 'string',
              enum: ['headline', 'subhead', 'body', 'caption', 'cta', 'logo', 'product', 'hero'],
            },
            bbox: bboxSchema(),
            mustSurviveAllCrops: { type: 'boolean' },
          },
          required: ['purpose', 'bbox'],
        },
      },
      cropPriorities: {
        type: 'object',
        description: 'Anchor regions that must survive every aspect-ratio crop.',
        properties: {
          primary: bboxSchema(),
          secondary: bboxSchema(),
        },
        required: ['primary'],
      },
    },
    required: ['hero', 'mood', 'safeZones', 'cropPriorities'],
  } as unknown as Anthropic.Messages.Tool['input_schema'],
};

function bboxSchema() {
  return {
    type: 'object',
    description: 'Normalized bbox; x+w ≤ 1 and y+h ≤ 1.',
    properties: {
      x: { type: 'number', minimum: 0, maximum: 1 },
      y: { type: 'number', minimum: 0, maximum: 1 },
      w: { type: 'number', minimum: 0, maximum: 1 },
      h: { type: 'number', minimum: 0, maximum: 1 },
    },
    required: ['x', 'y', 'w', 'h'],
  };
}

export interface BrandContextLite {
  name?: string;
  palette?: ReadonlyArray<string>;
  type?: ReadonlyArray<string>;
  voice?: string;
  moodKeywords?: ReadonlyArray<string>;
}

export interface ReferenceLite {
  url?: string;
  caption?: string;
}

export interface SketchToComponentInput {
  /** Image of the sketch — data URL (data:image/png;base64,...) or absolute https URL. */
  sketchImageUrl: string;
  brand?: BrandContextLite;
  references?: ReadonlyArray<ReferenceLite>;
  formats: ReadonlyArray<FormatTarget>;
  /** Optional creator-supplied intent ("tonight only, slow editorial drop"). */
  creatorIntent?: string;
}

export type PlannerMode = 'anthropic' | 'fallback';

export interface SketchToComponentOutput {
  component: SemanticCreativeComponent;
  plannerMode: PlannerMode;
  plannerModel?: string;
  /** Reason the fallback fired, if it did. */
  plannerError?: string;
}

export interface SketchToComponentDeps {
  /** Inject for tests. */
  anthropic?: Anthropic;
  apiKey?: string;
}

export async function sketchToComponent(
  input: SketchToComponentInput,
  deps: SketchToComponentDeps = {}
): Promise<SketchToComponentOutput> {
  if (!input.sketchImageUrl) {
    throw new Error('sketchToComponent: sketchImageUrl is required');
  }
  if (input.formats.length === 0) {
    throw new Error('sketchToComponent: at least one format target is required');
  }

  const client = deps.anthropic ?? createClient(deps.apiKey);
  if (!client) {
    return {
      component: defaultComponent(input),
      plannerMode: 'fallback',
      plannerError: 'ANTHROPIC_API_KEY not set',
    };
  }

  const sketchSource = parseImageSource(input.sketchImageUrl);

  const userParts: Anthropic.Messages.ContentBlockParam[] = [
    sketchSource.type === 'base64'
      ? {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: sketchSource.mediaType,
            data: sketchSource.data,
          },
        }
      : {
          type: 'image' as const,
          source: { type: 'url' as const, url: sketchSource.url },
        },
    {
      type: 'text' as const,
      text: buildBriefText(input),
    },
  ];

  let msg: Awaited<ReturnType<Anthropic['messages']['create']>>;
  try {
    msg = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      system: [
        { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      ],
      tools: [TOOL_PROPOSE_COMPONENT],
      tool_choice: { type: 'tool', name: 'propose_creative_component' },
      messages: [{ role: 'user', content: userParts }],
    });
  } catch (err) {
    if (shouldFallback(err)) {
      return {
        component: defaultComponent(input),
        plannerMode: 'fallback',
        plannerError: err instanceof Error ? err.message : String(err),
      };
    }
    throw err;
  }

  const toolBlock = msg.content.find(
    (b): b is Extract<typeof b, { type: 'tool_use' }> =>
      b.type === 'tool_use' && b.name === 'propose_creative_component'
  );
  if (!toolBlock) {
    throw new Error('Claude did not emit a propose_creative_component tool call');
  }

  const component = parseToolInput(toolBlock.input, input.formats);
  return {
    component,
    plannerMode: 'anthropic',
    plannerModel: CLAUDE_MODEL,
  };
}

function createClient(apiKey?: string): Anthropic | null {
  const key = apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}

function shouldFallback(err: unknown): boolean {
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

function buildBriefText(input: SketchToComponentInput): string {
  const lines: string[] = [];
  lines.push('Sketch attached above. Read what it shows.');
  if (input.creatorIntent?.trim()) {
    lines.push(`Creator intent: ${input.creatorIntent.trim()}`);
  }
  if (input.brand) {
    const brandBits: string[] = [];
    if (input.brand.name) brandBits.push(`name ${input.brand.name}`);
    if (input.brand.palette && input.brand.palette.length > 0) {
      brandBits.push(`palette ${input.brand.palette.join(', ')}`);
    }
    if (input.brand.type && input.brand.type.length > 0) {
      brandBits.push(`type ${input.brand.type.join(', ')}`);
    }
    if (input.brand.voice) brandBits.push(`voice ${input.brand.voice}`);
    if (input.brand.moodKeywords && input.brand.moodKeywords.length > 0) {
      brandBits.push(`mood ${input.brand.moodKeywords.join(', ')}`);
    }
    if (brandBits.length > 0) lines.push(`Brand: ${brandBits.join('; ')}.`);
  }
  if (input.references && input.references.length > 0) {
    const refs = input.references
      .slice(0, 6)
      .map((r) => r.caption || r.url || 'unnamed ref')
      .join('; ');
    lines.push(`References: ${refs}.`);
  }
  const aspects = uniqueAspects(input.formats);
  lines.push(
    `Target formats (${input.formats.length}): ${input.formats
      .map((f) => `${f.label ?? f.id} ${f.w}×${f.h}`)
      .join(', ')}.`
  );
  if (aspects.length > 1) {
    lines.push(
      `Aspect ratios in play: ${aspects.join(', ')}. The primary anchor must fit the narrowest of these.`
    );
  }
  lines.push(
    'Emit one propose_creative_component tool call. Do not add any other commentary.'
  );
  return lines.join('\n');
}

function uniqueAspects(formats: ReadonlyArray<FormatTarget>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const f of formats) {
    if (f.w <= 0 || f.h <= 0) continue;
    const ratio = simplifyRatio(f.w, f.h);
    if (seen.has(ratio)) continue;
    seen.add(ratio);
    out.push(ratio);
  }
  return out;
}

function simplifyRatio(w: number, h: number): string {
  const a = Math.round(w);
  const b = Math.round(h);
  const g = gcd(Math.max(a, 1), Math.max(b, 1));
  return `${a / g}:${b / g}`;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x === 0 ? 1 : x;
}

function parseImageSource(
  url: string
): { type: 'base64'; mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'; data: string } | { type: 'url'; url: string } {
  if (url.startsWith('data:')) {
    const match = /^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/i.exec(url);
    if (!match) {
      throw new Error('sketchImageUrl is a data URL but not a recognized image type (png/jpeg/gif/webp)');
    }
    return {
      type: 'base64',
      mediaType: match[1].toLowerCase() as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
      data: match[2],
    };
  }
  return { type: 'url', url };
}

function parseToolInput(
  raw: unknown,
  formats: ReadonlyArray<FormatTarget>
): SemanticCreativeComponent {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('propose_creative_component input was not an object');
  }
  const v = raw as Record<string, unknown>;

  const heroDesc = (v.hero as Record<string, unknown> | undefined)?.description;
  if (typeof heroDesc !== 'string' || !heroDesc.trim()) {
    throw new Error('propose_creative_component: hero.description required');
  }

  const moodObj = v.mood as Record<string, unknown> | undefined;
  const moodKeywords = Array.isArray(moodObj?.keywords)
    ? (moodObj.keywords as unknown[]).filter(
        (k): k is string => typeof k === 'string' && k.trim().length > 0
      )
    : [];

  const cropObj = v.cropPriorities as Record<string, unknown> | undefined;
  const primary = parseBBox(cropObj?.primary, 'cropPriorities.primary');
  const secondary = cropObj?.secondary
    ? parseBBox(cropObj.secondary, 'cropPriorities.secondary')
    : undefined;

  const rawZones = Array.isArray(v.safeZones) ? (v.safeZones as unknown[]) : [];
  const safeZones: SafeZone[] = rawZones.map((z, i) => parseSafeZone(z, i));

  const product = (v.product as Record<string, unknown> | undefined)?.description;
  const offerWeight = (v.offer as Record<string, unknown> | undefined)?.weight;

  return {
    hero: { description: heroDesc.trim() },
    product: typeof product === 'string' && product.trim() ? { description: product.trim() } : undefined,
    offer:
      offerWeight === 'aggressive' || offerWeight === 'soft'
        ? { weight: offerWeight }
        : undefined,
    mood: { keywords: moodKeywords },
    safeZones,
    cropPriorities: secondary ? { primary, secondary } : { primary },
    formats: [...formats],
  };
}

function parseBBox(raw: unknown, label: string): { x: number; y: number; w: number; h: number } {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`propose_creative_component: ${label} must be an object`);
  }
  const v = raw as Record<string, unknown>;
  const x = num(v.x, `${label}.x`);
  const y = num(v.y, `${label}.y`);
  const w = num(v.w, `${label}.w`);
  const h = num(v.h, `${label}.h`);
  return { x: clamp01(x), y: clamp01(y), w: clamp01(w), h: clamp01(h) };
}

function num(raw: unknown, label: string): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    throw new Error(`propose_creative_component: ${label} must be a finite number`);
  }
  return raw;
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

const ZONE_PURPOSES: ReadonlySet<SafeZone['purpose']> = new Set([
  'headline',
  'subhead',
  'body',
  'caption',
  'cta',
  'logo',
  'product',
  'hero',
]);

function parseSafeZone(raw: unknown, index: number): SafeZone {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`propose_creative_component: safeZones[${index}] must be an object`);
  }
  const v = raw as Record<string, unknown>;
  const purpose = v.purpose;
  if (typeof purpose !== 'string' || !ZONE_PURPOSES.has(purpose as SafeZone['purpose'])) {
    throw new Error(
      `propose_creative_component: safeZones[${index}].purpose must be one of ${[...ZONE_PURPOSES].join('|')}`
    );
  }
  const bbox = parseBBox(v.bbox, `safeZones[${index}].bbox`);
  const mustSurvive = v.mustSurviveAllCrops;
  return {
    purpose: purpose as SafeZone['purpose'],
    bbox,
    mustSurviveAllCrops:
      typeof mustSurvive === 'boolean' ? mustSurvive : undefined,
  };
}

/**
 * Best-effort default when Anthropic is unreachable: a centered hero anchor,
 * top-of-frame headline strip, and bottom-of-frame CTA strip. Lets the rest
 * of the demo loop (#105 prompt + #106 crop) still produce a sane render.
 */
function defaultComponent(input: SketchToComponentInput): SemanticCreativeComponent {
  const heroDesc = input.creatorIntent?.trim() || 'a single hero subject, editorial lighting, soft bounce, neutral backdrop';
  const moodKeywords = [
    ...(input.brand?.moodKeywords ?? []),
    'editorial',
    'soft',
  ].slice(0, 5);
  return {
    hero: { description: heroDesc },
    mood: { keywords: moodKeywords },
    safeZones: [
      { purpose: 'headline', bbox: { x: 0, y: 0, w: 1, h: 0.2 }, mustSurviveAllCrops: false },
      { purpose: 'cta', bbox: { x: 0, y: 0.85, w: 1, h: 0.15 }, mustSurviveAllCrops: false },
      { purpose: 'hero', bbox: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 } },
    ],
    cropPriorities: {
      primary: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
    },
    formats: [...input.formats],
  };
}

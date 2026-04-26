/**
 * Multilingual text-apply (issue #90, rescoped).
 *
 * Reads the typed creative primitive (SemanticCreativeComponent) + brand
 * context + locale list and asks Claude Opus 4.7 to emit one copy block per
 * text-bearing safeZone, in the source locale plus each requested target
 * locale. Forced tool-use to `propose_multilingual_copy` keeps the output
 * shape contract-stable.
 *
 * The hero render stays text-free — copy lives in editable overlay layers.
 * Multilingual is achieved through Claude translation, not image regeneration.
 *
 * Falls back to brand-aware placeholder copy (source locale only, target
 * locales mirror source) when Anthropic is unreachable, so the rest of the
 * canvas pipeline stays demoable.
 *
 * The agent stays pure — it returns proposed overlays plus provenance. The
 * canvas / Convex hydration layer (executeTextApply in lib/text-overlay)
 * persists them as full `TextOverlayLayer` records.
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  SafeZone,
  SafeZonePurpose,
  SemanticCreativeComponent,
} from '@/lib/types/semantic-component';
import type { BCP47LocaleCode, ForbiddenRegion } from '@/lib/text-overlay/types';

export const CLAUDE_MODEL = 'claude-opus-4-7';

/**
 * SafeZone purposes that carry copy. Visual zones (`logo`, `product`, `hero`)
 * are excluded — the image generator already handles those, no overlay needed.
 */
export const TEXT_BEARING_PURPOSES: ReadonlySet<SafeZonePurpose> = new Set([
  'headline',
  'subhead',
  'body',
  'caption',
  'cta',
]);

export type ProposedTextAlign = 'start' | 'center' | 'end';

/**
 * Agent-side proposal for a single text overlay. The canvas hydration layer
 * (T4 / executeTextApply) turns this into a full `TextOverlayLayer` by
 * minting an id and merging style + placement defaults.
 */
export interface ProposedTextOverlay {
  zone: SafeZone;
  /** Locale-keyed copy. Source locale always present; target locales present
   *  on success, mirror source on fallback. */
  content: Record<BCP47LocaleCode, string>;
  textAlign: ProposedTextAlign;
}

const SYSTEM_PROMPT = [
  'You are the copywriting brain inside aether — a canvas-native creative system whose pitch is "creative is responsive by default."',
  'You receive a typed creative primitive (SemanticCreativeComponent) plus a brand brief and a locale list.',
  'Your job: emit one copy block per text-bearing safeZone (headline, subhead, body, caption, cta), in the source locale plus every requested target locale.',
  '',
  'Mental model:',
  '- The hero render carries the visual; copy lives in editable overlay layers.',
  '- One copy block per text-bearing safeZone, in the same order the safeZones arrive.',
  '- For each block, emit a content array — one entry per locale, source locale first, then target locales in input order.',
  '- Translations are idiomatic, not literal. Match register and cultural rhythm of each locale; preserve brand voice.',
  '',
  'Operating principles:',
  '- Brand voice and mood drive tone in EVERY locale.',
  '- Headline: short, hooky, ≤ 6 words.',
  '- Subhead: ≤ 12 words.',
  '- Body: ≤ 25 words.',
  '- Caption: ≤ 15 words.',
  '- CTA: imperative; offer.weight=aggressive → urgent ("Shop now"), soft → invitational ("Discover").',
  '- textAlign defaults to center; left-aligned ("start") for body-heavy zones, right-aligned ("end") only when geometry warrants.',
  '- Be terse. Copy is the contract, not the rationale.',
].join('\n');

interface PurposeBudget {
  maxWords: number;
  defaultAlign: ProposedTextAlign;
}

const PURPOSE_BUDGETS: Record<Extract<SafeZonePurpose, 'headline' | 'subhead' | 'body' | 'caption' | 'cta'>, PurposeBudget> = {
  headline: { maxWords: 6, defaultAlign: 'center' },
  subhead: { maxWords: 12, defaultAlign: 'center' },
  body: { maxWords: 25, defaultAlign: 'start' },
  caption: { maxWords: 15, defaultAlign: 'center' },
  cta: { maxWords: 3, defaultAlign: 'center' },
};

const TOOL_PROPOSE_MULTILINGUAL_COPY: Anthropic.Messages.Tool = {
  name: 'propose_multilingual_copy',
  description:
    'Emit one copy block per text-bearing safeZone, in the source locale plus each requested target locale.',
  input_schema: {
    type: 'object',
    properties: {
      overlays: {
        type: 'array',
        description:
          'One entry per text-bearing safeZone, in input order. Skip zones whose purpose is logo/product/hero.',
        items: {
          type: 'object',
          properties: {
            purpose: {
              type: 'string',
              enum: ['headline', 'subhead', 'body', 'caption', 'cta'],
            },
            content: {
              type: 'array',
              description:
                'Copy for each requested locale. Source locale first, then target locales in input order. One entry per locale.',
              items: {
                type: 'object',
                properties: {
                  locale: {
                    type: 'string',
                    description: 'BCP-47 locale tag, e.g. en-US, zh-SG, fr-FR.',
                  },
                  text: { type: 'string' },
                },
                required: ['locale', 'text'],
              },
            },
            textAlign: { type: 'string', enum: ['start', 'center', 'end'] },
          },
          required: ['purpose', 'content', 'textAlign'],
        },
      },
      rationale: {
        type: 'string',
        description: 'One short sentence on the tone/voice choices that drove the copy.',
      },
    },
    required: ['overlays'],
  } as unknown as Anthropic.Messages.Tool['input_schema'],
};

export interface BrandContextLite {
  name?: string;
  palette?: ReadonlyArray<string>;
  type?: ReadonlyArray<string>;
  voice?: string;
  moodKeywords?: ReadonlyArray<string>;
}

export interface ApplyTextOverlayInput {
  component: SemanticCreativeComponent;
  /** Locale the planner writes the source copy in. Required. */
  sourceLocale: BCP47LocaleCode;
  /** Additional locales to translate into. May be empty. Source locale is
   *  filtered out automatically if it appears here. */
  targetLocales?: ReadonlyArray<BCP47LocaleCode>;
  brand?: BrandContextLite;
  /** Optional creator-supplied intent ("tonight only, slow editorial drop"). */
  creatorIntent?: string;
  /**
   * Regions the planner must avoid placing copy over — faces, products, logos.
   * Produced by `segmentationToForbiddenRegions` from a SAM3 response.
   * Defaults to `[]` if omitted, preserving backward compatibility.
   */
  forbiddenRegions?: ReadonlyArray<ForbiddenRegion>;
  /** Provenance — surfaces in the output for downstream wiring. */
  wsId?: string;
  artboardId?: string;
  capabilityRunId?: string;
}

export type TextApplyPlannerMode = 'anthropic' | 'fallback' | 'noop';

export interface ApplyTextOverlayOutput {
  layers: ProposedTextOverlay[];
  plannerMode: TextApplyPlannerMode;
  plannerModel?: string;
  plannerError?: string;
  rationale?: string;
  /**
   * Non-fatal advisory strings. Currently emits `'no-safe-zone-found'` when
   * every text-bearing zone overlaps a forbidden region so the planner falls
   * back to brand-aware placeholders.
   */
  warnings?: string[];
  provenance: {
    sourceLocale: BCP47LocaleCode;
    targetLocales: ReadonlyArray<BCP47LocaleCode>;
    wsId?: string;
    artboardId?: string;
    capabilityRunId?: string;
  };
}

export interface ApplyTextOverlayDeps {
  /** Inject for tests. */
  anthropic?: Anthropic;
  apiKey?: string;
}

export async function applyTextOverlay(
  input: ApplyTextOverlayInput,
  deps: ApplyTextOverlayDeps = {}
): Promise<ApplyTextOverlayOutput> {
  if (!input.sourceLocale) {
    throw new Error('applyTextOverlay: sourceLocale is required');
  }
  if (!input.component) {
    throw new Error('applyTextOverlay: component is required');
  }

  const targetLocales = dedupeTargetLocales(
    input.sourceLocale,
    input.targetLocales ?? []
  );
  const localeOrder: BCP47LocaleCode[] = [input.sourceLocale, ...targetLocales];

  const textZones = input.component.safeZones.filter((z) =>
    TEXT_BEARING_PURPOSES.has(z.purpose)
  );

  const forbiddenRegions: ReadonlyArray<ForbiddenRegion> =
    input.forbiddenRegions ?? [];

  const provenance: ApplyTextOverlayOutput['provenance'] = {
    sourceLocale: input.sourceLocale,
    targetLocales,
    wsId: input.wsId,
    artboardId: input.artboardId,
    capabilityRunId: input.capabilityRunId,
  };

  // No text-bearing safeZones → nothing to copywrite. Skip Anthropic entirely.
  if (textZones.length === 0) {
    return {
      layers: [],
      plannerMode: 'noop',
      provenance,
    };
  }

  // Segment-aware guard: if every text zone is fully covered by a forbidden
  // region, calling the planner would produce unusable placements. Fall back
  // immediately with a warning so the creator gets placeholder copy rather
  // than blank artboards.
  if (
    forbiddenRegions.length > 0 &&
    textZones.every((zone) => zoneOverlapsForbidden(zone, forbiddenRegions))
  ) {
    return {
      layers: fallbackLayers(textZones, localeOrder, input),
      plannerMode: 'fallback',
      plannerError: 'All text zones overlap forbidden regions',
      warnings: ['no-safe-zone-found'],
      provenance,
    };
  }

  const client = deps.anthropic ?? createClient(deps.apiKey);
  if (!client) {
    return {
      layers: fallbackLayers(textZones, localeOrder, input),
      plannerMode: 'fallback',
      plannerError: 'ANTHROPIC_API_KEY not set',
      provenance,
    };
  }

  let msg: Awaited<ReturnType<Anthropic['messages']['create']>>;
  try {
    msg = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      system: [
        { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      ],
      tools: [TOOL_PROPOSE_MULTILINGUAL_COPY],
      tool_choice: { type: 'tool', name: 'propose_multilingual_copy' },
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: buildBriefText(input, textZones, localeOrder, forbiddenRegions) }],
        },
      ],
    });
  } catch (err) {
    if (shouldFallback(err)) {
      return {
        layers: fallbackLayers(textZones, localeOrder, input),
        plannerMode: 'fallback',
        plannerError: err instanceof Error ? err.message : String(err),
        provenance,
      };
    }
    throw err;
  }

  const toolBlock = msg.content.find(
    (b): b is Extract<typeof b, { type: 'tool_use' }> =>
      b.type === 'tool_use' && b.name === 'propose_multilingual_copy'
  );
  if (!toolBlock) {
    throw new Error('Claude did not emit a propose_multilingual_copy tool call');
  }

  const { layers, rationale } = parseToolInput(
    toolBlock.input,
    textZones,
    localeOrder
  );

  return {
    layers,
    plannerMode: 'anthropic',
    plannerModel: CLAUDE_MODEL,
    rationale,
    provenance,
  };
}

function dedupeTargetLocales(
  source: BCP47LocaleCode,
  targets: ReadonlyArray<BCP47LocaleCode>
): BCP47LocaleCode[] {
  const seen = new Set<string>([source]);
  const out: BCP47LocaleCode[] = [];
  for (const t of targets) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
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

/**
 * Returns true when the zone's bbox overlaps with any forbidden region bbox.
 * Uses axis-aligned rectangle intersection (no partial-overlap threshold —
 * any overlap disqualifies the zone).
 */
function zoneOverlapsForbidden(
  zone: SafeZone,
  forbiddenRegions: ReadonlyArray<ForbiddenRegion>
): boolean {
  const z = zone.bbox;
  for (const region of forbiddenRegions) {
    const r = region.bbox;
    // AABB overlap: two rectangles overlap unless one is to the right/below/left/above the other
    const noOverlap =
      z.x + z.w <= r.x ||
      r.x + r.w <= z.x ||
      z.y + z.h <= r.y ||
      r.y + r.h <= z.y;
    if (!noOverlap) return true;
  }
  return false;
}

function buildBriefText(
  input: ApplyTextOverlayInput,
  textZones: ReadonlyArray<SafeZone>,
  localeOrder: ReadonlyArray<BCP47LocaleCode>,
  forbiddenRegions: ReadonlyArray<ForbiddenRegion> = []
): string {
  const lines: string[] = [];
  lines.push(`Source locale: ${input.sourceLocale}.`);
  if (localeOrder.length > 1) {
    lines.push(`Target locales (in order): ${localeOrder.slice(1).join(', ')}.`);
  } else {
    lines.push('Target locales: none — emit only the source locale.');
  }

  if (input.creatorIntent?.trim()) {
    lines.push(`Creator intent: ${input.creatorIntent.trim()}`);
  }

  if (input.brand) {
    const bits: string[] = [];
    if (input.brand.name) bits.push(`name ${input.brand.name}`);
    if (input.brand.voice) bits.push(`voice ${input.brand.voice}`);
    if (input.brand.moodKeywords && input.brand.moodKeywords.length > 0) {
      bits.push(`mood ${input.brand.moodKeywords.join(', ')}`);
    }
    if (input.brand.palette && input.brand.palette.length > 0) {
      bits.push(`palette ${input.brand.palette.join(', ')}`);
    }
    if (bits.length > 0) lines.push(`Brand: ${bits.join('; ')}.`);
  }

  if (input.component.mood.keywords.length > 0) {
    lines.push(`Component mood: ${input.component.mood.keywords.join(', ')}.`);
  }
  lines.push(`Hero subject: ${input.component.hero.description}.`);
  if (input.component.product?.description) {
    lines.push(`Product: ${input.component.product.description}.`);
  }
  if (input.component.offer?.weight) {
    lines.push(`Offer weight: ${input.component.offer.weight}.`);
  }

  lines.push('');
  lines.push(`Text-bearing safeZones (${textZones.length}, in order):`);
  textZones.forEach((zone, i) => {
    const budget = PURPOSE_BUDGETS[zone.purpose as keyof typeof PURPOSE_BUDGETS];
    lines.push(
      `  ${i + 1}. purpose=${zone.purpose}, bbox=(${formatBBox(zone.bbox)}), maxWords=${budget?.maxWords ?? 12}.`
    );
  });

  if (forbiddenRegions.length > 0) {
    lines.push('');
    lines.push(`Forbidden regions — do NOT place copy over these bboxes (${forbiddenRegions.length}):`);
    forbiddenRegions.forEach((region, i) => {
      lines.push(
        `  ${i + 1}. kind=${region.kind}, bbox=(${formatBBox(region.bbox)}), confidence=${region.confidence.toFixed(2)}.`
      );
    });
    lines.push('Place copy in safeZones that do not overlap any forbidden region bbox.');
  }

  lines.push('');
  lines.push(
    `Emit a single propose_multilingual_copy tool call with one overlay per text-bearing safeZone, content array containing exactly ${localeOrder.length} entries (one per locale, source first), and textAlign per zone.`
  );
  return lines.join('\n');
}

function formatBBox(bbox: { x: number; y: number; w: number; h: number }): string {
  const f = (n: number) => n.toFixed(2);
  return `x=${f(bbox.x)}, y=${f(bbox.y)}, w=${f(bbox.w)}, h=${f(bbox.h)}`;
}

function parseToolInput(
  raw: unknown,
  textZones: ReadonlyArray<SafeZone>,
  localeOrder: ReadonlyArray<BCP47LocaleCode>
): { layers: ProposedTextOverlay[]; rationale?: string } {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('propose_multilingual_copy input was not an object');
  }
  const v = raw as Record<string, unknown>;
  const overlaysRaw = v.overlays;
  if (!Array.isArray(overlaysRaw)) {
    throw new Error('propose_multilingual_copy: overlays must be an array');
  }

  const localeSet = new Set<string>(localeOrder);

  // Index overlays by purpose so we tolerate Claude reordering. First match
  // per purpose wins; extras are dropped to keep the layers list aligned with
  // the input zone order.
  const byPurpose = new Map<string, Record<string, unknown>>();
  for (const item of overlaysRaw) {
    if (typeof item !== 'object' || item === null) continue;
    const obj = item as Record<string, unknown>;
    const purpose = obj.purpose;
    if (typeof purpose !== 'string') continue;
    if (!byPurpose.has(purpose)) byPurpose.set(purpose, obj);
  }

  const layers: ProposedTextOverlay[] = [];
  for (const zone of textZones) {
    const overlay = byPurpose.get(zone.purpose);
    if (!overlay) {
      throw new Error(
        `propose_multilingual_copy: missing overlay for purpose '${zone.purpose}'`
      );
    }
    const content = parseContentArray(overlay.content, localeOrder, localeSet, zone.purpose);
    const textAlign = parseTextAlign(overlay.textAlign);
    layers.push({ zone, content, textAlign });
  }

  const rationale = typeof v.rationale === 'string' ? v.rationale.trim() : undefined;
  return {
    layers,
    rationale: rationale && rationale.length > 0 ? rationale : undefined,
  };
}

function parseContentArray(
  raw: unknown,
  localeOrder: ReadonlyArray<BCP47LocaleCode>,
  localeSet: Set<string>,
  purpose: string
): Record<BCP47LocaleCode, string> {
  if (!Array.isArray(raw)) {
    throw new Error(
      `propose_multilingual_copy: overlays[${purpose}].content must be an array`
    );
  }
  const map: Record<BCP47LocaleCode, string> = {} as Record<BCP47LocaleCode, string>;
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const obj = item as Record<string, unknown>;
    const locale = obj.locale;
    const text = obj.text;
    if (typeof locale !== 'string' || typeof text !== 'string') continue;
    if (!localeSet.has(locale)) continue; // ignore locales the caller didn't request
    map[locale as BCP47LocaleCode] = text;
  }

  // Source locale must be present. Target locales fall back to source if
  // Claude skipped them — better to render same-language than blank.
  const source = localeOrder[0];
  if (!(source in map)) {
    throw new Error(
      `propose_multilingual_copy: overlays[${purpose}].content missing source locale '${source}'`
    );
  }
  for (const locale of localeOrder) {
    if (!(locale in map)) {
      map[locale] = map[source];
    }
  }
  return map;
}

function parseTextAlign(raw: unknown): ProposedTextAlign {
  return raw === 'start' || raw === 'end' ? raw : 'center';
}

/**
 * Brand-aware fallback. Source locale gets a placeholder shaped by purpose +
 * brand voice; target locales mirror source so downstream code can still
 * render something on every artboard.
 */
function fallbackLayers(
  textZones: ReadonlyArray<SafeZone>,
  localeOrder: ReadonlyArray<BCP47LocaleCode>,
  input: ApplyTextOverlayInput
): ProposedTextOverlay[] {
  return textZones.map((zone) => {
    const purpose = zone.purpose;
    const placeholder = fallbackText(purpose, input);
    const content: Record<BCP47LocaleCode, string> = {} as Record<BCP47LocaleCode, string>;
    for (const locale of localeOrder) content[locale] = placeholder;
    const budget = PURPOSE_BUDGETS[purpose as keyof typeof PURPOSE_BUDGETS];
    return {
      zone,
      content,
      textAlign: budget?.defaultAlign ?? 'center',
    };
  });
}

function fallbackText(purpose: SafeZonePurpose, input: ApplyTextOverlayInput): string {
  const brandName = input.brand?.name?.trim();
  const offerWeight = input.component.offer?.weight;
  switch (purpose) {
    case 'headline':
      return brandName || 'Slow morning drop';
    case 'subhead':
      return input.creatorIntent?.trim() || 'A studio still life';
    case 'body':
      return input.component.hero.description;
    case 'caption':
      return brandName ? `New from ${brandName}` : 'New, today';
    case 'cta':
      if (offerWeight === 'aggressive') return 'Shop now';
      if (offerWeight === 'soft') return 'Discover';
      return 'Tap';
    default:
      return '';
  }
}

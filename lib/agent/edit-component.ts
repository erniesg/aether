/**
 * Apply a global edit to a SemanticCreativeComponent (issue #108, agent half).
 *
 * The "make the product feel more premium but keep the offer aggressive"
 * magic moment: read the current component + a natural-language edit
 * instruction, ask Claude Opus 4.7 to emit a patched component that
 * preserves whatever the instruction explicitly asks to keep, and return
 * it for downstream re-rendering (#105 prompt → #106 crop → text overlays).
 *
 * The persistence half (per-aspect override Convex table + merge pass with
 * surviving local edits) is a separate follow-up; this PR just ships the
 * agent that produces the patched global component.
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  SafeZone,
  SemanticCreativeComponent,
} from '@/lib/types/semantic-component';

export const CLAUDE_MODEL = 'claude-opus-4-7';

const SYSTEM_PROMPT = [
  'You are the editor brain inside aether — a canvas-native creative system.',
  'You receive an existing SemanticCreativeComponent (the typed creative primitive that drives one hero render plus N free format crops plus text overlays) and a natural-language edit instruction.',
  '',
  'Your job: emit a patched component that honors the instruction with surgical precision.',
  '',
  'Operating principles:',
  '- Only change what the instruction explicitly asks. Anything not mentioned stays identical, including formats, cropPriorities, and safeZones bbox geometry.',
  '- "Keep X aggressive" / "preserve Y" → leave that field exactly as it was.',
  '- Mood/voice shifts ("more premium", "softer") update mood.keywords and may re-describe hero/product, but do not change geometry.',
  '- Geometry shifts ("move the headline lower", "tighten the crop") update bbox values and only those.',
  '- Be terse. The patched component is a contract, not a presentation.',
].join('\n');

const TOOL_PATCH_COMPONENT: Anthropic.Messages.Tool = {
  name: 'patch_creative_component',
  description:
    'Emit a patched SemanticCreativeComponent. Preserve fields the instruction does not target.',
  input_schema: {
    type: 'object',
    properties: {
      hero: {
        type: 'object',
        properties: { description: { type: 'string' } },
        required: ['description'],
      },
      product: {
        type: 'object',
        properties: { description: { type: 'string' } },
      },
      offer: {
        type: 'object',
        properties: {
          weight: { type: 'string', enum: ['aggressive', 'soft'] },
        },
        required: ['weight'],
      },
      mood: {
        type: 'object',
        properties: {
          keywords: { type: 'array', items: { type: 'string' } },
        },
        required: ['keywords'],
      },
      safeZones: {
        type: 'array',
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
        properties: {
          primary: bboxSchema(),
          secondary: bboxSchema(),
        },
        required: ['primary'],
      },
      rationale: {
        type: 'string',
        description: 'One short sentence explaining what changed and why.',
      },
    },
    required: ['hero', 'mood', 'safeZones', 'cropPriorities'],
  } as unknown as Anthropic.Messages.Tool['input_schema'],
};

function bboxSchema() {
  return {
    type: 'object',
    properties: {
      x: { type: 'number', minimum: 0, maximum: 1 },
      y: { type: 'number', minimum: 0, maximum: 1 },
      w: { type: 'number', minimum: 0, maximum: 1 },
      h: { type: 'number', minimum: 0, maximum: 1 },
    },
    required: ['x', 'y', 'w', 'h'],
  };
}

export interface ApplyComponentEditInput {
  component: SemanticCreativeComponent;
  /** Natural-language edit. Examples: "make the product feel more premium",
   *  "keep the offer aggressive", "tighten the hero crop", "less mood, more snap". */
  instruction: string;
}

export type EditPlannerMode = 'anthropic' | 'fallback';

export interface ApplyComponentEditOutput {
  /** The patched component — `formats` is preserved exactly from the input. */
  component: SemanticCreativeComponent;
  rationale?: string;
  plannerMode: EditPlannerMode;
  plannerModel?: string;
  plannerError?: string;
}

export interface ApplyComponentEditDeps {
  anthropic?: Anthropic;
  apiKey?: string;
}

export async function applyComponentEdit(
  input: ApplyComponentEditInput,
  deps: ApplyComponentEditDeps = {}
): Promise<ApplyComponentEditOutput> {
  if (!input.instruction?.trim()) {
    throw new Error('applyComponentEdit: instruction is required');
  }

  const client = deps.anthropic ?? createClient(deps.apiKey);
  if (!client) {
    return {
      component: input.component,
      plannerMode: 'fallback',
      plannerError: 'ANTHROPIC_API_KEY not set',
    };
  }

  const briefText = buildBriefText(input);

  let msg: Awaited<ReturnType<Anthropic['messages']['create']>>;
  try {
    msg = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      system: [
        { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      ],
      tools: [TOOL_PATCH_COMPONENT],
      tool_choice: { type: 'tool', name: 'patch_creative_component' },
      messages: [{ role: 'user', content: [{ type: 'text', text: briefText }] }],
    });
  } catch (err) {
    if (shouldFallback(err)) {
      return {
        component: input.component,
        plannerMode: 'fallback',
        plannerError: err instanceof Error ? err.message : String(err),
      };
    }
    throw err;
  }

  const toolBlock = msg.content.find(
    (b): b is Extract<typeof b, { type: 'tool_use' }> =>
      b.type === 'tool_use' && b.name === 'patch_creative_component'
  );
  if (!toolBlock) {
    throw new Error('Claude did not emit a patch_creative_component tool call');
  }

  const { component, rationale } = parseToolInput(toolBlock.input, input.component);
  return {
    component,
    rationale,
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

function buildBriefText(input: ApplyComponentEditInput): string {
  return [
    `Current component (JSON):\n${JSON.stringify(input.component, null, 2)}`,
    '',
    `Edit instruction: ${input.instruction.trim()}`,
    '',
    'Emit a single patch_creative_component tool call. Preserve every field the instruction does not target.',
  ].join('\n');
}

function parseToolInput(
  raw: unknown,
  source: SemanticCreativeComponent
): { component: SemanticCreativeComponent; rationale?: string } {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('patch_creative_component input was not an object');
  }
  const v = raw as Record<string, unknown>;

  const heroDesc = (v.hero as Record<string, unknown> | undefined)?.description;
  if (typeof heroDesc !== 'string' || !heroDesc.trim()) {
    throw new Error('patch_creative_component: hero.description required');
  }

  const moodObj = v.mood as Record<string, unknown> | undefined;
  const moodKeywords = Array.isArray(moodObj?.keywords)
    ? (moodObj.keywords as unknown[]).filter(
        (k): k is string => typeof k === 'string' && k.trim().length > 0
      )
    : source.mood.keywords;

  const cropObj = v.cropPriorities as Record<string, unknown> | undefined;
  const primary = parseBBox(cropObj?.primary, 'cropPriorities.primary');
  const secondary = cropObj?.secondary
    ? parseBBox(cropObj.secondary, 'cropPriorities.secondary')
    : source.cropPriorities.secondary;

  const rawZones = Array.isArray(v.safeZones) ? (v.safeZones as unknown[]) : [];
  const safeZones: SafeZone[] = rawZones.map((z, i) => parseSafeZone(z, i));

  const product = (v.product as Record<string, unknown> | undefined)?.description;
  const offerWeight = (v.offer as Record<string, unknown> | undefined)?.weight;
  const rationale = typeof v.rationale === 'string' ? v.rationale.trim() : undefined;

  return {
    component: {
      hero: { description: heroDesc.trim() },
      product:
        typeof product === 'string' && product.trim()
          ? { description: product.trim() }
          : source.product,
      offer:
        offerWeight === 'aggressive' || offerWeight === 'soft'
          ? { weight: offerWeight }
          : source.offer,
      mood: { keywords: moodKeywords },
      safeZones: safeZones.length > 0 ? safeZones : source.safeZones,
      cropPriorities: secondary ? { primary, secondary } : { primary },
      // Formats are caller-controlled — never let the model change them.
      formats: source.formats,
    },
    rationale: rationale && rationale.length > 0 ? rationale : undefined,
  };
}

function parseBBox(raw: unknown, label: string): { x: number; y: number; w: number; h: number } {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`patch_creative_component: ${label} must be an object`);
  }
  const v = raw as Record<string, unknown>;
  return {
    x: clamp01(num(v.x, `${label}.x`)),
    y: clamp01(num(v.y, `${label}.y`)),
    w: clamp01(num(v.w, `${label}.w`)),
    h: clamp01(num(v.h, `${label}.h`)),
  };
}

function num(raw: unknown, label: string): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    throw new Error(`patch_creative_component: ${label} must be a finite number`);
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
    throw new Error(`patch_creative_component: safeZones[${index}] must be an object`);
  }
  const v = raw as Record<string, unknown>;
  const purpose = v.purpose;
  if (typeof purpose !== 'string' || !ZONE_PURPOSES.has(purpose as SafeZone['purpose'])) {
    throw new Error(
      `patch_creative_component: safeZones[${index}].purpose must be one of ${[...ZONE_PURPOSES].join('|')}`
    );
  }
  const bbox = parseBBox(v.bbox, `safeZones[${index}].bbox`);
  const must = v.mustSurviveAllCrops;
  return {
    purpose: purpose as SafeZone['purpose'],
    bbox,
    mustSurviveAllCrops: typeof must === 'boolean' ? must : undefined,
  };
}

/**
 * Vision step for the vision-guided segmentation path (slice #2).
 *
 * Calls Claude 4.7 vision once on a hero image, returning a structured JSON
 * inventory of what's in the frame: faces (highest text-safety priority),
 * products, brands (highest brand-safety priority), other components grouped
 * by kind, small-object groups (jewelry / water-droplets), and a background
 * description. The output is downstream-safe — every array field defaults to
 * empty when the model omits it.
 *
 * The orchestrator's vision-guided path then turns this JSON into a
 * per-image SAM3 prompt list via `descriptionToSegmentPrompts`, giving
 * SAM3 RICHER content-specific prompts ("wet leather jacket on man's head")
 * instead of the generic "person, jacket" the one-shot path uses.
 *
 * Cost: one Claude vision call (~$0.01 per image). The auto-mode lap
 * absorbs the cost in the slow tier — fast tier returns to the user
 * before this finishes when the architecture lands.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ComponentKind, SegmentSubjectsPrompt } from './segment-subjects';

export const DESCRIBE_IMAGE_MODEL = 'claude-opus-4-7';

export interface DescribedFace {
  /** Optional first name when recognizable (rare). */
  name?: string;
  /** Short visual description so SAM3 can find this face specifically. */
  description: string;
}

export interface DescribedProduct {
  name: string;
  description: string;
}

export interface DescribedBrand {
  name: string;
  description: string;
}

export type DescribedOtherKind =
  | 'apparel'
  | 'accessory'
  | 'pose'
  | 'environment-prop';

export interface DescribedOtherComponent {
  name: string;
  kind: DescribedOtherKind;
}

export interface DescribedSmallObjectGroup {
  /** Group label that becomes a single SAM3 prompt (jewelry, water-droplets). */
  groupName: string;
  /** Members of the group — informational only; SAM3 prompts the group name. */
  members: string[];
}

export interface ImageDescription {
  faces: DescribedFace[];
  products: DescribedProduct[];
  brands: DescribedBrand[];
  otherComponents: DescribedOtherComponent[];
  smallObjectGroups: DescribedSmallObjectGroup[];
  background: { description: string };
}

const SYSTEM_PROMPT = [
  'You are a hero-image analyst. Given an image, list every component you can see for downstream segmentation.',
  '',
  'Return ONLY a JSON object with this shape, no other prose:',
  '{',
  '  "faces": [{ "name": "<optional first name>", "description": "<short visual description>" }],',
  '  "products": [{ "name": "<short>", "description": "<short>" }],',
  '  "brands": [{ "name": "<short>", "description": "<short>" }],',
  '  "otherComponents": [{ "name": "<short>", "kind": "apparel|accessory|pose|environment-prop" }],',
  '  "smallObjectGroups": [{ "groupName": "<jewelry|water-droplets|...>", "members": ["<item1>", "<item2>"] }],',
  '  "background": { "description": "<short>" }',
  '}',
  '',
  'Rules:',
  '- Empty arrays are fine when a category is absent.',
  '- For grouping: cluster small co-located items of the same class (necklace + earrings + rings → jewelry; visible raindrops on the body → water-droplets).',
  '- "faces" / "products" / "brands" map to first-class safety taxonomy — never omit a visible face, product, or brand mark.',
  '- "background" should describe the setting briefly (e.g. "rainy urban street, neon signage").',
].join('\n');

export interface DescribeImageInput {
  imageUrl: string;
  /** Inject for tests. Defaults to a fresh Anthropic client built from env. */
  client?: Anthropic;
  apiKey?: string;
  /** Override the model (defaults to claude-opus-4-7). */
  model?: string;
  /** Override max_tokens (defaults to 1024 — JSON inventory is small). */
  maxTokens?: number;
}

export async function describeImage(
  input: DescribeImageInput
): Promise<ImageDescription> {
  const apiKey = input.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!input.client && !apiKey) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }
  const client =
    input.client ?? new Anthropic({ apiKey: apiKey as string });
  const model = input.model ?? DESCRIBE_IMAGE_MODEL;

  const msg = await client.messages.create({
    model,
    max_tokens: input.maxTokens ?? 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'url', url: input.imageUrl },
          },
        ],
      },
    ],
  });

  const text = msg.content
    .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('');

  return parseImageDescription(text);
}

const EMPTY_DESCRIPTION: ImageDescription = {
  faces: [],
  products: [],
  brands: [],
  otherComponents: [],
  smallObjectGroups: [],
  background: { description: '' },
};

/**
 * Pull the structured JSON out of the model's free-form text. Tolerates
 * leading prose / fenced code blocks by extracting the largest `{…}` span.
 * Always returns a well-shaped `ImageDescription` (empty arrays when the
 * model omits a field) so downstream code never has to null-check.
 */
export function parseImageDescription(text: string): ImageDescription {
  if (!text) return cloneEmpty();
  const trimmed = text.trim();
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first === -1 || last <= first) return cloneEmpty();
    try {
      parsed = JSON.parse(trimmed.slice(first, last + 1)) as Record<
        string,
        unknown
      >;
    } catch {
      return cloneEmpty();
    }
  }

  return {
    faces: pickFaces(parsed.faces),
    products: pickNamedDescriptions(parsed.products),
    brands: pickNamedDescriptions(parsed.brands),
    otherComponents: pickOtherComponents(parsed.otherComponents),
    smallObjectGroups: pickSmallObjectGroups(parsed.smallObjectGroups),
    background: pickBackground(parsed.background),
  };
}

function cloneEmpty(): ImageDescription {
  return {
    faces: [...EMPTY_DESCRIPTION.faces],
    products: [...EMPTY_DESCRIPTION.products],
    brands: [...EMPTY_DESCRIPTION.brands],
    otherComponents: [...EMPTY_DESCRIPTION.otherComponents],
    smallObjectGroups: [...EMPTY_DESCRIPTION.smallObjectGroups],
    background: { description: '' },
  };
}

function pickFaces(value: unknown): DescribedFace[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): DescribedFace | null => {
      if (!item || typeof item !== 'object') return null;
      const o = item as Record<string, unknown>;
      const description =
        typeof o.description === 'string' && o.description.trim().length > 0
          ? o.description.trim()
          : null;
      if (!description) return null;
      const name = typeof o.name === 'string' ? o.name.trim() || undefined : undefined;
      return { description, ...(name ? { name } : {}) };
    })
    .filter((x): x is DescribedFace => x !== null);
}

function pickNamedDescriptions(value: unknown): DescribedProduct[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): DescribedProduct | null => {
      if (!item || typeof item !== 'object') return null;
      const o = item as Record<string, unknown>;
      const name = typeof o.name === 'string' ? o.name.trim() : '';
      const description =
        typeof o.description === 'string' ? o.description.trim() : '';
      if (!name && !description) return null;
      return { name: name || description, description: description || name };
    })
    .filter((x): x is DescribedProduct => x !== null);
}

function pickOtherComponents(value: unknown): DescribedOtherComponent[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): DescribedOtherComponent | null => {
      if (!item || typeof item !== 'object') return null;
      const o = item as Record<string, unknown>;
      const name = typeof o.name === 'string' ? o.name.trim() : '';
      const kindRaw = typeof o.kind === 'string' ? o.kind.trim() : '';
      if (!name) return null;
      const kind: DescribedOtherKind =
        kindRaw === 'apparel' ||
        kindRaw === 'accessory' ||
        kindRaw === 'pose' ||
        kindRaw === 'environment-prop'
          ? kindRaw
          : 'environment-prop';
      return { name, kind };
    })
    .filter((x): x is DescribedOtherComponent => x !== null);
}

function pickSmallObjectGroups(value: unknown): DescribedSmallObjectGroup[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): DescribedSmallObjectGroup | null => {
      if (!item || typeof item !== 'object') return null;
      const o = item as Record<string, unknown>;
      const groupName = typeof o.groupName === 'string' ? o.groupName.trim() : '';
      if (!groupName) return null;
      const members = Array.isArray(o.members)
        ? (o.members.filter((m) => typeof m === 'string' && m.trim().length > 0) as string[])
        : [];
      return { groupName, members };
    })
    .filter((x): x is DescribedSmallObjectGroup => x !== null);
}

function pickBackground(value: unknown): { description: string } {
  if (!value || typeof value !== 'object') return { description: '' };
  const desc = (value as Record<string, unknown>).description;
  return {
    description: typeof desc === 'string' ? desc.trim() : '',
  };
}

/**
 * Translate an `ImageDescription` into the `SegmentSubjectsPrompt[]` the
 * vision-guided segmentation path feeds into SAM3. Each face becomes a
 * separate face-kind prompt; products → product-kind; brands → logo-kind;
 * other components are mapped to apparel / accessory / other based on the
 * model's reported kind; small-object groups become single accessory-kind
 * prompts; background gets one prompt at the end when present.
 */
export function descriptionToSegmentPrompts(
  desc: ImageDescription
): SegmentSubjectsPrompt[] {
  const out: SegmentSubjectsPrompt[] = [];

  for (const face of desc.faces) {
    const text = face.description?.trim() || (face.name ? `${face.name}'s face` : 'face');
    out.push({ prompt: text, componentKind: 'face' });
  }
  for (const p of desc.products) {
    if (!p.name) continue;
    out.push({ prompt: p.name, componentKind: 'product' });
  }
  for (const b of desc.brands) {
    if (!b.name) continue;
    out.push({ prompt: b.name, componentKind: 'logo' });
  }
  for (const c of desc.otherComponents) {
    let componentKind: ComponentKind = 'other';
    if (c.kind === 'apparel') componentKind = 'apparel';
    else if (c.kind === 'accessory') componentKind = 'accessory';
    out.push({ prompt: c.name, componentKind });
  }
  for (const group of desc.smallObjectGroups) {
    out.push({ prompt: group.groupName, componentKind: 'accessory' });
  }
  if (desc.background.description) {
    out.push({ prompt: 'background', componentKind: 'background' });
  }

  return out;
}

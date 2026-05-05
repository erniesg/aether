import type { AspectRatio, ImageRef } from '@/lib/providers/image/types';

export type HeroDirectionId = `hero-${string}`;

export interface HeroDirectionDimension {
  axis:
    | 'scene-distance'
    | 'subject-emphasis'
    | 'mood'
    | 'angle'
    | 'value-proposition'
    | 'composition';
  value: string;
}

export interface HeroDirection {
  id: HeroDirectionId;
  label: string;
  rationale: string;
  dimensions: HeroDirectionDimension[];
  /** Internal-only prompt cue. Do not render in primary UI. */
  promptCue: string;
}

export interface HeroDirectionPlan {
  strategy: 'deterministic';
  requestedCount: number;
  directions: HeroDirection[];
}

export const HERO_SEED_PROMPT_REQUIREMENT =
  'Use selected references when relevant. Keep raster free of baked text so editable overlays carry copy. Preserve brand/product identity and the referenced scene/subjects unless the creator asks otherwise. Create one continuous image, not a collage.';

export const CHILD_FORMAT_PROMPT_REQUIREMENT =
  'Use the attached hero as the single scene to adapt. Create one continuous photograph, not a collage. No grid, panels, inset images, contact sheet, split-screen, or montage. Preserve the same subject, product, lighting, camera identity, and scene. Recompose only to fit the requested aspect ratio. Keep raster free of baked text.';

const DIRECTION_LIBRARY: readonly Omit<HeroDirection, 'id'>[] = [
  {
    label: 'Intimate Product Moment',
    rationale:
      'A close, human-scale scene that makes the product feel present in a lived-in moment.',
    dimensions: [
      { axis: 'scene-distance', value: 'medium close scene' },
      { axis: 'subject-emphasis', value: 'person and product' },
      { axis: 'mood', value: 'warm lifestyle' },
      { axis: 'angle', value: 'bedside eye-level' },
      { axis: 'value-proposition', value: 'recovery and comfort' },
      { axis: 'composition', value: 'subject-led with soft negative space' },
    ],
    promptCue:
      'Creative direction: intimate bedroom lifestyle moment; a couple resting naturally, product visible and believable, warm recovery mood, bedside eye-level camera, soft negative space for later copy.',
  },
  {
    label: 'Premium Material Closeup',
    rationale:
      'A product-led direction that foregrounds material quality and premium technology cues.',
    dimensions: [
      { axis: 'scene-distance', value: 'closeup' },
      { axis: 'subject-emphasis', value: 'product' },
      { axis: 'mood', value: 'premium editorial' },
      { axis: 'angle', value: 'low cinematic macro' },
      { axis: 'value-proposition', value: 'cooling and smart automation' },
      { axis: 'composition', value: 'product-led with precise highlights' },
    ],
    promptCue:
      'Creative direction: premium product closeup; tactile materials, cooling technology cues, low cinematic macro angle, crisp controlled highlights, product identity dominant.',
  },
  {
    label: 'Morning Recovery Lifestyle',
    rationale:
      'A wider lifestyle scene that sells the benefit after sleep rather than the device itself.',
    dimensions: [
      { axis: 'scene-distance', value: 'wide lifestyle scene' },
      { axis: 'subject-emphasis', value: 'environment and person' },
      { axis: 'mood', value: 'fresh morning' },
      { axis: 'angle', value: 'wide natural-light angle' },
      { axis: 'value-proposition', value: 'morning recovery' },
      { axis: 'composition', value: 'negative-space-led environment' },
    ],
    promptCue:
      'Creative direction: morning recovery lifestyle; wider bedroom environment, rested person beginning the day, natural window light, product still recognisable but not oversized.',
  },
  {
    label: 'Clinical Calm Technology',
    rationale:
      'A controlled, technical direction for creators who need a cleaner performance story.',
    dimensions: [
      { axis: 'scene-distance', value: 'medium product scene' },
      { axis: 'subject-emphasis', value: 'product and environment' },
      { axis: 'mood', value: 'clinical tech' },
      { axis: 'angle', value: 'overhead three-quarter' },
      { axis: 'value-proposition', value: 'temperature precision' },
      { axis: 'composition', value: 'negative-space-led product layout' },
    ],
    promptCue:
      'Creative direction: clinical calm technology; precise bedding geometry, subtle temperature-control cues, overhead three-quarter camera, clean negative space, no diagnostic UI.',
  },
] as const;

export function clampHeroCount(value: unknown): number {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return 1;
  return Math.max(1, Math.min(4, Math.trunc(raw)));
}

export function planHeroDirections(input: {
  prompt: string;
  count: number;
  strategy?: string;
}): HeroDirectionPlan {
  const requestedCount = clampHeroCount(input.count);
  const directions = Array.from({ length: requestedCount }, (_unused, index) => {
    const seed = DIRECTION_LIBRARY[index % DIRECTION_LIBRARY.length]!;
    const suffix = String.fromCharCode(97 + index);
    return {
      ...seed,
      id: `hero-${suffix}` as HeroDirectionId,
    };
  });

  return {
    strategy: 'deterministic',
    requestedCount,
    directions,
  };
}

export function buildHeroSeedPrompt(input: {
  rewrittenPrompt: string;
  direction: HeroDirection;
}): string {
  return [
    input.rewrittenPrompt.trim(),
    '',
    input.direction.promptCue,
    HERO_SEED_PROMPT_REQUIREMENT,
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildChildFormatPrompt(input: {
  rewrittenPrompt: string;
  direction: HeroDirection;
  aspectRatio: AspectRatio;
  label?: string;
}): string {
  const formatLine = input.label
    ? `Target format: ${input.label} (${input.aspectRatio}).`
    : `Target aspect ratio: ${input.aspectRatio}.`;
  return [
    input.rewrittenPrompt.trim(),
    '',
    input.direction.promptCue,
    formatLine,
    CHILD_FORMAT_PROMPT_REQUIREMENT,
  ]
    .filter(Boolean)
    .join('\n');
}

export function selectChildGenerationRefs(input: {
  heroSeedUrl: string;
  originalRefs?: readonly ImageRef[];
  includeProductIdentityRef?: boolean;
}): ImageRef[] {
  const refs: ImageRef[] = [{ url: input.heroSeedUrl, weight: 1 }];
  if (input.includeProductIdentityRef) {
    const firstIdentityRef = (input.originalRefs ?? []).find(
      (ref) => typeof ref.url === 'string' && ref.url.length > 0
    );
    if (firstIdentityRef) refs.push({ ...firstIdentityRef, weight: firstIdentityRef.weight ?? 0.35 });
  }
  return refs;
}


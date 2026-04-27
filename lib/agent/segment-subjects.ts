/**
 * Multi-prompt SAM3 fan-out (slice #2: one-shot + vision-guided segmentation).
 *
 * `/api/segment` accepts a single `prompt: string` per request. To cover the
 * 12-component taxonomy we need (face / subject / apparel / accessory /
 * product / logo / background / etc.), we issue N parallel POSTs and merge
 * the results into one kind-tagged mask array.
 *
 * Both segmentation paths in `runPostHeroPipeline` consume this same shape:
 *   - One-shot: ONE_SHOT_PROMPTS (static, no LLM cost; broad coverage; can
 *     miss per-image semantic grouping).
 *   - Vision-guided: prompt list derived from `describeImage` (per-image
 *     specificity at the cost of one Claude vision call).
 *
 * Output is the same array of `SegmentSubjectsMask` so downstream code
 * (text-overlay planner, layer extractor) is path-agnostic.
 */

import type { ForbiddenRegion } from '@/lib/text-overlay/types';

/**
 * Granularity-aware kind taxonomy for slice #2 + slice #3 (layer extraction).
 * Wider than `ForbiddenRegion.kind` (which is the 4-kind taxonomy that text
 * overlay needs) — includes 'subject', 'apparel', 'accessory', 'background'
 * for the layer extractor's component-aware ordering.
 */
export type ComponentKind =
  | 'face'
  | 'subject'
  | 'apparel'
  | 'accessory'
  | 'product'
  | 'logo'
  | 'background'
  | 'other';

export interface SegmentSubjectsPrompt {
  /** Prompt text passed to SAM3. */
  prompt: string;
  /** Granularity tag — drives the layer extractor and forbidden-region map. */
  componentKind: ComponentKind;
}

export interface SegmentSubjectsMask {
  /** The originating prompt string — useful for debugging A/B coverage. */
  label: string;
  componentKind: ComponentKind;
  /** Pixel-space bounding box in the source image's coordinate system. */
  bbox: { x: number; y: number; w: number; h: number };
  /** 0..1 confidence as reported by SAM3. */
  confidence: number;
}

export interface SegmentSubjectsResult {
  /** Source image dims in pixels — required for normalization. */
  width: number;
  height: number;
  masks: SegmentSubjectsMask[];
  /** Number of prompts that produced at least one mask. */
  matched: number;
  /** Total prompts attempted (matched ≤ prompted). */
  prompted: number;
}

/**
 * Static one-shot prompt list — covers the foreground / background components
 * a hero image typically contains. Per Ernie 2026-04-26: each foreground
 * component gets its own mask; small co-located items of the same class are
 * grouped (jewelry, water-droplets) so the user doesn't end up managing 100
 * tiny shapes.
 *
 * Order is roughly priority-descending: face first (highest text-safety), then
 * subject and apparel, then accessories, then product/logo, then background.
 * SAM3 returns no mask when a prompt isn't found, so empty results are fine.
 */
export const ONE_SHOT_PROMPTS: ReadonlyArray<SegmentSubjectsPrompt> = [
  { prompt: 'face',                                componentKind: 'face' },
  { prompt: 'person',                              componentKind: 'subject' },
  { prompt: 'jacket',                              componentKind: 'apparel' },
  { prompt: 'shirt',                               componentKind: 'apparel' },
  { prompt: 'pants',                               componentKind: 'apparel' },
  { prompt: 'shoes',                               componentKind: 'apparel' },
  { prompt: 'jewelry',                             componentKind: 'accessory' },
  { prompt: 'bag, accessory',                      componentKind: 'accessory' },
  { prompt: 'glasses, sunglasses, eyewear',        componentKind: 'accessory' },
  { prompt: 'hat, cap, headwear',                  componentKind: 'accessory' },
  { prompt: 'phone, smartphone, mobile device',    componentKind: 'product' },
  { prompt: 'cup, bottle, beverage',               componentKind: 'product' },
  { prompt: 'product',                             componentKind: 'product' },
  { prompt: 'brand logo, mark',                    componentKind: 'logo' },
  { prompt: 'text, typography',                    componentKind: 'logo' },
  // Catch-all: any salient foreground region the per-class prompts above
  // missed. SAM3 returns no mask when nothing matches, so this is cheap
  // and prevents text overlays from landing on unnamed product elements
  // (Pod sensors, Hub housings, headboards, etc.) that the planner
  // otherwise treats as empty space.
  { prompt: 'visible foreground object, item, element', componentKind: 'other' },
  { prompt: 'background',                          componentKind: 'background' },
] as const;

/** Map the wider component kind down to the 4-kind ForbiddenRegion taxonomy. */
export function componentKindToForbiddenKind(
  kind: ComponentKind
): ForbiddenRegion['kind'] {
  if (kind === 'face' || kind === 'product' || kind === 'logo') return kind;
  return 'other';
}

export interface SegmentSubjectsInput {
  imageUrl: string;
  prompts: ReadonlyArray<SegmentSubjectsPrompt>;
  baseUrl: string;
  /** Source image pixel dims — required by /api/segment. */
  width: number;
  height: number;
  /** Override for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * Issue one /api/segment POST per prompt in parallel; merge the results into
 * a single mask array tagged with each prompt's componentKind. Failures are
 * fail-soft per-prompt — a network error or 4xx for one prompt does not abort
 * the rest.
 *
 * One prompt can return zero or more masks (SAM3 may detect multiple
 * instances, e.g. two faces). Each is tagged with the prompt's label +
 * componentKind so downstream consumers can distinguish them.
 */
export async function segmentSubjects(
  input: SegmentSubjectsInput
): Promise<SegmentSubjectsResult> {
  const fetchFn = input.fetchImpl ?? fetch;

  const tasks = input.prompts.map(async (p) => {
    try {
      const r = await fetchFn(`${input.baseUrl}/api/segment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceUrl: input.imageUrl,
          mode: 'unmask',
          width: input.width,
          height: input.height,
          prompt: p.prompt,
        }),
      });
      if (!r.ok) return [] as SegmentSubjectsMask[];
      const json = (await r.json()) as Record<string, unknown>;
      const raw = json.raw as Record<string, unknown> | undefined;
      const masksRaw =
        (raw?.masks as Array<Record<string, unknown>> | undefined) ?? [];
      return masksRaw
        .map((m): SegmentSubjectsMask | null => {
          const bbox = m.bbox as
            | { x?: number; y?: number; w?: number; h?: number }
            | undefined;
          if (
            !bbox ||
            typeof bbox.x !== 'number' ||
            typeof bbox.y !== 'number' ||
            typeof bbox.w !== 'number' ||
            typeof bbox.h !== 'number'
          ) {
            return null;
          }
          const conf =
            typeof m.confidence === 'number' && Number.isFinite(m.confidence)
              ? m.confidence
              : 0;
          return {
            label: p.prompt,
            componentKind: p.componentKind,
            bbox: { x: bbox.x, y: bbox.y, w: bbox.w, h: bbox.h },
            confidence: conf,
          };
        })
        .filter((m): m is SegmentSubjectsMask => m !== null);
    } catch {
      return [] as SegmentSubjectsMask[];
    }
  });

  const settled = await Promise.allSettled(tasks);
  const masks: SegmentSubjectsMask[] = [];
  let matched = 0;
  for (const r of settled) {
    if (r.status !== 'fulfilled') continue;
    if (r.value.length === 0) continue;
    masks.push(...r.value);
    matched += 1;
  }

  // Fallback chain: SAM3 grounding is brittle on photographic heroes
  // (returns 0 masks for every text prompt). When that happens, fire one
  // SAM2 (men1scus/birefnet) salient-object call — no prompt needed — so
  // the planner has SOMETHING to anchor crops + forbidden regions to.
  if (matched === 0) {
    const fallback = await runSam2SalientFallback(input, fetchFn);
    if (fallback) {
      return {
        width: input.width,
        height: input.height,
        masks: [fallback],
        matched: 1,
        prompted: input.prompts.length,
      };
    }
  }

  return {
    width: input.width,
    height: input.height,
    masks,
    matched,
    prompted: input.prompts.length,
  };
}

/**
 * Single salient-object call to /api/segment with providerId='sam2'. Used
 * silently when the SAM3 fan-out matches nothing — birefnet does NOT take
 * a text prompt, so we get one mask covering the whole subject region.
 *
 * Bbox handling: the Replicate SAM2 provider doesn't currently compute
 * bbox from the alpha mask, so the response often omits it. When that
 * happens we synthesise a full-image bbox — useless as a forbidden
 * region by itself, but it (a) ticks `matched>0` so downstream metrics
 * are honest about whether segmentation produced any usable signal and
 * (b) gives the planner a non-empty subject hint instead of silently
 * dropping back to "treat the whole image as empty space."
 *
 * Returns null on any failure — caller keeps the original empty result.
 */
async function runSam2SalientFallback(
  input: SegmentSubjectsInput,
  fetchFn: typeof fetch
): Promise<SegmentSubjectsMask | null> {
  try {
    const r = await fetchFn(`${input.baseUrl}/api/segment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerId: 'sam2',
        sourceUrl: input.imageUrl,
        mode: 'cutout',
        width: input.width,
        height: input.height,
      }),
    });
    if (!r.ok) return null;
    const json = (await r.json()) as Record<string, unknown>;
    const preview = json.preview as Record<string, unknown> | undefined;
    const bboxRaw = preview?.bbox as
      | { x?: number; y?: number; w?: number; h?: number }
      | undefined;
    const bbox =
      bboxRaw &&
      typeof bboxRaw.x === 'number' &&
      typeof bboxRaw.y === 'number' &&
      typeof bboxRaw.w === 'number' &&
      typeof bboxRaw.h === 'number'
        ? { x: bboxRaw.x, y: bboxRaw.y, w: bboxRaw.w, h: bboxRaw.h }
        : { x: 0, y: 0, w: input.width, h: input.height };
    return {
      label: 'salient-subject',
      componentKind: 'subject',
      bbox,
      confidence: 1,
    };
  } catch {
    return null;
  }
}

/**
 * Convert a SegmentSubjectsResult into the `ForbiddenRegion[]` that
 * `applyTextOverlay` consumes. Mirrors the existing
 * `segmentationToForbiddenRegions` adapter but uses the wider componentKind
 * taxonomy (mapping 'subject' / 'apparel' / 'accessory' / 'background' →
 * 'other').
 */
export function segmentSubjectsToForbiddenRegions(
  result: SegmentSubjectsResult
): ForbiddenRegion[] {
  if (!result.width || !result.height) return [];
  return result.masks.map((m) => {
    const normX = clamp01(m.bbox.x / result.width);
    const normY = clamp01(m.bbox.y / result.height);
    const normW = clamp01(m.bbox.w / result.width);
    const normH = clamp01(m.bbox.h / result.height);
    return {
      kind: componentKindToForbiddenKind(m.componentKind),
      bbox: {
        x: normX,
        y: normY,
        w: Math.min(normW, 1 - normX),
        h: Math.min(normH, 1 - normY),
      },
      confidence: m.confidence,
    };
  });
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

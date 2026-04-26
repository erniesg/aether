/**
 * Layout-aware prompt construction (issue #105).
 *
 * Produces an image-gen prompt that bakes safe zones, crop priorities, and
 * multi-format composition guidance into the natural-language instruction —
 * so a single render survives every aspect-ratio crop without per-format
 * regeneration. The image is text-free; copy lives in BCP47 text overlay
 * layers downstream (PR #74 schema).
 */

import type {
  FormatTarget,
  NormalizedBBox,
  SafeZone,
  SemanticCreativeComponent,
} from '@/lib/types/semantic-component';

export interface BuildLayoutAwarePromptOptions {
  /**
   * The original creator request (e.g. "tonight only, slow editorial drop"),
   * preserved verbatim as the lead of the prompt.
   */
  creatorPrompt: string;
  component: SemanticCreativeComponent;
  /** Optional brand mood keywords woven into the mood line. */
  brandMoodKeywords?: ReadonlyArray<string>;
}

/**
 * Assemble the prompt. The shape is intentionally line-per-instruction so
 * gpt-image-1 (which prefers terse, declarative input) parses each constraint
 * independently rather than averaging over a long prose paragraph.
 */
export function buildLayoutAwarePrompt(
  options: BuildLayoutAwarePromptOptions
): string {
  const { creatorPrompt, component, brandMoodKeywords } = options;
  const lines: string[] = [];

  const trimmedCreator = creatorPrompt.trim();
  if (trimmedCreator) lines.push(trimmedCreator);

  lines.push(`Hero subject: ${component.hero.description}.`);
  if (component.product?.description) {
    lines.push(`Product: ${component.product.description}.`);
  }

  const moodKeywords = mergeMood(component.mood.keywords, brandMoodKeywords);
  if (moodKeywords.length > 0) {
    lines.push(`Mood: ${moodKeywords.join(', ')}.`);
  }

  const aspects = uniqueAspectRatios(component.formats);
  if (aspects.length > 1) {
    lines.push(
      `Compose this image so it remains readable when cropped to any of these aspect ratios: ${aspects.join(', ')}. The hero subject must stay centered and uncropped in every one.`
    );
  } else if (aspects.length === 1) {
    lines.push(`Aspect ratio: ${aspects[0]}.`);
  }

  if (component.safeZones.length > 0) {
    lines.push(
      'Reserve the following regions as soft negative space — flat tone, low detail, no clutter — so editable text overlays can be placed there separately:'
    );
    for (const zone of component.safeZones) {
      lines.push(`- ${describeBBox(zone.bbox)} for the ${zone.purpose}.`);
    }
  }

  lines.push(
    `Primary subject anchor: ${describeBBox(component.cropPriorities.primary)}; this region must survive every crop.`
  );
  if (component.cropPriorities.secondary) {
    lines.push(
      `Secondary anchor: ${describeBBox(component.cropPriorities.secondary)} — preserve when geometry permits.`
    );
  }

  if (component.offer?.weight === 'aggressive') {
    lines.push(
      'Offer weight is aggressive — visual contrast and tonal urgency, but no on-image text.'
    );
  } else if (component.offer?.weight === 'soft') {
    lines.push('Offer weight is soft — restrained tonal range, no on-image text.');
  }

  lines.push(
    'Do not render any text, logos, or watermarks in the image; all copy will be added as a separate editable overlay.'
  );

  return lines.join('\n');
}

function mergeMood(
  componentMood: ReadonlyArray<string>,
  brandMood: ReadonlyArray<string> | undefined
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const term of [...componentMood, ...(brandMood ?? [])]) {
    const t = term.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/** Reduce w/h pairs to canonical aspect-ratio strings (e.g. "9:16"). */
function uniqueAspectRatios(formats: ReadonlyArray<FormatTarget>): string[] {
  const set = new Set<string>();
  const ordered: string[] = [];
  for (const f of formats) {
    if (f.w <= 0 || f.h <= 0) continue;
    const ratio = simplifyRatio(f.w, f.h);
    if (set.has(ratio)) continue;
    set.add(ratio);
    ordered.push(ratio);
  }
  return ordered;
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

const EPS = 0.01;

/**
 * Convert a normalized bbox into a short natural-language description that
 * gpt-image-1 understands ("the upper 20% of the frame", "the central 60% ×
 * 60% region", etc.). The phrasing is what unlocks the generator's ability
 * to leave appropriate negative space — naming the percent works empirically
 * better than coordinates.
 */
export function describeBBox(bbox: NormalizedBBox): string {
  const { x, y, w, h } = clampBBox(bbox);
  const left = x;
  const right = x + w;
  const top = y;
  const bottom = y + h;
  const wPct = Math.round(w * 100);
  const hPct = Math.round(h * 100);

  const fullWidth = approx(left, 0) && approx(right, 1);
  const fullHeight = approx(top, 0) && approx(bottom, 1);

  if (fullWidth && fullHeight) return 'the entire frame';

  if (fullWidth) {
    if (approx(top, 0)) return `the upper ${hPct}% of the frame`;
    if (approx(bottom, 1)) return `the lower ${hPct}% of the frame`;
    return `a full-width band from ${Math.round(top * 100)}% to ${Math.round(bottom * 100)}% vertically`;
  }
  if (fullHeight) {
    if (approx(left, 0)) return `the left ${wPct}% of the frame`;
    if (approx(right, 1)) return `the right ${wPct}% of the frame`;
    return `a full-height column from ${Math.round(left * 100)}% to ${Math.round(right * 100)}% horizontally`;
  }

  // Central detection uses a larger tolerance than the strip-edge checks —
  // a rectangle whose center sits within ±10% of the frame's center reads
  // as "central" to a human (and to gpt-image-1) even if it's not perfectly
  // symmetric.
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;
  if (approx(centerX, 0.5, 0.1) && approx(centerY, 0.5, 0.1)) {
    return `the central ${wPct}% × ${hPct}% region of the frame`;
  }

  const horiz = describeHorizontal(left, right);
  const vert = describeVertical(top, bottom);
  return `the ${vert}-${horiz} region (${wPct}% × ${hPct}%)`;
}

function clampBBox(b: NormalizedBBox): NormalizedBBox {
  const x = clamp01(b.x);
  const y = clamp01(b.y);
  const w = Math.max(0, Math.min(1 - x, b.w));
  const h = Math.max(0, Math.min(1 - y, b.h));
  return { x, y, w, h };
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function approx(value: number, target: number, eps = EPS): boolean {
  return Math.abs(value - target) <= eps;
}

function describeHorizontal(left: number, right: number): string {
  const center = (left + right) / 2;
  if (center < 0.34) return 'left';
  if (center > 0.66) return 'right';
  return 'center';
}

function describeVertical(top: number, bottom: number): string {
  const center = (top + bottom) / 2;
  if (center < 0.34) return 'upper';
  if (center > 0.66) return 'lower';
  return 'middle';
}

export type { SafeZone, NormalizedBBox, SemanticCreativeComponent, FormatTarget };

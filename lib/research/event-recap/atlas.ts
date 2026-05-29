import type { AtlasLaneConfig } from './event-config';

/**
 * Theme-shaped input for atlas lane assignment. Mirrors the relevant
 * subset of EventTheme so the function works both server-side (with
 * full EventTheme objects) and client-side (with the lightweight
 * theme payload the static worker reads from R2).
 */
export interface AtlasTheme {
  themeId: string;
  label: string;
  summary?: string;
  keywords?: string[];
  postIds?: string[];
}

/**
 * Assign a theme to an atlas lane.
 *
 * Match order:
 *   1. Pass over lanes — does the theme's label match the lane matcher?
 *   2. If no label match, pass again — does the theme's full text
 *      (label + summary + keywords) match the lane matcher?
 *   3. If still no match, fall back to the first lane without a matcher,
 *      or to the first lane in the array.
 *
 * The label-first pass exists so a theme whose label clearly belongs to
 * one lane doesn't get pulled into another lane by a stray sponsor or
 * topic mention in its summary.
 */
export function assignLane(theme: AtlasTheme, lanes: AtlasLaneConfig[]): AtlasLaneConfig {
  if (!lanes.length) {
    throw new Error('assignLane requires at least one lane');
  }

  const label = (theme.label ?? '').toLowerCase();
  for (const lane of lanes) {
    if (lane.matcher && lane.matcher.test(label)) return lane;
  }

  const fullText = `${theme.label ?? ''} ${theme.summary ?? ''} ${(theme.keywords ?? []).join(' ')}`.toLowerCase();
  for (const lane of lanes) {
    if (lane.matcher && lane.matcher.test(fullText)) return lane;
  }

  return lanes.find((l) => !l.matcher) ?? lanes[0];
}

/**
 * Group themes by lane. Returns a Map keyed by lane.id with the assigned
 * themes in input order. Lanes with no themes are still present in the
 * returned Map with empty arrays.
 */
export function groupByLane<T extends AtlasTheme>(
  themes: T[],
  lanes: AtlasLaneConfig[]
): Map<string, T[]> {
  const out = new Map<string, T[]>(lanes.map((lane) => [lane.id, []]));
  for (const theme of themes) {
    const lane = assignLane(theme, lanes);
    const bucket = out.get(lane.id);
    if (bucket) bucket.push(theme);
  }
  return out;
}

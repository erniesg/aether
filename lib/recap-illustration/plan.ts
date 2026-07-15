/**
 * Event recap → per-platform illustration plan.
 *
 * Given an event-recap bundle (the `outputs/event-recap-<event>/public.json`
 * shape, distilled to facts), compose a hand-drawn "doodle / sketchnote"
 * hero illustration brief per platform plus the hero→format fan-out the
 * rest of the app already speaks: `FormatTarget[]` with the same ids/dims
 * as `STANDARD_FORMATS` (lib/agent/auto-mode.ts) and `SafeZone[]` with the
 * same headline/caption semantics as `DEFAULT_TEXT_SAFE_ZONES`, so the
 * output plugs straight into `cropHeroToFormats` (lib/canvas/cropToFormat).
 *
 * Grounding contract: the prompt is composed ONLY from facts present in
 * the bundle — event name, real counts, theme labels, an optional standout
 * quote. The static template contains no digits, so every number in the
 * prompt is traceable to the input. Palette hexes (which carry digits)
 * live on the spec's `palette` field, never in the prompt text.
 *
 * Pure and deterministic — no network, no Date.now(), no randomness.
 * Actual generation goes through the provider registry (see
 * scripts/event-recap-illustrations.ts); no model or provider is named here.
 */

import type { AspectRatio } from '@/lib/providers/image/types';
import type { FormatTarget, SafeZone } from '@/lib/types/semantic-component';

export type RecapPlatform = 'x' | 'linkedin' | 'instagram';
export type RecapIllustrationStyle = 'doodle-sketchnote' | 'editorial-flat';

export interface RecapTheme {
  label: string;
  summary?: string;
}

export interface RecapQuote {
  text: string;
  attribution?: string;
}

export interface RecapStats {
  /** Relevant post count across platforms. */
  totalPosts?: number;
  /** Relevant post count per platform (x / linkedin / youtube / ...). */
  postsByPlatform?: Record<string, number>;
  /** Observed views where the platform exposes them. */
  knownViews?: number;
  /** Observed likes where the platform exposes them. */
  knownLikes?: number;
}

export interface RecapIllustrationBundle {
  eventId: string;
  eventName: string;
  stats?: RecapStats;
  themes?: RecapTheme[];
  quotes?: RecapQuote[];
}

export interface RecapIllustrationOptions {
  platforms?: RecapPlatform[];
  style?: RecapIllustrationStyle;
}

export interface IllustrationSpec {
  platform: RecapPlatform;
  style: RecapIllustrationStyle;
  /** Composed image-gen prompt, grounded only in bundle facts. */
  prompt: string;
  /** The style sentences embedded in the prompt, exposed for inspection. */
  styleDirectives: string[];
  /** Paper/ink/vermillion palette (docs/explorations/motion-graphics/DESIGN.md). */
  palette: { paper: string; ink: string; accent: string };
  /** Format fan-out for this platform; `formats[0]` is the hero. */
  formats: FormatTarget[];
  heroFormat: FormatTarget;
  /** Provider-ready aspect for the hero render. */
  heroAspect: AspectRatio;
  /** Text-safe zones — same semantics as auto-mode's DEFAULT_TEXT_SAFE_ZONES. */
  safeZones: SafeZone[];
  /** Suggested caption seed drawn from theme labels. */
  captionSeed: string;
  /** Trace of the facts the prompt was composed from. */
  grounding: {
    eventName: string;
    themeLabels: string[];
    numbersUsed: number[];
  };
}

export const RECAP_PLATFORMS: ReadonlyArray<RecapPlatform> = ['x', 'linkedin', 'instagram'];

/**
 * Same ids/dims as STANDARD_FORMATS in lib/agent/auto-mode.ts (private
 * there). plan.test.ts cross-checks these dims so a drift in either place
 * fails loudly.
 */
export const RECAP_FORMATS: Readonly<Record<string, FormatTarget>> = {
  '1x1': { id: '1x1', w: 1024, h: 1024, label: 'Hero · Square' },
  '4x5': { id: '4x5', w: 1080, h: 1350, label: 'IG Portrait' },
  '9x16': { id: '9x16', w: 1080, h: 1920, label: 'Story / Reel' },
  '16x9': { id: '16x9', w: 1920, h: 1080, label: 'Banner' },
};

const FORMAT_ASPECT: Readonly<Record<string, AspectRatio>> = {
  '1x1': '1:1',
  '4x5': '4:5',
  '9x16': '9:16',
  '16x9': '16:9',
};

/** First entry is the hero format the provider renders natively. */
const PLATFORM_FORMATS: Readonly<Record<RecapPlatform, ReadonlyArray<FormatTarget>>> = {
  x: [RECAP_FORMATS['16x9'], RECAP_FORMATS['1x1']],
  linkedin: [RECAP_FORMATS['16x9'], RECAP_FORMATS['1x1']],
  instagram: [RECAP_FORMATS['1x1'], RECAP_FORMATS['4x5'], RECAP_FORMATS['9x16']],
};

/** Paper/ink/vermillion — the repo's motion-graphics identity. */
const PALETTE = {
  paper: '#f4ede0',
  ink: '#1a1a1a',
  accent: '#c8413a',
} as const;

/**
 * Same headline/caption semantics as DEFAULT_TEXT_SAFE_ZONES in
 * lib/agent/auto-mode.ts (private there): top strip reserved for a
 * headline overlay, bottom strip for a caption, both must survive
 * every crop.
 */
const TEXT_SAFE_ZONES: ReadonlyArray<SafeZone> = [
  {
    purpose: 'headline',
    bbox: { x: 0.05, y: 0.05, w: 0.9, h: 0.18 },
    mustSurviveAllCrops: true,
  },
  {
    purpose: 'caption',
    bbox: { x: 0.05, y: 0.78, w: 0.9, h: 0.17 },
    mustSurviveAllCrops: true,
  },
];

/**
 * Style directive sentences. Static template text carries no digits —
 * that's what makes the no-invented-numbers guarantee checkable.
 */
const STYLE_DIRECTIVES: Readonly<Record<RecapIllustrationStyle, ReadonlyArray<string>>> = {
  'doodle-sketchnote': [
    'hand-drawn ink doodle sketchnote with loose confident linework',
    'small vignettes connected by arrows, underlines and hand-lettered labels',
    'warm paper texture background, flat, no gradients and no drop shadows',
    'monochrome ink with a single restrained vermillion-red accent used once',
    'research-notebook mood: restraint over ornament, generous margins',
  ],
  'editorial-flat': [
    'flat editorial illustration with clean shapes and thin ink outlines',
    'warm paper background, flat colour fields, no gradients and no drop shadows',
    'muted ink tones with a single vermillion-red accent used once',
    'calm editorial composition with generous negative space',
  ],
};

const STYLE_LEAD: Readonly<Record<RecapIllustrationStyle, string>> = {
  'doodle-sketchnote': 'hand-drawn ink doodle sketchnote',
  'editorial-flat': 'flat editorial',
};

const PLATFORM_FRAMING: Readonly<Record<RecapPlatform, string>> = {
  x: 'Composed to read instantly in a fast social feed: one bold focal vignette, minimal clutter around it.',
  linkedin:
    'Composed as a professional event-recap poster: orderly clusters, calm spacing, quietly confident.',
  instagram:
    'Composed as a dense square-first grid of vignettes that rewards a closer look on a phone screen.',
};

const MAX_THEME_VIGNETTES = 4;

export function buildRecapIllustrationPlan(
  bundle: RecapIllustrationBundle,
  options: RecapIllustrationOptions = {}
): IllustrationSpec[] {
  if (!bundle.eventId || !bundle.eventName) {
    throw new Error('buildRecapIllustrationPlan: bundle needs eventId and eventName');
  }
  const style = options.style ?? 'doodle-sketchnote';
  const platforms = options.platforms ?? [...RECAP_PLATFORMS];
  return platforms.map((platform) => buildSpec(bundle, platform, style));
}

function buildSpec(
  bundle: RecapIllustrationBundle,
  platform: RecapPlatform,
  style: RecapIllustrationStyle
): IllustrationSpec {
  const themeLabels = (bundle.themes ?? [])
    .map((t) => t.label.trim())
    .filter((label) => label.length > 0);
  const vignettes = themeLabels.slice(0, MAX_THEME_VIGNETTES);
  const styleDirectives = [...STYLE_DIRECTIVES[style]];
  const { statLines, numbersUsed } = describeStats(bundle.stats, style);
  const quote = pickQuote(bundle.quotes);

  const lines: string[] = [];
  lines.push(
    `A ${STYLE_LEAD[style]} recap illustration of "${bundle.eventName}", drawn as if by an attendee summarising the event.`
  );
  if (vignettes.length > 0) {
    lines.push(
      `Vignettes drawn from what the community actually talked about: ${vignettes.join('; ')}.`
    );
  }
  if (statLines.length > 0) {
    lines.push(`Hand-lettered stat callouts using only these real numbers: ${statLines.join(', ')}.`);
  }
  if (quote) {
    lines.push(
      `A ribbon banner carries the quote "${quote.text}"${quote.attribution ? ` — ${quote.attribution}` : ''}.`
    );
  }
  lines.push(PLATFORM_FRAMING[platform]);
  lines.push(`Style: ${styleDirectives.join('; ')}.`);
  lines.push(
    'Reserve clear negative space along the top edge for a headline overlay and along the bottom edge for a caption overlay; keep both bands free of drawing.'
  );
  lines.push(
    'Depict only what is listed above — no invented names, numbers, logos, venues or extra details.'
  );

  const formats = [...PLATFORM_FORMATS[platform]];
  const heroFormat = formats[0];

  return {
    platform,
    style,
    prompt: lines.join('\n'),
    styleDirectives,
    palette: { ...PALETTE },
    formats,
    heroFormat,
    heroAspect: FORMAT_ASPECT[heroFormat.id],
    safeZones: TEXT_SAFE_ZONES.map((zone) => ({ ...zone, bbox: { ...zone.bbox } })),
    captionSeed: buildCaptionSeed(bundle, platform, themeLabels, numbersUsed),
    grounding: {
      eventName: bundle.eventName,
      themeLabels: vignettes,
      numbersUsed,
    },
  };
}

function describeStats(
  stats: RecapStats | undefined,
  style: RecapIllustrationStyle
): { statLines: string[]; numbersUsed: number[] } {
  const statLines: string[] = [];
  const numbersUsed: number[] = [];
  if (!stats) return { statLines, numbersUsed };
  const push = (value: number | undefined, phrase: (n: number) => string) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return;
    statLines.push(phrase(value));
    numbersUsed.push(value);
  };
  push(stats.totalPosts, (n) => `${n} community posts`);
  push(stats.knownViews, (n) => `${n} observed views`);
  push(stats.knownLikes, (n) => `${n} observed likes`);
  // Keep the callout list tight for editorial-flat: posts + views only.
  if (style === 'editorial-flat' && statLines.length > 2) {
    const dropped = statLines.length - 2;
    statLines.splice(2, dropped);
    numbersUsed.splice(2, dropped);
  }
  return { statLines, numbersUsed };
}

function pickQuote(quotes: RecapQuote[] | undefined): RecapQuote | undefined {
  const first = quotes?.[0];
  if (!first || first.text.trim().length === 0) return undefined;
  return {
    text: first.text.replace(/\s+/g, ' ').trim(),
    attribution: first.attribution?.trim() || undefined,
  };
}

function buildCaptionSeed(
  bundle: RecapIllustrationBundle,
  platform: RecapPlatform,
  themeLabels: string[],
  numbersUsed: number[]
): string {
  const lead = themeLabels[0] ?? bundle.eventName;
  const second = themeLabels[1];
  switch (platform) {
    case 'x':
      return `${bundle.eventName}, sketched: ${lead}${second ? ` · ${second}` : ''}`;
    case 'linkedin': {
      const postCount = bundle.stats?.totalPosts;
      const prefix =
        typeof postCount === 'number' && numbersUsed.includes(postCount)
          ? `What ${postCount} community posts said about ${bundle.eventName}`
          : `What the community said about ${bundle.eventName}`;
      return `${prefix} — ${lead}${second ? `, ${second}` : ''}`;
    }
    case 'instagram':
      return `${lead} — one doodle recap of ${bundle.eventName}`;
  }
}

// ───────────────── public.json → planner facts ─────────────────

const MAX_QUOTE_CHARS = 160;

/**
 * Distil the public event-recap bundle (outputs/event-recap-<event>/public.json)
 * into the planner's fact shape. Defensive against missing sections;
 * throws only when the event identity itself is absent.
 *
 * - relevant counts win over raw totals when both exist
 * - themes come back strongest-first (by their `score`)
 * - the standout quote is the highest-reach parent post whose text is
 *   short enough to letter into a ribbon
 */
export function toRecapIllustrationBundle(raw: unknown): RecapIllustrationBundle {
  const root = asRecord(raw);
  const eventId = typeof root.eventId === 'string' ? root.eventId : undefined;
  const eventName = typeof root.eventName === 'string' ? root.eventName : undefined;
  if (!eventId || !eventName) {
    throw new Error('toRecapIllustrationBundle: bundle is missing eventId/eventName');
  }

  const stats = asRecord(root.stats);
  const cross = asRecord(stats.crossSurfaceObserved);
  const byPlatform = numberRecord(stats.relevantByPlatform) ?? numberRecord(stats.byPlatform);

  const scoredThemes: Array<{ label: string; summary?: string; score: number }> = [];
  for (const entry of Array.isArray(root.themes) ? root.themes : []) {
    const theme = asRecord(entry);
    if (typeof theme.label !== 'string' || theme.label.length === 0) continue;
    scoredThemes.push({
      label: theme.label,
      summary: typeof theme.summary === 'string' ? theme.summary : undefined,
      score: typeof theme.score === 'number' ? theme.score : 0,
    });
  }
  scoredThemes.sort((a, b) => b.score - a.score);
  const themes = scoredThemes.map(({ label, summary }) => ({ label, summary }));

  return {
    eventId,
    eventName,
    stats: {
      totalPosts: finiteNumber(stats.relevantTotal) ?? finiteNumber(stats.total),
      postsByPlatform: byPlatform,
      knownViews: finiteNumber(cross.knownViews),
      knownLikes: finiteNumber(cross.knownLikes),
    },
    themes,
    quotes: pickStandoutQuote(root.posts),
  };
}

function pickStandoutQuote(posts: unknown): RecapQuote[] | undefined {
  if (!Array.isArray(posts)) return undefined;
  let best: { quote: RecapQuote; reach: number } | undefined;
  for (const entry of posts) {
    const post = asRecord(entry);
    if (post.rowType !== 'parent') continue;
    // Links aren't letterable quote content — drop them before measuring.
    const text =
      typeof post.text === 'string'
        ? post.text.replace(/https?:\/\/\S+/g, ' ').replace(/\s+/g, ' ').trim()
        : '';
    if (text.length === 0 || text.length > MAX_QUOTE_CHARS) continue;
    const reach = finiteNumber(post.reachScore) ?? 0;
    if (best && reach <= best.reach) continue;
    best = {
      quote: {
        text,
        attribution: typeof post.authorName === 'string' ? post.authorName : undefined,
      },
      reach,
    };
  }
  return best ? [best.quote] : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function finiteNumber(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

function numberRecord(value: unknown): Record<string, number> | undefined {
  const record = asRecord(value);
  const out: Record<string, number> = {};
  let any = false;
  for (const [key, v] of Object.entries(record)) {
    const n = finiteNumber(v);
    if (n === undefined) continue;
    out[key] = n;
    any = true;
  }
  return any ? out : undefined;
}

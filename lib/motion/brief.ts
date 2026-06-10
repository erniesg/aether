import type { EventPost, EventTheme } from '@/lib/research/event-recap/types';

/**
 * MotionBrief — the data contract between workspace material and motion
 * compositions (design: docs/DESIGN-SOCIAL-CANVAS.md §3). Builders assemble
 * a brief from either a recap bundle (events / brands / products / topics
 * all arrive theme+post shaped) or straight brand context; the compiler
 * turns it into a renderable HyperFrames composition.
 */

export interface MotionQuote {
  text: string;
  who: string;
  ctx: string;
  /** Optional word the slam technique emphasises. */
  accentWord?: string;
}

export interface MotionPalette {
  paper: string;
  ink: string;
  graphite: string;
  accent: string;
}

export interface MotionBrief {
  id: string;
  title: string;
  footerLeft: string;
  footerRight: string;
  quotes: MotionQuote[];
  palette?: MotionPalette;
}

const DEFAULT_MAX_QUOTES = 3;
const MAX_QUOTE_CHARS = 120;

/** First sentence of a post, capped — motion type wants one beat per scene. */
function quotableText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const sentenceEnd = trimmed.search(/[.!?](\s|$)/);
  const sentence =
    sentenceEnd >= 0 ? trimmed.slice(0, sentenceEnd + 1) : trimmed;
  if (sentence.length <= MAX_QUOTE_CHARS) return sentence;
  return `${sentence.slice(0, MAX_QUOTE_CHARS - 1).trimEnd()}…`;
}

export interface RecapBriefInput {
  eventName: string;
  themes: ReadonlyArray<EventTheme>;
  posts: ReadonlyArray<EventPost>;
}

export function briefFromRecap(
  input: RecapBriefInput,
  opts: { maxQuotes?: number; id?: string } = {}
): MotionBrief {
  const maxQuotes = opts.maxQuotes ?? DEFAULT_MAX_QUOTES;
  const themeByPostId = new Map<string, EventTheme>();
  for (const theme of input.themes) {
    for (const postId of theme.postIds) {
      if (!themeByPostId.has(postId)) themeByPostId.set(postId, theme);
    }
  }

  const quotes: MotionQuote[] = [];
  const ranked = [...input.posts].sort((a, b) => b.reachScore - a.reachScore);
  for (const post of ranked) {
    if (quotes.length >= maxQuotes) break;
    const text = quotableText(post.text);
    if (!text) continue;
    const theme = themeByPostId.get(post.postId);
    quotes.push({
      text,
      who: post.authorHandle ?? post.authorName,
      ctx: theme ? `${post.platform} · ${theme.label}` : post.platform,
    });
  }

  return {
    id: opts.id ?? `recap-${input.themes[0]?.eventId ?? 'event'}-quotes`,
    title: 'heard on the floor',
    footerLeft: '↳ heard on the floor',
    footerRight: input.eventName,
    quotes,
  };
}

export interface BrandBriefInput {
  name: string;
  voice?: string;
  claims: ReadonlyArray<string>;
  palette?: MotionPalette;
}

export function briefFromBrand(
  input: BrandBriefInput,
  opts: { maxQuotes?: number; id?: string } = {}
): MotionBrief {
  const maxQuotes = opts.maxQuotes ?? DEFAULT_MAX_QUOTES;
  const quotes: MotionQuote[] = input.claims
    .map((claim) => quotableText(claim))
    .filter((text) => text.length > 0)
    .slice(0, maxQuotes)
    .map((text) => ({
      text,
      who: input.name,
      ctx: input.voice ? `brand voice · ${input.voice}` : 'brand voice',
    }));

  return {
    id: opts.id ?? `brand-${input.name.toLowerCase().replace(/\s+/g, '-')}-quotes`,
    title: input.name,
    footerLeft: `↳ ${input.name}`,
    footerRight: input.name,
    quotes,
    palette: input.palette,
  };
}

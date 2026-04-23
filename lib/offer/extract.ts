import type {
  OfferHeroImage,
  OfferPriceTier,
  OfferRawExtract,
} from './types';
import { emptyOfferRawExtract } from './types';

/**
 * Strip markdown markers from a paragraph. Uses two anchored passes so
 * compound-word hyphens (e.g. `golden-hour`) survive — the inline class
 * deliberately excludes `-`. See hardening note in issue #22.
 */
function cleanProseLine(raw: string): string {
  return raw
    .replace(/^\s*[-*+>#]+\s*/gm, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function resolveUrl(candidate: string, base?: string): string {
  if (!base) return candidate;
  try {
    return new URL(candidate, base).toString();
  } catch {
    return candidate;
  }
}

function dedupeKeepOrder<T>(arr: T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const v of arr) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

/** Scrape `<meta>` content attributes by name or property. */
function metaContent(html: string, attr: 'name' | 'property', key: string): string | undefined {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `<meta\\s+[^>]*${attr}=["']${escapedKey}["'][^>]*content=["']([^"']+)["']`,
    'i'
  );
  const match = re.exec(html);
  return match?.[1];
}

/**
 * Pick up short declarative phrases that look like USPs / product claims.
 * Claim = a line 12–140 chars with no inline HTML left and at least one
 * verb-looking word or punctuation cue.
 */
export function extractClaimsFromHtml(html: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const line = cleanProseLine(raw);
    if (line.length < 12 || line.length > 160) return;
    const key = line.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(line);
  };

  // <ul><li> inside the body — product pages put USPs here.
  const listItemRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  for (const match of html.matchAll(listItemRe)) {
    const text = decodeHtmlEntities((match[1] ?? '').replace(/<[^>]+>/g, ''));
    push(text);
    if (out.length >= 12) break;
  }

  // H2 / H3 sub-headers often carry value-prop lines.
  const headerRe = /<(h2|h3)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  for (const match of html.matchAll(headerRe)) {
    const text = decodeHtmlEntities((match[2] ?? '').replace(/<[^>]+>/g, ''));
    push(text);
    if (out.length >= 14) break;
  }

  return out;
}

/** Testimonials + stat lines inside `<blockquote>` / `<cite>` blocks. */
export function extractProofFromHtml(html: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const line = cleanProseLine(raw);
    if (line.length < 10 || line.length > 280) return;
    const key = line.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(line);
  };

  const quoteRe = /<(blockquote|cite)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  for (const match of html.matchAll(quoteRe)) {
    const text = decodeHtmlEntities((match[2] ?? '').replace(/<[^>]+>/g, ''));
    push(text);
    if (out.length >= 6) break;
  }
  // Inline stat badges: `4.8★`, `10,000+ creators`, etc. Short + number.
  const statRe = /\b\d[\d,.\s]*(?:%|\+|★|\s?(?:stars?|users?|creators?|reviews?|customers?))\b[^<.]{0,80}/gi;
  for (const match of html.matchAll(statRe)) {
    push(match[0]);
    if (out.length >= 10) break;
  }
  return out;
}

/** Extract `price`, `offers`, `priceCurrency` from HTML content — best-effort. */
export function extractPriceTiersFromHtml(html: string): OfferPriceTier[] {
  const tiers: OfferPriceTier[] = [];
  const seen = new Set<string>();

  // Product schema.org offers: `"price": "29.00", "priceCurrency": "USD"`.
  const jsonLdBlocks = [...html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )].map((m) => m[1] ?? '');
  for (const block of jsonLdBlocks) {
    try {
      const parsed: unknown = JSON.parse(block.trim());
      collectOffersFromJsonLd(parsed, tiers, seen);
    } catch {
      // Skip malformed JSON-LD blocks quietly — best-effort parsing.
    }
  }

  // Prose prices — `$29/mo`, `€49`, `₱1,990 / year`. Longer alternatives first
  // so `/month` is preferred over `/mo`, etc.
  const proseRe = /([$€£¥₱]\s?\d[\d,.]{0,10})(?:\s?\/\s?(month|mo|year|yr|week|wk))?/gi;
  for (const match of html.matchAll(proseRe)) {
    const price = match[1]?.trim() ?? '';
    if (!price) continue;
    const period = match[2]?.toLowerCase();
    const key = `${price}|${period ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tiers.push(period ? { label: price, price, period } : { label: price, price });
    if (tiers.length >= 6) break;
  }
  return tiers;
}

function collectOffersFromJsonLd(
  node: unknown,
  out: OfferPriceTier[],
  seen: Set<string>
): void {
  if (Array.isArray(node)) {
    for (const n of node) collectOffersFromJsonLd(n, out, seen);
    return;
  }
  if (!node || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  const graph = obj['@graph'];
  if (Array.isArray(graph)) collectOffersFromJsonLd(graph, out, seen);
  const offers = obj.offers;
  if (offers) collectOffersFromJsonLd(offers, out, seen);

  const rawPrice = obj.price ?? obj.lowPrice ?? obj.highPrice;
  const currency = typeof obj.priceCurrency === 'string' ? obj.priceCurrency : '';
  if (rawPrice !== undefined && rawPrice !== null) {
    const priceStr = String(rawPrice).trim();
    if (priceStr) {
      const label = typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : priceStr;
      const price = currency ? `${currency} ${priceStr}` : priceStr;
      const key = `${label}|${price}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ label, price });
      }
    }
  }
}

/**
 * Parse schema.org Product / Offer JSON-LD for name, tagline, hero imagery,
 * and launch window (validFrom / validThrough).
 */
export function extractJsonLdOffer(html: string): Partial<OfferRawExtract> {
  const out: Partial<OfferRawExtract> = {};
  const blocks = [...html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )].map((m) => m[1] ?? '');
  for (const block of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block.trim());
    } catch {
      continue;
    }
    walkJsonLd(parsed, out);
  }
  return out;
}

function walkJsonLd(node: unknown, out: Partial<OfferRawExtract>): void {
  if (Array.isArray(node)) {
    for (const n of node) walkJsonLd(n, out);
    return;
  }
  if (!node || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  const graph = obj['@graph'];
  if (Array.isArray(graph)) walkJsonLd(graph, out);

  const type = obj['@type'];
  const typeStr = Array.isArray(type) ? type.join(',') : typeof type === 'string' ? type : '';
  if (/Product|Offer|Service/i.test(typeStr)) {
    if (!out.name && typeof obj.name === 'string' && obj.name.trim()) {
      out.name = obj.name.trim();
    }
    if (!out.tagline && typeof obj.description === 'string' && obj.description.trim()) {
      out.tagline = obj.description.trim();
    }
    const images = obj.image;
    const heroCandidates: Array<{ url: string; alt?: string }> = [];
    if (typeof images === 'string' && images.trim()) {
      heroCandidates.push({ url: images.trim() });
    } else if (Array.isArray(images)) {
      for (const img of images) {
        if (typeof img === 'string' && img.trim()) heroCandidates.push({ url: img.trim() });
      }
    }
    if (heroCandidates.length > 0) {
      out.heroImageCandidates = [...(out.heroImageCandidates ?? []), ...heroCandidates];
    }

    const offers = obj.offers;
    const fromObj = offers && !Array.isArray(offers) && typeof offers === 'object'
      ? (offers as Record<string, unknown>)
      : null;
    const startAt = typeof obj.validFrom === 'string' ? obj.validFrom :
      fromObj && typeof fromObj.validFrom === 'string' ? fromObj.validFrom : undefined;
    const endAt = typeof obj.validThrough === 'string' ? obj.validThrough :
      fromObj && typeof fromObj.validThrough === 'string' ? fromObj.validThrough : undefined;
    if ((startAt || endAt) && !out.launchWindow) {
      out.launchWindow = {
        ...(startAt ? { startAt } : {}),
        ...(endAt ? { endAt } : {}),
      };
    }
  }
}

/** Extract hero image candidates from `<img>` / `<meta og:image>`. */
export function extractHeroImagesFromHtml(
  html: string,
  baseUrl?: string
): OfferHeroImage[] {
  const out: OfferHeroImage[] = [];
  const seen = new Set<string>();
  const push = (url: string, alt?: string) => {
    const resolved = resolveUrl(url, baseUrl);
    if (seen.has(resolved)) return;
    seen.add(resolved);
    out.push(alt ? { url: resolved, alt } : { url: resolved });
  };

  const og = metaContent(html, 'property', 'og:image');
  if (og) push(og);
  const twitter = metaContent(html, 'name', 'twitter:image');
  if (twitter) push(twitter);

  const imgRe = /<img\b([^>]*)>/gi;
  for (const match of html.matchAll(imgRe)) {
    const attrs = match[1] ?? '';
    const src = /\bsrc=["']([^"']+)["']/i.exec(attrs)?.[1];
    const alt = /\balt=["']([^"']*)["']/i.exec(attrs)?.[1];
    if (!src) continue;
    const lowered = `${alt ?? ''} ${src}`.toLowerCase();
    // Skip obvious logos / icons / trackers.
    if (lowered.includes('logo') || lowered.includes('icon') || lowered.includes('pixel')) continue;
    push(src, alt?.trim() ? alt : undefined);
    if (out.length >= 8) break;
  }
  return out;
}

/** Parse an HTML page string into a raw offer extract. */
export function extractFromHtml(html: string, baseUrl?: string): OfferRawExtract {
  const out = emptyOfferRawExtract();

  const jsonLd = extractJsonLdOffer(html);
  if (jsonLd.name) out.name = jsonLd.name;
  if (jsonLd.tagline) out.tagline = jsonLd.tagline;
  if (jsonLd.launchWindow) out.launchWindow = jsonLd.launchWindow;
  if (jsonLd.heroImageCandidates) out.heroImageCandidates.push(...jsonLd.heroImageCandidates);

  if (!out.name) {
    const ogTitle = metaContent(html, 'property', 'og:title');
    const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
    const name = (ogTitle ?? title ?? '').replace(/\s+/g, ' ').trim();
    if (name) out.name = name;
  }
  if (!out.tagline) {
    const description = metaContent(html, 'name', 'description') ??
      metaContent(html, 'property', 'og:description');
    if (description) out.tagline = description.trim();
  }

  out.claims = extractClaimsFromHtml(html);
  out.proofCandidates = extractProofFromHtml(html);
  out.priceCandidates = extractPriceTiersFromHtml(html);

  const heroes = extractHeroImagesFromHtml(html, baseUrl);
  for (const hero of heroes) {
    if (out.heroImageCandidates.some((h) => h.url === hero.url)) continue;
    out.heroImageCandidates.push(hero);
  }

  if (out.name) out.contextLines.push(`title: ${out.name}`);
  if (out.tagline) out.contextLines.push(`description: ${out.tagline}`);
  return out;
}

/**
 * Files payload: plain-text excerpts + pre-resolved image refs. Plain-text
 * bundles (Notion / Docs paste) need their own claim / price regex — don't
 * try to reuse HTML-only extractors on them.
 */
export function extractFromFiles(payload: {
  texts?: string[];
  images?: Array<{ url: string; alt?: string }>;
}): OfferRawExtract {
  const out = emptyOfferRawExtract();
  const texts = (payload.texts ?? []).filter((t) => typeof t === 'string' && t.trim() !== '');
  const joined = texts.join('\n');

  // Name / tagline heuristic: Markdown H1 line, else first non-empty line.
  const h1 = /^\s*#\s+(.+)$/m.exec(joined)?.[1];
  if (h1) out.name = cleanProseLine(h1);
  if (!out.name) {
    const firstLine = joined.split(/\n+/).map((s) => cleanProseLine(s)).find((s) => s.length > 0);
    if (firstLine) out.name = firstLine.slice(0, 120);
  }
  const taglineMatch = /^\s*(?:tagline|subtitle|headline)\s*[:=]\s*["']?([^"'\n]+)["']?\s*$/im.exec(joined);
  if (taglineMatch?.[1]) out.tagline = taglineMatch[1].trim();

  // Claims: bullet-style lines. Anchored stripping, hyphen preserved.
  const bulletRe = /^\s*[-*+•]\s+(.+)$/gm;
  const claimsOut: string[] = [];
  for (const match of joined.matchAll(bulletRe)) {
    const line = cleanProseLine(match[1] ?? '');
    if (line.length >= 6 && line.length <= 160) claimsOut.push(line);
    if (claimsOut.length >= 12) break;
  }
  out.claims = dedupeKeepOrder(claimsOut);

  // Proof: `"…"` quoted testimonials + stat-y lines.
  const quoteRe = /"([^"\n]{10,240})"|“([^”\n]{10,240})”/g;
  const proofOut: string[] = [];
  for (const match of joined.matchAll(quoteRe)) {
    const body = (match[1] ?? match[2] ?? '').trim();
    if (body) proofOut.push(body);
    if (proofOut.length >= 6) break;
  }
  out.proofCandidates = dedupeKeepOrder(proofOut);

  // Prices: plain-text prices (re-use HTML regex, it is currency-symbol based).
  out.priceCandidates = extractPriceTiersFromHtml(joined);

  // Launch window: `Launches Apr 30 2026`, `startAt: 2026-04-30`.
  const isoStart = /\b(?:start(?:At)?|launches?)\s*[:=]?\s*(\d{4}-\d{2}-\d{2})/i.exec(joined)?.[1];
  const isoEnd = /\b(?:end(?:At)?|closes?)\s*[:=]?\s*(\d{4}-\d{2}-\d{2})/i.exec(joined)?.[1];
  if (isoStart || isoEnd) {
    out.launchWindow = {
      ...(isoStart ? { startAt: isoStart } : {}),
      ...(isoEnd ? { endAt: isoEnd } : {}),
    };
  }

  for (const img of payload.images ?? []) {
    if (!img?.url) continue;
    const tag = `${img.alt ?? ''} ${img.url}`.toLowerCase();
    if (tag.includes('logo') || tag.includes('icon') || tag.includes('pixel')) continue;
    out.heroImageCandidates.push({ url: img.url, ...(img.alt ? { alt: img.alt } : {}) });
  }

  return out;
}

/**
 * Clipboard payload: rich-text HTML, plain-text, or a single URL. We prefer
 * HTML when present (product pages tend to copy with markup), fall through
 * to the plain-text file path, and surface the `url` field so the caller
 * can recognise a single-URL paste and re-route it through the URL mode.
 */
export function extractFromClipboard(payload: {
  html?: string;
  text?: string;
  url?: string;
}): OfferRawExtract {
  if (payload.html && payload.html.trim()) {
    return extractFromHtml(payload.html);
  }
  if (payload.text && payload.text.trim()) {
    return extractFromFiles({ texts: [payload.text] });
  }
  return emptyOfferRawExtract();
}

const URL_ONLY_RE = /^https?:\/\/\S+$/i;

/** Detect a clipboard payload that is really just a single URL. */
export function clipboardUrl(payload: {
  html?: string;
  text?: string;
  url?: string;
}): string | null {
  if (payload.url && URL_ONLY_RE.test(payload.url.trim())) return payload.url.trim();
  if (payload.text && URL_ONLY_RE.test(payload.text.trim())) return payload.text.trim();
  return null;
}

/**
 * URL ingestion (multimodal trigger v1).
 *
 * Fetches a public URL and extracts the bits the auto-mode pipeline needs to
 * make sense of it: page title, meta description, OpenGraph hero image, all
 * `<img>` candidates ranked by likely importance, and any Schema.org/JSON-LD
 * product data. Pure HTTP — no headless browser. JS-rendered SPAs may miss
 * lazy-loaded imagery, but the OG hero + structured data + initial DOM is
 * usually enough for a useful campaign brief.
 *
 * Used by auto-mode when `trigger.kind === 'url'` so the agent gets:
 *   - a richer text trigger (title + description woven into the prompt)
 *   - one or more reference images (the OG hero is the primary; large
 *     <img> tags supplement)
 *
 * Same module will back PDF/image ingestion in v2 (route `kind === 'file'`
 * by mime sniff).
 */

import { JSDOM } from 'jsdom';

export interface IngestedImage {
  url: string;
  alt?: string;
  /** Origin signal: the OG hero is the most reliable; large body <img>
   *  tags second; explicit srcset/main fallback. */
  source: 'og-image' | 'twitter-image' | 'json-ld' | 'img-tag';
  /** Pixel dims when the page declared them. Used to rank candidates. */
  width?: number;
  height?: number;
}

export interface IngestedProduct {
  name: string;
  description?: string;
  brand?: string;
  offers?: {
    price?: number;
    currency?: string;
  };
  /** Raw schema.org type ("Product", "MattressBox", etc.). */
  schemaType?: string;
}

export interface BrandPalette {
  /** Mapped from --brand-primary / --primary / --color-primary / --colour-primary */
  primary?: string;
  /** Mapped from --secondary / --color-secondary / --brand-secondary */
  secondary?: string;
  /** Mapped from --accent / --color-accent */
  accent?: string;
  /** Mapped from --background / --bg / --color-background */
  background?: string;
  /** Mapped from --foreground / --fg / --color-foreground */
  foreground?: string;
  /** All extracted hex colors, de-duped, ordered by occurrence frequency. Max 12. */
  all: string[];
}

export interface IngestedLogo {
  url: string;
  source: 'apple-touch-icon' | 'icon-svg' | 'og-logo' | 'header-img' | 'favicon';
  mime?: string;
  width?: number;
  height?: number;
}

export interface UrlIngestion {
  url: string;
  finalUrl: string;
  title: string;
  description: string;
  /** Highest-priority hero image — the OG image when present. */
  primaryImage?: IngestedImage;
  /** All candidate images (primary first, then ranked body images). */
  images: IngestedImage[];
  /** Schema.org Product data extracted from <script type="application/ld+json">. */
  products: IngestedProduct[];
  /** Useful body text (h1/h2 + first paragraph) — feeds the agent prompt. */
  bodyExcerpt: string;
  fetchedAt: string;
  rawHtmlBytes: number;
  /** Brand color palette from :root CSS tokens and inline element styles. */
  brandPalette?: BrandPalette;
  /** Typefaces detected from Google Fonts links and font-family declarations. Max 6. */
  fonts?: string[];
  /** Most likely site logo, preferring high-DPI + transparent sources. */
  logo?: IngestedLogo;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const MAX_IMAGES = 12;
const MIN_IMAGE_DIM = 200;

export interface FetchUrlIngestionOptions {
  timeoutMs?: number;
  userAgent?: string;
  /** Override for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export async function fetchUrlIngestion(
  url: string,
  opts: FetchUrlIngestionOptions = {}
): Promise<UrlIngestion> {
  const fetchFn = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );

  let response: Response;
  try {
    response = await fetchFn(url, {
      method: 'GET',
      headers: {
        'User-Agent': opts.userAgent ?? DEFAULT_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(`url ingest: ${url} → HTTP ${response.status}`);
  }

  const html = await response.text();
  return parseHtmlIngestion(html, {
    requestedUrl: url,
    finalUrl: response.url || url,
  });
}

export interface ParseHtmlIngestionInput {
  requestedUrl: string;
  finalUrl: string;
}

export function parseHtmlIngestion(
  html: string,
  input: ParseHtmlIngestionInput
): UrlIngestion {
  const dom = new JSDOM(html, { url: input.finalUrl });
  const doc = dom.window.document;

  const title = textContent(doc.querySelector('title')) || metaContent(doc, 'og:title') || '';
  const description =
    metaContent(doc, 'og:description') ||
    metaContent(doc, 'description', { byName: true }) ||
    metaContent(doc, 'twitter:description') ||
    '';

  const ogImage = collectOgImage(doc);
  const twitterImage = collectTwitterImage(doc);
  const ldProducts = collectJsonLdProducts(doc);
  const ldImages = ldProducts.flatMap((p) => p.images);
  const bodyImages = collectBodyImages(doc, input.finalUrl);

  const all: IngestedImage[] = [];
  if (ogImage) all.push(ogImage);
  if (twitterImage && twitterImage.url !== ogImage?.url) all.push(twitterImage);
  for (const img of ldImages) {
    if (!all.some((existing) => existing.url === img.url)) all.push(img);
  }
  for (const img of bodyImages) {
    if (!all.some((existing) => existing.url === img.url)) {
      all.push(img);
      if (all.length >= MAX_IMAGES) break;
    }
  }

  const bodyExcerpt = collectBodyExcerpt(doc);
  const brandPalette = extractBrandPalette(doc, input.finalUrl);
  const fonts = extractFonts(doc);
  const logo = extractLogo(doc, input.finalUrl);

  return {
    url: input.requestedUrl,
    finalUrl: input.finalUrl,
    title: title.trim(),
    description: description.trim(),
    primaryImage: all[0],
    images: all.slice(0, MAX_IMAGES),
    products: ldProducts.map((p) => ({
      name: p.name,
      description: p.description,
      brand: p.brand,
      offers: p.offers,
      schemaType: p.schemaType,
    })),
    bodyExcerpt,
    fetchedAt: new Date().toISOString(),
    rawHtmlBytes: html.length,
    brandPalette,
    fonts,
    logo,
  };
}

function textContent(el: Element | null): string {
  return el?.textContent?.trim() ?? '';
}

function metaContent(
  doc: Document,
  key: string,
  opts: { byName?: boolean } = {}
): string {
  const selector = opts.byName
    ? `meta[name="${key}"]`
    : `meta[property="${key}"]`;
  const el = doc.querySelector(selector);
  const v = el?.getAttribute('content');
  return v ? v.trim() : '';
}

function collectOgImage(doc: Document): IngestedImage | undefined {
  const url = metaContent(doc, 'og:image') || metaContent(doc, 'og:image:secure_url');
  if (!url) return undefined;
  const w = Number(metaContent(doc, 'og:image:width')) || undefined;
  const h = Number(metaContent(doc, 'og:image:height')) || undefined;
  return { url, source: 'og-image', width: w, height: h };
}

function collectTwitterImage(doc: Document): IngestedImage | undefined {
  const url = metaContent(doc, 'twitter:image', { byName: true });
  if (!url) return undefined;
  return { url, source: 'twitter-image' };
}

interface LdProductRaw {
  name: string;
  description?: string;
  brand?: string;
  schemaType?: string;
  offers?: { price?: number; currency?: string };
  images: IngestedImage[];
}

function collectJsonLdProducts(doc: Document): LdProductRaw[] {
  const blocks = Array.from(
    doc.querySelectorAll('script[type="application/ld+json"]')
  );
  const out: LdProductRaw[] = [];
  for (const block of blocks) {
    const text = block.textContent;
    if (!text) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      continue;
    }
    const candidates = Array.isArray(parsed) ? parsed : [parsed];
    for (const c of candidates) flattenLdCandidate(c, out);
  }
  return out;
}

function flattenLdCandidate(value: unknown, out: LdProductRaw[]): void {
  if (!value || typeof value !== 'object') return;
  const o = value as Record<string, unknown>;
  // @graph wraps a list of nodes inside one ld+json block.
  if (Array.isArray(o['@graph'])) {
    for (const item of o['@graph']) flattenLdCandidate(item, out);
    return;
  }
  const t = typeof o['@type'] === 'string' ? (o['@type'] as string) : undefined;
  if (!t) return;
  if (!t.toLowerCase().includes('product')) return;
  const name = typeof o.name === 'string' ? o.name : '';
  if (!name) return;
  const description = typeof o.description === 'string' ? o.description : undefined;
  const brand =
    typeof o.brand === 'object' && o.brand !== null
      ? (o.brand as Record<string, unknown>).name
      : typeof o.brand === 'string'
        ? o.brand
        : undefined;
  const offer = pickFirstOffer(o.offers);
  const images = pickLdImages(o.image);
  out.push({
    name,
    description,
    brand: typeof brand === 'string' ? brand : undefined,
    schemaType: t,
    offers: offer,
    images,
  });
}

function pickFirstOffer(value: unknown): { price?: number; currency?: string } | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || typeof candidate !== 'object') return undefined;
  const o = candidate as Record<string, unknown>;
  const priceRaw = o.price ?? o.lowPrice;
  const price =
    typeof priceRaw === 'number'
      ? priceRaw
      : typeof priceRaw === 'string' && Number.isFinite(Number(priceRaw))
        ? Number(priceRaw)
        : undefined;
  const currency =
    typeof o.priceCurrency === 'string' ? (o.priceCurrency as string) : undefined;
  if (price === undefined && !currency) return undefined;
  return { price, currency };
}

function pickLdImages(value: unknown): IngestedImage[] {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  const out: IngestedImage[] = [];
  for (const item of list) {
    if (typeof item === 'string') {
      out.push({ url: item, source: 'json-ld' });
    } else if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      const url = typeof o.url === 'string' ? o.url : typeof o['@id'] === 'string' ? o['@id'] : '';
      if (!url) continue;
      const w = typeof o.width === 'number' ? o.width : undefined;
      const h = typeof o.height === 'number' ? o.height : undefined;
      out.push({ url, source: 'json-ld', width: w, height: h });
    }
  }
  return out;
}

function collectBodyImages(doc: Document, baseUrl: string): IngestedImage[] {
  const imgs = Array.from(doc.querySelectorAll('img'));
  const out: IngestedImage[] = [];
  for (const img of imgs) {
    // Prefer srcset's largest entry when present — that's typically the
    // hi-res CDN URL while src is a placeholder or lazy-load default.
    const srcsetLargest = pickFromSrcset(img.getAttribute('srcset'));
    const src =
      srcsetLargest ||
      img.getAttribute('src') ||
      img.getAttribute('data-src');
    if (!src) continue;
    const absolute = absolutize(src, baseUrl);
    if (!absolute) continue;
    if (
      absolute.endsWith('.svg') ||
      absolute.startsWith('data:') ||
      /icon|logo|sprite|placeholder/i.test(absolute)
    ) {
      continue;
    }
    const w = parsePixelAttr(img.getAttribute('width'));
    const h = parsePixelAttr(img.getAttribute('height'));
    // Drop tiny images outright — usually icons / pixel trackers.
    if ((w !== undefined && w < MIN_IMAGE_DIM) || (h !== undefined && h < MIN_IMAGE_DIM)) {
      continue;
    }
    const alt = img.getAttribute('alt')?.trim() || undefined;
    out.push({ url: absolute, alt, source: 'img-tag', width: w, height: h });
  }
  // De-dupe + rank — biggest declared dims first; unknown dims at the end.
  const seen = new Set<string>();
  const ranked: IngestedImage[] = [];
  for (const img of out.sort((a, b) => area(b) - area(a))) {
    if (seen.has(img.url)) continue;
    seen.add(img.url);
    ranked.push(img);
    if (ranked.length >= MAX_IMAGES) break;
  }
  return ranked;
}

function pickFromSrcset(srcset: string | null): string | null {
  if (!srcset) return null;
  // Pick the largest entry by descriptor — simple parse, not a full grammar.
  const entries = srcset.split(',').map((s) => s.trim()).filter(Boolean);
  let bestUrl = '';
  let bestSize = -1;
  for (const entry of entries) {
    const [u, descriptor] = entry.split(/\s+/);
    if (!u) continue;
    const sizeStr = descriptor?.replace(/[^\d.]/g, '') ?? '';
    const size = Number(sizeStr) || 0;
    if (size >= bestSize) {
      bestSize = size;
      bestUrl = u;
    }
  }
  return bestUrl || null;
}

function absolutize(src: string, baseUrl: string): string | null {
  try {
    return new URL(src, baseUrl).toString();
  } catch {
    return null;
  }
}

function parsePixelAttr(v: string | null): number | undefined {
  if (!v) return undefined;
  const n = Number(v.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function area(img: IngestedImage): number {
  if (img.width && img.height) return img.width * img.height;
  if (img.width) return img.width * img.width;
  return 0;
}

// ---------------------------------------------------------------------------
// Brand palette extractor
// ---------------------------------------------------------------------------

/** Hex color regex: matches #rgb, #rrggbb, #rgba, #rrggbbaa (case-insensitive). */
const HEX_COLOR_RE = /#[0-9a-fA-F]{3,8}\b/g;

/** Maps a CSS custom-property name to a BrandPalette field. */
const TOKEN_FIELD_MAP: Record<string, keyof Omit<BrandPalette, 'all'>> = {
  // primary
  '--primary': 'primary',
  '--brand-primary': 'primary',
  '--color-primary': 'primary',
  '--colour-primary': 'primary',
  // secondary
  '--secondary': 'secondary',
  '--brand-secondary': 'secondary',
  '--color-secondary': 'secondary',
  '--colour-secondary': 'secondary',
  // accent
  '--accent': 'accent',
  '--color-accent': 'accent',
  '--colour-accent': 'accent',
  // background
  '--background': 'background',
  '--bg': 'background',
  '--color-background': 'background',
  '--colour-background': 'background',
  '--brand-background': 'background',
  // foreground
  '--foreground': 'foreground',
  '--fg': 'foreground',
  '--color-foreground': 'foreground',
  '--colour-foreground': 'foreground',
  '--brand-foreground': 'foreground',
};

function extractBrandPalette(doc: Document, baseUrl: string): BrandPalette | undefined {
  // Frequency map across all sources
  const freq = new Map<string, number>();

  const bump = (hex: string) => {
    const normalized = hex.toLowerCase();
    freq.set(normalized, (freq.get(normalized) ?? 0) + 1);
  };

  // --- Source 1: :root custom properties in <style> blocks ---
  const styleTags = Array.from(doc.querySelectorAll('style'));
  const namedTokens: Partial<Record<keyof Omit<BrandPalette, 'all'>, string>> = {};

  for (const style of styleTags) {
    const css = style.textContent ?? '';
    // Find :root { ... } blocks — simple scan (not a full CSS parser).
    const rootMatch = css.match(/:root\s*\{([^}]*)\}/s);
    if (rootMatch) {
      const block = rootMatch[1];
      // Each declaration: --token-name: value;
      const declRe = /(--[\w-]+)\s*:\s*([^;]+);/g;
      let m: RegExpExecArray | null;
      while ((m = declRe.exec(block)) !== null) {
        const tokenName = m[1].trim();
        const value = m[2].trim();
        const hexMatch = value.match(/^#[0-9a-fA-F]{3,8}$/);
        if (!hexMatch) continue;
        const hex = hexMatch[0].toLowerCase();
        // Map to palette field if known token
        const field = TOKEN_FIELD_MAP[tokenName];
        if (field && !namedTokens[field]) {
          namedTokens[field] = hex;
        }
        bump(hex);
      }
    }

    // --- Source 2: All font-family + color declarations anywhere in <style> ---
    // Collect all hex literals from non-:root declarations too
    const nonRootCss = css.replace(/:root\s*\{[^}]*\}/gs, '');
    const hexMatches = nonRootCss.match(HEX_COLOR_RE) ?? [];
    for (const hex of hexMatches) {
      bump(hex);
    }
  }

  // --- Source 3: Inline styles on <header>, <nav>, <button>, and their children ---
  const inlineEls = Array.from(
    doc.querySelectorAll('header, header *, nav, nav *, button, button *')
  );
  for (const el of inlineEls) {
    const style = el.getAttribute('style');
    if (!style) continue;
    const hexMatches = style.match(HEX_COLOR_RE) ?? [];
    for (const hex of hexMatches) {
      bump(hex);
    }
  }

  if (freq.size === 0 && Object.keys(namedTokens).length === 0) {
    return undefined;
  }

  // Sort by frequency descending, cap to 12
  const all = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([hex]) => hex);

  return {
    primary: namedTokens.primary,
    secondary: namedTokens.secondary,
    accent: namedTokens.accent,
    background: namedTokens.background,
    foreground: namedTokens.foreground,
    all,
  };
}

// ---------------------------------------------------------------------------
// Fonts extractor
// ---------------------------------------------------------------------------

const MAX_FONTS = 6;

function extractFonts(doc: Document): string[] | undefined {
  const seen = new Set<string>();
  const fonts: string[] = [];

  const addFont = (name: string) => {
    const clean = name.trim().replace(/^['"]|['"]$/g, '').replace(/\+/g, ' ');
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      fonts.push(clean);
    }
  };

  // --- Source 1: Google Fonts <link> tags ---
  const gfontLinks = Array.from(
    doc.querySelectorAll('link[rel="stylesheet"][href*="fonts.googleapis.com"]')
  );
  for (const link of gfontLinks) {
    const href = link.getAttribute('href') ?? '';
    try {
      const url = new URL(href);
      // Support both ?family= (single) and multiple &family= params
      const families = url.searchParams.getAll('family');
      for (const fam of families) {
        // family=Inter:wght@400;700  → "Inter"
        // family=Playfair+Display:ital → "Playfair Display"
        const base = fam.split(':')[0].split('@')[0];
        addFont(base);
        if (fonts.length >= MAX_FONTS) return fonts;
      }
    } catch {
      // Malformed URL — skip
    }
  }

  // --- Source 2: font-family declarations in <style> blocks ---
  const styleTags = Array.from(doc.querySelectorAll('style'));
  for (const style of styleTags) {
    const css = style.textContent ?? '';
    const fontFamilyRe = /font-family\s*:\s*([^;{}]+);/gi;
    let m: RegExpExecArray | null;
    while ((m = fontFamilyRe.exec(css)) !== null) {
      // Take the first comma-separated value, strip quotes and generic families
      const firstFamily = m[1].split(',')[0].trim().replace(/^['"]|['"]$/g, '');
      if (!firstFamily) continue;
      // Skip CSS variable references (var(--...)), generic keywords, and
      // anything that looks like a CSS selector fragment (contains { or })
      if (
        /^var\(/i.test(firstFamily) ||
        /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|inherit|initial|unset)$/i.test(firstFamily) ||
        /[{}]/.test(firstFamily)
      ) {
        continue;
      }
      addFont(firstFamily);
      if (fonts.length >= MAX_FONTS) return fonts;
    }
  }

  return fonts.length > 0 ? fonts : undefined;
}

// ---------------------------------------------------------------------------
// Logo extractor
// ---------------------------------------------------------------------------

/**
 * Returns the most-likely site logo in preference order:
 *   1. apple-touch-icon  (highest-DPI, often PNG with transparent bg)
 *   2. icon/svg          (vector = transparent by nature)
 *   3. og:logo meta      (explicit logo signal)
 *   4. header <img> with "logo" in alt/src
 *   5. rel="icon" (any)
 *   6. /favicon.ico fallback
 */
function extractLogo(doc: Document, finalUrl: string): IngestedLogo | undefined {
  // 1. apple-touch-icon
  const ati = doc.querySelector('link[rel~="apple-touch-icon"]');
  if (ati) {
    const href = ati.getAttribute('href');
    if (href) {
      const url = absolutize(href, finalUrl);
      if (url) return { url, source: 'apple-touch-icon' };
    }
  }

  // 2. SVG icon
  const svgIcon = doc.querySelector('link[rel="icon"][type="image/svg+xml"]');
  if (svgIcon) {
    const href = svgIcon.getAttribute('href');
    if (href) {
      const url = absolutize(href, finalUrl);
      if (url) return { url, source: 'icon-svg', mime: 'image/svg+xml' };
    }
  }

  // 3. og:logo meta
  const ogLogo =
    doc.querySelector('meta[property="og:logo"]')?.getAttribute('content') ?? '';
  if (ogLogo) {
    const url = absolutize(ogLogo, finalUrl);
    if (url) return { url, source: 'og-logo' };
  }

  // 4. header <img> with "logo" in alt or src
  const headerImgs = Array.from(doc.querySelectorAll('header img'));
  for (const img of headerImgs) {
    const alt = img.getAttribute('alt') ?? '';
    const src = img.getAttribute('src') ?? '';
    if (/logo/i.test(alt) || /logo/i.test(src)) {
      const url = absolutize(src, finalUrl);
      if (url) {
        const w = parsePixelAttr(img.getAttribute('width'));
        const h = parsePixelAttr(img.getAttribute('height'));
        return { url, source: 'header-img', width: w, height: h };
      }
    }
  }

  // 5. any rel="icon"
  const favicon = doc.querySelector('link[rel="icon"]');
  if (favicon) {
    const href = favicon.getAttribute('href');
    if (href) {
      const url = absolutize(href, finalUrl);
      if (url) {
        const mime = favicon.getAttribute('type') ?? undefined;
        return { url, source: 'favicon', mime };
      }
    }
  }

  // 6. /favicon.ico fallback
  try {
    const base = new URL(finalUrl);
    return {
      url: `${base.protocol}//${base.host}/favicon.ico`,
      source: 'favicon',
    };
  } catch {
    return undefined;
  }
}

function collectBodyExcerpt(doc: Document): string {
  const lines: string[] = [];
  const h1 = doc.querySelector('h1');
  if (h1?.textContent) lines.push(h1.textContent.trim());
  const h2s = Array.from(doc.querySelectorAll('h2')).slice(0, 5);
  for (const h2 of h2s) {
    const t = h2.textContent?.trim();
    if (t) lines.push(t);
  }
  const firstP = doc.querySelector('p');
  if (firstP?.textContent) {
    const t = firstP.textContent.trim();
    if (t.length > 20) lines.push(t);
  }
  return lines.join('\n').slice(0, 1200);
}

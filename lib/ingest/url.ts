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

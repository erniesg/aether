/**
 * Minimal Open Graph + Twitter Card + oEmbed scraping helpers shared across
 * adapters. Regex-based on purpose — the hackathon scope doesn't justify a
 * full HTML parser, and social-share endpoints emit static OG tags that are
 * trivially grep-able.
 */

const USER_AGENT =
  'aether-reference-ingest/0.1 (+https://aether.berlayar.ai)';
const DEFAULT_TIMEOUT_MS = 10_000;

export interface OgTags {
  ogImage?: string;
  ogVideo?: string;
  ogType?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogSiteName?: string;
  twitterImage?: string;
  twitterPlayer?: string;
  author?: string;
  canonical?: string;
  title?: string;
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function findMeta(html: string, key: string, value: string): string | undefined {
  // Accept both attribute orders: <meta property="..." content="..."> or content-first.
  const re = new RegExp(
    `<meta\\s+[^>]*${key}=["']${value}["'][^>]*content=["']([^"']+)["']`,
    'i'
  );
  const m = re.exec(html);
  if (m?.[1]) return decode(m[1]);
  const re2 = new RegExp(
    `<meta\\s+[^>]*content=["']([^"']+)["'][^>]*${key}=["']${value}["']`,
    'i'
  );
  const m2 = re2.exec(html);
  return m2?.[1] ? decode(m2[1]) : undefined;
}

function findCanonical(html: string): string | undefined {
  const m = /<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i.exec(
    html
  );
  return m?.[1] ? decode(m[1]) : undefined;
}

function findTitle(html: string): string | undefined {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!m?.[1]) return undefined;
  return decode(m[1]).replace(/\s+/g, ' ').trim();
}

export function parseOgTags(html: string): OgTags {
  return {
    ogImage:
      findMeta(html, 'property', 'og:image:secure_url') ??
      findMeta(html, 'property', 'og:image') ??
      findMeta(html, 'name', 'og:image'),
    ogVideo:
      findMeta(html, 'property', 'og:video:secure_url') ??
      findMeta(html, 'property', 'og:video') ??
      findMeta(html, 'name', 'og:video'),
    ogType: findMeta(html, 'property', 'og:type'),
    ogTitle:
      findMeta(html, 'property', 'og:title') ??
      findMeta(html, 'name', 'og:title'),
    ogDescription:
      findMeta(html, 'property', 'og:description') ??
      findMeta(html, 'name', 'og:description'),
    ogSiteName: findMeta(html, 'property', 'og:site_name'),
    twitterImage:
      findMeta(html, 'name', 'twitter:image') ??
      findMeta(html, 'name', 'twitter:image:src'),
    twitterPlayer: findMeta(html, 'name', 'twitter:player'),
    author:
      findMeta(html, 'name', 'author') ??
      findMeta(html, 'property', 'article:author'),
    canonical: findCanonical(html),
    title: findTitle(html),
  };
}

export function pickPreviewImage(tags: OgTags): string | undefined {
  return tags.ogImage ?? tags.twitterImage;
}

/** Fetch an HTML page with a sane UA + timeout; throw with a user-facing message on failure. */
export async function fetchHtml(
  url: string,
  fetcher: typeof fetch = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetcher(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`fetch failed: ${res.status} ${res.statusText}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export function genReferenceId(prefix = 'ref'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

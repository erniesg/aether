/**
 * Header builders + theme parsing for embeddable event-recap workers.
 *
 * Used by the per-event Cloudflare Workers (workers/aie2026-vibes.ts +
 * future per-event templates) to:
 *  - allow third-party sites (ai.engineer/singapore etc) to iframe the
 *    recap with a frame-ancestors CSP allowlist
 *  - serve the data endpoint with CORS so JS on the embedding site can
 *    fetch the recap data directly
 *  - support a ?theme=dark|light toggle so the embed matches the host
 *    site's design (AIE site is dark; the standalone aether.berlayar.ai
 *    page can stay light)
 */

export type EmbedTheme = 'dark' | 'light';

export interface EmbedHeadersOptions {
  /** MIME type for the response body. */
  contentType: string;
  /** Cache-Control max-age in seconds. Defaults to 60 for HTML, 120 for data. */
  maxAge?: number;
  /**
   * Origins permitted to iframe this response via Content-Security-Policy
   * frame-ancestors. Pass [] or omit to skip the directive entirely.
   * "'self'" is always included automatically.
   */
  frameAncestors?: string[];
  /** When true, emits permissive CORS headers for cross-origin data fetches. */
  cors?: boolean;
}

export function buildEmbedHeaders(options: EmbedHeadersOptions): Headers {
  const headers = new Headers();
  headers.set('Content-Type', options.contentType);

  if (options.maxAge !== undefined) {
    headers.set('Cache-Control', `public, max-age=${options.maxAge}`);
  }

  if (options.frameAncestors && options.frameAncestors.length > 0) {
    const ancestors = ["'self'", ...options.frameAncestors].join(' ');
    headers.set('Content-Security-Policy', `frame-ancestors ${ancestors};`);
  }

  if (options.cors) {
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    headers.set('Vary', 'Origin');
  }

  return headers;
}

/**
 * Parse the `?theme=dark|light` query param. Unknown values fall through
 * to the supplied default.
 */
export function parseTheme(url: URL, defaultTheme: EmbedTheme): EmbedTheme {
  const value = url.searchParams.get('theme');
  if (value === 'dark' || value === 'light') return value;
  return defaultTheme;
}

export interface EmbedSnippetOptions {
  url: string;
  /** iframe height in px. Defaults to 900. */
  height?: number;
  /** Accessible iframe title. Defaults to "Event recap". */
  title?: string;
}

/**
 * Build a copy-pasteable `<iframe>` snippet for embedders (AIE site
 * maintainers paste this into their MDX/JSX). Caller is responsible
 * for providing a trusted URL; titles are HTML-escaped.
 */
export function buildEmbedSnippet(options: EmbedSnippetOptions): string {
  const height = options.height ?? 900;
  const title = escapeHtml(options.title ?? 'Event recap');
  return [
    `<iframe`,
    `  src="${options.url}"`,
    `  title="${title}"`,
    `  height="${height}"`,
    `  width="100%"`,
    `  loading="lazy"`,
    `  allow="fullscreen"`,
    `  style="border:0;display:block;width:100%"`,
    `></iframe>`,
  ].join('\n');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Embed allowlist that ships by default. Add more event-host pairs here
 * (or override per event by passing custom frameAncestors to
 * buildEmbedHeaders). Wildcards are supported per CSP spec.
 */
export const DEFAULT_EMBED_ALLOWLIST: readonly string[] = [
  'https://ai.engineer',
  'https://www.ai.engineer',
  'https://*.ai.engineer',
  'https://berlayar.ai',
  'https://*.berlayar.ai',
];

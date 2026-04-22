import type { BrandRawExtract } from './types';
import { emptyBrandRawExtract } from './types';

/** Normalise a hex string into `#rrggbb` lowercase; return null if invalid. */
export function normalizeHex(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  const hex3 = /^#?([0-9a-f]{3})$/.exec(trimmed);
  if (hex3) {
    const [r, g, b] = hex3[1]!.split('');
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  const hex6 = /^#?([0-9a-f]{6})$/.exec(trimmed);
  if (hex6) return `#${hex6[1]}`;
  // 8-digit hex (rgba): drop alpha
  const hex8 = /^#?([0-9a-f]{6})[0-9a-f]{2}$/.exec(trimmed);
  if (hex8) return `#${hex8[1]}`;
  return null;
}

/** Convert `rgb(r, g, b)` / `rgba(...)` into #rrggbb; ignores non-rgb forms. */
export function rgbStringToHex(raw: string): string | null {
  const m = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i.exec(raw);
  if (!m) return null;
  const clamp = (n: number) => Math.max(0, Math.min(255, n));
  const [r, g, b] = [m[1], m[2], m[3]].map((v) => clamp(Number(v)));
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(r!)}${toHex(g!)}${toHex(b!)}`;
}

/**
 * Scrape a CSS/HTML blob for hex colour literals. We deliberately accept
 * colour-looking strings and leave ranking + deduping to the shaper.
 */
export function extractHexColorsFromText(input: string): string[] {
  const out = new Set<string>();
  const hexRe = /#[0-9a-fA-F]{3}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{8}\b/g;
  for (const match of input.matchAll(hexRe)) {
    const hex = normalizeHex(match[0]);
    if (hex) out.add(hex);
  }
  const rgbRe = /rgba?\([^)]+\)/gi;
  for (const match of input.matchAll(rgbRe)) {
    const hex = rgbStringToHex(match[0]);
    if (hex) out.add(hex);
  }
  return Array.from(out);
}

/**
 * Extract `font-family` declarations from CSS text. Quoted names win; fallback
 * to bare identifiers. Keeps order of appearance; dedupes case-insensitively.
 */
export function extractFontFamiliesFromCss(input: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  const add = (name: string) => {
    const key = name.toLowerCase();
    if (!seen.has(key) && name.length > 0) {
      seen.add(key);
      result.push(name);
    }
  };
  const declRe = /font-family\s*:\s*([^;{}]+)/gi;
  for (const match of input.matchAll(declRe)) {
    const body = match[1] ?? '';
    const families = body
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, '').trim())
      .filter((s) => s && !isGenericCssFontKeyword(s));
    for (const f of families) add(f);
  }
  // Also pick up Google-Fonts-style `family=Name+Space` from <link> hrefs.
  const googleRe = /fonts\.googleapis\.com\/css2?\?[^"'\s]*family=([^"'\s&]+)/gi;
  for (const match of input.matchAll(googleRe)) {
    const fam = decodeURIComponent(match[1] ?? '').replace(/\+/g, ' ').split(':')[0] ?? '';
    if (fam) add(fam.trim());
  }
  return result;
}

function isGenericCssFontKeyword(s: string): boolean {
  const k = s.toLowerCase();
  return (
    k === 'inherit' ||
    k === 'initial' ||
    k === 'unset' ||
    k === 'revert' ||
    k === 'sans-serif' ||
    k === 'serif' ||
    k === 'monospace' ||
    k === 'cursive' ||
    k === 'fantasy' ||
    k === 'system-ui'
  );
}

/** Pull plain-text blurbs from an HTML body — favours structural copy. */
export function extractVoiceSamplesFromHtml(html: string): string[] {
  const samples: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const text = raw.replace(/\s+/g, ' ').trim();
    if (text.length < 12 || text.length > 280) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    samples.push(text);
  };
  // Meta description first — usually a deliberate brand statement.
  const metaDesc = /<meta\s+[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i.exec(html);
  if (metaDesc?.[1]) push(metaDesc[1]);
  const ogDesc = /<meta\s+[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i.exec(
    html
  );
  if (ogDesc?.[1]) push(ogDesc[1]);

  const blockRe =
    /<(h1|h2|h3|p|blockquote|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  for (const match of html.matchAll(blockRe)) {
    const stripped = (match[2] ?? '').replace(/<[^>]+>/g, '');
    push(decodeHtmlEntities(stripped));
    if (samples.length >= 8) break;
  }
  return samples;
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

/** Extract logo + product image candidates from HTML. */
export function extractImageCandidatesFromHtml(
  html: string,
  baseUrl?: string
): { logos: string[]; products: Array<{ url: string; alt?: string }> } {
  const logos = new Set<string>();
  const products: Array<{ url: string; alt?: string }> = [];
  const productSeen = new Set<string>();

  const ogImage = /<meta\s+[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i.exec(html);
  if (ogImage?.[1]) {
    const url = resolveUrl(ogImage[1], baseUrl);
    products.push({ url });
    productSeen.add(url);
  }

  const imgRe = /<img\b([^>]*)>/gi;
  for (const match of html.matchAll(imgRe)) {
    const attrs = match[1] ?? '';
    const src = /\bsrc=["']([^"']+)["']/i.exec(attrs)?.[1];
    const alt = /\balt=["']([^"']*)["']/i.exec(attrs)?.[1];
    if (!src) continue;
    const url = resolveUrl(src, baseUrl);
    const lowered = `${alt ?? ''} ${src}`.toLowerCase();
    if (lowered.includes('logo') || lowered.includes('mark') || lowered.includes('wordmark')) {
      logos.add(url);
      continue;
    }
    if (!productSeen.has(url)) {
      products.push({ url, alt: alt?.trim() ? alt : undefined });
      productSeen.add(url);
    }
  }

  // <link rel="icon" href> / shortcut icons as logo fallback.
  const iconRe = /<link\b[^>]*rel=["'][^"']*icon[^"']*["'][^>]*>/gi;
  for (const match of html.matchAll(iconRe)) {
    const href = /\bhref=["']([^"']+)["']/i.exec(match[0])?.[1];
    if (href) logos.add(resolveUrl(href, baseUrl));
  }

  return { logos: Array.from(logos), products: products.slice(0, 12) };
}

/** Parse an HTML page string into a raw extract. */
export function extractFromHtml(html: string, baseUrl?: string): BrandRawExtract {
  const out = emptyBrandRawExtract();
  // Colours: both inline <style> blobs and style="" attributes bring real
  // brand tokens; meta theme-color is also high-signal.
  const styleBlocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((m) => m[1] ?? '')
    .join('\n');
  const inlineStyles = [...html.matchAll(/style=["']([^"']+)["']/gi)]
    .map((m) => m[1] ?? '')
    .join('\n');
  const themeColor = /<meta\s+[^>]*name=["']theme-color["'][^>]*content=["']([^"']+)["']/i.exec(
    html
  )?.[1];

  const colourBlob = [styleBlocks, inlineStyles, themeColor ?? ''].join('\n');
  out.hexes = extractHexColorsFromText(colourBlob);

  // Typography: style blocks + inline + Google Fonts links.
  const linkBlobs = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]).join('\n');
  out.families = extractFontFamiliesFromCss([styleBlocks, inlineStyles, linkBlobs].join('\n'));

  // Voice: structural copy.
  out.voiceSamples = extractVoiceSamplesFromHtml(html);

  const { logos, products } = extractImageCandidatesFromHtml(html, baseUrl);
  out.logoCandidates = logos;
  out.productImageCandidates = products;

  // Context: title + meta description for the shaper.
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  if (title) out.contextLines.push(`title: ${title.replace(/\s+/g, ' ').trim()}`);
  const metaDesc = /<meta\s+[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i.exec(
    html
  )?.[1];
  if (metaDesc) out.contextLines.push(`description: ${metaDesc.trim()}`);

  return out;
}

/**
 * Parse repo material: a README string, tailwind config source, theme.ts
 * source, and any design-tokens JSON. All inputs optional.
 */
export interface RepoFiles {
  readme?: string;
  tailwindConfig?: string;
  themeSource?: string;
  designTokensJson?: string;
  brandJson?: string;
}

export function extractFromRepo(files: RepoFiles, repoUrl?: string): BrandRawExtract {
  const out = emptyBrandRawExtract();

  const all = [
    files.readme ?? '',
    files.tailwindConfig ?? '',
    files.themeSource ?? '',
    files.designTokensJson ?? '',
    files.brandJson ?? '',
  ].join('\n\n');

  out.hexes = extractHexColorsFromText(all);
  out.families = extractFontFamiliesFromCss(all);

  // Tailwind + theme files often declare fonts as identifier arrays:
  //   fontFamily: { display: ['Canela', 'serif'], body: ['Inter', ...] }
  for (const match of all.matchAll(
    /(?:display|body|mono|sans|serif|heading)\s*:\s*\[\s*['"]([^'"]+)['"]/gi
  )) {
    const fam = match[1]?.trim();
    if (fam && !out.families.includes(fam)) out.families.push(fam);
  }

  // README often has a brand blurb — pull the first couple of paragraphs.
  if (files.readme) {
    const paragraphs = files.readme
      .split(/\n{2,}/)
      .map((p) => p.replace(/[#>*_`-]/g, '').replace(/\s+/g, ' ').trim())
      .filter((p) => p.length >= 40 && p.length <= 280);
    out.voiceSamples = paragraphs.slice(0, 4);
  }

  if (repoUrl) out.contextLines.push(`repo: ${repoUrl}`);
  return out;
}

/** Accept a pre-resolved files payload (images as URLs + text blurbs). */
export interface FilesPayload {
  texts?: string[];
  images?: Array<{ url: string; alt?: string }>;
}

export function extractFromFiles(payload: FilesPayload): BrandRawExtract {
  const out = emptyBrandRawExtract();
  const texts = (payload.texts ?? []).filter((t) => typeof t === 'string' && t.trim() !== '');

  out.hexes = extractHexColorsFromText(texts.join('\n'));
  out.families = extractFontFamiliesFromCss(texts.join('\n'));
  out.voiceSamples = texts
    .flatMap((t) => t.split(/\n{2,}|\.\s+/))
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length >= 12 && s.length <= 280)
    .slice(0, 8);

  for (const img of payload.images ?? []) {
    if (!img?.url) continue;
    const tag = `${img.alt ?? ''} ${img.url}`.toLowerCase();
    if (tag.includes('logo') || tag.includes('mark') || tag.includes('wordmark')) {
      out.logoCandidates.push(img.url);
    } else {
      out.productImageCandidates.push({ url: img.url, alt: img.alt });
    }
  }

  return out;
}

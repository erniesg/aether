/**
 * Brand + product parser — deterministic fallback for when Schema.org
 * Product JSON-LD is absent (Eight Sleep, Apple, most marketing sites).
 *
 * Heuristic: parse the og:title pattern `Brand | Product` (or `-`, `:`, `—`,
 * `–`). When that fails, fall back to URL hostname for brand and the first
 * line of og:description for product. Confidence-tagged so callers can
 * decide whether to enrich via SerpAPI before piping into the variation
 * prompt.
 *
 * Pure, no IO. Test-friendly.
 */

import type { UrlIngestion } from './url';

export interface ParsedBrandProduct {
  brand: string;
  product: string;
  /** 'high' = clear separator pattern matched. 'medium' = inferred from
   *  hostname + first description line. 'low' = both fell back to defaults
   *  (caller should consider SerpAPI enrichment). */
  confidence: 'high' | 'medium' | 'low';
  /** Raw signal used so /inspect can show how the value was derived. */
  source: 'og-title-separator' | 'hostname-and-description' | 'defaults';
}

const TITLE_SEPARATORS = [' | ', ' — ', ' – ', ' - ', ': '];

/**
 * Parse "Brand | Product" / "Brand - Product" / "Brand — Product" forms.
 * Returns null if no separator pattern is found.
 *
 * Heuristic: when both halves are present, the SHORTER half is usually the
 * brand (Eight Sleep, Apple, IKEA) and the LONGER half is the product
 * (Pod 4 Ultra, MacBook Pro 14"). Reversed when the first half is the
 * known brand convention.
 */
function parseTitleSeparator(title: string): { brand: string; product: string } | null {
  for (const sep of TITLE_SEPARATORS) {
    const idx = title.indexOf(sep);
    if (idx === -1) continue;
    const left = title.slice(0, idx).trim();
    const right = title.slice(idx + sep.length).trim();
    if (!left || !right) continue;
    // "Brand | Product" — left = brand, right = product. We could try to
    // detect the reversed case, but the canonical pattern in og:title is
    // brand-first (X-team SEO conventions, Yoast defaults). Stick with it.
    return { brand: left, product: right };
  }
  return null;
}

function brandFromHostname(finalUrl: string): string | null {
  try {
    const u = new URL(finalUrl);
    const host = u.hostname.replace(/^www\./, '');
    // Strip TLD: "eightsleep.com" → "eightsleep". URL hostnames are
    // always lowercased by the parser, so we can't recover camel-case
    // for SEO-style smashed hostnames; emit the lowercased base with
    // the first letter capitalised. The LLM disambiguates "Eightsleep"
    // → "Eight Sleep" on its own when it sees the brand context.
    const base = host.split('.')[0];
    if (!base) return null;
    return base.charAt(0).toUpperCase() + base.slice(1);
  } catch {
    return null;
  }
}

/**
 * Parse brand + product from a UrlIngestion. Always returns a value — the
 * confidence field tells callers how much to trust it. `'low'` results are
 * good candidates for SerpAPI enrichment.
 */
export function parseBrandProduct(ingestion: UrlIngestion): ParsedBrandProduct {
  const title = ingestion.title?.trim() ?? '';

  const sep = title ? parseTitleSeparator(title) : null;
  if (sep) {
    return {
      brand: sep.brand,
      product: sep.product,
      confidence: 'high',
      source: 'og-title-separator',
    };
  }

  const hostBrand = brandFromHostname(ingestion.finalUrl || ingestion.url);
  const descFirstLine = ingestion.description?.split(/\r?\n/)[0]?.trim() ?? '';
  if (hostBrand && descFirstLine) {
    return {
      brand: hostBrand,
      product: descFirstLine.slice(0, 80),
      confidence: 'medium',
      source: 'hostname-and-description',
    };
  }
  if (hostBrand && title) {
    return {
      brand: hostBrand,
      product: title.slice(0, 80),
      confidence: 'medium',
      source: 'hostname-and-description',
    };
  }

  return {
    brand: hostBrand ?? title ?? 'unknown',
    product: title || 'unknown',
    confidence: 'low',
    source: 'defaults',
  };
}

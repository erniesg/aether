/**
 * SerpAPI fallback for product enrichment when Schema.org Product JSON-LD
 * is absent and local heuristics (brand-parser) hit medium/low confidence.
 *
 * Used by auto-mode after URL ingestion: given a brand + product hint,
 * runs a Google web/shopping search and returns:
 *   - canonical brand + product names (often more precise than og:title)
 *   - a short product description (knowledge-graph blurb or top SERP snippet)
 *   - extra reference image URLs (Google Images results)
 *
 * Fail-soft: missing SERPAPI_KEY → returns null. Network errors / non-2xx
 * responses → null + console warn. The caller treats null as "no
 * enrichment" and falls through to the local-parse result.
 *
 * Pure HTTP — no SDK. SerpAPI is a thin wrapper around Google's various
 * properties; we hit `engine=google` and `engine=google_images` directly.
 *
 * Doc reference: https://serpapi.com/search-api
 */

const SERP_BASE = 'https://serpapi.com/search.json';
const TIMEOUT_MS = 12_000;

export interface SerpProductResult {
  /** Canonical brand. */
  brand: string;
  /** Canonical product name. */
  product: string;
  /** Short description (knowledge-graph blurb or top SERP snippet). */
  description?: string;
  /** Up to 5 image URLs Google associates with this product. */
  imageUrls: string[];
  /** Top organic result URL (often the official product page). */
  officialUrl?: string;
  /** Source flag: 'knowledge-graph' = high-confidence; 'organic' = mid;
   *  'images-only' = low (we only got photos back, no semantic data). */
  source: 'knowledge-graph' | 'organic' | 'images-only';
}

interface FetchOptions {
  apiKey?: string;
  timeoutMs?: number;
  /** Override for tests. */
  fetchImpl?: typeof fetch;
}

interface SerpKnowledgeGraph {
  title?: string;
  type?: string;
  description?: string;
  manufacturer?: string;
  source?: { name?: string };
  image?: string;
  thumbnail?: string;
  images?: Array<{ source?: string }>;
}

interface SerpOrganicResult {
  title?: string;
  link?: string;
  snippet?: string;
  thumbnail?: string;
}

interface SerpImagesResult {
  thumbnail?: string;
  original?: string;
  source?: string;
  link?: string;
  title?: string;
}

interface SerpSearchResponse {
  knowledge_graph?: SerpKnowledgeGraph;
  organic_results?: SerpOrganicResult[];
  images_results?: SerpImagesResult[];
  error?: string;
}

function pickImagesFromKg(kg: SerpKnowledgeGraph): string[] {
  const out: string[] = [];
  if (kg.image) out.push(kg.image);
  for (const i of kg.images ?? []) {
    if (i.source && !out.includes(i.source)) out.push(i.source);
  }
  return out.slice(0, 5);
}

async function fetchWithTimeout(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { signal: controller.signal });
  } catch (err) {
    console.warn(
      '[ingest/serp] fetch failed:',
      err instanceof Error ? err.message : String(err)
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Search SerpAPI for a brand+product pair and return enriched info. The
 * query is plain Google Search — knowledge-graph hits give the highest-
 * confidence canonical names; organic top result is the official page;
 * images are pulled from the knowledge-graph image carousel when present.
 *
 * Returns null when:
 *   - SERPAPI_KEY is absent (and not passed via options.apiKey)
 *   - the request fails / times out
 *   - SerpAPI returns an error or empty results
 */
export async function searchProductOnSerp(
  query: string,
  options: FetchOptions = {}
): Promise<SerpProductResult | null> {
  const apiKey = options.apiKey ?? process.env.SERPAPI_KEY;
  if (!apiKey) {
    console.log(
      '[ingest/serp] SERPAPI_KEY not set — skipping product enrichment'
    );
    return null;
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;

  const params = new URLSearchParams({
    engine: 'google',
    q: query,
    api_key: apiKey,
    hl: 'en',
    gl: 'sg',
    num: '5',
  });
  const res = await fetchWithTimeout(
    `${SERP_BASE}?${params.toString()}`,
    fetchImpl,
    timeoutMs
  );
  if (!res || !res.ok) {
    console.warn(
      `[ingest/serp] non-ok response: ${res?.status ?? 'no response'}`
    );
    return null;
  }
  let json: SerpSearchResponse;
  try {
    json = (await res.json()) as SerpSearchResponse;
  } catch {
    return null;
  }
  if (json.error) {
    console.warn(`[ingest/serp] API error: ${json.error}`);
    return null;
  }

  const kg = json.knowledge_graph;
  if (kg && kg.title) {
    return {
      brand: kg.manufacturer ?? kg.source?.name ?? extractBrandFromQuery(query),
      product: kg.title,
      description: kg.description,
      imageUrls: pickImagesFromKg(kg),
      officialUrl: json.organic_results?.[0]?.link,
      source: 'knowledge-graph',
    };
  }

  const top = json.organic_results?.[0];
  if (top && (top.title || top.snippet)) {
    return {
      brand: extractBrandFromQuery(query),
      product: top.title ?? query,
      description: top.snippet,
      imageUrls: top.thumbnail ? [top.thumbnail] : [],
      officialUrl: top.link,
      source: 'organic',
    };
  }

  return null;
}

/**
 * Search SerpAPI Google Images for additional product reference photos.
 * Returns up to N image URLs (high-quality `original` field preferred).
 * Useful when the og:image is generic and the knowledge graph doesn't
 * have an image carousel.
 */
export async function searchProductImagesOnSerp(
  query: string,
  limit = 5,
  options: FetchOptions = {}
): Promise<string[]> {
  const apiKey = options.apiKey ?? process.env.SERPAPI_KEY;
  if (!apiKey) return [];
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;

  const params = new URLSearchParams({
    engine: 'google_images',
    q: query,
    api_key: apiKey,
    hl: 'en',
    gl: 'sg',
    num: String(limit * 2),
  });
  const res = await fetchWithTimeout(
    `${SERP_BASE}?${params.toString()}`,
    fetchImpl,
    timeoutMs
  );
  if (!res || !res.ok) return [];
  let json: SerpSearchResponse;
  try {
    json = (await res.json()) as SerpSearchResponse;
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const r of json.images_results ?? []) {
    const u = r.original ?? r.thumbnail;
    if (u && !out.includes(u)) out.push(u);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Extract a likely brand name from a `"<brand> <product>"` query when the
 * knowledge graph doesn't supply one. Heuristic: take the first 1-2 words
 * (most brand names are short). Fragile, but only used as a fallback.
 */
function extractBrandFromQuery(query: string): string {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return query;
  // Two-word brands (Eight Sleep, North Face) outnumber three-word ones,
  // so we cap at 2.
  return words.slice(0, Math.min(2, words.length)).join(' ');
}

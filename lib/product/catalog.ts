import { searchProductOnSerp, type SerpProductResult } from '@/lib/ingest/serp';

export type ProductCatalogSource = 'catalog' | 'research' | 'manual';

export interface ProductCatalogEntry {
  id: string;
  canonicalName: string;
  brand?: string;
  productName?: string;
  aliases: string[];
  description?: string;
  officialUrl?: string;
  imageSearchQuery?: string;
  source: ProductCatalogSource;
  confidence: number;
  updatedAt?: number;
}

export interface ProductResolution extends ProductCatalogEntry {
  matchedText: string;
  matchKind: 'alias' | 'research';
  imageUrls?: string[];
}

export type ProductResearcher = (
  query: string
) => Promise<SerpProductResult | null>;

export const DEFAULT_PRODUCT_CATALOG: readonly ProductCatalogEntry[] = [
  {
    id: 'eight-sleep-pod',
    canonicalName: 'Eight Sleep Pod',
    brand: 'Eight Sleep',
    productName: 'Pod',
    aliases: [
      '8 sleep pod',
      'eight sleep pod',
      'eight sleeping pod',
      '8 sleeping pod',
      '8 sleeping pop',
      'eight sleeping pop',
      'egg sleeping pop',
      'egg sleeping pod',
      'egg sleep pop',
      'egg sleep pod',
      'aid sleep pod',
      'aid sleeping pod',
      'aid sleeping part',
      'aide sleeping part',
      'eight sleep part',
      'eight sleeping part',
      '8 sleeping part',
      'sleeping pod',
      'sleeping pot',
      'sleeping part',
      'aits league pod',
      'eight league pod',
      'eights league pod',
    ],
    officialUrl: 'https://www.eightsleep.com/',
    imageSearchQuery: 'Eight Sleep Pod',
    source: 'catalog',
    confidence: 0.96,
  },
];

export function productKey(value: string): string {
  return normalizeForMatch(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function aliasCandidates(entry: ProductCatalogEntry): string[] {
  return [
    entry.canonicalName,
    entry.brand && entry.productName ? `${entry.brand} ${entry.productName}` : '',
    entry.brand && entry.productName
      ? `${entry.brand.split(/\s+/).at(-1)} ${entry.productName}`
      : '',
    ...entry.aliases,
  ].filter((candidate): candidate is string => candidate.trim().length > 0);
}

function replacementAliasCandidates(entry: ProductCatalogEntry): string[] {
  return [
    entry.canonicalName,
    entry.brand && entry.productName ? `${entry.brand} ${entry.productName}` : '',
    ...entry.aliases,
  ].filter((candidate): candidate is string => candidate.trim().length > 0);
}

export function resolveKnownProductMention(
  text: string,
  catalog: readonly ProductCatalogEntry[] = DEFAULT_PRODUCT_CATALOG
): ProductResolution | null {
  const normalizedText = normalizeForMatch(text);
  if (!normalizedText) return null;

  for (const entry of catalog) {
    for (const alias of aliasCandidates(entry)) {
      const normalizedAlias = normalizeForMatch(alias);
      if (!normalizedAlias) continue;
      const tokenPattern = new RegExp(`(^| )${escapeRegExp(normalizedAlias)}( |$)`);
      if (!tokenPattern.test(normalizedText)) continue;
      return {
        ...entry,
        id: entry.id || productKey(entry.canonicalName),
        aliases: entry.aliases ?? [],
        matchedText: alias,
        matchKind: 'alias',
      };
    }
  }

  for (const entry of catalog) {
    for (const alias of aliasCandidates(entry)) {
      const normalizedAlias = normalizeForMatch(alias);
      if (!isLikelyVoiceSlip(normalizedText, normalizedAlias)) continue;
      return {
        ...entry,
        id: entry.id || productKey(entry.canonicalName),
        aliases: entry.aliases ?? [],
        matchedText: alias,
        matchKind: 'alias',
      };
    }
  }
  return null;
}

export function normalizeKnownProductText(
  text: string,
  catalog: readonly ProductCatalogEntry[] = DEFAULT_PRODUCT_CATALOG
): string {
  let out = text;
  for (const entry of catalog) {
    const aliases = replacementAliasCandidates(entry).sort(
      (a, b) => b.length - a.length
    );
    for (const alias of aliases) {
      const pattern = new RegExp(`\\b${escapeLooseAlias(alias)}\\b`, 'gi');
      out = out.replace(pattern, entry.canonicalName);
    }
  }
  return out.replace(/\bthe\s+([A-Z][\w ]+)\b/g, '$1').trim();
}

export async function resolveProductMention(input: {
  text: string;
  researchQuery?: string;
  catalog?: readonly ProductCatalogEntry[];
  allowResearch?: boolean;
  research?: ProductResearcher | null;
}): Promise<ProductResolution | null> {
  const catalog = input.catalog ?? DEFAULT_PRODUCT_CATALOG;
  const known = resolveKnownProductMention(input.text, catalog);
  if (known) return known;
  if (input.allowResearch === false) return null;

  const researcher =
    input.research === undefined
      ? (query: string) => searchProductOnSerp(query)
      : input.research;
  if (!researcher) return null;

  const query = input.researchQuery?.trim() || input.text;
  const researched = await researcher(query);
  if (!researched) return null;
  if (!isUsefulResearchResult(query, researched)) return null;
  return productResolutionFromResearch(query, researched);
}

export function productResolutionFromResearch(
  query: string,
  result: SerpProductResult
): ProductResolution {
  const canonicalName = joinBrandProduct(result.brand, result.product);
  return {
    id: productKey(canonicalName || query),
    canonicalName: canonicalName || query,
    brand: result.brand,
    productName: result.product,
    aliases: Array.from(new Set([query, result.product, canonicalName].filter(Boolean))),
    description: result.description,
    officialUrl: result.officialUrl,
    imageSearchQuery: canonicalName || query,
    source: 'research',
    confidence: result.source === 'knowledge-graph' ? 0.88 : 0.72,
    matchedText: query,
    matchKind: 'research',
    imageUrls: result.imageUrls,
  };
}

export function productCatalogEntryFromResolution(
  resolution: ProductResolution,
  extraAliases: readonly string[] = []
): ProductCatalogEntry {
  const aliases = Array.from(
    new Set(
      [...resolution.aliases, ...extraAliases]
        .map((alias) => alias.trim())
        .filter(Boolean)
    )
  );
  return {
    id: resolution.id || productKey(resolution.canonicalName),
    canonicalName: resolution.canonicalName,
    brand: resolution.brand,
    productName: resolution.productName,
    aliases,
    description: resolution.description,
    officialUrl: resolution.officialUrl,
    imageSearchQuery: resolution.imageSearchQuery ?? resolution.canonicalName,
    source: resolution.source,
    confidence: resolution.confidence,
    updatedAt: Date.now(),
  };
}

function joinBrandProduct(brand: string, product: string): string {
  if (!brand) return product;
  if (!product) return brand;
  return normalizeForMatch(product).startsWith(normalizeForMatch(brand))
    ? product
    : `${brand} ${product}`;
}

function isUsefulResearchResult(
  query: string,
  result: SerpProductResult
): boolean {
  if (result.source === 'knowledge-graph') return true;
  const canonicalName = joinBrandProduct(result.brand, result.product);
  const normalizedName = normalizeForMatch(canonicalName);
  if (!normalizedName || normalizedName.length > 90) return false;
  if (
    /\b(?:how to|learn|tutorial|guide|best|top|review|reviews|reddit|youtube)\b/i.test(
      canonicalName
    )
  ) {
    return false;
  }
  const queryTokens = normalizeForMatch(query)
    .split(' ')
    .filter((token) => token.length > 2 && !['the', 'for', 'and'].includes(token));
  if (queryTokens.length === 0) return false;
  const matched = queryTokens.filter((token) => normalizedName.includes(token));
  return matched.length / queryTokens.length >= 0.6;
}

function isLikelyVoiceSlip(normalizedText: string, normalizedAlias: string): boolean {
  const aliasTokens = normalizedAlias.split(' ').filter(Boolean);
  if (aliasTokens.length < 2 || aliasTokens.length > 4) return false;
  const textTokens = normalizedText.split(' ').filter(Boolean);
  if (textTokens.length < aliasTokens.length) return false;
  for (let index = 0; index <= textTokens.length - aliasTokens.length; index += 1) {
    const window = textTokens.slice(index, index + aliasTokens.length);
    if (window.every((token, i) => looseTokenMatch(token, aliasTokens[i]!))) {
      return true;
    }
  }
  return false;
}

function looseTokenMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 5 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) {
    return true;
  }
  return levenshteinAtMostOne(a, b);
}

function levenshteinAtMostOne(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let edits = 0;
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) {
      i += 1;
    } else if (b.length > a.length) {
      j += 1;
    } else {
      i += 1;
      j += 1;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeLooseAlias(value: string): string {
  return normalizeForMatch(value)
    .split(' ')
    .map(escapeRegExp)
    .join('[\\s\\-]+');
}

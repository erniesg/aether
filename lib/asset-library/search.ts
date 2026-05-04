import type { ReferenceRecord, ReferenceOrigin } from '@/lib/providers/reference/types';

export interface RankedLibraryReference {
  record: ReferenceRecord;
  score: number;
}

const VISUAL_KINDS = new Set(['image', 'video']);

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);
}

export function referencePrimaryUrl(record: ReferenceRecord): string {
  return record.fullUrl?.trim() || record.previewUrl.trim();
}

export function referenceOrigin(record: ReferenceRecord): ReferenceOrigin {
  if (record.origin) return record.origin;
  if (record.attribution.source === 'generated') return 'generated';
  if (record.attribution.source === 'upload') return 'upload';
  if (record.attribution.source === 'image-search') return 'search';
  if (record.kind === 'template' || record.kind === 'element') return 'manual';
  return 'ingest';
}

export function isGeneratedReference(record: ReferenceRecord): boolean {
  return (
    referenceOrigin(record) === 'generated' ||
    record.tags?.some((tag) => tag.toLowerCase() === 'generated') === true
  );
}

export function isVisualLibraryReference(record: ReferenceRecord): boolean {
  return VISUAL_KINDS.has(record.kind) && Boolean(referencePrimaryUrl(record));
}

function scoreToken(token: string, record: ReferenceRecord): number {
  let score = 0;
  const title = record.title?.toLowerCase() ?? '';
  const tags = (record.tags ?? []).map((tag) => tag.toLowerCase());
  const usage = record.usageIntent?.toLowerCase() ?? '';
  const notes = record.notes?.toLowerCase() ?? '';
  const source = record.attribution.source.toLowerCase();
  const author = record.attribution.author?.toLowerCase() ?? '';
  const url = referencePrimaryUrl(record).toLowerCase();
  const origin = referenceOrigin(record);

  if (title.includes(token)) score += 5;
  if (tags.some((tag) => tag.includes(token))) score += 4;
  if (usage.includes(token)) score += 3;
  if (notes.includes(token)) score += 2;
  if (source.includes(token) || author.includes(token)) score += 1.5;
  if (url.includes(token)) score += 1;
  if (origin.includes(token)) score += 1;
  return score;
}

export function rankLibraryReferences(
  query: string,
  records: ReadonlyArray<ReferenceRecord>,
  options: { visualOnly?: boolean; limit?: number } = {}
): RankedLibraryReference[] {
  const tokens = tokenize(query);
  const visualOnly = options.visualOnly ?? true;
  const ranked: RankedLibraryReference[] = [];

  for (const record of records) {
    if (visualOnly && !isVisualLibraryReference(record)) continue;
    const base = isGeneratedReference(record) ? 0.2 : 0;
    const score =
      tokens.length === 0
        ? base
        : tokens.reduce((total, token) => total + scoreToken(token, record), base);
    if (score <= 0) continue;
    ranked.push({ record, score });
  }

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.record.capturedAt.localeCompare(a.record.capturedAt);
  });
  return typeof options.limit === 'number' ? ranked.slice(0, options.limit) : ranked;
}

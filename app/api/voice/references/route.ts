import { NextResponse } from 'next/server';
import { searchVoiceReferences } from '@/lib/voice/reference-search';
import { cacheVoiceReferenceAssets } from '@/lib/voice/reference-assets';
import { listCreatorReferences } from '@/lib/convex/http';
import type { ReferenceRecord } from '@/lib/providers/reference/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function isReferenceRecord(value: unknown): value is ReferenceRecord {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.kind === 'string' &&
    typeof v.previewUrl === 'string' &&
    typeof v.capturedAt === 'string' &&
    typeof v.attribution === 'object' &&
    v.attribution !== null
  );
}

function parseProduct(value: unknown):
  | { id: string; canonicalName: string; confidence?: number }
  | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const v = value as Record<string, unknown>;
  const id = typeof v.id === 'string' ? v.id.trim() : '';
  const canonicalName =
    typeof v.canonicalName === 'string' ? v.canonicalName.trim() : '';
  if (!id || !canonicalName) return undefined;
  return {
    id,
    canonicalName,
    confidence:
      typeof v.confidence === 'number' && Number.isFinite(v.confidence)
        ? Math.max(0, Math.min(1, v.confidence))
        : undefined,
  };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid JSON body');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonError(400, 'body must be an object');
  }
  const b = body as Record<string, unknown>;
  const query = typeof b.query === 'string' ? b.query.trim() : '';
  if (!query) return jsonError(400, 'query is required');
  const limit =
    typeof b.limit === 'number' && Number.isFinite(b.limit)
      ? Math.max(1, Math.min(8, Math.floor(b.limit)))
      : 4;
  const workspaceId =
    typeof b.workspaceId === 'string' && b.workspaceId.trim()
      ? b.workspaceId.trim()
      : undefined;
  const clientLibraryReferences = Array.isArray(b.libraryReferences)
    ? b.libraryReferences.filter(isReferenceRecord)
    : [];
  let persistedLibraryReferences: ReferenceRecord[] = [];
  try {
    persistedLibraryReferences = await listCreatorReferences(workspaceId);
  } catch {
    // Reference lookup is optional for voice generation. If local Convex is
    // still warming up, continue with client-side refs and external search.
  }
  const libraryReferences = [
    ...clientLibraryReferences,
    ...persistedLibraryReferences,
  ];
  const product = parseProduct(b.product);

  const result = await searchVoiceReferences({
    query,
    limit,
    libraryReferences,
    product,
  });
  const cached =
    result.status === 'ok'
      ? await cacheVoiceReferenceAssets({
          query,
          references: result.references,
          records: result.records,
          workspaceId,
        })
      : { references: result.references, records: result.records, warnings: [] };
  const warnings = [result.warning, ...cached.warnings].filter(
    (entry): entry is string => typeof entry === 'string' && entry.length > 0
  );
  return NextResponse.json({
    ok: true,
    ...result,
    references: cached.references,
    records: cached.records,
    warning: warnings.length > 0 ? warnings.join('\n') : undefined,
  });
}

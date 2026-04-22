import { NextResponse } from 'next/server';
import { ingestBrand } from '@/lib/brand/ingest';
import { BRAND_REVIEW_CONFIDENCE_THRESHOLD } from '@/lib/brand/types';
import type { BrandIngestKind, BrandIngestRequest } from '@/lib/brand/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KINDS: ReadonlyArray<BrandIngestKind> = ['url', 'repo', 'files'];

function jsonError(status: number, error: string, code?: string) {
  return NextResponse.json(
    { ok: false, error, ...(code ? { code } : {}) },
    { status }
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid JSON body');
  }
  if (typeof body !== 'object' || body === null) {
    return jsonError(400, 'body must be an object');
  }
  const b = body as Record<string, unknown>;
  const kind = typeof b.kind === 'string' ? (b.kind as BrandIngestKind) : undefined;
  if (!kind || !KINDS.includes(kind)) {
    return jsonError(400, `kind must be one of ${KINDS.join(', ')}`);
  }
  if (b.source === undefined || b.source === null) {
    return jsonError(400, 'source is required');
  }

  const bypassAgent = b.bypassAgent === true;

  try {
    const ingestRequest: BrandIngestRequest = {
      kind,
      source: b.source as BrandIngestRequest['source'],
    };
    const snapshot = await ingestBrand(ingestRequest, { bypassAgent });
    const review = snapshot.confidence < BRAND_REVIEW_CONFIDENCE_THRESHOLD;
    return NextResponse.json({ ok: true, snapshot, review });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // URL fetch + repo fetch failures are user-facing; surface as 4xx.
    if (/^fetch failed:/.test(message) || /currently expects/.test(message)) {
      return jsonError(400, message, 'ingest_failed');
    }
    if (/requires a non-empty/.test(message) || /requires a source object/.test(message)) {
      return jsonError(400, message);
    }
    return jsonError(500, message);
  }
}

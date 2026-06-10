import { NextResponse } from 'next/server';
import { ingestEvidenceFacts, type EvidenceIngestKind } from '@/lib/research/evidence-ingest';

const KINDS: EvidenceIngestKind[] = ['repo', 'resume', 'site'];

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = parseRequest(body);
    const result = await ingestEvidenceFacts(parsed, { fetcher: fetch });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        code: 'evidence_ingest_failed',
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 400 }
    );
  }
}

function parseRequest(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('body must be an object');
  }
  const record = body as Record<string, unknown>;
  const kind = record.kind;
  if (!KINDS.includes(kind as EvidenceIngestKind)) {
    throw new Error(`kind must be one of: ${KINDS.join(', ')}`);
  }
  if (record.source === undefined) throw new Error('source is required');
  return {
    workspaceId: typeof record.workspaceId === 'string' ? record.workspaceId : undefined,
    kind: kind as EvidenceIngestKind,
    source: record.source,
  };
}

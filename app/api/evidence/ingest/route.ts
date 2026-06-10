import { NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';
import { ingestEvidenceFacts, type EvidenceIngestKind } from '@/lib/research/evidence-ingest';
import type { EvidenceClaim, EvidenceSourceRef } from '@/lib/research/evidence-facts';

const KINDS: EvidenceIngestKind[] = ['repo', 'resume', 'site'];

const evidenceFactsApi = (anyApi as unknown as {
  evidenceFacts: { upsert: unknown };
}).evidenceFacts;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = parseRequest(body);
    const result = await ingestEvidenceFacts(parsed, { fetcher: fetch });
    const persistence = await persistFacts(parsed, result.facts);
    return NextResponse.json({
      ok: true,
      ...result,
      persisted: Boolean(persistence),
      ...(persistence ? { persistence } : {}),
    });
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

async function persistFacts(
  request: ReturnType<typeof parseRequest>,
  facts: { name: string; claims: EvidenceClaim[] }
): Promise<{ sourceItemId: string; productFactId: string } | null> {
  if (!request.workspaceId) return null;
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return null;
  const source = sourceForPersistence(request.kind, facts.claims);
  if (!source) return null;

  const client = new ConvexHttpClient(convexUrl);
  const deployKey = process.env.CONVEX_DEPLOY_KEY;
  if (deployKey) {
    const adminClient = client as unknown as { setAdminAuth?: (key: string) => void };
    if (typeof adminClient.setAdminAuth === 'function') {
      adminClient.setAdminAuth(deployKey);
    }
  }

  return (await client.mutation(evidenceFactsApi.upsert as never, {
    wsId: request.workspaceId,
    source,
    name: facts.name,
    claims: facts.claims,
  } as never)) as { sourceItemId: string; productFactId: string };
}

function sourceForPersistence(
  kind: EvidenceIngestKind,
  claims: EvidenceClaim[]
): EvidenceSourceRef | null {
  const claimSource = claims.find((claim) => claim.source.kind === kind)?.source;
  return claimSource ?? claims[0]?.source ?? null;
}

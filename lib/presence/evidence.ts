import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';
import type { EvidenceClaim } from '@/lib/research/evidence-facts';

const evidenceFactsApi = (anyApi as unknown as {
  evidenceFacts: { listClaims: unknown };
}).evidenceFacts;

export async function loadWorkspaceEvidenceFacts(
  workspaceId: string,
  provided?: EvidenceClaim[]
): Promise<EvidenceClaim[] | undefined> {
  if (provided && provided.length > 0) return provided;
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return provided;
  const client = new ConvexHttpClient(convexUrl);
  const deployKey = process.env.CONVEX_DEPLOY_KEY;
  if (deployKey) {
    const adminClient = client as unknown as { setAdminAuth?: (key: string) => void };
    if (typeof adminClient.setAdminAuth === 'function') adminClient.setAdminAuth(deployKey);
  }
  const rows = (await client.query(evidenceFactsApi.listClaims as never, {
    wsId: workspaceId,
  } as never)) as unknown;
  const facts = evidenceClaimsFromRows(rows);
  return facts.length > 0 ? facts : provided;
}

export function evidenceClaimsFromRows(rows: unknown): EvidenceClaim[] {
  if (!Array.isArray(rows)) return [];
  const facts: EvidenceClaim[] = [];
  for (const row of rows) {
    if (isEvidenceClaim(row)) {
      facts.push(row);
      continue;
    }
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    if (!Array.isArray(record.claims)) continue;
    const sources = Array.isArray(record.claimSources) ? record.claimSources : [];
    for (const [index, claim] of record.claims.entries()) {
      const source = coerceEvidenceSource(sources[index]);
      if (typeof claim === 'string' && claim.trim() && source) {
        facts.push({ text: claim.trim(), source });
      }
    }
  }
  return facts;
}

export function isEvidenceClaim(input: unknown): input is EvidenceClaim {
  if (!input || typeof input !== 'object') return false;
  const record = input as Record<string, unknown>;
  if (typeof record.text !== 'string' || !record.text.trim()) return false;
  const source = record.source as Record<string, unknown> | undefined;
  return (
    Boolean(source) &&
    (source?.kind === 'repo' || source?.kind === 'resume' || source?.kind === 'site') &&
    typeof source.ref === 'string' &&
    Boolean(source.ref.trim())
  );
}

function coerceEvidenceSource(input: unknown): EvidenceClaim['source'] | null {
  if (!input || typeof input !== 'object') return null;
  const record = input as Record<string, unknown>;
  if (
    (record.kind === 'repo' || record.kind === 'resume' || record.kind === 'site') &&
    typeof record.ref === 'string' &&
    record.ref.trim()
  ) {
    return { kind: record.kind, ref: record.ref.trim() };
  }
  return null;
}

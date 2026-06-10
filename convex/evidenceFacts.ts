import { mutationGeneric, queryGeneric } from 'convex/server';
import { v } from 'convex/values';

const EVIDENCE_SOURCE = v.object({
  kind: v.union(v.literal('repo'), v.literal('resume'), v.literal('site')),
  ref: v.string(),
});

const EVIDENCE_CLAIM = v.object({
  text: v.string(),
  source: EVIDENCE_SOURCE,
});

interface EvidenceClaimRecord {
  text: string;
  source: {
    kind: 'repo' | 'resume' | 'site';
    ref: string;
  };
}

interface UpsertEvidenceFactsInput {
  wsId: string;
  source: EvidenceClaimRecord['source'];
  name: string;
  claims: EvidenceClaimRecord[];
}

type EvidenceDb = {
  query(table: 'sourceItem' | 'productFact'): {
    withIndex(name: string, fn: (q: { eq(field: string, value: unknown): unknown }) => unknown): {
      collect(): Promise<Array<Record<string, any>>>;
    };
    collect?: () => Promise<Array<Record<string, any>>>;
  };
  insert(table: 'sourceItem' | 'productFact', doc: Record<string, unknown>): Promise<unknown>;
  patch(id: unknown, patch: Record<string, unknown>): Promise<void>;
};

export async function listProductFactRecords(db: EvidenceDb, wsId: string) {
  return await db
    .query('productFact')
    .withIndex('by_ws', (q) => q.eq('wsId', wsId))
    .collect();
}

export async function listEvidenceClaimsForWorkspace(
  db: EvidenceDb,
  wsId: string
): Promise<EvidenceClaimRecord[]> {
  const [productRows, sourceRows] = await Promise.all([
    listProductFactRecords(db, wsId),
    db
      .query('sourceItem')
      .withIndex('by_ws', (q) => q.eq('wsId', wsId))
      .collect(),
  ]);
  const sourceByName = new Map<string, EvidenceClaimRecord['source']>();
  for (const row of sourceRows) {
    const name = typeof row.payload?.name === 'string' ? row.payload.name.trim() : '';
    const source = coerceEvidenceSource(row.payload);
    if (name && source) sourceByName.set(name, source);
  }

  return productRows.flatMap((row) => {
    const claims = Array.isArray(row.claims) ? row.claims : [];
    const claimSources = Array.isArray(row.claimSources) ? row.claimSources : [];
    const fallbackSource =
      typeof row.name === 'string' ? sourceByName.get(row.name) : undefined;
    return claims
      .map((claim, index) => {
        if (typeof claim !== 'string' || !claim.trim()) return null;
        const source = coerceEvidenceSource(claimSources[index]) ?? fallbackSource;
        return source ? { text: claim.trim(), source } : null;
      })
      .filter((claim): claim is EvidenceClaimRecord => claim !== null);
  });
}

export async function upsertEvidenceFactsForWorkspace(
  db: EvidenceDb,
  input: UpsertEvidenceFactsInput
): Promise<{ sourceItemId: string; productFactId: string }> {
  const now = Date.now();
  const sourceRows = await db
    .query('sourceItem')
    .withIndex('by_ws', (q) => q.eq('wsId', input.wsId))
    .collect();
  const existingSource = sourceRows.find(
    (row) =>
      row.kind === sourceItemKind(input.source.kind) &&
      row.payload?.sourceKind === input.source.kind &&
      row.payload?.ref === input.source.ref
  );
  const sourcePatch = {
    wsId: input.wsId,
    kind: sourceItemKind(input.source.kind),
    payload: {
      sourceKind: input.source.kind,
      ref: input.source.ref,
      name: input.name,
      claimCount: input.claims.length,
    },
    tags: ['evidence', input.source.kind],
    addedAt: now,
  };
  const sourceItemId = existingSource
    ? (await db.patch(existingSource._id, sourcePatch), String(existingSource._id))
    : String(await db.insert('sourceItem', sourcePatch));

  const productRows = await listProductFactRecords(db, input.wsId);
  const existingProduct = productRows.find((row) => row.name === input.name);
  const productPatch = {
    wsId: input.wsId,
    name: input.name,
    claims: input.claims.map((claim) => claim.text),
    claimSources: input.claims.map((claim) => claim.source),
  };
  const productFactId = existingProduct
    ? (await db.patch(existingProduct._id, productPatch), String(existingProduct._id))
    : String(await db.insert('productFact', productPatch));

  return { sourceItemId, productFactId };
}

export const list = queryGeneric({
  args: { wsId: v.string() },
  handler: async (ctx, args) => await listProductFactRecords(ctx.db as unknown as EvidenceDb, args.wsId),
});

export const listClaims = queryGeneric({
  args: { wsId: v.string() },
  handler: async (ctx, args) =>
    await listEvidenceClaimsForWorkspace(ctx.db as unknown as EvidenceDb, args.wsId),
});

export const upsert = mutationGeneric({
  args: {
    wsId: v.string(),
    source: EVIDENCE_SOURCE,
    name: v.string(),
    claims: v.array(EVIDENCE_CLAIM),
  },
  handler: async (ctx, args) =>
    await upsertEvidenceFactsForWorkspace(ctx.db as unknown as EvidenceDb, args),
});

function sourceItemKind(sourceKind: 'repo' | 'resume' | 'site') {
  if (sourceKind === 'repo') return 'repo';
  if (sourceKind === 'resume') return 'upload';
  return 'url';
}

function coerceEvidenceSource(input: unknown): EvidenceClaimRecord['source'] | null {
  if (!input || typeof input !== 'object') return null;
  const record = input as Record<string, unknown>;
  const kind = record.kind ?? record.sourceKind;
  const ref = record.ref;
  if (
    (kind === 'repo' || kind === 'resume' || kind === 'site') &&
    typeof ref === 'string' &&
    ref.trim()
  ) {
    return { kind, ref: ref.trim() };
  }
  return null;
}

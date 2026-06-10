import { beforeEach, describe, expect, it } from 'vitest';
import {
  listProductFactRecords,
  upsertEvidenceFactsForWorkspace,
} from '../../convex/evidenceFacts';
import type { EvidenceClaim } from '@/lib/research/evidence-facts';

type Table = 'sourceItem' | 'productFact';

interface SourceDoc {
  _id: string;
  wsId: string;
  kind: 'url' | 'upload' | 'pinterest' | 'instagram' | 'tiktok' | 'xhs' | 'repo';
  payload: Record<string, unknown>;
  tags: string[];
  addedAt: number;
}

interface ProductFactDoc {
  _id: string;
  wsId: string;
  name: string;
  claims: string[];
  heroAsset?: string;
}

function makeFakeDb() {
  const sourceItem = new Map<string, SourceDoc>();
  const productFact = new Map<string, ProductFactDoc>();
  let seq = 1;

  function tableStore(table: Table) {
    return table === 'sourceItem' ? sourceItem : productFact;
  }

  return {
    sourceItem,
    productFact,
    query(table: Table) {
      let predicate: (doc: SourceDoc | ProductFactDoc) => boolean = () => true;
      const chain = {
        withIndex: (_name: string, fn: (q: { eq: (field: string, value: unknown) => unknown }) => unknown) => {
          fn({
            eq: (field, value) => {
              predicate = (doc) => (doc as unknown as Record<string, unknown>)[field] === value;
              return chain;
            },
          });
          return chain;
        },
        collect: async () => {
          const rows =
            table === 'sourceItem'
              ? Array.from(sourceItem.values())
              : Array.from(productFact.values());
          return rows.filter(predicate);
        },
      };
      return chain;
    },
    async insert(table: Table, doc: Omit<SourceDoc, '_id'> | Omit<ProductFactDoc, '_id'>) {
      const _id = `${table}_${seq++}`;
      tableStore(table).set(_id, { _id, ...doc } as SourceDoc & ProductFactDoc);
      return _id;
    },
    async patch(id: string, patch: Partial<SourceDoc> | Partial<ProductFactDoc>) {
      const store = id.startsWith('sourceItem') ? sourceItem : productFact;
      const cur = store.get(id as never);
      if (!cur) throw new Error(`doc ${id} not found`);
      store.set(id as never, { ...cur, ...patch } as never);
    },
  };
}

const CLAIMS: EvidenceClaim[] = [
  {
    text: 'aether has 42 GitHub stars.',
    source: { kind: 'repo', ref: 'https://github.com/erniesg/aether' },
  },
  {
    text: 'aether uses TypeScript and Convex.',
    source: { kind: 'repo', ref: 'https://github.com/erniesg/aether' },
  },
  {
    text: 'aether published release v0.5.0.',
    source: { kind: 'repo', ref: 'https://github.com/erniesg/aether' },
  },
];

describe('convex/evidenceFacts · sourceItem + productFact persistence', () => {
  let db: ReturnType<typeof makeFakeDb>;

  beforeEach(() => {
    db = makeFakeDb();
  });

  it('persists a repo sourceItem and productFact claims for a workspace', async () => {
    await upsertEvidenceFactsForWorkspace(db, {
      wsId: 'workspace_demo',
      source: { kind: 'repo', ref: 'https://github.com/erniesg/aether' },
      name: 'aether',
      claims: CLAIMS,
    });

    expect(Array.from(db.sourceItem.values())).toEqual([
      expect.objectContaining({
        wsId: 'workspace_demo',
        kind: 'repo',
        payload: expect.objectContaining({ ref: 'https://github.com/erniesg/aether' }),
      }),
    ]);

    const rows = await listProductFactRecords(db, 'workspace_demo');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      wsId: 'workspace_demo',
      name: 'aether',
      claims: CLAIMS.map((claim) => claim.text),
    });
  });

  it('updates instead of duplicating when the same repo is ingested twice', async () => {
    await upsertEvidenceFactsForWorkspace(db, {
      wsId: 'workspace_demo',
      source: { kind: 'repo', ref: 'https://github.com/erniesg/aether' },
      name: 'aether',
      claims: CLAIMS,
    });
    await upsertEvidenceFactsForWorkspace(db, {
      wsId: 'workspace_demo',
      source: { kind: 'repo', ref: 'https://github.com/erniesg/aether' },
      name: 'aether',
      claims: [
        ...CLAIMS,
        {
          text: 'aether README names tldraw as the canvas engine.',
          source: { kind: 'repo', ref: 'https://github.com/erniesg/aether' },
        },
      ],
    });

    expect(db.sourceItem.size).toBe(1);
    expect(db.productFact.size).toBe(1);
    const rows = await listProductFactRecords(db, 'workspace_demo');
    expect(rows[0]?.claims).toContain('aether README names tldraw as the canvas engine.');
  });
});

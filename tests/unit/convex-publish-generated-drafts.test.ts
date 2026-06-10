import { beforeEach, describe, expect, it } from 'vitest';
import { addGeneratedDraftBatchForWorkspace } from '../../convex/publishDrafts';

function makeFakeDb() {
  const publishDraft = new Map<string, Record<string, any>>();
  let seq = 1;
  return {
    publishDraft,
    query(table: 'publishDraft') {
      let predicate: (doc: Record<string, any>) => boolean = () => true;
      const chain = {
        withIndex: (_name: string, fn: (q: { eq: (field: string, value: unknown) => unknown }) => unknown) => {
          fn({
            eq: (field, value) => {
              predicate = (doc) => doc[field] === value;
              return chain;
            },
          });
          return chain;
        },
        collect: async () => Array.from(publishDraft.values()).filter(predicate),
      };
      return chain;
    },
    async insert(table: 'publishDraft', doc: Record<string, unknown>) {
      const id = `${table}_${seq++}`;
      publishDraft.set(id, { _id: id, ...doc });
      return id;
    },
  };
}

describe('convex/publishDrafts · generated presence batches', () => {
  let db: ReturnType<typeof makeFakeDb>;

  beforeEach(() => {
    db = makeFakeDb();
  });

  it('writes generated drafts as draft rows and skips duplicate lap rows', async () => {
    const input = {
      workspaceId: 'demo-ws',
      profileId: 'profile_personal',
      lapId: 'lap_1',
      drafts: [
        {
          kind: 'post' as const,
          text: 'Post with [N] receipts.',
          pillar: 'agent harnesses',
          status: 'draft' as const,
          receiptKind: 'evidence-fact' as const,
          receiptRef: 'repo:aether#claim-1',
        },
        {
          kind: 'reply' as const,
          text: 'Useful reply.',
          pillar: 'agent harnesses',
          targetUrl: 'https://x.com/openai/status/1780000000000000001',
          status: 'draft' as const,
          receiptKind: 'signal-post' as const,
          receiptRef: 'https://x.com/openai/status/1780000000000000001',
        },
      ],
    };

    expect(await addGeneratedDraftBatchForWorkspace(db, input)).toEqual({
      created: 2,
      skipped: 0,
    });
    expect(await addGeneratedDraftBatchForWorkspace(db, input)).toEqual({
      created: 0,
      skipped: 2,
    });
    expect(db.publishDraft.size).toBe(2);
    expect(Array.from(db.publishDraft.values())).toEqual([
      expect.objectContaining({
        workspaceId: 'demo-ws',
        profileId: 'profile_personal',
        lapId: 'lap_1',
        status: 'draft',
        receiptKind: 'evidence-fact',
        receiptRef: 'repo:aether#claim-1',
      }),
      expect.objectContaining({
        kind: 'reply',
        targetUrl: 'https://x.com/openai/status/1780000000000000001',
        status: 'draft',
      }),
    ]);
  });
});

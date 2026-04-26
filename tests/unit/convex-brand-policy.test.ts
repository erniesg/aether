import { describe, it, expect, beforeEach } from 'vitest';
import { resolveComposition } from '@/lib/providers/image/composition';
import type { ImageComposition } from '@/lib/providers/image/types';
import {
  getBrandPolicyRecord,
  setBrandPolicyDefaultComposition,
} from '../../convex/brandPolicy';

/**
 * Convex doesn't commit `_generated` in this repo, so we don't go through the
 * real runtime. Instead we exercise the handler shapes against a fake `ctx.db`
 * that matches the subset of the Convex API we use (`query`, `withIndex`,
 * `unique`, `insert`, `patch`). The schema validators for the brandPolicy
 * table are enforced at the `setDefaultComposition` handler level via the
 * composition validator; we cover that contract here.
 *
 * The CRUD round trip then feeds through `resolveComposition` to prove the
 * workspace default + per-call override merge behaves as the PR describes.
 */

interface Doc {
  _id: string;
  wsId: string;
  defaultComposition: {
    textStrategy?: 'none' | 'baked' | 'auto';
    constraints?: string[];
  };
  updatedAt: number;
}

function makeFakeDb() {
  const store = new Map<string, Doc>();
  let seq = 1;
  function nextId() {
    return `brandPolicy_${seq++}`;
  }
  return {
    store,
    query(table: string) {
      if (table !== 'brandPolicy') throw new Error(`unexpected table ${table}`);
      let predicate: (d: Doc) => boolean = () => true;
      const chain = {
        withIndex: (_name: string, fn: (q: { eq: (field: string, value: unknown) => unknown }) => unknown) => {
          // Capture the eq call to build a predicate.
          fn({
            eq: (field, value) => {
              predicate = (d) => (d as unknown as Record<string, unknown>)[field] === value;
              return chain;
            },
          });
          return chain;
        },
        unique: async () => {
          const matches = Array.from(store.values()).filter(predicate);
          if (matches.length > 1) throw new Error('uniqueness violated');
          return matches[0] ?? null;
        },
      };
      return chain;
    },
    async insert(table: string, doc: Omit<Doc, '_id'>) {
      if (table !== 'brandPolicy') throw new Error(`unexpected table ${table}`);
      const _id = nextId();
      store.set(_id, { _id, ...doc });
      return _id;
    },
    async patch(id: string, patch: Partial<Doc>) {
      const cur = store.get(id);
      if (!cur) throw new Error(`doc ${id} not found`);
      store.set(id, { ...cur, ...patch } as Doc);
    },
  };
}

describe('convex/brandPolicy · CRUD + resolve round trip', () => {
  let ctx: { db: ReturnType<typeof makeFakeDb> };
  const wsId = 'workspace_abc';

  beforeEach(() => {
    ctx = { db: makeFakeDb() };
  });

  it('getBrandPolicy returns null when no policy is set', async () => {
    expect(await getBrandPolicyRecord(ctx.db, wsId)).toBeNull();
  });

  it('setDefaultComposition inserts a new row and getBrandPolicy returns it', async () => {
    const composition: ImageComposition = {
      textStrategy: 'none',
      constraints: ['no-signatures', 'no-watermarks'],
    };
    await setBrandPolicyDefaultComposition(ctx.db, wsId, composition, 123);
    const got = await getBrandPolicyRecord(ctx.db, wsId);
    expect(got).not.toBeNull();
    expect(got!.defaultComposition).toEqual(composition);
    expect(got!.updatedAt).toBe(123);
  });

  it('setDefaultComposition patches an existing row instead of inserting a second', async () => {
    await setBrandPolicyDefaultComposition(ctx.db, wsId, { textStrategy: 'none' }, 123);
    await setBrandPolicyDefaultComposition(ctx.db, wsId, {
      textStrategy: 'baked',
      constraints: ['no-unknown-brand-logos'],
    }, 456);
    const got = await getBrandPolicyRecord(ctx.db, wsId);
    expect(got!.defaultComposition.textStrategy).toBe('baked');
    expect(got!.defaultComposition.constraints).toEqual(['no-unknown-brand-logos']);
    expect(got!.updatedAt).toBe(456);
    expect(ctx.db.store.size).toBe(1);
  });

  it('policies are scoped by wsId — different workspaces do not collide', async () => {
    await setBrandPolicyDefaultComposition(ctx.db, 'ws_a', { textStrategy: 'none' });
    await setBrandPolicyDefaultComposition(ctx.db, 'ws_b', { textStrategy: 'baked' });
    expect((await getBrandPolicyRecord(ctx.db, 'ws_a'))!.defaultComposition.textStrategy).toBe('none');
    expect((await getBrandPolicyRecord(ctx.db, 'ws_b'))!.defaultComposition.textStrategy).toBe('baked');
  });

  it('per-call override merges correctly over a workspace default', async () => {
    await setBrandPolicyDefaultComposition(ctx.db, wsId, {
      textStrategy: 'none',
      constraints: ['no-signatures', 'no-watermarks'],
    });
    const workspace = (await getBrandPolicyRecord(ctx.db, wsId))!.defaultComposition as ImageComposition;

    // Per-call bakes typography for this one generation; workspace constraints
    // still apply (per-call didn't supply constraints).
    const merged = resolveComposition({ textStrategy: 'baked' }, workspace);
    expect(merged.textStrategy).toBe('baked');
    expect(merged.constraints).toEqual(['no-signatures', 'no-watermarks']);
  });

  it('per-call empty-constraints clears the inherited workspace list', async () => {
    await setBrandPolicyDefaultComposition(ctx.db, wsId, {
      textStrategy: 'none',
      constraints: ['no-signatures', 'no-watermarks'],
    });
    const workspace = (await getBrandPolicyRecord(ctx.db, wsId))!.defaultComposition as ImageComposition;
    const merged = resolveComposition({ constraints: [] }, workspace);
    expect(merged.constraints).toEqual([]);
    expect(merged.textStrategy).toBe('none');
  });
});

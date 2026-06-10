import { beforeEach, describe, expect, it } from 'vitest';
import {
  acceptPresenceStrategyForWorkspace,
  addPresenceProfileForWorkspace,
  listPresenceProfilesForWorkspace,
  setActivePresenceProfileForWorkspace,
  upsertPresenceStrategyProposalForWorkspace,
} from '../../convex/presence';
import type { PresenceStrategyShape } from '@/lib/presence/types';

type Table = 'presenceProfile' | 'presenceStrategy';

function makeFakeDb() {
  const presenceProfile = new Map<string, Record<string, any>>();
  const presenceStrategy = new Map<string, Record<string, any>>();
  let seq = 1;

  function store(table: Table) {
    return table === 'presenceProfile' ? presenceProfile : presenceStrategy;
  }

  return {
    presenceProfile,
    presenceStrategy,
    query(table: Table) {
      let predicate: (doc: Record<string, any>) => boolean = () => true;
      const chain = {
        withIndex: (_name: string, fn: (q: { eq: (field: string, value: unknown) => unknown }) => unknown) => {
          const filters: Array<[string, unknown]> = [];
          fn({
            eq: (field, value) => {
              filters.push([field, value]);
              predicate = (doc) => filters.every(([key, expected]) => doc[key] === expected);
              return chain;
            },
          });
          return chain;
        },
        order: () => chain,
        collect: async () => Array.from(store(table).values()).filter(predicate),
        first: async () => Array.from(store(table).values()).find(predicate) ?? null,
      };
      return chain;
    },
    async insert(table: Table, doc: Record<string, unknown>) {
      const id = `${table}_${seq++}`;
      store(table).set(id, { _id: id, ...doc });
      return id;
    },
    async patch(id: string, patch: Record<string, unknown>) {
      const table = id.startsWith('presenceProfile')
        ? presenceProfile
        : presenceStrategy;
      const current = table.get(id);
      if (!current) throw new Error(`missing ${id}`);
      table.set(id, { ...current, ...patch });
    },
  };
}

const STRATEGY: PresenceStrategyShape = {
  positioning: 'Ship visible agents with production receipts.',
  icpAccounts: [
    { handle: '@openai', reason: 'platform builders' },
    { handle: '@AnthropicAI', reason: 'agent builders' },
    { handle: '@modal_labs', reason: 'infra builders' },
    { handle: '@vercel', reason: 'DX builders' },
    { handle: '@convex_dev', reason: 'reactive app builders' },
  ],
  pillars: [
    { name: 'harnesses', evidenceRefs: ['repo:a'], exampleFormats: ['thread'] },
    { name: 'demos', evidenceRefs: ['site:b'], exampleFormats: ['demo'] },
    { name: 'rigor', evidenceRefs: ['resume:c'], exampleFormats: ['opinion'] },
  ],
  cadence: '2 posts/week',
  replyPlaybook: { dailyMinutes: 15, accountListSize: 25 },
  skipList: ['generic hot takes'],
  goalMetric90d: '5 DMs from named builders',
};

describe('convex/presence', () => {
  let db: ReturnType<typeof makeFakeDb>;

  beforeEach(() => {
    db = makeFakeDb();
  });

  it('persists multiple normalized profiles and one active profile per workspace', async () => {
    const personal = await addPresenceProfileForWorkspace(db, {
      workspaceId: 'demo-ws',
      label: 'personal',
      xHandle: 'x.com/erniesg',
      goal: 'FDE roles',
    });
    const product = await addPresenceProfileForWorkspace(db, {
      workspaceId: 'demo-ws',
      label: 'product',
      xHandle: 'aether_app',
      goal: 'AI creative builders',
    });

    await setActivePresenceProfileForWorkspace(db, {
      workspaceId: 'demo-ws',
      profileId: product,
    });

    const rows = await listPresenceProfilesForWorkspace(db, 'demo-ws');
    expect(rows.map((row) => row.xHandle)).toEqual(['@erniesg', '@aether_app']);
    expect(rows.find((row) => row.id === personal)?.active).toBe(false);
    expect(rows.find((row) => row.id === product)?.active).toBe(true);
  });

  it('accepts one profile strategy without changing a sibling proposal', async () => {
    const personal = await addPresenceProfileForWorkspace(db, {
      workspaceId: 'demo-ws',
      label: 'personal',
      xHandle: '@erniesg',
      goal: 'FDE roles',
    });
    const product = await addPresenceProfileForWorkspace(db, {
      workspaceId: 'demo-ws',
      label: 'product',
      xHandle: '@aether_app',
      goal: 'AI creative builders',
    });
    const personalStrategy = await upsertPresenceStrategyProposalForWorkspace(db, {
      workspaceId: 'demo-ws',
      profileId: personal,
      strategy: STRATEGY,
    });
    const productStrategy = await upsertPresenceStrategyProposalForWorkspace(db, {
      workspaceId: 'demo-ws',
      profileId: product,
      strategy: { ...STRATEGY, positioning: 'Product lane' },
    });

    await acceptPresenceStrategyForWorkspace(db, {
      workspaceId: 'demo-ws',
      strategyId: personalStrategy,
    });

    expect(db.presenceStrategy.get(personalStrategy)?.status).toBe('accepted');
    expect(db.presenceStrategy.get(productStrategy)?.status).toBe('proposed');
  });
});

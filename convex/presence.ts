import { mutationGeneric, queryGeneric } from 'convex/server';
import { v } from 'convex/values';
import { normalizeXHandle } from '@/lib/presence/handle';
import type {
  PresenceProfile,
  PresenceStrategyRecord,
  PresenceStrategyShape,
} from '@/lib/presence/types';

const ICP_ACCOUNT = v.object({ handle: v.string(), reason: v.string() });
const PILLAR = v.object({
  name: v.string(),
  evidenceRefs: v.array(v.string()),
  exampleFormats: v.array(v.string()),
});
const REPLY_PLAYBOOK = v.object({
  dailyMinutes: v.number(),
  accountListSize: v.number(),
});
const STRATEGY = v.object({
  positioning: v.string(),
  icpAccounts: v.array(ICP_ACCOUNT),
  pillars: v.array(PILLAR),
  cadence: v.string(),
  replyPlaybook: REPLY_PLAYBOOK,
  skipList: v.array(v.string()),
  goalMetric90d: v.string(),
});

type PresenceDb = {
  query(table: 'presenceProfile' | 'presenceStrategy'): PresenceQuery;
  insert(table: 'presenceProfile' | 'presenceStrategy', doc: Record<string, unknown>): Promise<unknown>;
  patch(id: unknown, patch: Record<string, unknown>): Promise<void>;
};

type PresenceQuery = {
  withIndex(
    name: string,
    fn: (q: { eq(field: string, value: unknown): unknown }) => unknown
  ): PresenceQuery;
  order?(direction: 'asc' | 'desc'): PresenceQuery;
  collect(): Promise<Array<Record<string, any>>>;
  first?(): Promise<Record<string, any> | null>;
};

export async function listPresenceProfilesForWorkspace(
  db: PresenceDb,
  workspaceId: string
): Promise<Array<PresenceProfile & { active: boolean }>> {
  const docs = await db
    .query('presenceProfile')
    .withIndex('by_workspace', (q) => q.eq('workspaceId', workspaceId))
    .collect();
  return docs.map(profileToRecord);
}

export async function addPresenceProfileForWorkspace(
  db: PresenceDb,
  input: {
    workspaceId: string;
    label: string;
    xHandle: string;
    goal: string;
    targetMetric?: string;
  }
): Promise<string> {
  const label = input.label.trim();
  const xHandle = normalizeXHandle(input.xHandle);
  const goal = input.goal.trim();
  if (!label || !xHandle || !goal) throw new Error('label, xHandle, and goal are required');
  const existing = await listPresenceProfilesForWorkspace(db, input.workspaceId);
  const now = Date.now();
  const id = String(
    await db.insert('presenceProfile', {
      workspaceId: input.workspaceId,
      label,
      xHandle,
      goal,
      targetMetric: input.targetMetric?.trim() || undefined,
      active: existing.length === 0,
      createdAt: now,
      updatedAt: now,
    })
  );
  return id;
}

export async function setActivePresenceProfileForWorkspace(
  db: PresenceDb,
  input: { workspaceId: string; profileId: string }
): Promise<void> {
  const rows = await db
    .query('presenceProfile')
    .withIndex('by_workspace', (q) => q.eq('workspaceId', input.workspaceId))
    .collect();
  const now = Date.now();
  for (const row of rows) {
    await db.patch(row._id, {
      active: String(row._id) === input.profileId,
      updatedAt: now,
    });
  }
}

export async function upsertPresenceStrategyProposalForWorkspace(
  db: PresenceDb,
  input: {
    workspaceId: string;
    profileId: string;
    strategy: PresenceStrategyShape;
  }
): Promise<string> {
  const now = Date.now();
  const rows = await db
    .query('presenceStrategy')
    .withIndex('by_workspace', (q) => q.eq('workspaceId', input.workspaceId))
    .collect();
  const existing = rows.find((row) => row.profileId === input.profileId);
  const patch = {
    workspaceId: input.workspaceId,
    profileId: input.profileId,
    status: 'proposed',
    ...input.strategy,
    updatedAt: now,
  };
  if (existing) {
    await db.patch(existing._id, patch);
    return String(existing._id);
  }
  return String(
    await db.insert('presenceStrategy', {
      ...patch,
      createdAt: now,
    })
  );
}

export async function acceptPresenceStrategyForWorkspace(
  db: PresenceDb,
  input: { workspaceId: string; strategyId: string }
): Promise<void> {
  const now = Date.now();
  await db.patch(input.strategyId, {
    status: 'accepted',
    acceptedAt: now,
    updatedAt: now,
  });
}

export async function rejectPresenceStrategyForWorkspace(
  db: PresenceDb,
  input: { workspaceId: string; strategyId: string }
): Promise<void> {
  const now = Date.now();
  await db.patch(input.strategyId, {
    status: 'rejected',
    rejectedAt: now,
    updatedAt: now,
  });
}

export const listProfiles = queryGeneric({
  args: { workspaceId: v.string() },
  handler: async (ctx, args) =>
    await listPresenceProfilesForWorkspace(ctx.db as unknown as PresenceDb, args.workspaceId),
});

export const addProfile = mutationGeneric({
  args: {
    workspaceId: v.string(),
    label: v.string(),
    xHandle: v.string(),
    goal: v.string(),
    targetMetric: v.optional(v.string()),
  },
  handler: async (ctx, args) =>
    await addPresenceProfileForWorkspace(ctx.db as unknown as PresenceDb, args),
});

export const setActiveProfile = mutationGeneric({
  args: { workspaceId: v.string(), profileId: v.string() },
  handler: async (ctx, args) =>
    await setActivePresenceProfileForWorkspace(ctx.db as unknown as PresenceDb, args),
});

export const listStrategies = queryGeneric({
  args: { workspaceId: v.string() },
  handler: async (ctx, args) => {
    const docs = await ctx.db
      .query('presenceStrategy')
      .withIndex('by_workspace', (q: any) => q.eq('workspaceId', args.workspaceId))
      .collect();
    return docs.map(strategyToRecord);
  },
});

export const upsertStrategyProposal = mutationGeneric({
  args: { workspaceId: v.string(), profileId: v.string(), strategy: STRATEGY },
  handler: async (ctx, args) =>
    await upsertPresenceStrategyProposalForWorkspace(
      ctx.db as unknown as PresenceDb,
      args
    ),
});

export const acceptStrategy = mutationGeneric({
  args: { workspaceId: v.string(), strategyId: v.string() },
  handler: async (ctx, args) =>
    await acceptPresenceStrategyForWorkspace(ctx.db as unknown as PresenceDb, args),
});

export const rejectStrategy = mutationGeneric({
  args: { workspaceId: v.string(), strategyId: v.string() },
  handler: async (ctx, args) =>
    await rejectPresenceStrategyForWorkspace(ctx.db as unknown as PresenceDb, args),
});

function profileToRecord(doc: Record<string, any>): PresenceProfile & { active: boolean } {
  return {
    id: String(doc._id),
    workspaceId: doc.workspaceId,
    label: doc.label,
    xHandle: doc.xHandle,
    goal: doc.goal,
    targetMetric: doc.targetMetric,
    active: Boolean(doc.active),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function strategyToRecord(doc: Record<string, any>): PresenceStrategyRecord {
  return {
    id: String(doc._id),
    workspaceId: doc.workspaceId,
    profileId: doc.profileId,
    status: doc.status,
    positioning: doc.positioning,
    icpAccounts: doc.icpAccounts,
    pillars: doc.pillars,
    cadence: doc.cadence,
    replyPlaybook: doc.replyPlaybook,
    skipList: doc.skipList,
    goalMetric90d: doc.goalMetric90d,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    acceptedAt: doc.acceptedAt,
    rejectedAt: doc.rejectedAt,
  };
}

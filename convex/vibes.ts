import { mutationGeneric, queryGeneric } from 'convex/server';
import { v } from 'convex/values';

const SOURCE = v.union(v.literal('logto'), v.literal('api-key'), v.literal('dev'));

interface VibesApiKeyDoc {
  _id: unknown;
  keyId: string;
  userId: string;
  userEmail?: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  status: 'active' | 'revoked';
  dailyLimit: number;
  createdAt: number;
  lastUsedAt?: number;
  revokedAt?: number;
}

interface VibesDailyUsageDoc {
  _id: unknown;
  userId: string;
  day: string;
  used: number;
  dailyLimit: number;
  updatedAt: number;
}

type UsageReason = 'invalid_api_key' | 'quota_exceeded';

const usageArgs = {
  route: v.string(),
  action: v.string(),
  day: v.string(),
  requestId: v.string(),
  metadata: v.any(),
  createdAt: v.number(),
};

export const createApiKey = mutationGeneric({
  args: {
    keyId: v.string(),
    userId: v.string(),
    userEmail: v.optional(v.string()),
    name: v.string(),
    keyHash: v.string(),
    keyPrefix: v.string(),
    status: v.union(v.literal('active'), v.literal('revoked')),
    dailyLimit: v.number(),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = (await ctx.db
      .query('vibesApiKey')
      .withIndex('by_key_id', (q: any) => q.eq('keyId', args.keyId))
      .unique()) as VibesApiKeyDoc | null;
    if (existing) return args.keyId;
    await ctx.db.insert('vibesApiKey', args);
    return args.keyId;
  },
});

export const listApiKeysByUser = queryGeneric({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const docs = (await ctx.db
      .query('vibesApiKey')
      .withIndex('by_user', (q: any) => q.eq('userId', args.userId))
      .order('desc')
      .take(50)) as VibesApiKeyDoc[];
    return docs.map(({ keyHash: _keyHash, _id: _id, ...doc }) => doc);
  },
});

export const consumeApiKeyCall = mutationGeneric({
  args: {
    keyHash: v.string(),
    dailyLimit: v.optional(v.number()),
    ...usageArgs,
  },
  handler: async (ctx, args) => {
    const key = (await ctx.db
      .query('vibesApiKey')
      .withIndex('by_key_hash', (q: any) => q.eq('keyHash', args.keyHash))
      .unique()) as VibesApiKeyDoc | null;
    if (!key || key.status !== 'active') {
      await insertUsageEvent(ctx, {
        source: 'api-key',
        route: args.route,
        action: args.action,
        day: args.day,
        status: 'rejected',
        reason: 'invalid_api_key',
        metadata: args.metadata,
        createdAt: args.createdAt,
      });
      return {
        allowed: false,
        source: 'api-key',
        dailyLimit: args.dailyLimit ?? 0,
        remaining: 0,
        reason: 'invalid_api_key',
      };
    }

    const result = await consumeUser(ctx, {
      userId: key.userId,
      userEmail: key.userEmail,
      keyId: key.keyId,
      source: 'api-key',
      dailyLimit: key.dailyLimit,
      route: args.route,
      action: args.action,
      day: args.day,
      metadata: args.metadata,
      createdAt: args.createdAt,
    });
    if (result.allowed) {
      await ctx.db.patch(key._id as any, { lastUsedAt: args.createdAt });
    }
    return result;
  },
});

export const consumeUserCall = mutationGeneric({
  args: {
    userId: v.string(),
    userEmail: v.optional(v.string()),
    source: SOURCE,
    dailyLimit: v.number(),
    ...usageArgs,
  },
  handler: async (ctx, args) => {
    return await consumeUser(ctx, {
      userId: args.userId,
      userEmail: args.userEmail,
      source: args.source,
      dailyLimit: args.dailyLimit,
      route: args.route,
      action: args.action,
      day: args.day,
      metadata: args.metadata,
      createdAt: args.createdAt,
    });
  },
});

async function consumeUser(
  ctx: any,
  input: {
    userId: string;
    userEmail?: string;
    keyId?: string;
    source: 'logto' | 'api-key' | 'dev';
    dailyLimit: number;
    route: string;
    action: string;
    day: string;
    metadata: unknown;
    createdAt: number;
  }
) {
  const existing = (await ctx.db
    .query('vibesDailyUsage')
    .withIndex('by_user_day', (q: any) => q.eq('userId', input.userId).eq('day', input.day))
    .unique()) as VibesDailyUsageDoc | null;
  const used = existing?.used ?? 0;
  if (used >= input.dailyLimit) {
    await insertUsageEvent(ctx, {
      userId: input.userId,
      userEmail: input.userEmail,
      keyId: input.keyId,
      source: input.source,
      route: input.route,
      action: input.action,
      day: input.day,
      status: 'rejected',
      reason: 'quota_exceeded',
      metadata: input.metadata,
      createdAt: input.createdAt,
    });
    return {
      allowed: false,
      userId: input.userId,
      userEmail: input.userEmail,
      keyId: input.keyId,
      source: input.source,
      dailyLimit: input.dailyLimit,
      remaining: 0,
      reason: 'quota_exceeded',
    };
  }

  if (existing) {
    await ctx.db.patch(existing._id as any, {
      used: used + 1,
      dailyLimit: input.dailyLimit,
      updatedAt: input.createdAt,
    });
  } else {
    await ctx.db.insert('vibesDailyUsage', {
      userId: input.userId,
      day: input.day,
      used: 1,
      dailyLimit: input.dailyLimit,
      updatedAt: input.createdAt,
    });
  }

  await insertUsageEvent(ctx, {
    userId: input.userId,
    userEmail: input.userEmail,
    keyId: input.keyId,
    source: input.source,
    route: input.route,
    action: input.action,
    day: input.day,
    status: 'accepted',
    metadata: input.metadata,
    createdAt: input.createdAt,
  });

  return {
    allowed: true,
    userId: input.userId,
    userEmail: input.userEmail,
    keyId: input.keyId,
    source: input.source,
    dailyLimit: input.dailyLimit,
    remaining: input.dailyLimit - used - 1,
  };
}

async function insertUsageEvent(
  ctx: any,
  input: {
    userId?: string;
    userEmail?: string;
    keyId?: string;
    source: 'logto' | 'api-key' | 'dev';
    route: string;
    action: string;
    day: string;
    status: 'accepted' | 'rejected';
    reason?: UsageReason;
    metadata: unknown;
    createdAt: number;
  }
) {
  await ctx.db.insert('vibesUsageEvent', {
    eventId: `vibes_evt_${input.createdAt}_${Math.random().toString(36).slice(2, 10)}`,
    ...input,
  });
}

import { createHash, randomBytes } from 'node:crypto';
import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';

export type VibesAuthSource = 'logto' | 'api-key' | 'dev';
export type VibesUsageStatus = 'accepted' | 'rejected';

export interface VibesApiKeyRecord {
  keyId: string;
  userId: string;
  userEmail?: string;
  name: string;
  keyPrefix: string;
  status: 'active' | 'revoked';
  dailyLimit: number;
  createdAt: number;
  lastUsedAt?: number;
  revokedAt?: number;
}

export interface VibesPrincipal {
  userId: string;
  userEmail?: string;
  source: VibesAuthSource;
  keyId?: string;
  dailyLimit: number;
}

export interface VibesUsageInput {
  route: string;
  action: string;
  day: string;
  requestId: string;
  metadata: Record<string, unknown>;
  dailyLimit?: number;
}

export interface VibesQuotaResult {
  allowed: boolean;
  userId?: string;
  userEmail?: string;
  keyId?: string;
  source: VibesAuthSource;
  dailyLimit: number;
  remaining: number;
  reason?: 'invalid_api_key' | 'quota_exceeded';
}

export interface CreatedVibesApiKey {
  apiKey: string;
  record: VibesApiKeyRecord;
}

interface DailyUsageRecord {
  userId: string;
  day: string;
  used: number;
  dailyLimit: number;
  updatedAt: number;
}

interface MemoryState {
  keysByHash: Map<string, VibesApiKeyRecord & { keyHash: string }>;
  keysByUser: Map<string, VibesApiKeyRecord[]>;
  daily: Map<string, DailyUsageRecord>;
  events: unknown[];
}

const MEMORY_KEY = '__aether_vibes_access_store__';
const DEFAULT_DAILY_LIMIT = 100;

const vibesApi = (anyApi as unknown as {
  vibes: {
    createApiKey: unknown;
    listApiKeysByUser: unknown;
    consumeApiKeyCall: unknown;
    consumeUserCall: unknown;
  };
}).vibes;

let client: ConvexHttpClient | null = null;

function memory(): MemoryState {
  const g = globalThis as typeof globalThis & { [MEMORY_KEY]?: MemoryState };
  if (!g[MEMORY_KEY]) {
    g[MEMORY_KEY] = {
      keysByHash: new Map(),
      keysByUser: new Map(),
      daily: new Map(),
      events: [],
    };
  }
  return g[MEMORY_KEY];
}

function convexClient(): ConvexHttpClient | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return null;
  if (!client) {
    client = new ConvexHttpClient(url);
    const deployKey = process.env.CONVEX_DEPLOY_KEY;
    if (deployKey) {
      const maybeAdmin = client as unknown as { setAdminAuth?: (key: string) => void };
      if (typeof maybeAdmin.setAdminAuth === 'function') maybeAdmin.setAdminAuth(deployKey);
    }
  }
  return client;
}

export function vibesDailyLimit(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.VIBES_DAILY_CALL_LIMIT);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_DAILY_LIMIT;
}

export function dayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function generateVibesApiKey(): { apiKey: string; keyId: string; keyPrefix: string } {
  const keyId = `vk_${randomBytes(8).toString('hex')}`;
  const secret = randomBytes(24).toString('base64url');
  const apiKey = `vibes_${keyId}_${secret}`;
  return {
    apiKey,
    keyId,
    keyPrefix: `vibes_${keyId}`,
  };
}

export function hashVibesApiKey(apiKey: string, env: NodeJS.ProcessEnv = process.env): string {
  const pepper = env.VIBES_API_KEY_PEPPER?.trim() ?? '';
  return `sha256:${createHash('sha256').update(pepper).update(apiKey).digest('hex')}`;
}

export async function createVibesApiKey(input: {
  userId: string;
  userEmail?: string;
  name?: string;
  dailyLimit?: number;
}): Promise<CreatedVibesApiKey> {
  const now = Date.now();
  const generated = generateVibesApiKey();
  const keyHash = hashVibesApiKey(generated.apiKey);
  const record: VibesApiKeyRecord = {
    keyId: generated.keyId,
    userId: input.userId,
    userEmail: input.userEmail,
    name: cleanName(input.name),
    keyPrefix: generated.keyPrefix,
    status: 'active',
    dailyLimit: input.dailyLimit ?? vibesDailyLimit(),
    createdAt: now,
  };

  const convex = convexClient();
  if (convex) {
    try {
      await convex.mutation(vibesApi.createApiKey as never, {
        ...record,
        keyHash,
      } as never);
      return { apiKey: generated.apiKey, record };
    } catch (err) {
      console.error('[vibes/access-store] createApiKey Convex write failed', err);
    }
  }

  const state = memory();
  state.keysByHash.set(keyHash, { ...record, keyHash });
  state.keysByUser.set(record.userId, [record, ...(state.keysByUser.get(record.userId) ?? [])]);
  return { apiKey: generated.apiKey, record };
}

export async function listVibesApiKeys(userId: string): Promise<VibesApiKeyRecord[]> {
  const convex = convexClient();
  if (convex) {
    try {
      return (await convex.query(vibesApi.listApiKeysByUser as never, {
        userId,
      } as never)) as VibesApiKeyRecord[];
    } catch (err) {
      console.error('[vibes/access-store] listApiKeys Convex read failed', err);
    }
  }
  return memory().keysByUser.get(userId) ?? [];
}

export async function consumeVibesApiKeyCall(
  apiKey: string,
  usage: VibesUsageInput
): Promise<VibesQuotaResult> {
  const keyHash = hashVibesApiKey(apiKey);
  const convex = convexClient();
  if (convex) {
    try {
      return (await convex.mutation(vibesApi.consumeApiKeyCall as never, {
        keyHash,
        ...usage,
        createdAt: Date.now(),
      } as never)) as VibesQuotaResult;
    } catch (err) {
      console.error('[vibes/access-store] consumeApiKey Convex write failed', err);
    }
  }
  return consumeMemoryApiKeyCall(keyHash, usage);
}

export async function consumeVibesUserCall(
  principal: Omit<VibesPrincipal, 'dailyLimit'> & { dailyLimit?: number },
  usage: VibesUsageInput
): Promise<VibesQuotaResult> {
  const convex = convexClient();
  const dailyLimit = usage.dailyLimit ?? principal.dailyLimit ?? vibesDailyLimit();
  if (convex) {
    try {
      return (await convex.mutation(vibesApi.consumeUserCall as never, {
        userId: principal.userId,
        userEmail: principal.userEmail,
        source: principal.source,
        dailyLimit,
        ...usage,
        createdAt: Date.now(),
      } as never)) as VibesQuotaResult;
    } catch (err) {
      console.error('[vibes/access-store] consumeUser Convex write failed', err);
    }
  }
  return consumeMemoryUserCall({ ...principal, dailyLimit }, usage);
}

function consumeMemoryApiKeyCall(keyHash: string, usage: VibesUsageInput): VibesQuotaResult {
  const state = memory();
  const key = state.keysByHash.get(keyHash);
  if (!key || key.status !== 'active') {
    state.events.push({ ...usage, status: 'rejected', reason: 'invalid_api_key', createdAt: Date.now() });
    return {
      allowed: false,
      source: 'api-key',
      dailyLimit: usage.dailyLimit ?? vibesDailyLimit(),
      remaining: 0,
      reason: 'invalid_api_key',
    };
  }
  key.lastUsedAt = Date.now();
  return consumeMemoryUserCall(
    {
      userId: key.userId,
      userEmail: key.userEmail,
      source: 'api-key',
      keyId: key.keyId,
      dailyLimit: key.dailyLimit,
    },
    usage
  );
}

function consumeMemoryUserCall(
  principal: VibesPrincipal,
  usage: VibesUsageInput
): VibesQuotaResult {
  const state = memory();
  const dailyLimit = usage.dailyLimit ?? principal.dailyLimit ?? vibesDailyLimit();
  const counterKey = `${principal.userId}:${usage.day}`;
  const existing = state.daily.get(counterKey);
  const used = existing?.used ?? 0;
  if (used >= dailyLimit) {
    state.events.push({
      ...usage,
      userId: principal.userId,
      userEmail: principal.userEmail,
      keyId: principal.keyId,
      source: principal.source,
      status: 'rejected',
      reason: 'quota_exceeded',
      createdAt: Date.now(),
    });
    return {
      allowed: false,
      userId: principal.userId,
      userEmail: principal.userEmail,
      keyId: principal.keyId,
      source: principal.source,
      dailyLimit,
      remaining: 0,
      reason: 'quota_exceeded',
    };
  }

  state.daily.set(counterKey, {
    userId: principal.userId,
    day: usage.day,
    used: used + 1,
    dailyLimit,
    updatedAt: Date.now(),
  });
  state.events.push({
    ...usage,
    userId: principal.userId,
    userEmail: principal.userEmail,
    keyId: principal.keyId,
    source: principal.source,
    status: 'accepted',
    createdAt: Date.now(),
  });

  return {
    allowed: true,
    userId: principal.userId,
    userEmail: principal.userEmail,
    keyId: principal.keyId,
    source: principal.source,
    dailyLimit,
    remaining: dailyLimit - used - 1,
  };
}

function cleanName(value: string | undefined): string {
  const name = value?.trim();
  return name ? name.slice(0, 80) : 'Vibes API key';
}

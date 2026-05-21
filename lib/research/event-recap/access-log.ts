import { createHash } from 'node:crypto';
import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';
import type { EventRawExportFormat, EventRawExportScope } from './raw-export';

export interface EventRawAccessInput {
  eventId: string;
  action: 'download' | 'inspect';
  format: EventRawExportFormat;
  scope: EventRawExportScope;
  postCount: number;
  mediaCount: number;
  userAgent?: string;
  referer?: string;
  ip?: string;
}

const eventRecapsApi = (anyApi as unknown as {
  eventRecaps: { recordRawAccess: unknown };
}).eventRecaps;

let client: ConvexHttpClient | null = null;

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

export async function recordEventRawAccess(input: EventRawAccessInput): Promise<void> {
  const convex = convexClient();
  const record = {
    accessId: `raw_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    eventId: input.eventId,
    action: input.action,
    format: input.format,
    scope: input.scope,
    postCount: input.postCount,
    mediaCount: input.mediaCount,
    userAgent: input.userAgent?.slice(0, 180),
    referer: input.referer?.slice(0, 240),
    ipHash: input.ip ? hashIp(input.ip) : undefined,
    createdAt: Date.now(),
  };

  if (!convex) {
    memoryAccessLog().push(record);
    return;
  }

  try {
    await convex.mutation(eventRecapsApi.recordRawAccess as never, record as never);
  } catch (err) {
    console.error('[event-recap/access-log] recordRawAccess Convex write failed', err);
    memoryAccessLog().push(record);
  }
}

function hashIp(ip: string): string {
  const salt = process.env.EVENT_ACCESS_LOG_SALT?.trim() ?? '';
  return `sha256:${createHash('sha256').update(salt).update(ip).digest('hex')}`;
}

function memoryAccessLog(): unknown[] {
  const key = '__aether_event_raw_access_log__';
  const g = globalThis as typeof globalThis & { [key]?: unknown[] };
  g[key] ??= [];
  return g[key];
}

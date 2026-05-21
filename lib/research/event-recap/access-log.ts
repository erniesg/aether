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
  schemaVersion: string;
  latestRunId?: string;
  requestPath: string;
  requestQuery: string;
  userAgent?: string;
  acceptLanguage?: string;
  browserPlatform?: string;
  browserBrands?: string;
  referer?: string;
  ip?: string;
  cfCountry?: string;
  cfColo?: string;
  cfRay?: string;
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

export async function recordEventRawAccess(input: EventRawAccessInput): Promise<string> {
  const convex = convexClient();
  const record = {
    accessId: `raw_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    eventId: input.eventId,
    action: input.action,
    format: input.format,
    scope: input.scope,
    postCount: input.postCount,
    mediaCount: input.mediaCount,
    schemaVersion: input.schemaVersion.slice(0, 80),
    latestRunId: input.latestRunId?.slice(0, 120),
    requestPath: input.requestPath.slice(0, 240),
    requestQuery: input.requestQuery.slice(0, 500),
    userAgent: input.userAgent?.slice(0, 180),
    acceptLanguage: input.acceptLanguage?.slice(0, 120),
    browserPlatform: input.browserPlatform?.slice(0, 80),
    browserBrands: input.browserBrands?.slice(0, 180),
    referer: input.referer?.slice(0, 240),
    ipHash: input.ip ? hashIp(input.ip) : undefined,
    visitorHash: visitorHash(input),
    cfCountry: input.cfCountry?.slice(0, 8),
    cfColo: input.cfColo?.slice(0, 16),
    cfRay: input.cfRay?.slice(0, 80),
    createdAt: Date.now(),
  };

  if (!convex) {
    memoryAccessLog().push(record);
    return record.accessId;
  }

  try {
    await convex.mutation(eventRecapsApi.recordRawAccess as never, record as never);
  } catch (err) {
    console.error('[event-recap/access-log] recordRawAccess Convex write failed', err);
    memoryAccessLog().push(record);
  }
  return record.accessId;
}

function hashIp(ip: string): string {
  const salt = process.env.EVENT_ACCESS_LOG_SALT?.trim() ?? '';
  return `sha256:${createHash('sha256').update(salt).update(ip).digest('hex')}`;
}

function visitorHash(input: EventRawAccessInput): string | undefined {
  const parts = [
    input.ip?.trim(),
    input.userAgent?.trim(),
    input.acceptLanguage?.trim(),
    input.browserPlatform?.trim(),
  ].filter(Boolean);
  if (!parts.length) return undefined;
  const salt = process.env.EVENT_ACCESS_LOG_SALT?.trim() ?? '';
  return `sha256:${createHash('sha256').update(salt).update(parts.join('|')).digest('hex')}`;
}

function memoryAccessLog(): unknown[] {
  const key = '__aether_event_raw_access_log__';
  const g = globalThis as typeof globalThis & { [key]?: unknown[] };
  g[key] ??= [];
  return g[key];
}

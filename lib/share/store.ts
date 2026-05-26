import { createHash } from 'node:crypto';
import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';
import { generateShareCode, isValidShareCode, normalizeShareCode, type ShareCodeMode } from './codes';
import { isSharePlatform, type SharePlatform } from './platforms';
import { shortUrlForCode } from './url';

export type ShareObjectType =
  | 'vibes_page'
  | 'event_recap'
  | 'brand_page'
  | 'canvas'
  | 'render'
  | 'pack'
  | 'moodboard';

export type ShareEventType =
  | 'share_link_created'
  | 'platform_clicked'
  | 'copy_link'
  | 'copy_clean_link'
  | 'native_share_success'
  | 'native_share_error'
  | 'share_link_visit'
  | 'share_link_bot_preview'
  | 'conversion';

export interface ShareTargetInput {
  canonicalUrl: string;
  objectType: ShareObjectType;
  objectId: string;
  slug?: string;
  title: string;
  description?: string;
  imageUrl?: string;
}

export interface ShareLinkRecord {
  code: string;
  shortUrl: string;
  canonicalUrl: string;
  platform: SharePlatform;
  targetId: string;
  linkId: string;
}

export interface ResolvedShareLink {
  link: {
    code: string;
    platform: SharePlatform;
    visitCount: number;
    botVisitCount: number;
  };
  target: ShareTargetInput;
}

export interface ShareSummary {
  shareLinks: number;
  shareActions: number;
  trackedVisits: number;
  botPreviews: number;
  publicPosts: number;
  publicPostsByPlatform: Partial<Record<PublicMentionPlatform, number>>;
  platformActions: Partial<Record<SharePlatform, number>>;
  publicReach: Record<string, number>;
}

export type PublicMentionPlatform = 'x' | 'linkedin' | 'facebook';
export type PublicMentionConfidence =
  | 'direct_tracked_url'
  | 'direct_canonical_url'
  | 'redirect_resolved'
  | 'text_match'
  | 'manual'
  | 'published';

export interface PublicMentionMetrics {
  likes?: number;
  reposts?: number;
  quotes?: number;
  replies?: number;
  comments?: number;
  reactions?: number;
  views?: number;
  impressions?: number;
}

export interface PublicMentionInput {
  canonicalUrl: string;
  platform: PublicMentionPlatform;
  externalId?: string;
  externalUrl: string;
  authorName?: string;
  authorHandle?: string;
  matchedUrl: string;
  normalizedCanonicalUrl: string;
  matchedCode?: string;
  metrics: PublicMentionMetrics;
  confidence: PublicMentionConfidence;
  raw?: unknown;
}

interface MemoryShareEvent {
  eventId: string;
  code?: string;
  canonicalUrl?: string;
  eventType: ShareEventType;
  platform: SharePlatform;
  now: number;
}

const sharesApi = (anyApi as unknown as {
  shares: {
    createLink: unknown;
    resolveLink: unknown;
    recordEvent: unknown;
    getSummary: unknown;
    upsertPublicMention: unknown;
  };
}).shares;

let convexClient: ConvexHttpClient | null = null;

function getConvexClient(): ConvexHttpClient | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return null;
  if (!convexClient) {
    convexClient = new ConvexHttpClient(url);
    const key = process.env.CONVEX_DEPLOY_KEY;
    if (key) {
      const maybeAdmin = convexClient as unknown as { setAdminAuth?: (key: string) => void };
      if (typeof maybeAdmin.setAdminAuth === 'function') maybeAdmin.setAdminAuth(key);
    }
  }
  return convexClient;
}

export async function createShareLink(input: {
  requestUrl: string;
  target: ShareTargetInput;
  platform: SharePlatform;
  label?: string;
  actorId?: string;
  actorLabel?: string;
  sessionId?: string;
  shareText?: string;
}): Promise<ShareLinkRecord> {
  const platform = isSharePlatform(input.platform) ? input.platform : 'unknown';
  const modes: ShareCodeMode[] = [
    ...Array<ShareCodeMode>(40).fill('pronounceable-4'),
    ...Array<ShareCodeMode>(40).fill('pronounceable-6'),
    ...Array<ShareCodeMode>(20).fill('friendly-alphanumeric'),
  ];

  let lastError: unknown;
  for (const mode of modes) {
    const code = generateShareCode(mode);
    try {
      return await createShareLinkWithCode({
        ...input,
        platform,
        code,
      });
    } catch (err) {
      lastError = err;
      if (!isCollisionError(err)) throw err;
    }
  }
  throw new Error(`unable to allocate share code: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

export async function resolveShareCode(codeValue: string): Promise<ResolvedShareLink | null> {
  const code = normalizeShareCode(codeValue);
  if (!isValidShareCode(code)) return null;

  const convex = getConvexClient();
  if (convex) {
    try {
      const result = (await convex.query(sharesApi.resolveLink as never, { code } as never)) as
        | {
            link: {
              code: string;
              platform: SharePlatform;
              visitCount: number;
              botVisitCount: number;
            };
            target: ShareTargetInput;
          }
        | null;
      return result;
    } catch (err) {
      console.error('[share/store] resolveLink Convex read failed', err);
    }
  }

  return memory().links.get(code) ?? null;
}

export async function recordShareEvent(input: {
  request?: Request;
  eventType: ShareEventType;
  platform?: SharePlatform;
  code?: string;
  canonicalUrl?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const now = Date.now();
  const code = input.code ? normalizeShareCode(input.code) : undefined;
  const meta = requestMeta(input.request);
  const event = {
    eventId: `share_${now}_${Math.random().toString(36).slice(2, 10)}`,
    code,
    canonicalUrl: input.canonicalUrl,
    eventType: input.eventType,
    platform: input.platform ?? 'unknown',
    metadata: input.metadata,
    now,
    ...meta,
  };

  const convex = getConvexClient();
  if (convex) {
    try {
      await convex.mutation(sharesApi.recordEvent as never, event as never);
      return;
    } catch (err) {
      console.error('[share/store] recordEvent Convex write failed', err);
    }
  }

  memory().events.push(event);
  if (code) {
    const resolved = memory().links.get(code);
    if (resolved && input.eventType === 'share_link_visit') resolved.link.visitCount += 1;
    if (resolved && input.eventType === 'share_link_bot_preview') resolved.link.botVisitCount += 1;
  }
}

export async function getShareSummary(canonicalUrl: string): Promise<ShareSummary> {
  const convex = getConvexClient();
  if (convex) {
    try {
      const summary = (await convex.query(sharesApi.getSummary as never, { canonicalUrl } as never)) as ShareSummary;
      return summary;
    } catch (err) {
      console.error('[share/store] getSummary Convex read failed', err);
    }
  }

  const links = Array.from(memory().links.values()).filter(
    (item) => item.target.canonicalUrl === canonicalUrl
  );
  const linkCodes = new Set(links.map((item) => item.link.code));
  const events = memory().events.filter(
    (event) => event.canonicalUrl === canonicalUrl || (event.code ? linkCodes.has(event.code) : false)
  );
  const actionEvents = events.filter((event) => isShareActionEvent(event.eventType));
  return {
    shareLinks: links.length,
    shareActions: actionEvents.length,
    trackedVisits: links.reduce((sum, item) => sum + item.link.visitCount, 0),
    botPreviews: links.reduce((sum, item) => sum + item.link.botVisitCount, 0),
    publicPosts: 0,
    publicPostsByPlatform: {},
    platformActions: actionEvents.reduce<Partial<Record<SharePlatform, number>>>((acc, event) => {
      acc[event.platform] = (acc[event.platform] ?? 0) + 1;
      return acc;
    }, {}),
    publicReach: {},
  };
}

export function __resetShareStoreMemoryForTests(): void {
  convexClient = null;
  const state = memory();
  state.links.clear();
  state.events.length = 0;
}

export async function upsertPublicMention(input: PublicMentionInput): Promise<string | null> {
  const convex = getConvexClient();
  if (!convex) return null;
  try {
    return (await convex.mutation(sharesApi.upsertPublicMention as never, {
      ...input,
      now: Date.now(),
    } as never)) as string;
  } catch (err) {
    console.error('[share/store] upsertPublicMention Convex write failed', err);
    throw err;
  }
}

async function createShareLinkWithCode(input: {
  requestUrl: string;
  target: ShareTargetInput;
  platform: SharePlatform;
  code: string;
  label?: string;
  actorId?: string;
  actorLabel?: string;
  sessionId?: string;
  shareText?: string;
}): Promise<ShareLinkRecord> {
  const code = normalizeShareCode(input.code);
  if (!isValidShareCode(code)) throw new Error(`invalid share code: ${input.code}`);
  const now = Date.now();
  const shareTextHash = input.shareText ? hashValue(input.shareText) : undefined;
  const convex = getConvexClient();
  if (convex) {
    try {
      const result = (await convex.mutation(sharesApi.createLink as never, {
        ...input.target,
        code,
        platform: input.platform,
        label: input.label,
        actorId: input.actorId,
        actorLabel: input.actorLabel,
        sessionId: input.sessionId,
        shareTextHash,
        now,
      } as never)) as { targetId: string; linkId: string; code: string; canonicalUrl: string };
      return {
        code: result.code,
        shortUrl: shortUrlForCode(input.requestUrl, result.code),
        canonicalUrl: result.canonicalUrl,
        platform: input.platform,
        targetId: result.targetId,
        linkId: result.linkId,
      };
    } catch (err) {
      if (isCollisionError(err)) throw err;
      console.error('[share/store] createLink Convex write failed; using memory fallback', err);
    }
  }

  const existing = memory().links.get(code);
  if (existing) throw new Error(`share code collision: ${code}`);
  const targetId = `target_${hashValue(input.target.canonicalUrl).slice(0, 12)}`;
  const linkId = `link_${code}`;
  const resolved: ResolvedShareLink = {
    link: {
      code,
      platform: input.platform,
      visitCount: 0,
      botVisitCount: 0,
    },
    target: input.target,
  };
  memory().links.set(code, resolved);
  memory().events.push({
    eventId: `share_${now}_${code}`,
    code,
    canonicalUrl: input.target.canonicalUrl,
    eventType: 'share_link_created',
    platform: input.platform,
    now,
  });
  return {
    code,
    shortUrl: shortUrlForCode(input.requestUrl, code),
    canonicalUrl: input.target.canonicalUrl,
    platform: input.platform,
    targetId,
    linkId,
  };
}

function isCollisionError(err: unknown): boolean {
  return err instanceof Error && /share code collision/i.test(err.message);
}

function isShareActionEvent(eventType: ShareEventType): boolean {
  return eventType === 'platform_clicked' || eventType === 'copy_link' || eventType === 'native_share_success';
}

function hashValue(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function requestMeta(request?: Request) {
  if (!request) return {};
  const headers = request.headers;
  const ip =
    headers.get('cf-connecting-ip') ??
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    undefined;
  const ua = headers.get('user-agent') ?? undefined;
  const acceptLanguage = headers.get('accept-language') ?? undefined;
  return {
    requestPath: new URL(request.url).pathname,
    referer: headers.get('referer') ?? undefined,
    userAgent: ua?.slice(0, 180),
    acceptLanguage: acceptLanguage?.slice(0, 120),
    ipHash: ip ? saltedHash(ip) : undefined,
    visitorHash: ip || ua || acceptLanguage ? saltedHash([ip, ua, acceptLanguage].filter(Boolean).join('|')) : undefined,
    cfCountry: headers.get('cf-ipcountry')?.slice(0, 8) ?? undefined,
    cfColo: headers.get('cf-colo')?.slice(0, 16) ?? undefined,
    cfRay: headers.get('cf-ray')?.slice(0, 80) ?? undefined,
  };
}

function saltedHash(value: string): string {
  const salt = process.env.SHARE_EVENT_LOG_SALT ?? process.env.EVENT_ACCESS_LOG_SALT ?? '';
  return `sha256:${createHash('sha256').update(salt).update(value).digest('hex')}`;
}

function memory() {
  const key = '__aether_share_store__';
  const g = globalThis as typeof globalThis & {
    [key]?: {
      links: Map<string, ResolvedShareLink>;
      events: MemoryShareEvent[];
    };
  };
  g[key] ??= {
    links: new Map(),
    events: [],
  };
  return g[key];
}

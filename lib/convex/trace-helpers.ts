/**
 * Thin query helpers used exclusively by the /api/campaigns/[id]/trace endpoint.
 *
 * Isolated here so the route handler and its tests can mock this module at the
 * boundary without touching the shared http.ts helpers that mutations use.
 * All calls are fail-soft — they return null rather than throwing so the
 * endpoint can assemble a partial trace even when individual rows are missing.
 */
import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';

let httpClient: ConvexHttpClient | null = null;

function getHttpClient(): ConvexHttpClient | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return null;
  if (!httpClient) {
    httpClient = new ConvexHttpClient(url);
    const key = process.env.CONVEX_DEPLOY_KEY;
    if (key && key.length > 0) {
      const client = httpClient as unknown as { setAdminAuth?: (k: string) => void };
      if (typeof client.setAdminAuth === 'function') client.setAdminAuth(key);
    }
  }
  return httpClient;
}

// ─── Typed API references ─────────────────────────────────────────────────────

const campaignsApi = (
  anyApi as unknown as {
    campaigns: { get: unknown; listByWorkspace: unknown };
  }
).campaigns;

const runsApi = (
  anyApi as unknown as {
    runs: { getByClientId: unknown };
  }
).runs;

const assetsApi = (
  anyApi as unknown as {
    assets: { getAsset: unknown };
  }
).assets;

const publisherApi = (
  anyApi as unknown as {
    publisher: { list: unknown };
  }
).publisher;

const lapEventApi = (
  anyApi as unknown as {
    lapEvent: { listByCampaign: unknown };
  }
).lapEvent;

// ─── Return shapes ────────────────────────────────────────────────────────────

export interface CampaignRow {
  id: string;
  workspaceId?: string;
  triggerKind: 'url' | 'file' | 'text';
  triggerPayload: string;
  variationCount: number;
  notifyMode: 'notify' | 'review' | 'auto-post';
  status: 'running' | 'completed' | 'failed';
  startedAt: number;
  finishedAt?: number;
  error?: string;
  /** B2 research bundle (canonical shape: ResearchBundle in
   *  lib/agent/managed/research.ts). Populated when the agent runs
   *  successfully and persists via setCampaignResearchBundle. */
  researchBundle?: unknown;
  /** Signoff Managed Agent schedule plan (canonical: SchedulePlan in
   *  lib/agent/managed/signoff.ts). Persisted via setCampaignSchedulePlan. */
  schedulePlan?: unknown;
  /** Cluster Managed Agent bundle (canonical: ClusterBundle in
   *  lib/agent/managed/cluster.ts). Persisted via setCampaignClusterBundle. */
  clusterBundle?: unknown;
  /** URL-only ref summary persisted at startCampaign. /inspect uses this
   *  to show what visual identity anchors flowed into the lap. */
  referenceImages?: Array<{ url?: string; hint?: string }>;
}

export interface VariationRow {
  id: string;
  campaignId: string;
  workspaceId?: string;
  index: number;
  status: 'pending' | 'running' | 'ready' | 'failed';
  heroImageUrl?: string;
  heroAssetId?: string;
  caption?: string;
  captionsByLocale?: Record<string, string>;
  hashtags?: string[];
  moodNote?: string;
  schedulePlatform?: string;
  scheduleWhenLocal?: string;
  formatCrops?: unknown;
  masksOneShot?: unknown;
  masksVisionGuided?: unknown;
  /** 4-locale × 4-format atlas (Convex public URL). Optional. */
  atlasUrl?: string;
  /** Per-locale text overlays (zone, content, bbox, scope). Stored as v.any
   *  in Convex; consumers cast to ProposedTextOverlay[]. Optional. */
  textOverlays?: unknown;
  /** Aspect ids that produced bytes via per-format render (e.g. ['4x5','9x16']). */
  nativePerFormatRendered?: string[];
  /** Per-format public URLs after Convex upload — see auto-mode.ts shape. */
  nativePerFormatUrls?: Partial<
    Record<'1x1' | '4x5' | '9x16' | '16x9', string>
  >;
  agentRunIds: string[];
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

export interface AssetRow {
  id: string;
  storageId: string;
  publicUrl: string;
  kind: string;
  mime?: string;
  sourceUrl?: string;
  width?: number;
  height?: number;
  createdAt: number;
}

export interface LapEventRow {
  id: string;
  ts: number;
  variationIndex?: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  tag: string;
  message: string;
  data?: unknown;
}

export interface CapabilityRunRow {
  id: string;
  tool: string;
  provider: string;
  model: string;
  prompt: string;
  latencyMs?: number;
  status: string;
  startedAt: number;
  finishedAt?: number;
  error?: string;
}

export interface ScheduledPostRow {
  id: string;
  platform: string;
  scheduledAt: string;
  mediaUrls: string[];
  caption: string;
  hashtags: string[];
  status: string;
  provider?: string;
  externalId?: string;
}

// ─── Query helpers ────────────────────────────────────────────────────────────

/**
 * Fetches the campaign row plus all its variation rows in one call.
 * Returns null when the campaign is not found or Convex is unreachable.
 */
export async function getCampaignWithVariations(
  campaignId: string
): Promise<{ campaign: CampaignRow; variations: VariationRow[] } | null> {
  const client = getHttpClient();
  if (!client) return null;
  const result = (await client.query(campaignsApi.get as never, {
    campaignId,
  } as never)) as { campaign: CampaignRow; variations: VariationRow[] } | null;
  return result ?? null;
}

/**
 * Fetches a single capabilityRun ledger row by its client-assigned run ID.
 * Returns null when not found or Convex is unreachable.
 */
export async function getCapabilityRunByClientId(
  clientRunId: string
): Promise<CapabilityRunRow | null> {
  const client = getHttpClient();
  if (!client) return null;
  const result = (await client.query(runsApi.getByClientId as never, {
    clientRunId,
  } as never)) as CapabilityRunRow | null;
  return result ?? null;
}

/**
 * Fetches an asset row by its Convex id.
 * Returns null when not found or Convex is unreachable.
 */
export async function getAsset(id: string): Promise<AssetRow | null> {
  const client = getHttpClient();
  if (!client) return null;
  const result = (await client.query(assetsApi.getAsset as never, {
    id,
  } as never)) as AssetRow | null;
  return result ?? null;
}

/**
 * Lists scheduled posts scoped to a workspace id.
 * Returns empty array when Convex is unreachable.
 */
export async function listScheduledPosts(
  wsId?: string
): Promise<ScheduledPostRow[]> {
  const client = getHttpClient();
  if (!client) return [];
  const result = (await client.query(publisherApi.list as never, {
    wsId,
  } as never)) as ScheduledPostRow[];
  return result ?? [];
}

/**
 * Lists structured lap events for a campaign in chronological order.
 * Returns empty array when Convex is unreachable or there are no events.
 */
export async function listLapEvents(
  campaignId: string,
  limit = 500
): Promise<LapEventRow[]> {
  const client = getHttpClient();
  if (!client) return [];
  try {
    const result = (await client.query(lapEventApi.listByCampaign as never, {
      campaignId,
      limit,
    } as never)) as LapEventRow[];
    return result ?? [];
  } catch {
    return [];
  }
}

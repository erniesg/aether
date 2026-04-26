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

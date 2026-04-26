import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';
import type { CapabilityEntryRef } from '@/lib/capability/entry';
import type { ArtifactKind } from '@/lib/tool/registry';
import { sanitizeImageUrlForConvex } from './sanitize';
import type {
  PublisherProviderId,
  ScheduledPost,
} from '@/lib/providers/publisher/types';

/**
 * Convex HTTP client for server-side runtimes (Next.js route handlers).
 * Activates whenever NEXT_PUBLIC_CONVEX_URL is set. CONVEX_DEPLOY_KEY is
 * optional — every mutation we call (runs.*, campaigns.*, publisher.*,
 * skills.*) is public (`mutationGeneric` with no auth gate in handler),
 * so admin auth is not required to invoke them. When the key IS set we
 * still apply it via setAdminAuth so audit / rate-limit attribution
 * lines up with the server identity.
 */

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

const runsApi = (anyApi as unknown as {
  runs: { start: unknown; step: unknown; finish: unknown; fail: unknown };
}).runs;

const publisherApi = (anyApi as unknown as {
  publisher: {
    schedule: unknown;
    cancel: unknown;
    updateStatus: unknown;
  };
}).publisher;

const skillsApi = (anyApi as unknown as {
  skills: { insert: unknown; getByName: unknown };
}).skills;

export interface ServerRunStart {
  clientRunId: string;
  wsId?: string;
  artifactKind?: ArtifactKind;
  outputFormat?: 'particle-field' | 'gaussian-splat';
  quality?: 'draft' | 'standard' | 'high';
  sourceMode?: 'selected-image';
  sourceImageShapeId?: string;
  tool: string;
  provider: string;
  model: string;
  prompt: string;
  aspectRatio?: string;
  definitionId?: string;
  definitionVersion?: number;
  entryRef?: CapabilityEntryRef;
}

export async function recordRunStart(input: ServerRunStart): Promise<void> {
  const client = getHttpClient();
  if (!client) return;
  try {
    await client.mutation(runsApi.start as never, {
      ...input,
      startedAt: Date.now(),
    } as never);
  } catch (err) {
    console.error('[convex/http] recordRunStart failed', err);
  }
}

export async function recordRunFinish(
  clientRunId: string,
  patch: Partial<{
    status: 'running' | 'ok' | 'error';
    provider: string;
    model: string;
    rewrittenPrompt: string;
    rationale: string;
    aspectRatio: string;
    imageUrl: string;
    latencyMs: number;
    error: string;
    httpStatus: number;
  }>
): Promise<void> {
  const client = getHttpClient();
  if (!client) return;
  try {
    await client.mutation(runsApi.finish as never, {
      clientRunId,
      ...patch,
      imageUrl: sanitizeImageUrlForConvex(patch.imageUrl),
      finishedAt: Date.now(),
    } as never);
  } catch (err) {
    console.error('[convex/http] recordRunFinish failed', err);
  }
}

export async function recordRunFail(
  clientRunId: string,
  error: string,
  httpStatus?: number
): Promise<void> {
  const client = getHttpClient();
  if (!client) return;
  try {
    await client.mutation(runsApi.fail as never, {
      clientRunId,
      error,
      httpStatus,
      finishedAt: Date.now(),
    } as never);
  } catch (err) {
    console.error('[convex/http] recordRunFail failed', err);
  }
}

export function isConvexHttpEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);
}

export async function recordScheduledPost(input: {
  workspaceId: string;
  post: ScheduledPost;
  provider: PublisherProviderId;
  externalId?: string;
}): Promise<string | null> {
  const client = getHttpClient();
  if (!client) return null;
  try {
    return (await client.mutation(publisherApi.schedule as never, {
      platform: input.post.platform,
      mediaUrls: input.post.mediaUrls,
      caption: input.post.caption,
      hashtags: input.post.hashtags,
      scheduledAt: input.post.scheduledAt,
      accountId: input.post.accountId,
      provider: input.provider,
      externalId: input.externalId,
    } as never)) as string;
  } catch (err) {
    console.error('[convex/http] recordScheduledPost failed', err);
    return null;
  }
}

export async function recordScheduledPostCancel(id: string): Promise<void> {
  const client = getHttpClient();
  if (!client) return;
  try {
    await client.mutation(publisherApi.cancel as never, { id } as never);
  } catch (err) {
    console.error('[convex/http] recordScheduledPostCancel failed', err);
  }
}

export interface ServerSkillInsert {
  name: string;
  version: number;
  description: string;
  /** Path to SKILL.md, relative to repo root. */
  manifestPath: string;
  referenceFilePaths: string[];
}

/**
 * Best-effort insert of a SkillRecord into the Convex `skill` table.
 * No-op when Convex is not provisioned. Returns the convex document id when
 * the insert succeeded so the caller can echo it back to the client.
 */
export async function recordSkillInsert(
  input: ServerSkillInsert
): Promise<string | null> {
  const client = getHttpClient();
  if (!client) return null;
  try {
    const id = (await client.mutation(skillsApi.insert as never, input as never)) as
      | string
      | null;
    return id ?? null;
  } catch (err) {
    console.error('[convex/http] recordSkillInsert failed', err);
    return null;
  }
}

// ───── Auto-Mode campaign helpers (handoff §9) ────────────────────────────

const campaignsApi = (anyApi as unknown as {
  campaigns: {
    startCampaign: unknown;
    setCampaignStatus: unknown;
    insertVariation: unknown;
  };
}).campaigns;

export interface ServerCampaignStart {
  workspaceId?: string;
  triggerKind: 'url' | 'file' | 'text';
  triggerPayload: string;
  variationCount: number;
  notifyMode: 'notify' | 'review' | 'auto-post';
}

export async function startCampaign(
  input: ServerCampaignStart
): Promise<string | null> {
  const client = getHttpClient();
  if (!client) return null;
  try {
    return (await client.mutation(
      campaignsApi.startCampaign as never,
      input as never
    )) as string;
  } catch (err) {
    console.error('[convex/http] startCampaign failed', err);
    return null;
  }
}

export async function setCampaignStatus(
  campaignId: string,
  status: 'running' | 'completed' | 'failed',
  error?: string
): Promise<void> {
  const client = getHttpClient();
  if (!client) return;
  try {
    await client.mutation(campaignsApi.setCampaignStatus as never, {
      campaignId,
      status,
      error,
    } as never);
  } catch (err) {
    console.error('[convex/http] setCampaignStatus failed', err);
  }
}

export interface ServerVariationInsert {
  campaignId: string;
  workspaceId?: string;
  index: number;
  status: 'pending' | 'running' | 'ready' | 'failed';
  heroImageUrl?: string;
  caption?: string;
  captionsByLocale?: Record<string, string>;
  hashtags?: string[];
  moodNote?: string;
  schedulePlatform?: string;
  scheduleWhenLocal?: string;
  formatCrops?: unknown;
  /** SAM3 mask set from the static one-shot prompt list (slice #2). */
  masksOneShot?: unknown;
  /** SAM3 mask set from Claude vision-derived prompts (slice #2). */
  masksVisionGuided?: unknown;
  agentRunIds: string[];
  error?: string;
}

export async function insertCampaignVariation(
  input: ServerVariationInsert
): Promise<string | null> {
  const client = getHttpClient();
  if (!client) return null;
  try {
    return (await client.mutation(
      campaignsApi.insertVariation as never,
      input as never
    )) as string;
  } catch (err) {
    console.error('[convex/http] insertCampaignVariation failed', err);
    return null;
  }
}

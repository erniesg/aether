/**
 * GET /api/campaigns/[id]/trace
 *
 * Returns the full lap trace for an Auto-Mode campaign as JSON.
 * Aggregates data from four Convex tables:
 *   - campaign + campaignVariation (campaigns.get)
 *   - capabilityRun (runs.getByClientId per agentRunId — enriches agentSteps)
 *   - asset (assets.getAsset for heroAsset when heroAssetId is present)
 *   - scheduledPost (publisher.list scoped to workspaceId)
 *
 * Mask summaries only — full bbox arrays are stripped to avoid bloat.
 * urlIngestion / pdfIngestion / referenceDescriptions are NOT persisted to
 * Convex today; the response sets lapDataUnavailable:true to signal this.
 *
 * Error semantics:
 *   400 — invalid (empty / whitespace) campaign id
 *   404 — campaign row not found
 *   500 — Convex unreachable or unexpected failure
 */
import { NextResponse } from 'next/server';
import {
  getCampaignWithVariations,
  getCapabilityRunByClientId,
  getAsset,
  listScheduledPosts,
  type VariationRow,
  type CapabilityRunRow,
  type AssetRow,
  type ScheduledPostRow,
} from '@/lib/convex/trace-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MaskSummary {
  matched: string[];
  prompted: string[];
  maskCount: number;
}

interface AgentStepTrace {
  clientRunId: string;
  name: string;
  ok: boolean;
  ms?: number;
  errorMessage?: string;
  ledger: CapabilityRunRow | null;
}

interface VariationTrace {
  id: string;
  index: number;
  status: string;
  error?: string;
  heroImageUrl?: string;
  heroAssetId?: string;
  heroAsset?: AssetRow;
  caption?: string;
  captionsByLocale?: Record<string, string>;
  hashtags?: string[];
  moodNote?: string;
  schedulePlatform?: string;
  scheduleWhenLocal?: string;
  formatCrops?: unknown;
  textOverlays?: unknown;
  textOverlayWarnings?: unknown;
  masksOneShot?: MaskSummary;
  masksVisionGuided?: MaskSummary;
  agentSteps: AgentStepTrace[];
  startedAt: number;
  finishedAt?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert the raw masks object stored in Convex to a lightweight summary.
 * The full bbox arrays can be many KB — callers only need counts + labels.
 */
function summarizeMasks(raw: unknown): MaskSummary | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const matched = Array.isArray(r.matched)
    ? (r.matched as unknown[]).filter((v): v is string => typeof v === 'string')
    : [];
  const prompted = Array.isArray(r.prompted)
    ? (r.prompted as unknown[]).filter((v): v is string => typeof v === 'string')
    : [];
  const masks = Array.isArray(r.masks) ? r.masks : [];
  return {
    matched,
    prompted,
    maskCount: masks.length,
  };
}

/**
 * Build the agentSteps array for a variation. For each agentRunId (a
 * clientRunId cross-link), look up the capabilityRun ledger row.
 * Fail-soft per row via Promise.allSettled — a missing row gets ledger:null.
 */
async function buildAgentSteps(agentRunIds: string[]): Promise<AgentStepTrace[]> {
  if (!agentRunIds || agentRunIds.length === 0) return [];

  const ledgerResults = await Promise.allSettled(
    agentRunIds.map((id) => getCapabilityRunByClientId(id))
  );

  return agentRunIds.map((clientRunId, i) => {
    const settled = ledgerResults[i];
    const ledger =
      settled?.status === 'fulfilled' ? (settled.value ?? null) : null;

    // Derive step-level fields from the ledger when available
    const name = ledger?.tool ?? 'unknown';
    const ok =
      ledger != null
        ? ledger.status === 'ok'
        : true; // unknown steps default ok
    const ms = ledger?.latencyMs;
    const errorMessage = ledger?.error;

    return {
      clientRunId,
      name,
      ok,
      ms,
      errorMessage,
      ledger,
    };
  });
}

/**
 * Build the trace for a single variation row, enriching with:
 *  - heroAsset from assets.getAsset (when heroAssetId present)
 *  - agentSteps with ledger from capabilityRun (per agentRunId)
 */
async function buildVariationTrace(variation: VariationRow): Promise<VariationTrace> {
  // Hero asset — fail-soft
  let heroAsset: AssetRow | undefined;
  if (variation.heroAssetId) {
    try {
      const asset = await getAsset(variation.heroAssetId);
      heroAsset = asset ?? undefined;
    } catch {
      // fail-soft — heroAsset stays undefined
    }
  }

  const agentSteps = await buildAgentSteps(variation.agentRunIds ?? []);

  return {
    id: variation.id,
    index: variation.index,
    status: variation.status,
    error: variation.error,
    heroImageUrl: variation.heroImageUrl,
    heroAssetId: variation.heroAssetId,
    heroAsset,
    caption: variation.caption,
    captionsByLocale: variation.captionsByLocale,
    hashtags: variation.hashtags,
    moodNote: variation.moodNote,
    schedulePlatform: variation.schedulePlatform,
    scheduleWhenLocal: variation.scheduleWhenLocal,
    formatCrops: variation.formatCrops,
    masksOneShot: summarizeMasks(variation.masksOneShot),
    masksVisionGuided: summarizeMasks(variation.masksVisionGuided),
    agentSteps,
    startedAt: variation.startedAt,
    finishedAt: variation.finishedAt,
  };
}

function shapeScheduledPost(post: ScheduledPostRow) {
  return {
    id: post.id,
    platform: post.platform,
    scheduledAt: post.scheduledAt,
    mediaUrls: post.mediaUrls,
    caption: post.caption,
    hashtags: post.hashtags,
    status: post.status,
    provider: post.provider,
    externalId: post.externalId,
  };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await context.params;

  // Validate id
  if (!campaignId || campaignId.trim().length === 0) {
    return NextResponse.json(
      { ok: false, error: 'invalid campaign id' },
      { status: 400 }
    );
  }

  let campaignData: Awaited<ReturnType<typeof getCampaignWithVariations>>;
  try {
    campaignData = await getCampaignWithVariations(campaignId);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'Convex query failed',
      },
      { status: 500 }
    );
  }

  if (!campaignData) {
    return NextResponse.json(
      { ok: false, error: `campaign ${campaignId} not found` },
      { status: 404 }
    );
  }

  const { campaign, variations } = campaignData;

  // Build variation traces in parallel — fail-soft per variation
  const variationTraces: VariationTrace[] = await Promise.all(
    variations.map((v) => buildVariationTrace(v))
  );

  // Scheduled posts scoped to workspace
  let scheduledPosts: ReturnType<typeof shapeScheduledPost>[] = [];
  try {
    const posts = await listScheduledPosts(campaign.workspaceId);
    scheduledPosts = posts.map(shapeScheduledPost);
  } catch {
    // fail-soft — scheduledPosts stays empty
  }

  // urlIngestion / pdfIngestion / referenceDescriptions are NOT persisted to
  // Convex today (they are in-memory per AutoModeResult). Signal this to
  // callers so they know the absence is expected, not a bug.
  const lapDataUnavailable = true;

  return NextResponse.json({
    ok: true,
    campaign: {
      id: campaign.id,
      workspaceId: campaign.workspaceId,
      triggerKind: campaign.triggerKind,
      triggerPayload: campaign.triggerPayload,
      variationCount: campaign.variationCount,
      notifyMode: campaign.notifyMode,
      status: campaign.status,
      startedAt: campaign.startedAt,
      finishedAt: campaign.finishedAt,
    },
    variations: variationTraces,
    scheduledPosts,
    lapDataUnavailable,
  });
}

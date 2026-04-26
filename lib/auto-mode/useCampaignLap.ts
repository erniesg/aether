'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { isConvexEnabled } from '@/lib/convex/client';
import type {
  AutoModeCampaignView,
  AutoModeVariationView,
} from '@/components/rail/sections/AutoModePanel';

/**
 * useCampaignLap — subscribe to a running or recently-completed Auto-Mode lap.
 *
 * When Convex is enabled, uses reactive useQuery subscriptions so the right
 * rail updates in real-time as the agent loop writes rows. When Convex is
 * disabled (no NEXT_PUBLIC_CONVEX_URL), falls back to polling
 * /api/campaigns/[id]/trace every 8 seconds so the demo still works without
 * a Convex deployment.
 *
 * The hook returns a stable { campaign, variations } pair — the AutoModePanel
 * can pass these through as props without any further fetching.
 */

interface CampaignLapState {
  campaign: AutoModeCampaignView | null;
  variations: AutoModeVariationView[];
}

const EMPTY: CampaignLapState = { campaign: null, variations: [] };

const campaignsAnyApi = (anyApi as unknown as {
  campaigns: {
    get: unknown;
    listVariations: unknown;
  };
}).campaigns;

// ──────────────────────────────────────────────────────────────────────────────
// Convex-enabled path
// ──────────────────────────────────────────────────────────────────────────────

function useConvexCampaignLap(campaignId: string | null): CampaignLapState {
  // Convex useQuery requires a stable args object; pass `'skip'` when there is
  // no campaign id so the query is a no-op. When Convex is not provisioned,
  // also skip to avoid the "no ConvexProvider" error in test / local envs.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const result = useQuery(
    campaignsAnyApi.get as never,
    campaignId && isConvexEnabled() ? ({ campaignId } as never) : 'skip'
  ) as {
    campaign: {
      id: string;
      triggerKind: 'url' | 'file' | 'text';
      triggerPayload: string;
      variationCount: number;
      notifyMode: 'notify' | 'review' | 'auto-post';
      status: 'running' | 'completed' | 'failed';
      startedAt: number;
      finishedAt?: number;
      error?: string;
    };
    variations: Array<{
      id: string;
      index: number;
      status: 'pending' | 'running' | 'ready' | 'failed';
      heroImageUrl?: string;
      caption?: string;
      captionsByLocale?: Partial<Record<'en-SG' | 'zh-Hans-SG' | 'ms-SG' | 'ta-SG', string>>;
      hashtags?: string[];
      moodNote?: string;
      schedulePlatform?: string;
      scheduleWhenLocal?: string;
      formatCrops?: Array<{ formatId: string; aspectRatio: string; w: number; h: number; fit: string }>;
      atlasUrl?: string;
      textOverlays?: unknown;
      nativePerFormatRendered?: string[];
      agentRunIds: string[];
      error?: string;
      startedAt: number;
      finishedAt?: number;
    }>;
  } | null | undefined;

  if (!campaignId || !result) return EMPTY;

  const { campaign, variations } = result;
  return {
    campaign: {
      id: campaign.id,
      triggerKind: campaign.triggerKind,
      triggerPayload: campaign.triggerPayload,
      variationCount: campaign.variationCount,
      notifyMode: campaign.notifyMode,
      status: campaign.status,
      startedAt: campaign.startedAt,
      finishedAt: campaign.finishedAt,
      error: campaign.error,
    },
    variations: variations.map((v) => ({
      id: v.id,
      index: v.index,
      status: v.status,
      heroImageUrl: v.heroImageUrl,
      caption: v.caption,
      captionsByLocale: v.captionsByLocale,
      hashtags: v.hashtags,
      moodNote: v.moodNote,
      schedulePlatform: v.schedulePlatform,
      scheduleWhenLocal: v.scheduleWhenLocal,
      formatCrops: v.formatCrops,
      atlasUrl: v.atlasUrl,
      // textOverlays is stored as `any` in Convex schema; cast through unknown.
      textOverlays: v.textOverlays as AutoModeVariationView['textOverlays'],
      nativePerFormatRendered: v.nativePerFormatRendered,
      agentRunIds: v.agentRunIds,
      error: v.error,
      startedAt: v.startedAt,
      finishedAt: v.finishedAt,
    })),
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Polling fallback (no Convex)
// ──────────────────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 8_000;

interface TraceVariation {
  id: string;
  index: number;
  status: string;
  heroImageUrl?: string;
  caption?: string;
  captionsByLocale?: Partial<Record<'en-SG' | 'zh-Hans-SG' | 'ms-SG' | 'ta-SG', string>>;
  hashtags?: string[];
  moodNote?: string;
  schedulePlatform?: string;
  scheduleWhenLocal?: string;
  agentRunIds?: string[];
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

interface TraceResponse {
  ok: boolean;
  campaign?: {
    id: string;
    triggerKind?: string;
    triggerPayload?: string;
    variationCount?: number;
    notifyMode?: string;
    status?: string;
    startedAt?: number;
    finishedAt?: number;
    error?: string;
  };
  variations?: TraceVariation[];
}

function usePollingCampaignLap(campaignId: string | null): CampaignLapState {
  const [state, setState] = useState<CampaignLapState>(EMPTY);
  const doneRef = useRef(false);

  const poll = useCallback(async () => {
    if (!campaignId) return;
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/trace`);
      if (!res.ok) return;
      const json = (await res.json()) as TraceResponse;
      if (!json.ok || !json.campaign) return;

      const c = json.campaign;
      const campaign: AutoModeCampaignView = {
        id: c.id,
        triggerKind: (c.triggerKind ?? 'url') as 'url' | 'file' | 'text',
        triggerPayload: c.triggerPayload ?? '',
        variationCount: c.variationCount ?? 1,
        notifyMode: (c.notifyMode ?? 'review') as 'notify' | 'review' | 'auto-post',
        status: (c.status ?? 'running') as 'running' | 'completed' | 'failed',
        startedAt: c.startedAt ?? Date.now(),
        finishedAt: c.finishedAt,
        error: c.error,
      };

      const variations: AutoModeVariationView[] = (json.variations ?? []).map((v) => ({
        id: v.id,
        index: v.index,
        status: (v.status ?? 'pending') as 'pending' | 'running' | 'ready' | 'failed',
        heroImageUrl: v.heroImageUrl,
        caption: v.caption,
        captionsByLocale: v.captionsByLocale,
        hashtags: v.hashtags,
        moodNote: v.moodNote,
        schedulePlatform: v.schedulePlatform,
        scheduleWhenLocal: v.scheduleWhenLocal,
        agentRunIds: v.agentRunIds ?? [],
        error: v.error,
        startedAt: v.startedAt,
        finishedAt: v.finishedAt,
      }));

      setState({ campaign, variations });

      // Stop polling once the lap is done.
      if (campaign.status !== 'running') {
        doneRef.current = true;
      }
    } catch {
      // Best-effort; keep the last good state.
    }
  }, [campaignId]);

  useEffect(() => {
    if (!campaignId) {
      setState(EMPTY);
      doneRef.current = false;
      return;
    }
    doneRef.current = false;
    void poll();
    const timer = setInterval(() => {
      if (!doneRef.current) void poll();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [campaignId, poll]);

  return campaignId ? state : EMPTY;
}

// ──────────────────────────────────────────────────────────────────────────────
// Public hook — picks the right implementation
// ──────────────────────────────────────────────────────────────────────────────

/**
 * useCampaignLap(campaignId)
 *
 * Returns { campaign, variations } for the given campaign, or { null, [] }
 * when no campaignId is provided. Uses Convex reactive subscriptions when
 * NEXT_PUBLIC_CONVEX_URL is set; falls back to polling /api/campaigns/trace
 * otherwise.
 *
 * The eslint-disable below is intentional — we follow the same pattern as
 * `lib/context/creator-store.ts` where `isConvexEnabled()` is determined at
 * module-load time (stable env var check) so the conditional branch is
 * constant across a render session, making the rule technically satisfied.
 */
export function useCampaignLap(campaignId: string | null): CampaignLapState {
  /* eslint-disable react-hooks/rules-of-hooks */
  if (isConvexEnabled()) {
    return useConvexCampaignLap(campaignId);
  }
  return usePollingCampaignLap(campaignId);
  /* eslint-enable react-hooks/rules-of-hooks */
}

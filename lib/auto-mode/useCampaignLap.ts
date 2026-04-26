'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { isConvexEnabled } from '@/lib/convex/client';
import type {
  AutoModeCampaignView,
  AutoModeVariationView,
  LapStepView,
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

export interface LapEventView {
  id: string;
  ts: number;
  variationIndex?: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  tag: string;
  message: string;
  data?: unknown;
}

interface CampaignLapState {
  campaign: AutoModeCampaignView | null;
  variations: AutoModeVariationView[];
  events: LapEventView[];
}

const EMPTY: CampaignLapState = { campaign: null, variations: [], events: [] };

/**
 * C4: Infer the named-step timeline from campaign + variation status.
 *
 * Named steps: url-ingest → vision-describe → sam3-segment → generate →
 * compose-atlas → publish (auto-post only).
 *
 * Inference heuristic (no Convex schema change needed):
 * - Campaign `running` + no variation `running` → url-ingest running
 * - First variation `running` → url-ingest done, vision-describe running
 * - First variation `ready` or campaign `completed` → all "generate" steps done
 * - Campaign `completed` + notifyMode `auto-post` → publish done
 *
 * This gives the right-rail enough granularity to show "where we are" without
 * requiring a per-step Convex table. A future slice can replace this with
 * real step events written by auto-mode.ts.
 */
export function inferLapSteps(
  campaign: AutoModeCampaignView,
  variations: AutoModeVariationView[]
): LapStepView[] {
  const now = Date.now();
  const anyRunning = variations.some((v) => v.status === 'running');
  const anyReady = variations.some((v) => v.status === 'ready');
  const allDone = campaign.status !== 'running';
  const isAutoPost = campaign.notifyMode === 'auto-post';
  const isUrl = campaign.triggerKind === 'url';

  // url-ingest: only shown for URL triggers
  const ingestStep: LapStepView = isUrl ? {
    name: 'url-ingest',
    label: 'ingest',
    status: anyRunning || anyReady || allDone ? 'done' : 'running',
    startedAt: campaign.startedAt,
    finishedAt: anyRunning || anyReady || allDone
      ? variations[0]?.startedAt ?? campaign.startedAt + 5000
      : undefined,
  } : undefined!;

  const runningV = variations.find((v) => v.status === 'running');
  const readyV = variations.find((v) => v.status === 'ready');

  const visionStep: LapStepView = {
    name: 'vision-describe',
    label: 'vision',
    status: anyReady || allDone
      ? 'done'
      : anyRunning
        ? 'running'
        : 'pending',
    startedAt: runningV?.startedAt ?? readyV?.startedAt,
    finishedAt: anyReady || allDone
      ? readyV?.startedAt ?? (runningV?.startedAt ? runningV.startedAt + 8000 : undefined)
      : undefined,
  };

  const generateStep: LapStepView = {
    name: 'generate',
    label: 'generate',
    status: anyReady || allDone
      ? 'done'
      : anyRunning
        ? 'running'
        : 'pending',
    startedAt: runningV?.startedAt,
    finishedAt: anyReady ? readyV?.finishedAt ?? now : undefined,
  };

  const composeStep: LapStepView = {
    name: 'compose-atlas',
    label: 'compose',
    status: allDone ? 'done' : anyReady ? 'running' : 'pending',
    startedAt: anyReady ? (readyV?.finishedAt ?? now) : undefined,
    finishedAt: allDone ? campaign.finishedAt : undefined,
  };

  const publishStep: LapStepView | undefined = isAutoPost ? {
    name: 'publish',
    label: 'publish',
    status: allDone ? 'done' : 'pending',
    startedAt: campaign.finishedAt,
    finishedAt: campaign.finishedAt,
  } : undefined;

  return [
    ...(isUrl ? [ingestStep] : []),
    visionStep,
    generateStep,
    composeStep,
    ...(isAutoPost && publishStep ? [publishStep] : []),
  ];
}

const campaignsAnyApi = (anyApi as unknown as {
  campaigns: {
    get: unknown;
    listVariations: unknown;
  };
}).campaigns;

const lapEventAnyApi = (anyApi as unknown as {
  lapEvent: { listByCampaign: unknown };
}).lapEvent;

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
      researchBundle?: AutoModeCampaignView['researchBundle'];
      schedulePlan?: AutoModeCampaignView['schedulePlan'];
      clusterBundle?: AutoModeCampaignView['clusterBundle'];
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
      nativePerFormatUrls?: Partial<
        Record<'1x1' | '4x5' | '9x16' | '16x9', string>
      >;
      agentRunIds: string[];
      error?: string;
      startedAt: number;
      finishedAt?: number;
    }>;
  } | null | undefined;

  // Live lap events — separate Convex subscription (one query per row table).
  // 'skip' until campaignId + Convex are available so test envs don't bind
  // to a non-existent provider.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const eventsResult = useQuery(
    lapEventAnyApi.listByCampaign as never,
    campaignId && isConvexEnabled() ? ({ campaignId, limit: 200 } as never) : 'skip'
  ) as
    | Array<{
        id: string;
        campaignId: string;
        variationIndex?: number;
        tag: string;
        level: 'debug' | 'info' | 'warn' | 'error';
        message: string;
        data?: unknown;
        ts: number;
      }>
    | null
    | undefined;

  if (!campaignId || !result) return EMPTY;

  const { campaign, variations } = result;
  const mappedVariations: AutoModeVariationView[] = variations.map((v) => ({
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
    nativePerFormatUrls: v.nativePerFormatUrls,
    agentRunIds: v.agentRunIds,
    error: v.error,
    startedAt: v.startedAt,
    finishedAt: v.finishedAt,
  }));
  const mappedCampaign: AutoModeCampaignView = {
    id: campaign.id,
    triggerKind: campaign.triggerKind,
    triggerPayload: campaign.triggerPayload,
    variationCount: campaign.variationCount,
    notifyMode: campaign.notifyMode,
    status: campaign.status,
    startedAt: campaign.startedAt,
    finishedAt: campaign.finishedAt,
    error: campaign.error,
    researchBundle: campaign.researchBundle,
    schedulePlan: campaign.schedulePlan,
    clusterBundle: campaign.clusterBundle,
    lapSteps: inferLapSteps(
      {
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
      mappedVariations
    ),
  };
  const events: LapEventView[] = (eventsResult ?? []).map((e) => ({
    id: e.id,
    ts: e.ts,
    variationIndex: e.variationIndex,
    level: e.level,
    tag: e.tag,
    message: e.message,
    data: e.data,
  }));
  return { campaign: mappedCampaign, variations: mappedVariations, events };
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
  formatCrops?: AutoModeVariationView['formatCrops'];
  textOverlays?: AutoModeVariationView['textOverlays'];
  atlasUrl?: string;
  nativePerFormatRendered?: string[];
  nativePerFormatUrls?: Partial<
    Record<'1x1' | '4x5' | '9x16' | '16x9', string>
  >;
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
    researchBundle?: AutoModeCampaignView['researchBundle'];
    schedulePlan?: AutoModeCampaignView['schedulePlan'];
    clusterBundle?: AutoModeCampaignView['clusterBundle'];
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
        formatCrops: v.formatCrops,
        textOverlays: v.textOverlays,
        atlasUrl: v.atlasUrl,
        nativePerFormatRendered: v.nativePerFormatRendered,
        nativePerFormatUrls: v.nativePerFormatUrls,
        agentRunIds: v.agentRunIds ?? [],
        error: v.error,
        startedAt: v.startedAt,
        finishedAt: v.finishedAt,
      }));
      const baseCampaign = {
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
      const campaign: AutoModeCampaignView = {
        ...baseCampaign,
        researchBundle: c.researchBundle,
        schedulePlan: c.schedulePlan,
        clusterBundle: c.clusterBundle,
        lapSteps: inferLapSteps(baseCampaign, variations),
      };

      // Polling fallback doesn't yet have lapEvents — the trace endpoint
      // would need to be extended. Emit empty array; Convex-backed path is
      // the primary source for the live event tail.
      setState({ campaign, variations, events: [] });

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

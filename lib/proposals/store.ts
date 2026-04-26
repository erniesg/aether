'use client';

import { useSyncExternalStore } from 'react';
import { useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { getConvexClient, isConvexEnabled } from '@/lib/convex/client';
import type { CampaignContext, OfferContext } from '@/lib/context/model';
import { DEFAULT_WORKSPACE_ID } from '@/lib/context/creator-store';

export interface ProposedOfferRow extends OfferContext {
  /** Convex `_id` of the proposal row when persisted; otherwise the local id. */
  rowId: string;
  proposalId: string;
  proposedAt: number;
}

export interface ProposedCampaignRow extends CampaignContext {
  rowId: string;
  proposalId: string;
  proposedAt: number;
}

const proposalsApi = (anyApi as unknown as {
  proposals: {
    listProposedOffers: unknown;
    listProposedCampaigns: unknown;
    replaceProposedOffers: unknown;
    replaceProposedCampaigns: unknown;
    removeProposedOffer: unknown;
    removeProposedCampaign: unknown;
  };
}).proposals;

type Listener = () => void;
const listeners = new Set<Listener>();
const offerCache = new Map<string, ProposedOfferRow[]>();
const campaignCache = new Map<string, ProposedCampaignRow[]>();

function workspaceKey(workspaceId?: string): string {
  return workspaceId?.trim() || DEFAULT_WORKSPACE_ID;
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}

const EMPTY_OFFERS: ProposedOfferRow[] = [];
const EMPTY_CAMPAIGNS: ProposedCampaignRow[] = [];

// Returning a stable reference when the cache is empty is required by
// useSyncExternalStore — a fresh `[]` every read triggers an infinite render
// loop in React 19.
function loadOffers(workspaceId?: string): ProposedOfferRow[] {
  return offerCache.get(workspaceKey(workspaceId)) ?? EMPTY_OFFERS;
}

function loadCampaigns(workspaceId?: string): ProposedCampaignRow[] {
  return campaignCache.get(workspaceKey(workspaceId)) ?? EMPTY_CAMPAIGNS;
}

function coerceConvexOffer(row: unknown): ProposedOfferRow | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.proposalId !== 'string') return null;
  return {
    rowId: r.id,
    proposalId: r.proposalId,
    id: r.proposalId,
    name: typeof r.name === 'string' ? r.name : '',
    summary: typeof r.summary === 'string' ? r.summary : '',
    claims: Array.isArray(r.claims) ? r.claims.filter((c): c is string => typeof c === 'string') : [],
    heroAsset: typeof r.heroAsset === 'string' ? r.heroAsset : '',
    proposedAt: typeof r.proposedAt === 'number' ? r.proposedAt : 0,
  };
}

function coerceConvexCampaign(row: unknown): ProposedCampaignRow | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.proposalId !== 'string') return null;
  return {
    rowId: r.id,
    proposalId: r.proposalId,
    id: r.proposalId,
    name: typeof r.name === 'string' ? r.name : '',
    goal: typeof r.goal === 'string' ? r.goal : '',
    audience: typeof r.audience === 'string' ? r.audience : '',
    channels: Array.isArray(r.channels) ? r.channels.filter((c): c is string => typeof c === 'string') : [],
    cta: typeof r.cta === 'string' ? r.cta : '',
    proposedAt: typeof r.proposedAt === 'number' ? r.proposedAt : 0,
  };
}

export function useProposedOffers(workspaceId?: string): ProposedOfferRow[] {
  /* eslint-disable react-hooks/rules-of-hooks */
  if (isConvexEnabled()) {
    const data = useQuery(proposalsApi.listProposedOffers as never, {
      workspaceId: workspaceKey(workspaceId),
    } as never) as unknown[] | null | undefined;
    if (!Array.isArray(data)) return EMPTY_OFFERS;
    return data
      .map(coerceConvexOffer)
      .filter((row): row is ProposedOfferRow => row !== null);
  }
  return useSyncExternalStore(
    subscribe,
    () => loadOffers(workspaceId),
    () => EMPTY_OFFERS
  );
  /* eslint-enable react-hooks/rules-of-hooks */
}

export function useProposedCampaigns(workspaceId?: string): ProposedCampaignRow[] {
  /* eslint-disable react-hooks/rules-of-hooks */
  if (isConvexEnabled()) {
    const data = useQuery(proposalsApi.listProposedCampaigns as never, {
      workspaceId: workspaceKey(workspaceId),
    } as never) as unknown[] | null | undefined;
    if (!Array.isArray(data)) return EMPTY_CAMPAIGNS;
    return data
      .map(coerceConvexCampaign)
      .filter((row): row is ProposedCampaignRow => row !== null);
  }
  return useSyncExternalStore(
    subscribe,
    () => loadCampaigns(workspaceId),
    () => EMPTY_CAMPAIGNS
  );
  /* eslint-enable react-hooks/rules-of-hooks */
}

export function setProposedOffers(
  offers: OfferContext[],
  workspaceId?: string
): void {
  const now = Date.now();
  const rows: ProposedOfferRow[] = offers.map((offer) => ({
    rowId: `local-offer-${offer.id}`,
    proposalId: offer.id,
    ...offer,
    proposedAt: now,
  }));
  offerCache.set(workspaceKey(workspaceId), rows);
  if (isConvexEnabled()) {
    const client = getConvexClient();
    if (client) {
      void client.mutation(proposalsApi.replaceProposedOffers as never, {
        workspaceId: workspaceKey(workspaceId),
        offers: offers.map((offer) => ({
          proposalId: offer.id,
          name: offer.name,
          summary: offer.summary,
          claims: offer.claims,
          heroAsset: offer.heroAsset,
        })),
      } as never);
    }
  }
  notify();
}

export function setProposedCampaigns(
  campaigns: CampaignContext[],
  workspaceId?: string
): void {
  const now = Date.now();
  const rows: ProposedCampaignRow[] = campaigns.map((campaign) => ({
    rowId: `local-campaign-${campaign.id}`,
    proposalId: campaign.id,
    ...campaign,
    proposedAt: now,
  }));
  campaignCache.set(workspaceKey(workspaceId), rows);
  if (isConvexEnabled()) {
    const client = getConvexClient();
    if (client) {
      void client.mutation(proposalsApi.replaceProposedCampaigns as never, {
        workspaceId: workspaceKey(workspaceId),
        campaigns: campaigns.map((campaign) => ({
          proposalId: campaign.id,
          name: campaign.name,
          goal: campaign.goal,
          audience: campaign.audience,
          channels: campaign.channels,
          cta: campaign.cta,
        })),
      } as never);
    }
  }
  notify();
}

export function dismissProposedOffer(rowId: string, workspaceId?: string): void {
  const key = workspaceKey(workspaceId);
  const rows = offerCache.get(key) ?? [];
  offerCache.set(key, rows.filter((row) => row.rowId !== rowId));
  if (isConvexEnabled()) {
    const client = getConvexClient();
    if (client && !rowId.startsWith('local-')) {
      void client.mutation(proposalsApi.removeProposedOffer as never, {
        id: rowId,
      } as never);
    }
  }
  notify();
}

export function dismissProposedCampaign(rowId: string, workspaceId?: string): void {
  const key = workspaceKey(workspaceId);
  const rows = campaignCache.get(key) ?? [];
  campaignCache.set(key, rows.filter((row) => row.rowId !== rowId));
  if (isConvexEnabled()) {
    const client = getConvexClient();
    if (client && !rowId.startsWith('local-')) {
      void client.mutation(proposalsApi.removeProposedCampaign as never, {
        id: rowId,
      } as never);
    }
  }
  notify();
}

export function resetProposalsForTests(): void {
  offerCache.clear();
  campaignCache.clear();
  notify();
}

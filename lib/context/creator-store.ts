'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { getConvexClient, isConvexEnabled } from '@/lib/convex/client';
import { useReferences } from '@/lib/references/store';
import { useSignals, isMuted, displaySignalValue } from '@/lib/signals/store';
import type { SignalRecord } from '@/lib/signals/types';
import {
  DEMO_CREATOR_CONTEXT,
  type BrandContext,
  type CampaignContext,
  type CreatorContextModel,
  type InputSetDraft,
  type KnowledgeSource,
  type OfferContext,
  type SignalContext,
} from './model';

export const DEFAULT_WORKSPACE_ID = 'demo-ws';
export const BRAND_CONTEXT_STORAGE_KEY = 'aether.brand.v1';
export const OFFER_CONTEXT_STORAGE_KEY = 'aether.offer.v1';
export const CAMPAIGN_CONTEXT_STORAGE_KEY = 'aether.campaign.v1';
export const WORKSPACE_CONTEXT_STORAGE_KEY = 'aether.workspaceContext.v1';

type Listener = () => void;
type SliceName = 'brand' | 'offer' | 'campaign' | 'inputSet';

const listeners = new Set<Listener>();
const brandCache = new Map<string, BrandContext>();
const offerCache = new Map<string, OfferContext>();
const campaignCache = new Map<string, CampaignContext>();
const inputSetCache = new Map<string, InputSetDraft>();

const creatorContextApi = (anyApi as unknown as {
  creatorContext: {
    getBrand: unknown;
    saveBrand: unknown;
    getOffer: unknown;
    saveOffer: unknown;
    getCampaign: unknown;
    saveCampaign: unknown;
    getInputSet: unknown;
    saveWorkspaceContext: unknown;
  };
}).creatorContext;

function workspaceKey(workspaceId?: string): string {
  return workspaceId?.trim() || DEFAULT_WORKSPACE_ID;
}

function storageKey(base: string, workspaceId?: string): string {
  const key = workspaceKey(workspaceId);
  return key === DEFAULT_WORKSPACE_ID ? base : `${base}:${key}`;
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify() {
  for (const listener of listeners) listener();
}

function readJson(key: string): unknown {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be disabled; in-memory cache still drives the current UI.
  }
}

function normalizeHex(value: string): string | null {
  const raw = value.trim().replace(/^#/, '');
  if (!/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) return null;
  const expanded =
    raw.length === 3
      ? raw
          .split('')
          .map((ch) => `${ch}${ch}`)
          .join('')
      : raw;
  return `#${expanded.toUpperCase()}`;
}

function compactStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean)
    : [];
}

function isKnowledgeSource(value: unknown): value is KnowledgeSource {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    (v.kind === 'url' || v.kind === 'repo' || v.kind === 'upload' || v.kind === 'asset') &&
    typeof v.label === 'string' &&
    typeof v.note === 'string'
  );
}

export function coerceBrandContext(value: unknown): BrandContext | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || typeof v.name !== 'string') return null;

  const palette = Array.isArray(v.palette)
    ? v.palette
        .map((entry) => (typeof entry === 'string' ? normalizeHex(entry) : null))
        .filter((entry): entry is string => entry !== null)
    : [];

  return {
    id: v.id,
    name: v.name.trim() || DEMO_CREATOR_CONTEXT.brand.name,
    palette,
    type: compactStringArray(v.type),
    voice: typeof v.voice === 'string' ? v.voice.trim() : '',
    knowledgeSources: Array.isArray(v.knowledgeSources)
      ? v.knowledgeSources.filter(isKnowledgeSource)
      : [],
  };
}

export function coerceOfferContext(value: unknown): OfferContext | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || typeof v.name !== 'string') return null;
  return {
    id: v.id,
    name: v.name.trim() || DEMO_CREATOR_CONTEXT.offer.name,
    summary: typeof v.summary === 'string' ? v.summary.trim() : '',
    claims: compactStringArray(v.claims),
    heroAsset: typeof v.heroAsset === 'string' ? v.heroAsset.trim() : '',
    heroAssetReferenceId:
      typeof v.heroAssetReferenceId === 'string' && v.heroAssetReferenceId
        ? v.heroAssetReferenceId
        : undefined,
  };
}

export function coerceCampaignContext(value: unknown): CampaignContext | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || typeof v.name !== 'string') return null;
  return {
    id: v.id,
    name: v.name.trim() || DEMO_CREATOR_CONTEXT.campaign.name,
    goal: typeof v.goal === 'string' ? v.goal.trim() : '',
    audience: typeof v.audience === 'string' ? v.audience.trim() : '',
    channels: compactStringArray(v.channels),
    cta: typeof v.cta === 'string' ? v.cta.trim() : '',
  };
}

function coerceInputSet(value: unknown): InputSetDraft | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string') return null;
  return {
    id: v.id,
    referenceCount: typeof v.referenceCount === 'number' ? v.referenceCount : 0,
    signalIds: compactStringArray(v.signalIds),
    referenceIds: compactStringArray(v.referenceIds),
    constraints: compactStringArray(v.constraints),
  };
}

function loadBrand(workspaceId?: string): BrandContext {
  const key = workspaceKey(workspaceId);
  if (!brandCache.has(key)) {
    brandCache.set(
      key,
      coerceBrandContext(readJson(storageKey(BRAND_CONTEXT_STORAGE_KEY, workspaceId))) ??
        DEMO_CREATOR_CONTEXT.brand
    );
  }
  return brandCache.get(key)!;
}

function loadOffer(workspaceId?: string): OfferContext {
  const key = workspaceKey(workspaceId);
  if (!offerCache.has(key)) {
    offerCache.set(
      key,
      coerceOfferContext(readJson(storageKey(OFFER_CONTEXT_STORAGE_KEY, workspaceId))) ??
        DEMO_CREATOR_CONTEXT.offer
    );
  }
  return offerCache.get(key)!;
}

function loadCampaign(workspaceId?: string): CampaignContext {
  const key = workspaceKey(workspaceId);
  if (!campaignCache.has(key)) {
    campaignCache.set(
      key,
      coerceCampaignContext(readJson(storageKey(CAMPAIGN_CONTEXT_STORAGE_KEY, workspaceId))) ??
        DEMO_CREATOR_CONTEXT.campaign
    );
  }
  return campaignCache.get(key)!;
}

function loadInputSet(workspaceId?: string): InputSetDraft {
  const key = workspaceKey(workspaceId);
  if (!inputSetCache.has(key)) {
    inputSetCache.set(
      key,
      coerceInputSet(readJson(storageKey(WORKSPACE_CONTEXT_STORAGE_KEY, workspaceId))) ??
        DEMO_CREATOR_CONTEXT.inputSet
    );
  }
  return inputSetCache.get(key)!;
}

function getServerBrand(): BrandContext {
  return DEMO_CREATOR_CONTEXT.brand;
}

function getServerOffer(): OfferContext {
  return DEMO_CREATOR_CONTEXT.offer;
}

function getServerCampaign(): CampaignContext {
  return DEMO_CREATOR_CONTEXT.campaign;
}

function getServerInputSet(): InputSetDraft {
  return DEMO_CREATOR_CONTEXT.inputSet;
}

function saveMemory<T>(
  slice: SliceName,
  workspaceId: string | undefined,
  value: T,
  coerce: (value: unknown) => T | null,
  fallback: T,
  cache: Map<string, T>,
  baseKey: string
): T {
  const normalized = coerce(value) ?? fallback;
  cache.set(workspaceKey(workspaceId), normalized);
  writeJson(storageKey(baseKey, workspaceId), normalized);
  notify();
  void slice;
  return normalized;
}

export function useBrandContext(workspaceId?: string): BrandContext {
  /* eslint-disable react-hooks/rules-of-hooks */
  if (isConvexEnabled()) {
    const data = useQuery(creatorContextApi.getBrand as never, {
      workspaceId: workspaceKey(workspaceId),
    } as never) as BrandContext | null | undefined;
    return coerceBrandContext(data) ?? DEMO_CREATOR_CONTEXT.brand;
  }
  return useSyncExternalStore(
    subscribe,
    () => loadBrand(workspaceId),
    getServerBrand
  );
  /* eslint-enable react-hooks/rules-of-hooks */
}

export function saveBrandContext(
  context: BrandContext,
  workspaceId?: string,
  onError?: (err: unknown) => void
): void {
  if (isConvexEnabled()) {
    const client = getConvexClient();
    if (client) {
      client
        .mutation(creatorContextApi.saveBrand as never, {
          workspaceId: workspaceKey(workspaceId),
          brand: coerceBrandContext(context) ?? DEMO_CREATOR_CONTEXT.brand,
        } as never)
        .catch((err: unknown) => {
          if (
            typeof window !== 'undefined' &&
            new URLSearchParams(window.location.search).get('debug') === '1'
          ) {
            console.error('[aether] saveBrand mutation failed:', err);
          }
          onError?.(err);
        });
    }
    return;
  }
  saveMemory(
    'brand',
    workspaceId,
    context,
    coerceBrandContext,
    DEMO_CREATOR_CONTEXT.brand,
    brandCache,
    BRAND_CONTEXT_STORAGE_KEY
  );
}

export function useOfferContext(workspaceId?: string): OfferContext {
  /* eslint-disable react-hooks/rules-of-hooks */
  if (isConvexEnabled()) {
    const data = useQuery(creatorContextApi.getOffer as never, {
      workspaceId: workspaceKey(workspaceId),
    } as never) as OfferContext | null | undefined;
    return coerceOfferContext(data) ?? DEMO_CREATOR_CONTEXT.offer;
  }
  return useSyncExternalStore(
    subscribe,
    () => loadOffer(workspaceId),
    getServerOffer
  );
  /* eslint-enable react-hooks/rules-of-hooks */
}

export function saveOfferContext(context: OfferContext, workspaceId?: string): void {
  if (isConvexEnabled()) {
    const client = getConvexClient();
    if (client) {
      void client.mutation(creatorContextApi.saveOffer as never, {
        workspaceId: workspaceKey(workspaceId),
        offer: coerceOfferContext(context) ?? DEMO_CREATOR_CONTEXT.offer,
      } as never);
    }
    return;
  }
  saveMemory(
    'offer',
    workspaceId,
    context,
    coerceOfferContext,
    DEMO_CREATOR_CONTEXT.offer,
    offerCache,
    OFFER_CONTEXT_STORAGE_KEY
  );
}

export function useCampaignContext(workspaceId?: string): CampaignContext {
  /* eslint-disable react-hooks/rules-of-hooks */
  if (isConvexEnabled()) {
    const data = useQuery(creatorContextApi.getCampaign as never, {
      workspaceId: workspaceKey(workspaceId),
    } as never) as CampaignContext | null | undefined;
    return coerceCampaignContext(data) ?? DEMO_CREATOR_CONTEXT.campaign;
  }
  return useSyncExternalStore(
    subscribe,
    () => loadCampaign(workspaceId),
    getServerCampaign
  );
  /* eslint-enable react-hooks/rules-of-hooks */
}

export function saveCampaignContext(context: CampaignContext, workspaceId?: string): void {
  if (isConvexEnabled()) {
    const client = getConvexClient();
    if (client) {
      void client.mutation(creatorContextApi.saveCampaign as never, {
        workspaceId: workspaceKey(workspaceId),
        campaign: coerceCampaignContext(context) ?? DEMO_CREATOR_CONTEXT.campaign,
      } as never);
    }
    return;
  }
  saveMemory(
    'campaign',
    workspaceId,
    context,
    coerceCampaignContext,
    DEMO_CREATOR_CONTEXT.campaign,
    campaignCache,
    CAMPAIGN_CONTEXT_STORAGE_KEY
  );
}

export function useWorkspaceInputSet(workspaceId?: string): InputSetDraft {
  /* eslint-disable react-hooks/rules-of-hooks */
  if (isConvexEnabled()) {
    const data = useQuery(creatorContextApi.getInputSet as never, {
      workspaceId: workspaceKey(workspaceId),
    } as never) as InputSetDraft | null | undefined;
    return coerceInputSet(data) ?? DEMO_CREATOR_CONTEXT.inputSet;
  }
  return useSyncExternalStore(
    subscribe,
    () => loadInputSet(workspaceId),
    getServerInputSet
  );
  /* eslint-enable react-hooks/rules-of-hooks */
}

export function saveWorkspaceInputSet(inputSet: InputSetDraft, workspaceId?: string): void {
  const normalized = coerceInputSet(inputSet) ?? DEMO_CREATOR_CONTEXT.inputSet;
  if (isConvexEnabled()) {
    const client = getConvexClient();
    if (client) {
      void client.mutation(creatorContextApi.saveWorkspaceContext as never, {
        workspaceId: workspaceKey(workspaceId),
        inputSet: normalized,
      } as never);
    }
    return;
  }
  saveMemory(
    'inputSet',
    workspaceId,
    normalized,
    coerceInputSet,
    DEMO_CREATOR_CONTEXT.inputSet,
    inputSetCache,
    WORKSPACE_CONTEXT_STORAGE_KEY
  );
}

function signalToContext(record: SignalRecord): SignalContext {
  return {
    id: record.id,
    title: displaySignalValue(record),
    platform:
      record.kind === 'account'
        ? 'account'
        : record.kind === 'hashtag'
          ? 'social'
          : 'keyword',
    lift: '',
  };
}

export function useCreatorContext(workspaceId?: string): CreatorContextModel {
  const brand = useBrandContext(workspaceId);
  const offer = useOfferContext(workspaceId);
  const campaign = useCampaignContext(workspaceId);
  const savedInputSet = useWorkspaceInputSet(workspaceId);
  const signalRecords = useSignals(workspaceId);
  const references = useReferences(workspaceId);

  return useMemo(() => {
    const liveSignals = signalRecords.filter((signal) => !isMuted(signal));
    const signals =
      signalRecords.length > 0
        ? signalRecords.map(signalToContext)
        : DEMO_CREATOR_CONTEXT.signals;
    const signalIds =
      liveSignals.length > 0
        ? liveSignals.map((signal) => signal.id)
        : savedInputSet.signalIds.length > 0
          ? savedInputSet.signalIds
          : DEMO_CREATOR_CONTEXT.inputSet.signalIds;

    return {
      ...DEMO_CREATOR_CONTEXT,
      brand,
      offer,
      campaign,
      signals,
      inputSet: {
        ...savedInputSet,
        referenceCount: references.length,
        referenceIds:
          savedInputSet.referenceIds && savedInputSet.referenceIds.length > 0
            ? savedInputSet.referenceIds
            : references.map((ref) => ref.id),
        signalIds,
      },
    };
  }, [brand, campaign, offer, references, savedInputSet, signalRecords]);
}

export function resetBrandContextForTests(): void {
  brandCache.set(DEFAULT_WORKSPACE_ID, DEMO_CREATOR_CONTEXT.brand);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(BRAND_CONTEXT_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  notify();
}

export function resetCreatorContextForTests(): void {
  brandCache.clear();
  offerCache.clear();
  campaignCache.clear();
  inputSetCache.clear();
  if (typeof window !== 'undefined') {
    for (const key of [
      BRAND_CONTEXT_STORAGE_KEY,
      OFFER_CONTEXT_STORAGE_KEY,
      CAMPAIGN_CONTEXT_STORAGE_KEY,
      WORKSPACE_CONTEXT_STORAGE_KEY,
    ]) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // ignore
      }
    }
  }
  notify();
}

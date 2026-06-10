'use client';

import { useSyncExternalStore } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { isConvexEnabled } from '@/lib/convex/client';
import { normalizeXHandle } from './handle';
import type {
  PresenceProfile,
  PresenceStrategyRecord,
  PresenceStrategyShape,
} from './types';

const LS_KEY = 'aether.presence.v1';
const DEFAULT_WORKSPACE_ID = 'demo-ws';

const presenceApi = (anyApi as unknown as {
  presence: {
    listProfiles: unknown;
    addProfile: unknown;
    setActiveProfile: unknown;
    listStrategies: unknown;
    upsertStrategyProposal: unknown;
    acceptStrategy: unknown;
    rejectStrategy: unknown;
  };
}).presence;

type Listener = () => void;

interface PresenceState {
  profiles: PresenceProfile[];
  strategies: PresenceStrategyRecord[];
  activeProfileByWorkspace: Record<string, string>;
}

export interface AddPresenceProfileInput {
  label: string;
  xHandle: string;
  goal: string;
  targetMetric?: string;
}

export interface PresenceWorkspaceActions {
  addProfile(input: AddPresenceProfileInput): string;
  setActiveProfile(profileId: string): void;
  saveStrategyProposal(profileId: string, strategy: PresenceStrategyShape): string;
  acceptStrategy(strategyId: string): void;
  rejectStrategy(strategyId: string): void;
}

const EMPTY_STATE: PresenceState = {
  profiles: [],
  strategies: [],
  activeProfileByWorkspace: {},
};

const listeners = new Set<Listener>();
let cache: PresenceState | null = null;
let seq = 0;

function workspaceKey(workspaceId?: string): string {
  return workspaceId?.trim() || DEFAULT_WORKSPACE_ID;
}

function readState(): PresenceState {
  if (typeof window === 'undefined') return EMPTY_STATE;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return EMPTY_STATE;
    return coerceState(JSON.parse(raw));
  } catch {
    return EMPTY_STATE;
  }
}

function writeState(state: PresenceState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    // The in-memory cache still drives the current rail session.
  }
}

function current(): PresenceState {
  if (cache === null) cache = readState();
  return cache;
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

function update(fn: (state: PresenceState) => PresenceState): void {
  cache = fn(current());
  writeState(cache);
  notify();
}

function getServerSnapshot(): PresenceState {
  return EMPTY_STATE;
}

export function usePresenceWorkspace(workspaceId?: string): {
  profiles: PresenceProfile[];
  strategies: PresenceStrategyRecord[];
  activeProfileId?: string;
  actions: PresenceWorkspaceActions;
} {
  const key = workspaceKey(workspaceId);
  /* eslint-disable react-hooks/rules-of-hooks */
  if (isConvexEnabled()) {
    const profilesData = useQuery(presenceApi.listProfiles as never, {
      workspaceId: key,
    } as never) as Array<PresenceProfile & { active?: boolean }> | undefined;
    const strategiesData = useQuery(presenceApi.listStrategies as never, {
      workspaceId: key,
    } as never) as PresenceStrategyRecord[] | undefined;
    const addProfile = useMutation(presenceApi.addProfile as never);
    const setActiveProfile = useMutation(presenceApi.setActiveProfile as never);
    const upsertStrategyProposal = useMutation(
      presenceApi.upsertStrategyProposal as never
    );
    const acceptStrategy = useMutation(presenceApi.acceptStrategy as never);
    const rejectStrategy = useMutation(presenceApi.rejectStrategy as never);
    const profiles = profilesData ?? [];
    const strategies = strategiesData ?? [];
    const activeProfileId =
      profiles.find((profile) => profile.active)?.id ?? profiles[0]?.id;
    return {
      profiles,
      strategies,
      activeProfileId,
      actions: {
        addProfile(input) {
          void addProfile({ workspaceId: key, ...input } as never);
          return '';
        },
        setActiveProfile(profileId) {
          void setActiveProfile({ workspaceId: key, profileId } as never);
        },
        saveStrategyProposal(profileId, strategy) {
          void upsertStrategyProposal({
            workspaceId: key,
            profileId,
            strategy,
          } as never);
          return '';
        },
        acceptStrategy(strategyId) {
          void acceptStrategy({ workspaceId: key, strategyId } as never);
        },
        rejectStrategy(strategyId) {
          void rejectStrategy({ workspaceId: key, strategyId } as never);
        },
      },
    };
  }
  /* eslint-enable react-hooks/rules-of-hooks */

  const state = useSyncExternalStore(subscribe, current, getServerSnapshot);
  const profiles = state.profiles.filter((profile) => profile.workspaceId === key);
  const strategies = state.strategies.filter((strategy) => strategy.workspaceId === key);
  const activeProfileId = state.activeProfileByWorkspace[key] ?? profiles[0]?.id;
  return {
    profiles,
    strategies,
    activeProfileId,
    actions: {
      addProfile(input) {
        const label = input.label.trim();
        const xHandle = normalizeXHandle(input.xHandle);
        const goal = input.goal.trim();
        if (!label || !xHandle || !goal) return '';
        const now = Date.now();
        const id = `presence_${now.toString(36)}_${seq++}`;
        const profile: PresenceProfile = {
          id,
          workspaceId: key,
          label,
          xHandle,
          goal,
          targetMetric: input.targetMetric?.trim() || undefined,
          createdAt: now,
          updatedAt: now,
        };
        update((prev) => ({
          ...prev,
          profiles: [...prev.profiles, profile],
          activeProfileByWorkspace: {
            ...prev.activeProfileByWorkspace,
            [key]: prev.activeProfileByWorkspace[key] ?? id,
          },
        }));
        return id;
      },
      setActiveProfile(profileId) {
        update((prev) => ({
          ...prev,
          activeProfileByWorkspace: {
            ...prev.activeProfileByWorkspace,
            [key]: profileId,
          },
        }));
      },
      saveStrategyProposal(profileId, strategy) {
        const now = Date.now();
        const existing = current().strategies.find(
          (row) => row.workspaceId === key && row.profileId === profileId
        );
        const id = existing?.id ?? `strategy_${now.toString(36)}_${seq++}`;
        const record: PresenceStrategyRecord = {
          id,
          workspaceId: key,
          profileId,
          status: 'proposed',
          ...strategy,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        };
        update((prev) => ({
          ...prev,
          strategies: [
            ...prev.strategies.filter((row) => row.id !== id),
            record,
          ],
        }));
        return id;
      },
      acceptStrategy(strategyId) {
        const now = Date.now();
        update((prev) => ({
          ...prev,
          strategies: prev.strategies.map((row) =>
            row.id === strategyId
              ? { ...row, status: 'accepted', acceptedAt: now, updatedAt: now }
              : row
          ),
        }));
      },
      rejectStrategy(strategyId) {
        const now = Date.now();
        update((prev) => ({
          ...prev,
          strategies: prev.strategies.map((row) =>
            row.id === strategyId
              ? { ...row, status: 'rejected', rejectedAt: now, updatedAt: now }
              : row
          ),
        }));
      },
    },
  };
}

export function presenceSectionSummary(
  profiles: ReadonlyArray<PresenceProfile>,
  activeProfileId?: string
): string {
  if (profiles.length === 0) return '0 profiles';
  const active = profiles.find((profile) => profile.id === activeProfileId);
  return active ? `${profiles.length} · ${active.label}` : `${profiles.length} profiles`;
}

export function resetPresenceForTests(): void {
  cache = { ...EMPTY_STATE };
  seq = 0;
  writeState(cache);
  notify();
}

function coerceState(input: unknown): PresenceState {
  if (!input || typeof input !== 'object') return EMPTY_STATE;
  const record = input as Record<string, unknown>;
  return {
    profiles: Array.isArray(record.profiles)
      ? record.profiles.filter(isPresenceProfile)
      : [],
    strategies: Array.isArray(record.strategies)
      ? record.strategies.filter(isPresenceStrategy)
      : [],
    activeProfileByWorkspace:
      record.activeProfileByWorkspace &&
      typeof record.activeProfileByWorkspace === 'object' &&
      !Array.isArray(record.activeProfileByWorkspace)
        ? Object.fromEntries(
            Object.entries(record.activeProfileByWorkspace).filter(
              ([key, value]) => key && typeof value === 'string'
            )
          )
        : {},
  };
}

function isPresenceProfile(input: unknown): input is PresenceProfile {
  if (!input || typeof input !== 'object') return false;
  const value = input as Record<string, unknown>;
  return (
    typeof value.id === 'string' &&
    typeof value.workspaceId === 'string' &&
    typeof value.label === 'string' &&
    typeof value.xHandle === 'string' &&
    typeof value.goal === 'string' &&
    typeof value.createdAt === 'number' &&
    typeof value.updatedAt === 'number'
  );
}

function isPresenceStrategy(input: unknown): input is PresenceStrategyRecord {
  if (!input || typeof input !== 'object') return false;
  const value = input as Record<string, unknown>;
  return (
    typeof value.id === 'string' &&
    typeof value.workspaceId === 'string' &&
    typeof value.profileId === 'string' &&
    (value.status === 'proposed' || value.status === 'accepted' || value.status === 'rejected') &&
    typeof value.positioning === 'string' &&
    Array.isArray(value.icpAccounts) &&
    Array.isArray(value.pillars) &&
    typeof value.cadence === 'string' &&
    Array.isArray(value.skipList) &&
    typeof value.goalMetric90d === 'string' &&
    typeof value.createdAt === 'number' &&
    typeof value.updatedAt === 'number'
  );
}

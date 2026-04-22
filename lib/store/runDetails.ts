'use client';

import { useSyncExternalStore } from 'react';

export type RunActivityTone = 'neutral' | 'ok' | 'error';

export interface RunActivityRecord {
  id: string;
  at: number;
  title: string;
  detail?: string;
  tone: RunActivityTone;
}

export interface RunDetailsRecord {
  runId: string;
  providerHint?: string;
  modelHint?: string;
  activities: RunActivityRecord[];
}

type Listener = () => void;

const state = new Map<string, RunDetailsRecord>();
const listeners = new Set<Listener>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getRecord(runId?: string | null): RunDetailsRecord | null {
  if (!runId) return null;
  return state.get(runId) ?? null;
}

export function useRunDetails(runId?: string | null): RunDetailsRecord | null {
  return useSyncExternalStore(
    subscribe,
    () => getRecord(runId),
    () => null
  );
}

export function initRunDetails(
  runId: string,
  seed: Omit<RunDetailsRecord, 'runId' | 'activities'> & {
    activities?: RunActivityRecord[];
  } = {}
): void {
  state.set(runId, {
    runId,
    providerHint: seed.providerHint,
    modelHint: seed.modelHint,
    activities: seed.activities ?? [],
  });
  notify();
}

export function patchRunDetails(
  runId: string,
  patch: Partial<Omit<RunDetailsRecord, 'runId' | 'activities'>>
): void {
  const current = state.get(runId) ?? { runId, activities: [] };
  state.set(runId, {
    ...current,
    ...patch,
  });
  notify();
}

export function appendRunActivity(
  runId: string,
  activity: Omit<RunActivityRecord, 'id' | 'at' | 'tone'> & {
    at?: number;
    tone?: RunActivityTone;
  }
): void {
  const current = state.get(runId) ?? { runId, activities: [] };
  const next: RunActivityRecord = {
    id: `${runId}_${current.activities.length}`,
    at: activity.at ?? Date.now(),
    title: activity.title,
    detail: activity.detail,
    tone: activity.tone ?? 'neutral',
  };
  state.set(runId, {
    ...current,
    activities: [...current.activities, next].slice(-12),
  });
  notify();
}

export function resetRunDetailsForTests(): void {
  state.clear();
  notify();
}

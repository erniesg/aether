'use client';

import { useSyncExternalStore } from 'react';

export type RunActivityTone = 'neutral' | 'ok' | 'error';
export type RunFrameStatus = 'queued' | 'running' | 'returned' | 'placed' | 'error';

export interface RunActivityRecord {
  id: string;
  at: number;
  title: string;
  detail?: string;
  tone: RunActivityTone;
}

export interface RunFrameRecord {
  id: string;
  label?: string;
  aspectRatio?: string;
  status: RunFrameStatus;
  startedAt?: number;
  updatedAt: number;
  error?: string;
  imageUrl?: string;
}

export interface RunDetailsRecord {
  runId: string;
  providerHint?: string;
  modelHint?: string;
  activities: RunActivityRecord[];
  frames: RunFrameRecord[];
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

/** Read-only snapshot of every in-memory run-details record. Used by callbacks
 * (e.g. export pack assembly) that need a fresh read outside React's hook tree. */
export function getAllRunDetailsSnapshot(): RunDetailsRecord[] {
  return Array.from(state.values());
}

export function initRunDetails(
  runId: string,
  seed: Partial<Omit<RunDetailsRecord, 'runId'>> & {
    activities?: RunActivityRecord[];
    frames?: RunFrameRecord[];
  } = {}
): void {
  state.set(runId, {
    runId,
    providerHint: seed.providerHint,
    modelHint: seed.modelHint,
    activities: seed.activities ?? [],
    frames: seed.frames ?? [],
  });
  notify();
}

export function patchRunDetails(
  runId: string,
  patch: Partial<Omit<RunDetailsRecord, 'runId' | 'activities'>>
): void {
  const current = state.get(runId) ?? { runId, activities: [], frames: [] };
  state.set(runId, {
    ...current,
    ...patch,
  });
  notify();
}

export function upsertRunFrame(
  runId: string,
  frame: Omit<RunFrameRecord, 'updatedAt'> & { updatedAt?: number }
): void {
  const current = state.get(runId) ?? { runId, activities: [], frames: [] };
  const next: RunFrameRecord = {
    ...frame,
    updatedAt: frame.updatedAt ?? Date.now(),
  };
  const idx = current.frames.findIndex((entry) => entry.id === frame.id);
  const frames =
    idx === -1
      ? [...current.frames, next]
      : current.frames.map((entry, entryIdx) =>
          entryIdx === idx ? { ...entry, ...next } : entry
        );
  state.set(runId, {
    ...current,
    frames,
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
  const current = state.get(runId) ?? { runId, activities: [], frames: [] };
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

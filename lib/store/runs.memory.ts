'use client';

import { useSyncExternalStore } from 'react';
import type { CapabilityRunRecord, RunStatus, RunStep } from './runs.types';

export type { CapabilityRunRecord, RunStatus, RunStep };

type Listener = () => void;

const state = {
  runs: [] as CapabilityRunRecord[],
};
const listeners = new Set<Listener>();

function notify() {
  for (const l of listeners) l();
}

function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function getSnapshot(): CapabilityRunRecord[] {
  return state.runs;
}

const SERVER_SNAPSHOT: CapabilityRunRecord[] = [];
function getServerSnapshot(): CapabilityRunRecord[] {
  return SERVER_SNAPSHOT;
}

export function useRunsMemory(): CapabilityRunRecord[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function genId(): string {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function startRunMemory(
  partial: Omit<CapabilityRunRecord, 'id' | 'status' | 'startedAt'> & { status?: RunStatus },
  explicitId?: string
): string {
  const id = explicitId ?? genId();
  const record: CapabilityRunRecord = {
    ...partial,
    id,
    status: partial.status ?? 'running',
    startedAt: Date.now(),
  };
  state.runs = [record, ...state.runs].slice(0, 50);
  notify();
  return id;
}

export function stepRunMemory(id: string, step: RunStep): void {
  state.runs = state.runs.map((r) => (r.id === id ? { ...r, step } : r));
  notify();
}

export function finishRunMemory(id: string, patch: Partial<CapabilityRunRecord>): void {
  state.runs = state.runs.map((r) =>
    r.id === id
      ? { ...r, ...patch, finishedAt: Date.now(), status: patch.status ?? 'ok', step: 'done' }
      : r
  );
  notify();
}

export function failRunMemory(id: string, error: string, httpStatus?: number): void {
  finishRunMemory(id, { status: 'error', error, httpStatus });
}

export function clearRunsMemory(): void {
  state.runs = [];
  notify();
}

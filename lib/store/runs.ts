'use client';

import { useSyncExternalStore } from 'react';

/**
 * In-memory capability-run log. Replaces the Convex-backed store once the
 * Convex project is provisioned. Keeps the same public shape so the swap is
 * a one-file change — consumers see the same selectors.
 */

export type RunStatus = 'running' | 'ok' | 'error';
export type RunStep =
  | 'prepared'
  | 'sending'
  | 'awaiting'
  | 'received'
  | 'parsing'
  | 'placing'
  | 'done';

export interface CapabilityRunRecord {
  id: string;
  tool: string;                   // 'image-gen' | 'image-edit' | etc.
  provider: string;               // 'gemini' | 'volcengine' | ...
  model: string;
  prompt: string;
  rewrittenPrompt?: string;
  rationale?: string;
  aspectRatio?: string;
  imageUrl?: string;
  latencyMs?: number;
  status: RunStatus;
  step?: RunStep;                 // sub-state while running
  startedAt: number;
  finishedAt?: number;
  error?: string;
  httpStatus?: number;
}

type Listener = () => void;

const state = {
  runs: [] as CapabilityRunRecord[],
};
const listeners = new Set<Listener>();

function notify() {
  for (const l of listeners) l();
}

export function subscribe(l: Listener): () => void {
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

export function useRuns(): CapabilityRunRecord[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function genId(): string {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function startRun(partial: Omit<CapabilityRunRecord, 'id' | 'status' | 'startedAt'> & { status?: RunStatus }): string {
  const id = genId();
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

export function stepRun(id: string, step: RunStep): void {
  state.runs = state.runs.map((r) => (r.id === id ? { ...r, step } : r));
  notify();
}

export function finishRun(id: string, patch: Partial<CapabilityRunRecord>): void {
  state.runs = state.runs.map((r) =>
    r.id === id ? { ...r, ...patch, finishedAt: Date.now(), status: patch.status ?? 'ok', step: 'done' } : r
  );
  notify();
}

export function failRun(id: string, error: string, httpStatus?: number): void {
  finishRun(id, { status: 'error', error, httpStatus });
}

export function clearRuns(): void {
  state.runs = [];
  notify();
}

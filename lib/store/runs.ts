'use client';

/**
 * Capability-run log facade. Same public API consumers have always used
 * (useRuns / startRun / stepRun / finishRun / failRun / clearRuns).
 *
 * When NEXT_PUBLIC_CONVEX_URL is set, reads come from `useQuery(api.runs.list)`
 * and writes go through ConvexReactClient.mutation against `runs:*` functions.
 * When the flag is empty, everything falls back to the original in-memory
 * store so staging keeps working before Convex is provisioned.
 */

import type { CapabilityRunRecord, RunStatus, RunStep } from './runs.types';
import {
  useRunsMemory,
  startRunMemory,
  stepRunMemory,
  finishRunMemory,
  failRunMemory,
  clearRunsMemory,
  subscribeMemory,
} from './runs.memory';
import {
  useRunsConvex,
  startRunConvex,
  stepRunConvex,
  finishRunConvex,
  failRunConvex,
} from './runs.convex';
import { isConvexEnabled } from '@/lib/convex/client';

export type { CapabilityRunRecord, RunStatus, RunStep };

function genClientRunId(): string {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useRuns(): CapabilityRunRecord[] {
  // NEXT_PUBLIC_CONVEX_URL is inlined at build time by Next.js, so this
  // branch is stable across a given browser session — safe under React's
  // rules of hooks.
  /* eslint-disable react-hooks/rules-of-hooks */
  if (isConvexEnabled()) return useRunsConvex();
  return useRunsMemory();
  /* eslint-enable react-hooks/rules-of-hooks */
}

export function startRun(
  partial: Omit<CapabilityRunRecord, 'id' | 'status' | 'startedAt'> & { status?: RunStatus }
): string {
  if (isConvexEnabled()) {
    const id = genClientRunId();
    startRunConvex(id, partial);
    return id;
  }
  return startRunMemory(partial);
}

export function stepRun(id: string, step: RunStep): void {
  if (isConvexEnabled()) {
    stepRunConvex(id, step);
    return;
  }
  stepRunMemory(id, step);
}

export function finishRun(id: string, patch: Partial<CapabilityRunRecord>): void {
  if (isConvexEnabled()) {
    finishRunConvex(id, patch);
    return;
  }
  finishRunMemory(id, patch);
}

export function failRun(id: string, error: string, httpStatus?: number): void {
  if (isConvexEnabled()) {
    failRunConvex(id, error, httpStatus);
    return;
  }
  failRunMemory(id, error, httpStatus);
}

export function clearRuns(): void {
  clearRunsMemory();
}

/**
 * Preserved from main's public surface so callers (and tests) that subscribe
 * to store notifications keep working. Only observes the in-memory listener
 * set — when Convex is active, updates arrive via `useQuery`, not listeners.
 */
export function subscribe(l: () => void): () => void {
  return subscribeMemory(l);
}

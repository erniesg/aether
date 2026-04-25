'use client';

/**
 * Capability-run log facade. Same public API consumers have always used
 * (useRuns / startRun / stepRun / finishRun / failRun). The only extra export
 * is `resetRunsForTests`, which is — as the name says — test-only plumbing.
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
  abortStuckRunsConvex,
} from './runs.convex';
import { resetRunDetailsForTests } from './runDetails';
import { isConvexEnabled } from '@/lib/convex/client';

export type { CapabilityRunRecord, RunStatus, RunStep };

/**
 * Canonical error string written by `abortStuckRuns` (both memory and Convex
 * paths). Components that show run histories filter these out so stale-abort
 * noise never appears in the UI — only live runs, completions, and genuine
 * failures do.
 */
export const STALE_ABORT_ERROR = 'aborted: run exceeded inactivity threshold';

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

/**
 * Escape hatch: abort every run row that's been `running` for longer than
 * `olderThanMs` (default 60s). Useful when `runs:finish` failed server-side
 * and the composer status indicator is stuck "generating · placing on
 * canvas · NNNNs".
 *
 * Memory-mode fallback iterates the in-memory store directly so the local
 * dev experience matches Convex.
 */
export async function abortStuckRuns(
  olderThanMs = 60_000
): Promise<{ aborted: number }> {
  if (isConvexEnabled()) return abortStuckRunsConvex(olderThanMs);
  const threshold = Date.now() - olderThanMs;
  let aborted = 0;
  for (const run of useRunsMemory()) {
    if (run.status !== 'running') continue;
    if (run.startedAt > threshold) continue;
    failRunMemory(run.id, STALE_ABORT_ERROR);
    aborted += 1;
  }
  return { aborted };
}

/**
 * Test-only helper — empties the in-memory listener-backed store so each
 * test starts from a clean slate. No production UI invokes a "clear runs"
 * action, so there's nothing to dispatch to Convex here; the tests that
 * call this always run with `NEXT_PUBLIC_CONVEX_URL` empty, which routes
 * all reads/writes through memory anyway. If we ever grow a real
 * "delete my run history" feature for creators, that becomes a separate
 * server-side mutation, not this.
 */
export function resetRunsForTests(): void {
  clearRunsMemory();
  resetRunDetailsForTests();
}

/**
 * Preserved from main's public surface so callers (and tests) that subscribe
 * to store notifications keep working. Only observes the in-memory listener
 * set — when Convex is active, updates arrive via `useQuery`, not listeners.
 */
export function subscribe(l: () => void): () => void {
  return subscribeMemory(l);
}

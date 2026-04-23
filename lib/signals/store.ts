'use client';

// Signal-subscription store facade. Mirrors the lib/store/runs pattern: when
// NEXT_PUBLIC_CONVEX_URL is set, reads come from `useQuery(api.signals.list)`
// and writes go through ConvexReactClient.mutation. When empty, everything
// falls back to a localStorage-backed in-memory store so the slice works end-
// to-end in dev and Playwright without Convex provisioning.

import { isConvexEnabled } from '@/lib/convex/client';
import {
  useSignalsMemory,
  addSignalMemory,
  removeSignalMemory,
  muteSignalMemory,
  unmuteSignalMemory,
  clearSignalsMemory,
} from './memory';
import {
  useSignalsConvex,
  addSignalConvex,
  removeSignalConvex,
  muteSignalConvex,
  unmuteSignalConvex,
} from './convex';
import type { SignalKind, SignalRecord } from './types';

export type { SignalKind, SignalRecord };
export {
  isMuted,
  displaySignalValue,
  normalizeSignalValue,
} from './types';

export function useSignals(): SignalRecord[] {
  /* eslint-disable react-hooks/rules-of-hooks */
  if (isConvexEnabled()) return useSignalsConvex();
  return useSignalsMemory();
  /* eslint-enable react-hooks/rules-of-hooks */
}

export function addSignal(kind: SignalKind, value: string): string | null {
  if (isConvexEnabled()) {
    addSignalConvex(kind, value);
    return null;
  }
  return addSignalMemory(kind, value);
}

export function removeSignal(id: string): void {
  if (isConvexEnabled()) {
    removeSignalConvex(id);
    return;
  }
  removeSignalMemory(id);
}

export function muteSignal(id: string, mutedUntil?: number): void {
  if (isConvexEnabled()) {
    muteSignalConvex(id, mutedUntil);
    return;
  }
  muteSignalMemory(id, mutedUntil);
}

export function unmuteSignal(id: string): void {
  if (isConvexEnabled()) {
    unmuteSignalConvex(id);
    return;
  }
  unmuteSignalMemory(id);
}

export function resetSignalsForTests(): void {
  clearSignalsMemory();
}

export function summarizeSignals(
  records: ReadonlyArray<SignalRecord>,
  now: number = Date.now()
): { live: number; muted: number; total: number } {
  let muted = 0;
  for (const r of records) {
    if (typeof r.mutedUntil === 'number' && r.mutedUntil > now) muted++;
  }
  return { live: records.length - muted, muted, total: records.length };
}

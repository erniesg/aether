'use client';

import { useSyncExternalStore } from 'react';
import { useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { isConvexEnabled } from '@/lib/convex/client';
import type { PresenceLedgerLine } from '@/lib/research/presence-metrics';

const EMPTY_LEDGER: PresenceLedgerLine[] = [];
const LS_KEY = 'aether.presenceLedger.v1';

const presenceLedgerApi = (anyApi as unknown as {
  presenceLedger: { listMetrics: unknown };
}).presenceLedger;

type Listener = () => void;

const listeners = new Set<Listener>();
let cache: Map<string, PresenceLedgerLine[]> | null = null;

function keyFor(workspaceId: string, profileId?: string): string {
  return `${workspaceId.trim() || 'demo-ws'}::${profileId?.trim() ?? ''}`;
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function current(): Map<string, PresenceLedgerLine[]> {
  if (cache === null) cache = readCache();
  return cache;
}

function readCache(): Map<string, PresenceLedgerLine[]> {
  if (typeof window === 'undefined') return new Map();
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return new Map();
    const out = new Map<string, PresenceLedgerLine[]>();
    for (const [key, value] of Object.entries(parsed)) {
      if (!Array.isArray(value)) continue;
      const rows = value.filter(isLedgerLine);
      if (rows.length > 0) out.set(key, rows);
    }
    return out;
  } catch {
    return new Map();
  }
}

function writeCache(next: Map<string, PresenceLedgerLine[]>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      LS_KEY,
      JSON.stringify(Object.fromEntries(next.entries()))
    );
  } catch {
    // The in-memory cache still drives the active session.
  }
}

function notify(): void {
  for (const listener of listeners) listener();
}

export function usePresenceLedger(
  workspaceId: string,
  profileId?: string
): PresenceLedgerLine[] {
  const key = keyFor(workspaceId, profileId);
  /* eslint-disable react-hooks/rules-of-hooks */
  if (isConvexEnabled() && profileId) {
    const data = useQuery(presenceLedgerApi.listMetrics as never, {
      workspaceId: workspaceId.trim() || 'demo-ws',
      profileId,
    } as never) as unknown[] | undefined;
    if (!Array.isArray(data)) return EMPTY_LEDGER;
    return buildClientRollup(data);
  }
  return useSyncExternalStore(
    subscribe,
    () => current().get(key) ?? EMPTY_LEDGER,
    () => EMPTY_LEDGER
  );
  /* eslint-enable react-hooks/rules-of-hooks */
}

export function seedPresenceLedgerForTests(
  workspaceId: string,
  profileId: string,
  rows: PresenceLedgerLine[]
): void {
  const next = new Map(current());
  next.set(keyFor(workspaceId, profileId), rows);
  cache = next;
  writeCache(next);
  notify();
}

export function resetPresenceLedgerForTests(): void {
  cache = new Map();
  writeCache(cache);
  notify();
}

function buildClientRollup(rows: unknown[]): PresenceLedgerLine[] {
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    const pillar = typeof record.pillar === 'string' && record.pillar.trim()
      ? record.pillar.trim()
      : 'untagged';
    const likes = numberField(record.likes);
    const reposts = numberField(record.reposts);
    const replies = numberField(record.replies);
    groups.set(pillar, [...(groups.get(pillar) ?? []), likes + reposts + replies]);
  }
  return [...groups.entries()]
    .map(([pillar, values]) => ({
      pillar,
      posts: values.length,
      medianEngagement: median(values),
    }))
    .sort((a, b) => {
      const engagementDelta = b.medianEngagement - a.medianEngagement;
      if (engagementDelta !== 0) return engagementDelta;
      const postsDelta = b.posts - a.posts;
      if (postsDelta !== 0) return postsDelta;
      return a.pillar.localeCompare(b.pillar);
    });
}

function numberField(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function isLedgerLine(input: unknown): input is PresenceLedgerLine {
  if (!input || typeof input !== 'object') return false;
  const value = input as Record<string, unknown>;
  return (
    typeof value.pillar === 'string' &&
    typeof value.posts === 'number' &&
    typeof value.medianEngagement === 'number'
  );
}

'use client';

import { useSyncExternalStore } from 'react';
import { normalizeSignalValue, type SignalKind, type SignalRecord } from './types';

// localStorage-backed in-memory store. Persists across reloads in dev and in
// Playwright runs that don't have Convex provisioned. The singleton cache is
// exported via a getter so tests can reset cleanly.

const LS_KEY = 'aether.signals.v1';

type Listener = () => void;

let cache: SignalRecord[] | null = null;
const listeners = new Set<Listener>();

function loadFromStorage(): SignalRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSignalRecord);
  } catch {
    return [];
  }
}

function isSignalRecord(value: unknown): value is SignalRecord {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    (v.kind === 'keyword' || v.kind === 'hashtag' || v.kind === 'account') &&
    typeof v.value === 'string' &&
    typeof v.addedAt === 'number'
  );
}

function saveToStorage(records: SignalRecord[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(records));
  } catch {
    // storage quota / disabled — the in-memory cache still drives the UI.
  }
}

function current(): SignalRecord[] {
  if (cache === null) cache = loadFromStorage();
  return cache;
}

function notify() {
  for (const l of listeners) l();
}

function update(fn: (prev: SignalRecord[]) => SignalRecord[]) {
  cache = fn(current());
  saveToStorage(cache);
  notify();
}

export function subscribeMemory(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

const SERVER_SNAPSHOT: SignalRecord[] = [];
function getServerSnapshot(): SignalRecord[] {
  return SERVER_SNAPSHOT;
}

export function useSignalsMemory(): SignalRecord[] {
  return useSyncExternalStore(subscribeMemory, current, getServerSnapshot);
}

function genId(): string {
  return `sig_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function addSignalMemory(kind: SignalKind, value: string): string | null {
  const normalized = normalizeSignalValue(kind, value);
  if (!normalized) return null;
  const prev = current();
  const existing = prev.find((r) => r.kind === kind && r.value === normalized);
  if (existing) return existing.id;
  const id = genId();
  update((rs) => [...rs, { id, kind, value: normalized, addedAt: Date.now() }]);
  return id;
}

export function removeSignalMemory(id: string): void {
  update((rs) => rs.filter((r) => r.id !== id));
}

export function muteSignalMemory(id: string, mutedUntil?: number): void {
  const until =
    mutedUntil ?? Date.now() + 1000 * 60 * 60 * 24 * 365 * 5; // ~5y = "indefinite"
  update((rs) => rs.map((r) => (r.id === id ? { ...r, mutedUntil: until } : r)));
}

export function unmuteSignalMemory(id: string): void {
  update((rs) =>
    rs.map((r) => (r.id === id ? { ...r, mutedUntil: undefined } : r))
  );
}

export function clearSignalsMemory(): void {
  cache = [];
  saveToStorage(cache);
  notify();
}

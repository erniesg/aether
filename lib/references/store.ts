'use client';

import { useSyncExternalStore } from 'react';
import type { ReferenceRecord } from '@/lib/providers/reference/types';

/**
 * In-memory + localStorage-backed store for pinned references. Mirrors the
 * signals/memory.ts shape so rails and composer can subscribe coherently
 * without Convex provisioning in Playwright / dev. A persisted Convex-backed
 * store can replace this later without changing call sites.
 */

const LS_KEY = 'aether.references.v1';

type Listener = () => void;

let cache: ReferenceRecord[] | null = null;
const listeners = new Set<Listener>();

function isReferenceRecord(value: unknown): value is ReferenceRecord {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string') return false;
  if (v.kind !== 'image' && v.kind !== 'video' && v.kind !== 'embed') return false;
  if (typeof v.previewUrl !== 'string') return false;
  if (typeof v.capturedAt !== 'string') return false;
  const a = v.attribution as Record<string, unknown> | undefined;
  if (!a || typeof a !== 'object') return false;
  if (typeof a.source !== 'string' || typeof a.url !== 'string') return false;
  return true;
}

function loadFromStorage(): ReferenceRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isReferenceRecord);
  } catch {
    return [];
  }
}

function saveToStorage(records: ReferenceRecord[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(records));
  } catch {
    // Quota / disabled — in-memory cache still drives the UI.
  }
}

function current(): ReferenceRecord[] {
  if (cache === null) cache = loadFromStorage();
  return cache;
}

function notify() {
  for (const l of listeners) l();
}

function update(fn: (prev: ReferenceRecord[]) => ReferenceRecord[]): void {
  cache = fn(current());
  saveToStorage(cache);
  notify();
}

function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

const SERVER_SNAPSHOT: ReferenceRecord[] = [];
function getServerSnapshot(): ReferenceRecord[] {
  return SERVER_SNAPSHOT;
}

export function useReferences(): ReferenceRecord[] {
  return useSyncExternalStore(subscribe, current, getServerSnapshot);
}

export function addReference(record: ReferenceRecord): void {
  update((prev) => {
    // Dedupe on fullUrl (when present) or previewUrl — creators often paste
    // the same share link twice without realising.
    const key = record.fullUrl ?? record.previewUrl;
    if (prev.some((r) => (r.fullUrl ?? r.previewUrl) === key)) return prev;
    return [...prev, record];
  });
}

export function removeReference(id: string): void {
  update((prev) => prev.filter((r) => r.id !== id));
}

export function clearReferencesForTests(): void {
  cache = [];
  saveToStorage(cache);
  notify();
}

export function referenceSummary(records: ReadonlyArray<ReferenceRecord>): string {
  if (records.length === 0) return '0 pinned';
  return `${records.length} pinned`;
}

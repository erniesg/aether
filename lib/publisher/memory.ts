'use client';

import { useSyncExternalStore } from 'react';
import type { ScheduledPost, ScheduledPostStorage } from '@/lib/providers/publisher/types';

// localStorage-backed store for scheduled posts. Persists across reloads in
// dev and Playwright runs that don't have Convex provisioned. Mirrors the
// lib/signals/memory.ts pattern.

const LS_KEY = 'aether.scheduledPosts.v1';

type Listener = () => void;

interface StoredRow {
  id: string;
  workspaceId: string;
  post: ScheduledPost;
  status: 'scheduled' | 'cancelled';
  createdAt: number;
}

let cache: StoredRow[] | null = null;
const listeners = new Set<Listener>();

function isStoredRow(value: unknown): value is StoredRow {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.workspaceId === 'string' &&
    typeof v.status === 'string' &&
    typeof v.createdAt === 'number' &&
    typeof v.post === 'object' &&
    v.post !== null
  );
}

function loadFromStorage(): StoredRow[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredRow);
  } catch {
    return [];
  }
}

function saveToStorage(rows: StoredRow[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(rows));
  } catch {
    // storage quota / disabled — in-memory cache still drives the UI.
  }
}

function current(): StoredRow[] {
  if (cache === null) cache = loadFromStorage();
  return cache;
}

function notify() {
  for (const l of listeners) l();
}

function update(fn: (prev: StoredRow[]) => StoredRow[]) {
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

const SERVER_SNAPSHOT: StoredRow[] = [];
function getServerSnapshot(): StoredRow[] {
  return SERVER_SNAPSHOT;
}

function genId(): string {
  return `sp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useScheduledPostsMemory(workspaceId: string): ScheduledPost[] {
  const rows = useSyncExternalStore(subscribe, current, getServerSnapshot);
  return rows
    .filter((r) => r.workspaceId === workspaceId && r.status !== 'cancelled')
    .map((r) => r.post);
}

export function createMemoryStorage(): ScheduledPostStorage {
  return {
    async insert(workspaceId, post) {
      const id = genId();
      update((rows) => [
        ...rows,
        {
          id,
          workspaceId,
          post: { ...post, id },
          status: 'scheduled',
          createdAt: Date.now(),
        },
      ]);
      return { id };
    },
    async list(workspaceId) {
      return current()
        .filter((r) => r.workspaceId === workspaceId && r.status !== 'cancelled')
        .map((r) => r.post);
    },
    async cancel(id) {
      update((rows) =>
        rows.map((r) => (r.id === id ? { ...r, status: 'cancelled' } : r))
      );
    },
  };
}

export function clearScheduledPostsForTests(): void {
  cache = [];
  saveToStorage(cache);
  notify();
}

'use client';

import { useSyncExternalStore } from 'react';
import { useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { getConvexClient, isConvexEnabled } from '@/lib/convex/client';
import type { ReferenceRecord } from '@/lib/providers/reference/types';

/**
 * In-memory + localStorage-backed store for pinned references. Mirrors the
 * signals/memory.ts shape so rails and composer can subscribe coherently
 * without Convex provisioning in Playwright / dev. A persisted Convex-backed
 * store can replace this later without changing call sites.
 */

const LS_KEY = 'aether.references.v1';
const DEFAULT_REFERENCE_WORKSPACE_ID = 'demo-ws';

type Listener = () => void;

let cache: ReferenceRecord[] | null = null;
const listeners = new Set<Listener>();

const referencesApi = (anyApi as unknown as {
  creatorContext: {
    listReferences: unknown;
    addReference: unknown;
    updateReference: unknown;
    removeReference: unknown;
  };
}).creatorContext;

export type ReferencePatch = Partial<{
  title: string;
  source: string;
  author: string;
  usageIntent: string;
  tags: string[];
  notes: string;
  clusterId: string;
}>;

function isReferenceRecord(value: unknown): value is ReferenceRecord {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string') return false;
  if (
    v.kind !== 'image' &&
    v.kind !== 'video' &&
    v.kind !== 'embed' &&
    v.kind !== 'template' &&
    v.kind !== 'element'
  ) return false;
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

export function useReferences(workspaceId?: string): ReferenceRecord[] {
  /* eslint-disable react-hooks/rules-of-hooks */
  if (isConvexEnabled()) {
    const data = useQuery(referencesApi.listReferences as never, {
      workspaceId: workspaceId ?? DEFAULT_REFERENCE_WORKSPACE_ID,
    } as never) as ReferenceRecord[] | undefined;
    return data ?? [];
  }
  return useSyncExternalStore(subscribe, current, getServerSnapshot);
  /* eslint-enable react-hooks/rules-of-hooks */
}

export function useWorkspaceReferences(workspaceId?: string): ReferenceRecord[] {
  /* eslint-disable react-hooks/rules-of-hooks */
  if (isConvexEnabled()) {
    const data = useQuery(referencesApi.listReferences as never, {
      workspaceId: workspaceId ?? DEFAULT_REFERENCE_WORKSPACE_ID,
    } as never) as ReferenceRecord[] | undefined;
    return data ?? [];
  }
  return useSyncExternalStore(subscribe, current, getServerSnapshot);
  /* eslint-enable react-hooks/rules-of-hooks */
}

export function addReference(record: ReferenceRecord, workspaceId?: string): void {
  // Convex document fields cap at 1 MB. A clipboard-pasted or uploaded image
  // produces a data: URL that routinely runs several megabytes — persisting it
  // to Convex throws a server-side 500. data: URLs are session-only visual
  // anchors; the creator pin only needs the remote URL for durable persistence.
  // When the previewUrl is a data URL we fall through to the in-memory store
  // so the reference is still usable in the current session without error.
  const isDataUrl = record.previewUrl.startsWith('data:');

  if (isConvexEnabled() && !isDataUrl) {
    const client = getConvexClient();
    if (!client) return;
    void client.mutation(referencesApi.addReference as never, {
      workspaceId: workspaceId ?? DEFAULT_REFERENCE_WORKSPACE_ID,
      reference: {
        ...record,
        tags: record.tags ?? [],
      },
    } as never);
    return;
  }
  update((prev) => {
    // Dedupe on fullUrl (when present) or previewUrl — creators often paste
    // the same share link twice without realising.
    const key = record.fullUrl ?? record.previewUrl;
    if (prev.some((r) => (r.fullUrl ?? r.previewUrl) === key)) return prev;
    return [...prev, record];
  });
}

export function updateReference(id: string, patch: ReferencePatch): void {
  if (isConvexEnabled()) {
    const client = getConvexClient();
    if (!client) return;
    void client.mutation(referencesApi.updateReference as never, { id, patch } as never);
    return;
  }
  update((prev) =>
    prev.map((record) => {
      if (record.id !== id) return record;
      return {
        ...record,
        title: patch.title ?? record.title,
        attribution: {
          ...record.attribution,
          source: patch.source ?? record.attribution.source,
          author: patch.author ?? record.attribution.author,
        },
        usageIntent: patch.usageIntent ?? record.usageIntent,
        tags: patch.tags ?? record.tags,
        notes: patch.notes ?? record.notes,
        clusterId: patch.clusterId ?? record.clusterId,
      };
    })
  );
}

export function removeReference(id: string): void {
  if (isConvexEnabled()) {
    const client = getConvexClient();
    if (!client) return;
    void client.mutation(referencesApi.removeReference as never, { id } as never);
    return;
  }
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

'use client';

import { useSyncExternalStore } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { isConvexEnabled } from '@/lib/convex/client';
import { type PublishDraftKind } from './x-intent';

export type PublishDraftStatus = 'draft' | 'posted';

export interface PublishDraft {
  id: string;
  workspaceId: string;
  kind: PublishDraftKind;
  text: string;
  pillar: string;
  targetUrl?: string;
  receiptUrl?: string;
  status: PublishDraftStatus;
  createdAt: number;
  updatedAt: number;
  postedAt?: number;
}

export interface AddPublishDraftInput {
  kind: PublishDraftKind;
  text: string;
  pillar?: string;
  targetUrl?: string;
}

export interface PublishDraftActions {
  addDraft(input: AddPublishDraftInput): Promise<string>;
  updateDraftText(id: string, text: string): Promise<void>;
  markDraftPosted(id: string): Promise<void>;
  setDraftReceiptUrl(id: string, receiptUrl: string): Promise<void>;
}

const LS_KEY = 'aether.publishDrafts.v1';
const EMPTY_DRAFTS: PublishDraft[] = [];

const publishDraftsApi = (anyApi as unknown as {
  publishDrafts: {
    list: unknown;
    add: unknown;
    updateText: unknown;
    markPosted: unknown;
    setReceiptUrl: unknown;
  };
}).publishDrafts;

type Listener = () => void;

const listeners = new Set<Listener>();
let cache: PublishDraft[] | null = null;
let lastCreatedAt = 0;
const workspaceSnapshots = new Map<
  string,
  { source: PublishDraft[]; value: PublishDraft[] }
>();

function workspaceKey(workspaceId: string): string {
  return workspaceId.trim() || 'demo-ws';
}

function isPublishDraft(value: unknown): value is PublishDraft {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.workspaceId === 'string' &&
    (v.kind === 'post' || v.kind === 'reply') &&
    typeof v.text === 'string' &&
    typeof v.pillar === 'string' &&
    (v.status === 'draft' || v.status === 'posted') &&
    typeof v.createdAt === 'number' &&
    typeof v.updatedAt === 'number' &&
    (v.targetUrl === undefined || typeof v.targetUrl === 'string') &&
    (v.receiptUrl === undefined || typeof v.receiptUrl === 'string') &&
    (v.postedAt === undefined || typeof v.postedAt === 'number')
  );
}

function coerceDraft(value: unknown): PublishDraft | null {
  return isPublishDraft(value) ? value : null;
}

function sorted(rows: PublishDraft[]): PublishDraft[] {
  return [...rows].sort((a, b) => b.createdAt - a.createdAt);
}

function readRows(): PublishDraft[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPublishDraft);
  } catch {
    return [];
  }
}

function writeRows(rows: PublishDraft[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(rows));
  } catch {
    // Keep the in-memory cache useful even if localStorage is unavailable.
  }
}

function currentRows(): PublishDraft[] {
  if (cache === null) cache = readRows();
  return cache;
}

function notify(): void {
  for (const listener of listeners) listener();
}

function updateRows(fn: (rows: PublishDraft[]) => PublishDraft[]): void {
  cache = fn(currentRows());
  workspaceSnapshots.clear();
  writeRows(cache);
  notify();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function serverSnapshot(): PublishDraft[] {
  return EMPTY_DRAFTS;
}

function nextCreatedAt(): number {
  const now = Date.now();
  lastCreatedAt = Math.max(now, lastCreatedAt + 1);
  return lastCreatedAt;
}

function genId(): string {
  return `pd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function memorySnapshot(workspaceId: string): PublishDraft[] {
  const source = currentRows();
  const cached = workspaceSnapshots.get(workspaceId);
  if (cached?.source === source) return cached.value;
  const value = sorted(source.filter((row) => row.workspaceId === workspaceId));
  workspaceSnapshots.set(workspaceId, { source, value });
  return value;
}

export function usePublishDrafts(workspaceId: string): PublishDraft[] {
  const key = workspaceKey(workspaceId);
  /* eslint-disable react-hooks/rules-of-hooks */
  if (isConvexEnabled()) {
    const data = useQuery(publishDraftsApi.list as never, {
      workspaceId: key,
    } as never) as unknown[] | undefined;
    if (!Array.isArray(data)) return EMPTY_DRAFTS;
    return sorted(data.map(coerceDraft).filter((row): row is PublishDraft => row !== null));
  }
  return useSyncExternalStore(
    subscribe,
    () => memorySnapshot(key),
    serverSnapshot
  );
  /* eslint-enable react-hooks/rules-of-hooks */
}

export function usePublishDraftActions(workspaceId: string): PublishDraftActions {
  const key = workspaceKey(workspaceId);
  /* eslint-disable react-hooks/rules-of-hooks */
  if (isConvexEnabled()) {
    const add = useMutation(publishDraftsApi.add as never);
    const updateText = useMutation(publishDraftsApi.updateText as never);
    const markPosted = useMutation(publishDraftsApi.markPosted as never);
    const setReceiptUrl = useMutation(publishDraftsApi.setReceiptUrl as never);
    return {
      async addDraft(input) {
        return (await add({
          workspaceId: key,
          kind: input.kind,
          text: input.text,
          pillar: input.pillar ?? '',
          targetUrl: input.targetUrl,
        } as never)) as string;
      },
      async updateDraftText(id, text) {
        await updateText({ id, text } as never);
      },
      async markDraftPosted(id) {
        await markPosted({ id } as never);
      },
      async setDraftReceiptUrl(id, receiptUrl) {
        await setReceiptUrl({ id, receiptUrl } as never);
      },
    };
  }
  /* eslint-enable react-hooks/rules-of-hooks */

  return {
    async addDraft(input) {
      const id = genId();
      const now = nextCreatedAt();
      const draft: PublishDraft = {
        id,
        workspaceId: key,
        kind: input.kind,
        text: input.text,
        pillar: input.pillar?.trim() ?? '',
        targetUrl: input.targetUrl?.trim() || undefined,
        status: 'draft',
        createdAt: now,
        updatedAt: now,
      };
      updateRows((rows) => [...rows, draft]);
      return id;
    },
    async updateDraftText(id, text) {
      updateRows((rows) =>
        rows.map((row) =>
          row.id === id ? { ...row, text, updatedAt: Date.now() } : row
        )
      );
    },
    async markDraftPosted(id) {
      const now = Date.now();
      updateRows((rows) =>
        rows.map((row) =>
          row.id === id
            ? { ...row, status: 'posted', postedAt: now, updatedAt: now }
            : row
        )
      );
    },
    async setDraftReceiptUrl(id, receiptUrl) {
      const normalized = receiptUrl.trim();
      updateRows((rows) =>
        rows.map((row) =>
          row.id === id
            ? { ...row, receiptUrl: normalized, updatedAt: Date.now() }
            : row
        )
      );
    },
  };
}

export function resetPublishDraftsForTests(): void {
  cache = [];
  lastCreatedAt = 0;
  workspaceSnapshots.clear();
  writeRows(cache);
  notify();
}

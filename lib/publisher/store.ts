'use client';

import { isConvexEnabled } from '@/lib/convex/client';
import { createPreviewPublisher } from '@/lib/providers/publisher/preview';
import type {
  PublisherProvider,
  ScheduledPost,
  ScheduledPostStorage,
} from '@/lib/providers/publisher/types';
import {
  createMemoryStorage,
  rememberScheduledPostForClient,
  useScheduledPostsMemory,
  clearScheduledPostsForTests,
} from './memory';
import {
  createConvexStorage,
  useScheduledPostsConvex,
} from './convex';

/**
 * Client-side facade for the publisher seam. Picks a persistence backend
 * based on NEXT_PUBLIC_CONVEX_URL the same way lib/signals/store.ts does —
 * Convex when provisioned, localStorage memory otherwise — so the feature
 * works end-to-end in dev and Playwright without Convex running.
 */

export type { ScheduledPost };

function isPublisherConvexStorageEnabled(): boolean {
  return (
    isConvexEnabled() &&
    process.env.NEXT_PUBLIC_PUBLISHER_CONVEX_STORAGE === '1'
  );
}

function pickStorage(): ScheduledPostStorage {
  if (!isPublisherConvexStorageEnabled()) return createMemoryStorage();
  return createFailSoftStorage(createConvexStorage(), createMemoryStorage());
}

export function getPreviewPublisher(workspaceId: string): PublisherProvider {
  return createPreviewPublisher({
    workspaceId,
    storage: pickStorage(),
    baseUrl:
      typeof window !== 'undefined' ? window.location.origin : undefined,
  });
}

export function useScheduledPosts(workspaceId: string): ScheduledPost[] {
  /* eslint-disable react-hooks/rules-of-hooks */
  const memoryPosts = useScheduledPostsMemory(workspaceId);
  if (!isPublisherConvexStorageEnabled()) return memoryPosts;
  return mergeScheduledPosts(useScheduledPostsConvex(workspaceId), memoryPosts);
  /* eslint-enable react-hooks/rules-of-hooks */
}

export interface PublisherScheduleRouteResult {
  providerId: string;
  results: Array<{
    platform: ScheduledPost['platform'];
    locale?: string;
    format?: string;
    status: 'scheduled' | 'preview-only' | 'skipped' | 'failed';
    previewUrl?: string;
    externalId?: string;
    error?: string;
  }>;
}

export async function schedulePublisherPosts(
  workspaceId: string,
  posts: ScheduledPost[]
): Promise<PublisherScheduleRouteResult> {
  const res = await fetch('/api/publish/schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceId, posts }),
  });
  const body = (await res.json()) as
    | (PublisherScheduleRouteResult & { ok?: boolean; error?: string })
    | { ok: false; error: string };
  if (!res.ok) {
    throw new Error('error' in body ? body.error : 'publish scheduling failed');
  }
  return body as PublisherScheduleRouteResult;
}

export function resetScheduledPostsForTests(): void {
  clearScheduledPostsForTests();
}

export function rememberScheduledPost(
  workspaceId: string,
  post: ScheduledPost
): void {
  rememberScheduledPostForClient(workspaceId, post);
}

const CONVEX_PREVIEW_TIMEOUT_MS =
  process.env.NODE_ENV === 'test' ? 25 : 1_500;

function createFailSoftStorage(
  primary: ScheduledPostStorage,
  fallback: ScheduledPostStorage
): ScheduledPostStorage {
  return {
    insert(workspaceId, post) {
      return withFallback(
        primary.insert(workspaceId, post),
        () => fallback.insert(workspaceId, post)
      );
    },
    list(workspaceId) {
      return withFallback(
        primary.list(workspaceId),
        () => fallback.list(workspaceId)
      );
    },
    cancel(id) {
      return withFallback(
        primary.cancel(id),
        () => fallback.cancel(id)
      );
    },
  };
}

function withFallback<T>(
  primary: Promise<T>,
  fallback: () => Promise<T>
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settleWithFallback = () => {
      if (settled) return;
      settled = true;
      fallback().then(resolve, reject);
    };
    const timer = setTimeout(settleWithFallback, CONVEX_PREVIEW_TIMEOUT_MS);
    primary.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        settleWithFallback();
      }
    );
  });
}

function mergeScheduledPosts(
  primary: ScheduledPost[],
  fallback: ScheduledPost[]
): ScheduledPost[] {
  const seen = new Set<string>();
  const out: ScheduledPost[] = [];
  for (const post of [...fallback, ...primary]) {
    if (post.id && seen.has(post.id)) continue;
    if (post.id) seen.add(post.id);
    out.push(post);
  }
  return out;
}

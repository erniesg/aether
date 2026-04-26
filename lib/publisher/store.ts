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

function pickStorage(): ScheduledPostStorage {
  return isConvexEnabled() ? createConvexStorage() : createMemoryStorage();
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
  if (isConvexEnabled()) return useScheduledPostsConvex(workspaceId);
  return useScheduledPostsMemory(workspaceId);
  /* eslint-enable react-hooks/rules-of-hooks */
}

export interface PublisherScheduleRouteResult {
  providerId: string;
  results: Array<{
    platform: ScheduledPost['platform'];
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
  if (isConvexEnabled()) return;
  rememberScheduledPostForClient(workspaceId, post);
}

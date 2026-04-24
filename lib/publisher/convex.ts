'use client';

import { useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { getConvexClient } from '@/lib/convex/client';
import type {
  ScheduledPost,
  ScheduledPostStorage,
} from '@/lib/providers/publisher/types';

// anyApi lets us reference server functions by path without depending on the
// generated api surface. Replace with `api.publisher.*` from
// `convex/_generated/api` once `npx convex dev` has run.
const publisherApi = (anyApi as unknown as {
  publisher: {
    list: unknown;
    schedule: unknown;
    cancel: unknown;
    updateStatus: unknown;
  };
}).publisher;

/**
 * Reactive query for the scheduled posts of a workspace. Returns an empty
 * array while loading; consumers don't need a suspense boundary.
 */
export function useScheduledPostsConvex(_workspaceId: string): ScheduledPost[] {
  // wsId is optional on the server — pre-Phase-5 plumbing. Don't forward the
  // string yet; once the shell knows the workspace _id we can thread it here.
  const data = useQuery(publisherApi.list as never, {} as never) as
    | Array<ScheduledPost & { status: string }>
    | undefined;
  if (!data) return [];
  return data.filter((p) => p.status !== 'cancelled');
}

export function createConvexStorage(): ScheduledPostStorage {
  return {
    async insert(_workspaceId, post) {
      const client = getConvexClient();
      if (!client) throw new Error('convex disabled');
      const id = (await client.mutation(publisherApi.schedule as never, {
        platform: post.platform,
        mediaUrls: post.mediaUrls,
        caption: post.caption,
        hashtags: post.hashtags,
        scheduledAt: post.scheduledAt,
        accountId: post.accountId,
        provider: 'preview',
      } as never)) as string;
      return { id };
    },
    async list(_workspaceId) {
      const client = getConvexClient();
      if (!client) return [];
      const rows = (await client.query(publisherApi.list as never, {} as never)) as
        | Array<ScheduledPost & { status: string }>
        | undefined;
      return (rows ?? []).filter((p) => p.status !== 'cancelled');
    },
    async cancel(id) {
      const client = getConvexClient();
      if (!client) return;
      await client.mutation(publisherApi.cancel as never, { id } as never);
    },
  };
}

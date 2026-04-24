import { createInMemoryScheduledPostStorage } from './memory-storage';
import {
  PUBLISH_PLATFORMS,
  PublisherError,
  type PublisherProvider,
  type ScheduledPost,
  type ScheduledPostStorage,
  type ScheduleResult,
} from './types';

export interface PreviewPublisherOptions {
  /** Required — every stored post is scoped to a workspace. */
  workspaceId: string;
  /** Injected persistence; defaults to an in-process in-memory map. */
  storage?: ScheduledPostStorage;
  /**
   * Optional origin for the previewUrl. Omit to get a root-relative URL
   * (`/workspace/<wsId>?publishPreview=<id>`), which works inside the app.
   */
  baseUrl?: string;
}

const PROVIDER_ID = 'preview' as const;
const SUPPORTED_PLATFORMS = new Set<ScheduledPost['platform']>(PUBLISH_PLATFORMS);

/**
 * Non-posting publisher. Persists a scheduled post and returns a deep-link
 * back into the workspace shell that auto-opens the publish-preview lens.
 * M1 demo path — no OAuth, no external side effects.
 */
export function createPreviewPublisher(
  opts: PreviewPublisherOptions
): PublisherProvider {
  const { workspaceId } = opts;
  if (!workspaceId) {
    throw new PublisherError('workspaceId required', PROVIDER_ID);
  }
  const storage = opts.storage ?? createInMemoryScheduledPostStorage();

  function buildPreviewUrl(postId: string): string {
    const path = `/workspace/${encodeURIComponent(workspaceId)}?publishPreview=${encodeURIComponent(postId)}`;
    if (!opts.baseUrl) return path;
    return `${opts.baseUrl.replace(/\/+$/, '')}${path}`;
  }

  return {
    id: PROVIDER_ID,

    canPublish(post) {
      return SUPPORTED_PLATFORMS.has(post.platform);
    },

    async schedule(post): Promise<ScheduleResult> {
      if (!post.mediaUrls || post.mediaUrls.length === 0) {
        throw new PublisherError('mediaUrls required', PROVIDER_ID);
      }
      if (!SUPPORTED_PLATFORMS.has(post.platform)) {
        throw new PublisherError(
          `unsupported platform: ${post.platform}`,
          PROVIDER_ID
        );
      }
      const { id } = await storage.insert(workspaceId, post);
      return { previewUrl: buildPreviewUrl(id) };
    },

    async list(wsId) {
      return storage.list(wsId);
    },

    async cancel(id) {
      await storage.cancel(id);
    },
  };
}

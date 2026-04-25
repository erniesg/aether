/**
 * PublisherProvider contract. Provider-agnostic per CLAUDE.md hard rule #7 —
 * no platform / sidecar reference is hardcoded in business logic. Adapters
 * (`preview.ts`, future `postiz.ts`, future `social-auto-upload.ts`) implement
 * the interface and are wired through `./registry.ts`.
 *
 * Shape matches issue #9 acceptance — do not widen without updating the
 * issue first.
 */

export type PublishPlatform =
  | 'instagram'
  | 'tiktok'
  | 'x'
  | 'linkedin'
  | 'youtube-shorts'
  | 'xhs'
  | 'douyin'
  | 'pinterest';

export const PUBLISH_PLATFORMS: ReadonlyArray<PublishPlatform> = [
  'instagram',
  'tiktok',
  'x',
  'linkedin',
  'youtube-shorts',
  'xhs',
  'douyin',
  'pinterest',
];

export type PublishStatus = 'draft' | 'scheduled' | 'published' | 'cancelled';

/**
 * The scheduled unit. One `ScheduledPost` = one platform post. Multi-platform
 * distribution is a list of these, not a single record with a platforms[]
 * array — keeps per-platform scheduling, status, and cancellation orthogonal.
 */
export interface ScheduledPost {
  id: string;
  platform: PublishPlatform;
  /** From the multiformat export pack — ordered, platform-native list. */
  mediaUrls: string[];
  caption: string;
  hashtags: string[];
  /** ISO8601 — use strings, not epoch ms, so manifests are human-readable. */
  scheduledAt: string;
  accountId?: string;
  provider?: PublisherProviderId | string;
  externalId?: string;
}

export interface ScheduleResult {
  /** Deep-link into the shell that opens the publish preview for this post. */
  previewUrl: string;
  /** Platform-side id once real adapters post (postiz / social-auto-upload). */
  externalId?: string;
}

export type PublisherProviderId = 'preview' | 'postiz' | 'social-auto-upload';

export interface PublisherProvider {
  id: PublisherProviderId;
  /** Cheap check — e.g. does this adapter support the post's platform. */
  canPublish(post: ScheduledPost): boolean;
  schedule(post: ScheduledPost): Promise<ScheduleResult>;
  list(workspaceId: string): Promise<ScheduledPost[]>;
  cancel(id: string): Promise<void>;
}

export class PublisherUnavailableError extends Error {
  constructor(providerId: string, hint?: string) {
    super(
      hint
        ? `publisher '${providerId}' is unavailable: ${hint}`
        : `publisher '${providerId}' is unavailable`
    );
    this.name = 'PublisherUnavailableError';
  }
}

export class PublisherError extends Error {
  constructor(
    message: string,
    public readonly providerId: string,
    public readonly cause?: unknown
  ) {
    super(`${providerId}: ${message}`);
    this.name = 'PublisherError';
  }
}

/**
 * Storage seam used by `PreviewPublisher`. A Convex-backed implementation
 * persists to the `scheduledPost` table; an in-memory implementation is used
 * by the contract tests and by dev/Playwright runs without Convex provisioned.
 * Keeping it abstract here lets the adapter stay pure.
 */
export interface ScheduledPostStorage {
  insert(workspaceId: string, post: ScheduledPost): Promise<{ id: string }>;
  list(workspaceId: string): Promise<ScheduledPost[]>;
  cancel(id: string): Promise<void>;
}

'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { Chip } from '@/components/ui/Chip';
import { cn } from '@/lib/utils/cn';
import {
  getPreviewPublisher,
  rememberScheduledPost,
  useScheduledPosts,
} from '@/lib/publisher/store';
import {
  cancelViaServer,
  isServerPublisherEnabled,
  scheduleViaServer,
} from '@/lib/publisher/server-client';
import {
  PUBLISH_PLATFORMS,
  type PublishPlatform,
  type ScheduledPost,
} from '@/lib/providers/publisher/types';

// A tiny transparent PNG is enough for "nothing exported yet" — it lets
// creators still schedule a preview to exercise the flow end-to-end without
// waiting on the export pack (issue #5). Real media arrives once #5 lands.
const PLACEHOLDER_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZwkmBYAAAAASUVORK5CYII=';

export interface PublishSectionProps {
  workspaceId: string;
  /**
   * Ordered hero media URLs from the export pack (issue #5). Each selected
   * platform gets a scheduled post pointing at these URLs. Undefined /
   * empty = fall back to the placeholder PNG so the flow stays alive.
   */
  heroMediaUrls?: string[];
  /** Called when the creator opens the preview overlay for a post. */
  onOpenPreview?: (postId: string) => void;
}

/**
 * Right-rail `publish` lens body. Hosts the per-workspace scheduled-post
 * list + a schedule form that picks platforms and a caption. The preview
 * record is always created locally; the server route also hands it to a real
 * publisher when one is configured.
 */
export function PublishSection({
  workspaceId,
  heroMediaUrls,
  onOpenPreview,
}: PublishSectionProps) {
  const posts = useScheduledPosts(workspaceId);
  const publisher = useMemo(
    () => getPreviewPublisher(workspaceId),
    [workspaceId]
  );
  const serverPublishing = isServerPublisherEnabled();
  const mediaUrls =
    heroMediaUrls && heroMediaUrls.length > 0
      ? heroMediaUrls
      : [PLACEHOLDER_PNG];

  return (
    <div className="flex flex-col gap-3" data-testid="publish-section">
      <ScheduleForm
        serverPublishing={serverPublishing}
        onSchedule={async (platforms, caption, hashtags) => {
          const scheduledAt = new Date(
            Date.now() + 1000 * 60 * 60 * 24
          ).toISOString();
          let lastPreviewUrl: string | null = null;
          for (const platform of platforms) {
            const post: ScheduledPost = {
              id: '',
              platform,
              mediaUrls,
              caption,
              hashtags,
              scheduledAt,
            };
            // Always write the local preview row first — canvas review
            // must work regardless of whether a server publisher succeeds.
            const { previewUrl } = await publisher.schedule(post);
            const localId = new URL(previewUrl, 'http://local').searchParams.get(
              'publishPreview'
            );
            lastPreviewUrl = previewUrl;
            if (serverPublishing) {
              try {
                const response = await scheduleViaServer({
                  workspaceId,
                  post: { ...post, id: localId ?? '' },
                });
                // Use the local artifact id for the canvas overlay (Blocker 4).
                // Provider URLs (response.result.previewUrl) are external and
                // cannot open the in-canvas overlay; they are stored on the post
                // as metadata only.
                rememberScheduledPost(workspaceId, {
                  ...response.post,
                  id: response.post.id || localId || '',
                });
                lastPreviewUrl = previewUrl; // keep local url for overlay
              } catch {
                // The preview record is the creator-facing source of truth; a
                // missing external publisher must not block canvas review.
              }
            }
          }
          if (lastPreviewUrl) {
            const id = new URL(lastPreviewUrl, 'http://local').searchParams.get(
              'publishPreview'
            );
            if (id) onOpenPreview?.(id);
          }
        }}
      />

      <section
        aria-label="scheduled posts"
        className="flex flex-col gap-1.5"
        data-testid="publish-scheduled-list"
      >
        <span className="font-caption text-ink-dim">scheduled</span>
        {posts.length === 0 ? (
          <span className="font-caption text-xs text-ink-faint">
            schedule a preview to see it here
          </span>
        ) : (
          <ul className="flex flex-col gap-1">
            {posts.map((post) => (
              <ScheduledRow
                key={post.id}
                post={post}
                onOpen={() => onOpenPreview?.(post.id)}
                onCancel={async () => {
                  if (serverPublishing) {
                    await cancelViaServer({
                      workspaceId,
                      id: post.id,
                      externalId: post.externalId,
                      providerId: post.provider,
                    });
                    rememberScheduledPost(workspaceId, {
                      ...post,
                      status: 'cancelled',
                    });
                  } else {
                    await publisher.cancel(post.id);
                  }
                }}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ScheduleForm({
  onSchedule,
  serverPublishing,
}: {
  onSchedule: (
    platforms: PublishPlatform[],
    caption: string,
    hashtags: string[]
  ) => Promise<void>;
  serverPublishing: boolean;
}) {
  const [selected, setSelected] = useState<Set<PublishPlatform>>(
    () => new Set(['instagram'])
  );
  const [caption, setCaption] = useState('');
  const [hashtagsRaw, setHashtagsRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (platform: PublishPlatform) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) next.delete(platform);
      else next.add(platform);
      return next;
    });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (selected.size === 0 || busy) return;
    const tags = hashtagsRaw
      .split(/[\s,]+/)
      .map((t) => t.trim().replace(/^#+/, ''))
      .filter(Boolean);
    setBusy(true);
    setError(null);
    try {
      await onSchedule([...selected], caption.trim(), tags);
      setCaption('');
      setHashtagsRaw('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'publish failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2"
      data-testid="publish-schedule-form"
    >
      <section aria-label="platforms" className="flex flex-col gap-1">
        <span className="font-caption text-ink-dim">platforms</span>
        <div className="flex flex-wrap gap-1">
          {PUBLISH_PLATFORMS.map((platform) => {
            const on = selected.has(platform);
            return (
              <button
                key={platform}
                type="button"
                onClick={() => toggle(platform)}
                aria-pressed={on}
                data-testid={`publish-platform-${platform}`}
                className={cn(
                  'rounded-pill border px-2 py-0.5 font-mono text-2xs uppercase tracking-wide transition-colors duration-fast ease-quick',
                  on
                    ? 'border-accent bg-accent text-ink-on-accent'
                    : 'border-border-soft bg-surface-panel-muted text-ink-muted hover:border-border'
                )}
              >
                {platform}
              </button>
            );
          })}
        </div>
      </section>

      <label className="flex flex-col gap-1">
        <span className="font-caption text-ink-dim">caption</span>
        <textarea
          aria-label="caption"
          data-testid="publish-caption"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="hero drop · clean girl palette"
          rows={2}
          className="rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-caption text-ink-dim">hashtags</span>
        <input
          type="text"
          aria-label="hashtags"
          data-testid="publish-hashtags"
          value={hashtagsRaw}
          onChange={(e) => setHashtagsRaw(e.target.value)}
          placeholder="#aether #goldenhour"
          className="rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
        />
      </label>

      <button
        type="submit"
        data-testid="publish-schedule-submit"
        disabled={selected.size === 0 || busy}
        className="self-end rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink transition-colors hover:bg-surface-panel-muted disabled:opacity-50"
      >
        {busy
          ? 'scheduling…'
          : serverPublishing
            ? 'schedule post'
            : 'schedule preview'}
      </button>
      {error ? (
        <p
          role="status"
          className="font-caption text-xs text-signal-error"
          data-testid="publish-schedule-error"
        >
          {error}
        </p>
      ) : null}
    </form>
  );
}

function ScheduledRow({
  post,
  onOpen,
  onCancel,
}: {
  post: ScheduledPost;
  onOpen: () => void;
  onCancel: () => void | Promise<void>;
}) {
  return (
    <li
      data-scheduled-post-id={post.id}
      data-scheduled-post-platform={post.platform}
      className="flex items-center justify-between gap-2 rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1"
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex flex-1 items-center gap-2 text-left"
        data-testid="publish-scheduled-open"
      >
        <Chip tone="secondary" size="sm">
          {post.platform}
        </Chip>
        <span className="truncate font-caption text-xs text-ink">
          {post.caption || 'no caption'}
        </span>
      </button>
      <Chip tone="info" size="sm">
        scheduled
      </Chip>
      <button
        type="button"
        onClick={() => {
          void onCancel();
        }}
        aria-label={`cancel ${post.platform}`}
        data-testid="publish-scheduled-cancel"
        className="rounded-xs border border-transparent px-1 py-0.5 text-ink-dim transition-colors hover:border-border-soft hover:text-ink"
      >
        <X size={12} />
      </button>
    </li>
  );
}

export function publishSectionSummary(count: number): string {
  if (count === 0) return 'empty';
  return `${count} scheduled`;
}

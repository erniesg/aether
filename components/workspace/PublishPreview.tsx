'use client';

import { Chip } from '@/components/ui/Chip';
import { cn } from '@/lib/utils/cn';
import type {
  PublishPlatform,
  ScheduledPost,
} from '@/lib/providers/publisher/types';

// Platform framing. One-line hint per platform per CLAUDE.md hard rule #6.
// Aspect-ratio targets the canonical composition each platform renders at.
const PLATFORM_META: Record<
  PublishPlatform,
  { label: string; aspect: string; hint: string }
> = {
  instagram: { label: 'instagram', aspect: '4 / 5', hint: 'feed · 1080×1350' },
  tiktok: { label: 'tiktok', aspect: '9 / 16', hint: 'vertical · 1080×1920' },
  x: { label: 'x', aspect: '16 / 9', hint: 'card · 1600×900' },
  linkedin: { label: 'linkedin', aspect: '1200 / 627', hint: 'card · 1200×627' },
  'youtube-shorts': {
    label: 'youtube · shorts',
    aspect: '9 / 16',
    hint: 'short · 1080×1920',
  },
  xhs: { label: 'xiaohongshu', aspect: '3 / 4', hint: 'note · 1080×1440' },
  douyin: { label: 'douyin', aspect: '9 / 16', hint: 'vertical · 1080×1920' },
  pinterest: { label: 'pinterest', aspect: '2 / 3', hint: 'pin · 1000×1500' },
};

function formatScheduled(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.valueOf())) return iso;
    return d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, 'Z');
  } catch {
    return iso;
  }
}

function mediaIndexForPlatform(platform: PublishPlatform): number {
  switch (platform) {
    case 'tiktok':
    case 'youtube-shorts':
    case 'douyin':
      return 1;
    case 'x':
    case 'linkedin':
      return 3;
    case 'instagram':
    case 'xhs':
    case 'pinterest':
    default:
      return 0;
  }
}

function selectHeroMedia(post: ScheduledPost): string | undefined {
  const preferred = mediaIndexForPlatform(post.platform);
  return post.mediaUrls[preferred] ?? post.mediaUrls[0];
}

export interface PublishPreviewProps {
  posts: ScheduledPost[];
  onCancel?: (postId: string) => void;
  className?: string;
}

/**
 * Per-platform preview. Stacks one card per scheduled post using the
 * platform's native aspect ratio. Non-posting — renders what *would* go out,
 * nothing more. Feeds the issue-#9 acceptance criteria.
 */
export function PublishPreview({
  posts,
  onCancel,
  className,
}: PublishPreviewProps) {
  if (posts.length === 0) {
    return (
      <div
        data-testid="publish-preview-empty"
        className={cn(
          'flex min-h-24 items-center justify-center rounded-sm border border-dashed border-border-soft bg-surface-panel-muted px-4 py-6',
          className
        )}
      >
        <span className="font-caption text-ink-dim">
          nothing scheduled yet · export a pack and schedule a preview
        </span>
      </div>
    );
  }

  return (
    <div
      data-testid="publish-preview"
      className={cn('flex flex-col gap-3', className)}
    >
      {posts.map((post) => (
        <PublishPreviewCard key={post.id} post={post} onCancel={onCancel} />
      ))}
    </div>
  );
}

interface PublishPreviewCardProps {
  post: ScheduledPost;
  onCancel?: (postId: string) => void;
}

function PublishPreviewCard({ post, onCancel }: PublishPreviewCardProps) {
  const meta = PLATFORM_META[post.platform];
  const hero = selectHeroMedia(post);

  return (
    <article
      data-testid="publish-preview-card"
      data-platform={post.platform}
      data-post-id={post.id}
      className="flex flex-col gap-2 rounded-sm border border-border-soft bg-surface-panel p-3"
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Chip tone="secondary" size="sm">
            {meta.label}
          </Chip>
          <span className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
            {meta.hint}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Chip tone="info" size="sm">
            scheduled
          </Chip>
          {onCancel ? (
            <button
              type="button"
              onClick={() => onCancel(post.id)}
              aria-label={`cancel ${post.platform} post`}
              data-testid="publish-preview-cancel"
              className="font-caption text-2xs uppercase tracking-wide text-ink-dim transition-colors hover:text-ink"
            >
              cancel
            </button>
          ) : null}
        </div>
      </header>

      <div
        className="relative w-full overflow-hidden rounded-xs border border-border-soft bg-surface-panel-muted"
        style={{ aspectRatio: meta.aspect }}
      >
        {hero ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={hero}
            alt={`preview for ${post.platform}`}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-caption text-ink-dim">no media</span>
          </div>
        )}
      </div>

      <footer className="flex flex-col gap-1">
        <p
          data-testid="publish-preview-caption"
          className="font-caption text-xs text-ink"
        >
          {post.caption}
        </p>
        {post.hashtags.length > 0 ? (
          <p
            data-testid="publish-preview-hashtags"
            className="font-caption text-xs text-accent"
          >
            {post.hashtags.map((t) => `#${t}`).join(' ')}
          </p>
        ) : null}
        <span className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
          {formatScheduled(post.scheduledAt)}
        </span>
      </footer>
    </article>
  );
}

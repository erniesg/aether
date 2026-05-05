'use client';

import { useMemo, useState } from 'react';
import { Chip } from '@/components/ui/Chip';
import { cn } from '@/lib/utils/cn';
import { localeShortLabel } from '@/lib/locale/registry';
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
  bilibili: { label: 'bilibili', aspect: '16 / 9', hint: 'video · 1920×1080' },
  kuaishou: { label: 'kuaishou', aspect: '9 / 16', hint: 'vertical · 1080×1920' },
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

function selectHeroMedia(post: ScheduledPost): string | undefined {
  return post.mediaUrls[0];
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
    <PublishPreviewWithPosts
      posts={posts}
      onCancel={onCancel}
      className={className}
    />
  );
}

function PublishPreviewWithPosts({
  posts,
  onCancel,
  className,
}: PublishPreviewProps) {
  const localeGroups = useMemo(() => groupPostsByLocale(posts), [posts]);
  const locales = Object.keys(localeGroups);
  const [activeLocale, setActiveLocale] = useState<string>(() =>
    locales.length > 1 ? 'all' : locales[0] ?? 'all'
  );
  const heroOptions = useMemo(() => collectHeroOptions(posts), [posts]);
  const formatOptions = useMemo(() => collectFormatOptions(posts), [posts]);
  const [activeHero, setActiveHero] = useState<string>('all');
  const [activeFormat, setActiveFormat] = useState<string>('all');
  const viewMode =
    activeLocale === 'all' || !localeGroups[activeLocale] ? 'all' : 'single';
  const visibleGroups =
    viewMode === 'all'
      ? locales.map((locale) => [locale, localeGroups[locale] ?? []] as const)
      : [[activeLocale, localeGroups[activeLocale] ?? []] as const];

  return (
    <div
      data-testid="publish-preview"
      className={cn('flex flex-col gap-3', className)}
    >
      {locales.length > 1 ? (
        <LocaleTabs
          locales={locales}
          activeLocale={activeLocale}
          onSelect={setActiveLocale}
        />
      ) : null}
      {heroOptions.length > 1 ? (
        <ValueTabs
          testIdPrefix="publish-preview-hero"
          label="hero"
          values={heroOptions}
          activeValue={activeHero}
          allLabel="all heroes"
          onSelect={setActiveHero}
        />
      ) : null}
      {formatOptions.length > 1 ? (
        <ValueTabs
          testIdPrefix="publish-preview-format"
          label="format"
          values={formatOptions}
          activeValue={activeFormat}
          allLabel="all formats"
          onSelect={setActiveFormat}
        />
      ) : null}
      {visibleGroups.map(([locale, localePosts]) => (
        <section
          key={locale}
          data-testid={`publish-preview-locale-row-${locale}`}
          data-locale={locale}
          className="flex flex-col gap-2"
        >
          {viewMode === 'all' ? (
            <header className="flex items-center gap-2">
              <Chip tone="secondary" size="sm">
                {localeShortLabel(locale)}
              </Chip>
              <span className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
                {
                  filterPosts(localePosts, activeHero, activeFormat).length
                } format{filterPosts(localePosts, activeHero, activeFormat).length === 1 ? '' : 's'}
              </span>
            </header>
          ) : null}
          <div className="grid gap-2">
            {groupPostsByHero(
              filterPosts(localePosts, activeHero, activeFormat)
            ).map((group) =>
              group.id === 'default' && heroOptions.length <= 1 ? (
                group.posts.map((post) => (
                  <PublishPreviewCard key={post.id} post={post} onCancel={onCancel} />
                ))
              ) : (
                <section
                  key={group.id}
                  data-testid={`publish-preview-hero-row-${group.id}`}
                  data-hero-direction-id={group.id}
                  className="flex flex-col gap-2 rounded-sm border border-border-soft bg-surface-panel-muted p-2"
                >
                  <header className="flex items-center gap-2">
                    <Chip tone="info" size="sm">
                      {group.label}
                    </Chip>
                    <span className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
                      {group.posts.length} format{group.posts.length === 1 ? '' : 's'}
                    </span>
                  </header>
                  <div className="grid gap-2">
                    {group.posts.map((post) => (
                      <PublishPreviewCard key={post.id} post={post} onCancel={onCancel} />
                    ))}
                  </div>
                </section>
              )
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

function groupPostsByLocale(posts: ScheduledPost[]): Record<string, ScheduledPost[]> {
  const groups: Record<string, ScheduledPost[]> = {};
  for (const post of posts) {
    const locale = post.locale || 'unlocalized';
    groups[locale] = groups[locale] ?? [];
    groups[locale].push(post);
  }
  return groups;
}

function filterPosts(
  posts: ScheduledPost[],
  activeHero: string,
  activeFormat: string
): ScheduledPost[] {
  return posts.filter((post) => {
    if (activeHero !== 'all' && (post.heroDirectionId ?? 'default') !== activeHero) {
      return false;
    }
    if (activeFormat !== 'all' && post.format !== activeFormat) return false;
    return true;
  });
}

function collectHeroOptions(posts: ScheduledPost[]): Array<{ value: string; label: string }> {
  const seen = new Map<string, string>();
  for (const post of posts) {
    const id = post.heroDirectionId ?? 'default';
    if (id === 'default') continue;
    if (!seen.has(id)) seen.set(id, post.heroDirectionLabel ?? id);
  }
  return Array.from(seen, ([value, label]) => ({ value, label }));
}

function collectFormatOptions(posts: ScheduledPost[]): Array<{ value: string; label: string }> {
  const seen = new Set<string>();
  for (const post of posts) {
    if (post.format) seen.add(post.format);
  }
  return Array.from(seen, (value) => ({ value, label: value }));
}

function groupPostsByHero(posts: ScheduledPost[]): Array<{
  id: string;
  label: string;
  posts: ScheduledPost[];
}> {
  const groups = new Map<string, { id: string; label: string; posts: ScheduledPost[] }>();
  for (const post of posts) {
    const id = post.heroDirectionId ?? 'default';
    const group = groups.get(id) ?? {
      id,
      label: post.heroDirectionLabel ?? 'Hero',
      posts: [],
    };
    group.posts.push(post);
    groups.set(id, group);
  }
  return Array.from(groups.values());
}

function LocaleTabs({
  locales,
  activeLocale,
  onSelect,
}: {
  locales: string[];
  activeLocale: string;
  onSelect: (locale: string) => void;
}) {
  return (
    <div
      aria-label="publish preview locale"
      data-testid="publish-preview-locale-tabs"
      className="flex flex-wrap items-center gap-1 rounded-sm border border-border-soft bg-surface-panel-muted p-1"
    >
      <span className="px-2 font-caption text-xs text-ink-dim">locale</span>
      {locales.map((locale) => (
        <button
          key={locale}
          type="button"
          data-testid={`publish-preview-locale-${locale}`}
          aria-pressed={activeLocale === locale}
          onClick={() => onSelect(locale)}
          className={cn(
            'rounded-sm border px-2 py-1 font-caption text-xs transition-colors',
            activeLocale === locale
              ? 'border-accent bg-accent text-ink-on-accent'
              : 'border-border-soft bg-surface-panel text-ink-muted hover:border-border'
          )}
        >
          {localeShortLabel(locale)}
        </button>
      ))}
      <button
        type="button"
        data-testid="publish-preview-locale-all"
        aria-pressed={activeLocale === 'all'}
        onClick={() => onSelect('all')}
        className={cn(
          'rounded-sm border px-2 py-1 font-caption text-xs transition-colors',
          activeLocale === 'all'
            ? 'border-accent bg-accent text-ink-on-accent'
            : 'border-border-soft bg-surface-panel text-ink-muted hover:border-border'
        )}
      >
        all
      </button>
    </div>
  );
}

function ValueTabs({
  testIdPrefix,
  label,
  values,
  activeValue,
  allLabel,
  onSelect,
}: {
  testIdPrefix: string;
  label: string;
  values: Array<{ value: string; label: string }>;
  activeValue: string;
  allLabel: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div
      aria-label={`publish preview ${label}`}
      data-testid={`${testIdPrefix}-tabs`}
      className="flex flex-wrap items-center gap-1 rounded-sm border border-border-soft bg-surface-panel-muted p-1"
    >
      <span className="px-2 font-caption text-xs text-ink-dim">{label}</span>
      <button
        type="button"
        data-testid={`${testIdPrefix}-all`}
        aria-pressed={activeValue === 'all'}
        onClick={() => onSelect('all')}
        className={cn(
          'rounded-sm border px-2 py-1 font-caption text-xs transition-colors',
          activeValue === 'all'
            ? 'border-accent bg-accent text-ink-on-accent'
            : 'border-border-soft bg-surface-panel text-ink-muted hover:border-border'
        )}
      >
        {allLabel}
      </button>
      {values.map((item) => (
        <button
          key={item.value}
          type="button"
          data-testid={`${testIdPrefix}-${item.value}`}
          aria-pressed={activeValue === item.value}
          onClick={() => onSelect(item.value)}
          className={cn(
            'rounded-sm border px-2 py-1 font-caption text-xs transition-colors',
            activeValue === item.value
              ? 'border-accent bg-accent text-ink-on-accent'
              : 'border-border-soft bg-surface-panel text-ink-muted hover:border-border'
          )}
        >
          {item.label}
        </button>
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
      data-format={post.format ?? ''}
      data-hero-direction-id={post.heroDirectionId ?? ''}
      data-media-url={hero ?? ''}
      data-post-id={post.id}
      className="flex flex-col gap-2 rounded-sm border border-border-soft bg-surface-panel p-3"
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Chip tone="secondary" size="sm">
            {meta.label}
          </Chip>
          {post.locale ? (
            <Chip tone="info" size="sm">
              {localeShortLabel(post.locale)}
            </Chip>
          ) : null}
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

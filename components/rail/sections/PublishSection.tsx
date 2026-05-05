'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { Chip } from '@/components/ui/Chip';
import { cn } from '@/lib/utils/cn';
import { useEnabledLocales } from '@/lib/text-overlay/active-locale';
import { DEFAULT_LOCALE, localeShortLabel } from '@/lib/locale/registry';
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
  type PublisherProviderId,
  type ScheduledPost,
} from '@/lib/providers/publisher/types';
import {
  isValidPublishCaptionForLocale,
  sanitizePublicCaption,
} from '@/lib/publisher/public-guards';

// A tiny transparent PNG is enough for "nothing exported yet" — it lets
// creators still schedule a preview to exercise the flow end-to-end without
// waiting on the export pack (issue #5). Real media arrives once #5 lands.
const PLACEHOLDER_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZwkmBYAAAAASUVORK5CYII=';

type PublishFormatId = '1x1' | '4x5' | '9x16' | '16x9';

export interface PublishSectionProps {
  workspaceId: string;
  /**
   * Ordered hero media URLs from the export pack (issue #5). Each selected
   * platform gets a scheduled post pointing at these URLs. Undefined /
   * empty = fall back to the placeholder PNG so the flow stays alive.
   */
  heroMediaUrls?: string[];
  /** Final resolved media keyed by native format. X/LinkedIn consume 16x9;
   *  feed consumes 4x5; story/reel consumes 9x16; square consumes 1x1. */
  heroMediaByFormat?: Partial<Record<PublishFormatId, string>>;
  heroMediaByDirectionFormat?: Record<
    string,
    {
      label: string;
      mediaByFormat: Partial<Record<PublishFormatId, string>>;
    }
  >;
  /** Current canvas copy, keyed locale → format. Used when the creator leaves
   *  a publish caption blank so scheduled payloads match edited canvas text. */
  canvasCopyByLocaleFormat?: Record<string, Record<string, string>>;
  /** Hero-scoped canvas copy. Multi-hero publish should follow the selected
   *  hero's final editable text, not whichever text shape was visited last. */
  canvasCopyByHeroLocaleFormat?: Record<string, Record<string, Record<string, string>>>;
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
  heroMediaByFormat,
  heroMediaByDirectionFormat,
  canvasCopyByLocaleFormat,
  canvasCopyByHeroLocaleFormat,
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
  const heroDirectionEntries = Object.entries(heroMediaByDirectionFormat ?? {});
  const [selectedHeroDirectionId, setSelectedHeroDirectionId] = useState<string>(
    () => heroDirectionEntries[0]?.[0] ?? 'default'
  );
  const activeHeroDirection =
    selectedHeroDirectionId !== 'default'
      ? heroMediaByDirectionFormat?.[selectedHeroDirectionId]
      : undefined;
  const activeHeroMediaByFormat =
    activeHeroDirection?.mediaByFormat ?? heroMediaByFormat;
  const activeCanvasCopyByLocaleFormat =
    selectedHeroDirectionId !== 'default'
      ? canvasCopyByHeroLocaleFormat?.[selectedHeroDirectionId] ??
        canvasCopyByLocaleFormat
      : canvasCopyByLocaleFormat;
  useEffect(() => {
    if (selectedHeroDirectionId !== 'default') return;
    const first = heroDirectionEntries[0]?.[0];
    if (first) setSelectedHeroDirectionId(first);
  }, [heroDirectionEntries, selectedHeroDirectionId]);

  return (
    <div className="flex flex-col gap-3" data-testid="publish-section">
      <ScheduleForm
        serverPublishing={serverPublishing}
        heroDirections={heroDirectionEntries.map(([id, value]) => ({
          id,
          label: value.label,
        }))}
        activeHeroDirectionId={selectedHeroDirectionId}
        onHeroDirectionChange={setSelectedHeroDirectionId}
        onSchedule={async (drafts) => {
          const scheduledAt = new Date(
            Date.now() + 1000 * 60 * 60 * 24
          ).toISOString();
          let lastPreviewUrl: string | null = null;
          for (const draft of drafts) {
            for (const platform of draft.platforms) {
              const format = formatForPlatform(platform);
              const caption = sanitizePublicCaption(
                draft.caption ||
                activeCanvasCopyByLocaleFormat?.[draft.locale]?.[format] ||
                activeCanvasCopyByLocaleFormat?.[draft.locale]?.['1x1'] ||
                ''
              );
              if (!isValidPublishCaptionForLocale(draft.locale, caption)) {
                throw new Error(
                  `${localeShortLabel(draft.locale)} needs final localized copy before publish preview`
                );
              }
              const post: ScheduledPost = {
                id: '',
                platform,
                locale: draft.locale,
                format,
                heroDirectionId:
                  selectedHeroDirectionId === 'default'
                    ? undefined
                    : selectedHeroDirectionId,
                heroDirectionLabel: activeHeroDirection?.label,
                mediaUrls: mediaUrlsForFormat(format, activeHeroMediaByFormat, mediaUrls),
                caption,
                hashtags: draft.hashtags,
                scheduledAt,
              };
              // Always write the local preview row first — canvas review
              // must work regardless of whether a server publisher succeeds.
              const { previewUrl } = await publisher.schedule(post);
              const localId = new URL(previewUrl, 'http://local').searchParams.get(
                'publishPreview'
              );
              lastPreviewUrl = previewUrl;
              if (serverPublishing && localId) {
                try {
                  const response = await scheduleViaServer({
                    workspaceId,
                    post: { ...post, id: localId },
                  });
                  // Update the already-inserted local row with server metadata.
                  // Use localId as the canonical id so the canvas overlay keeps
                  // working — provider URLs are external and cannot open it.
                  // (Blocker 4: post.id for auto-open, not response.result.previewUrl)
                  rememberScheduledPost(workspaceId, {
                    ...post,
                    ...response.post,
                    id: localId,
                    locale: response.post.locale ?? post.locale,
                    format: response.post.format ?? post.format,
                    mediaUrls:
                      response.post.mediaUrls && response.post.mediaUrls.length > 0
                        ? response.post.mediaUrls
                        : post.mediaUrls,
                    caption: response.post.caption || post.caption,
                    hashtags: response.post.hashtags ?? post.hashtags,
                    scheduledAt: response.post.scheduledAt ?? post.scheduledAt,
                  });
                } catch {
                  // The preview record is the creator-facing source of truth; a
                  // missing external publisher must not block canvas review.
                }
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
                      providerId: post.provider as PublisherProviderId | undefined,
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

interface PublishLanguageDraft {
  locale: string;
  platforms: PublishPlatform[];
  caption: string;
  hashtags: string[];
}

function ScheduleForm({
  onSchedule,
  serverPublishing,
  heroDirections,
  activeHeroDirectionId,
  onHeroDirectionChange,
}: {
  onSchedule: (drafts: PublishLanguageDraft[]) => Promise<void>;
  serverPublishing: boolean;
  heroDirections: Array<{ id: string; label: string }>;
  activeHeroDirectionId: string;
  onHeroDirectionChange: (id: string) => void;
}) {
  const enabledLocales = useEnabledLocales();
  const locales =
    enabledLocales.length > 0 ? enabledLocales.map(String) : [String(DEFAULT_LOCALE)];
  const [selected, setSelected] = useState<Record<string, Set<PublishPlatform>>>(
    () => ({ [DEFAULT_LOCALE]: new Set(['instagram']) })
  );
  const [captions, setCaptions] = useState<Record<string, string>>({});
  const [hashtagsRaw, setHashtagsRaw] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (locale: string, platform: PublishPlatform) => {
    setSelected((prev) => {
      const nextForLocale = new Set(prev[locale] ?? []);
      if (nextForLocale.has(platform)) nextForLocale.delete(platform);
      else nextForLocale.add(platform);
      return { ...prev, [locale]: nextForLocale };
    });
  };

  const selectedCount = locales.reduce(
    (sum, locale) => sum + (selected[locale]?.size ?? 0),
    0
  );

  const updateCaption = (locale: string, value: string) => {
    setCaptions((prev) => ({ ...prev, [locale]: value }));
  };

  const updateHashtags = (locale: string, value: string) => {
    setHashtagsRaw((prev) => ({ ...prev, [locale]: value }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (selectedCount === 0 || busy) return;
    const drafts: PublishLanguageDraft[] = locales
      .map((locale) => {
        const platforms = [...(selected[locale] ?? new Set<PublishPlatform>())];
        const hashtags = (hashtagsRaw[locale] ?? '')
          .split(/[\s,]+/)
          .map((t) => t.trim().replace(/^#+/, ''))
          .filter(Boolean);
        return {
          locale,
          platforms,
          caption: (captions[locale] ?? '').trim(),
          hashtags,
        };
      })
      .filter((draft) => draft.platforms.length > 0);
    if (drafts.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await onSchedule(drafts);
      setCaptions({});
      setHashtagsRaw({});
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
      <p className="font-caption text-xs text-ink-faint" data-testid="publish-review-note">
        review each language before posting · Instagram uses approved APIs
      </p>

      {heroDirections.length > 1 ? (
        <div
          aria-label="hero direction"
          data-testid="publish-hero-direction-picker"
          className="flex flex-wrap items-center gap-1"
        >
          <span className="font-caption text-xs text-ink-dim">hero</span>
          {heroDirections.map((direction) => {
            const on = activeHeroDirectionId === direction.id;
            return (
              <button
                key={direction.id}
                type="button"
                data-testid={`publish-hero-${direction.id}`}
                aria-pressed={on}
                onClick={() => onHeroDirectionChange(direction.id)}
                className={cn(
                  'rounded-sm border px-2 py-0.5 font-caption text-2xs transition-colors',
                  on
                    ? 'border-accent bg-accent text-ink-on-accent'
                    : 'border-border-soft bg-surface-panel text-ink-dim hover:border-border'
                )}
              >
                {direction.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-col gap-2" data-testid="publish-language-matrix">
        {locales.map((locale) => (
          <section
            key={locale}
            aria-label={`${localeShortLabel(locale)} publish choices`}
            data-testid={`publish-language-${locale}`}
            className="flex flex-col gap-1 rounded-sm border border-border-soft bg-surface-panel-muted p-2"
          >
            <div className="flex items-center justify-between gap-2">
              <Chip tone="secondary" size="sm">
                {localeShortLabel(locale)}
              </Chip>
              <div className="flex flex-wrap justify-end gap-1">
                {PUBLISH_PLATFORMS.map((platform) => {
                  const on = selected[locale]?.has(platform) ?? false;
                  return (
                    <button
                      key={platform}
                      type="button"
                      onClick={() => toggle(locale, platform)}
                      aria-pressed={on}
                      data-testid={`publish-platform-${locale}-${platform}`}
                      className={cn(
                        'rounded-pill border px-2 py-0.5 font-mono text-2xs uppercase tracking-wide transition-colors duration-fast ease-quick',
                        on
                          ? 'border-accent bg-accent text-ink-on-accent'
                          : 'border-border-soft bg-surface-panel text-ink-muted hover:border-border'
                      )}
                    >
                      {platform}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="flex flex-col gap-1">
              <span className="font-caption text-ink-dim">caption</span>
              <textarea
                aria-label={`${localeShortLabel(locale)} caption`}
                data-testid={`publish-caption-${locale}`}
                value={captions[locale] ?? ''}
                onChange={(event) => updateCaption(locale, event.target.value)}
                placeholder="campaign caption"
                rows={2}
                className="rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-caption text-ink-dim">hashtags</span>
              <input
                type="text"
                aria-label={`${localeShortLabel(locale)} hashtags`}
                data-testid={`publish-hashtags-${locale}`}
                value={hashtagsRaw[locale] ?? ''}
                onChange={(event) => updateHashtags(locale, event.target.value)}
                placeholder="#aether #goldenhour"
                className="rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
              />
            </label>
          </section>
        ))}
      </div>

      <button
        type="submit"
        data-testid="publish-schedule-submit"
        disabled={selectedCount === 0 || busy}
        className="self-end rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink transition-colors hover:bg-surface-panel-muted disabled:opacity-50"
      >
        {busy
          ? 'scheduling…'
          : serverPublishing
            ? 'review + schedule'
            : 'review preview'}
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

function formatForPlatform(platform: PublishPlatform): PublishFormatId {
  switch (platform) {
    case 'instagram':
    case 'pinterest':
      return '4x5';
    case 'tiktok':
    case 'youtube-shorts':
    case 'douyin':
    case 'kuaishou':
      return '9x16';
    case 'linkedin':
    case 'x':
    case 'bilibili':
      return '16x9';
    default:
      return '1x1';
  }
}

function mediaUrlsForFormat(
  format: PublishFormatId,
  byFormat: Partial<Record<PublishFormatId, string>> | undefined,
  fallback: string[]
): string[] {
  const picked = byFormat?.[format] ?? fallback[0] ?? PLACEHOLDER_PNG;
  return [picked];
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
      data-scheduled-post-locale={post.locale ?? ''}
      data-scheduled-post-format={post.format ?? ''}
      data-scheduled-post-hero={post.heroDirectionId ?? ''}
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
        {post.locale ? (
          <Chip tone="info" size="sm">
            {localeShortLabel(post.locale)}
          </Chip>
        ) : null}
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

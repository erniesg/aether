'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ExternalLink, Plus, X } from 'lucide-react';
import { Chip } from '@/components/ui/Chip';
import { cn } from '@/lib/utils/cn';
import {
  usePublishDraftActions,
  usePublishDrafts,
  type PublishDraft,
  type PublishDraftActions,
} from '@/lib/publish/draft-store';
import {
  buildXIntentUrl,
  getXWeightedLength,
  isXIntentConfirmable,
  type PublishDraftKind,
} from '@/lib/publish/x-intent';
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
  const drafts = usePublishDrafts(workspaceId);
  const draftActions = usePublishDraftActions(workspaceId);
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
                  ...response.post,
                  id: localId,
                });
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

      <DraftQueue drafts={drafts} actions={draftActions} />

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

function DraftQueue({
  drafts,
  actions,
}: {
  drafts: PublishDraft[];
  actions: PublishDraftActions;
}) {
  return (
    <section
      aria-label="draft queue"
      className="flex flex-col gap-2"
      data-testid="publish-draft-queue"
    >
      <DraftComposer actions={actions} />
      <div className="flex flex-col gap-1.5">
        <span className="font-caption text-ink-dim">drafts</span>
        {drafts.length === 0 ? (
          <span className="font-caption text-xs text-ink-faint">
            compose a post or reply
          </span>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {drafts.map((draft) => (
              <DraftRow key={draft.id} draft={draft} actions={actions} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function DraftComposer({ actions }: { actions: PublishDraftActions }) {
  const [kind, setKind] = useState<PublishDraftKind>('post');
  const [text, setText] = useState('');
  const [pillar, setPillar] = useState('');
  const [targetUrl, setTargetUrl] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const body = text.trim();
    if (!body) return;
    await actions.addDraft({
      kind,
      text: body,
      pillar: pillar.trim(),
      targetUrl: kind === 'reply' ? targetUrl.trim() : undefined,
    });
    setText('');
    setPillar('');
    setTargetUrl('');
  };

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 rounded-sm border border-border-soft bg-surface-panel-muted p-2"
      data-testid="publish-draft-form"
    >
      <div className="flex items-center justify-between gap-2">
        <div
          role="group"
          aria-label="draft kind"
          className="inline-flex rounded-sm border border-border-soft bg-surface-panel p-0.5"
        >
          {(['post', 'reply'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={kind === option}
              data-testid={`publish-draft-kind-${option}`}
              onClick={() => setKind(option)}
              className={cn(
                'rounded-xs px-2 py-0.5 font-mono text-2xs uppercase transition-colors',
                kind === option
                  ? 'bg-accent text-ink-on-accent'
                  : 'text-ink-muted hover:text-ink'
              )}
            >
              {option}
            </button>
          ))}
        </div>
        <input
          type="text"
          aria-label="pillar"
          data-testid="publish-draft-pillar"
          value={pillar}
          onChange={(event) => setPillar(event.target.value)}
          placeholder="pillar"
          className="min-w-0 flex-1 rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
        />
      </div>

      <textarea
        aria-label="draft text"
        data-testid="publish-draft-text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="write the post"
        rows={2}
        className="rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
      />

      {kind === 'reply' ? (
        <input
          type="url"
          aria-label="reply target"
          data-testid="publish-draft-target"
          value={targetUrl}
          onChange={(event) => setTargetUrl(event.target.value)}
          placeholder="x.com/.../status/..."
          className="rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
        />
      ) : null}

      <button
        type="submit"
        data-testid="publish-draft-add"
        disabled={!text.trim()}
        className="inline-flex items-center gap-1 self-end rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink transition-colors hover:bg-surface-panel-muted disabled:opacity-50"
      >
        <Plus size={12} />
        draft
      </button>
    </form>
  );
}

function DraftRow({
  draft,
  actions,
}: {
  draft: PublishDraft;
  actions: PublishDraftActions;
}) {
  const [text, setText] = useState(draft.text);
  const [receiptUrl, setReceiptUrl] = useState('');

  useEffect(() => {
    setText(draft.text);
  }, [draft.id, draft.text]);

  const intentDraft = {
    kind: draft.kind,
    text,
    targetUrl: draft.targetUrl,
  };
  const count = getXWeightedLength(text);
  const confirmable = isXIntentConfirmable(intentDraft);
  const href = buildXIntentUrl(intentDraft);

  const persistText = () => {
    if (text !== draft.text) {
      void actions.updateDraftText(draft.id, text);
    }
  };

  const confirm = () => {
    if (text !== draft.text) {
      void actions.updateDraftText(draft.id, text);
    }
    void actions.markDraftPosted(draft.id);
  };

  const saveReceipt = () => {
    const normalized = receiptUrl.trim();
    if (normalized) {
      void actions.setDraftReceiptUrl(draft.id, normalized);
      setReceiptUrl('');
    }
  };

  return (
    <li
      data-publish-draft-id={draft.id}
      data-testid="publish-draft-row"
      className="flex flex-col gap-1.5 rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1.5"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <Chip tone="secondary" size="sm">
            {draft.kind}
          </Chip>
          {draft.pillar ? (
            <Chip tone="neutral" size="sm">
              {draft.pillar}
            </Chip>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Chip
            tone={count > 280 ? 'warn' : 'neutral'}
            size="sm"
            data-testid="publish-draft-count"
          >
            {count}/280
          </Chip>
          <Chip tone={draft.status === 'posted' ? 'ok' : 'info'} size="sm">
            {draft.status}
          </Chip>
        </div>
      </div>

      <textarea
        aria-label="edit draft"
        data-testid="publish-draft-edit-text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={persistText}
        rows={2}
        className="rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink focus:border-accent focus:outline-none"
      />

      {draft.receiptRef ? (
        <span
          data-testid="publish-draft-source-receipt"
          className="truncate font-caption text-xs text-ink-faint"
        >
          receipt {draft.receiptRef}
        </span>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {draft.receiptUrl ? (
          <a
            href={draft.receiptUrl}
            target="_blank"
            rel="noreferrer"
            data-testid="publish-draft-receipt-link"
            className="font-caption text-xs text-ink-dim underline-offset-2 hover:text-ink hover:underline"
          >
            permalink
          </a>
        ) : draft.status === 'posted' ? (
          <input
            type="url"
            aria-label="posted permalink"
            data-testid="publish-draft-receipt"
            value={receiptUrl}
            onChange={(event) => setReceiptUrl(event.target.value)}
            onBlur={saveReceipt}
            placeholder="paste permalink"
            className="min-w-0 flex-1 rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
          />
        ) : null}
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          data-testid="publish-draft-confirm"
          aria-disabled={confirmable ? 'false' : 'true'}
          tabIndex={confirmable ? 0 : -1}
          onClick={(event) => {
            if (!confirmable) {
              event.preventDefault();
              return;
            }
            confirm();
          }}
          className={cn(
            'inline-flex items-center gap-1 rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink transition-colors hover:bg-surface-panel-muted',
            !confirmable && 'pointer-events-none opacity-50'
          )}
        >
          <ExternalLink size={12} />
          intent
        </a>
      </div>
    </li>
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

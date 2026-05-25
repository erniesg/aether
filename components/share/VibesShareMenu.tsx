'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AtSign,
  Check,
  Copy,
  Eye,
  Link as LinkIcon,
  Loader2,
  MessageCircle,
  Send,
  Share2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import {
  platformShareUrl,
  SHARE_PLATFORMS,
  type SharePlatform,
} from '@/lib/share/platforms';
import type { ShareObjectType, ShareSummary } from '@/lib/share/store';

interface VibesShareMenuProps {
  objectType: ShareObjectType;
  objectId: string;
  slug?: string;
  canonicalPath: string;
  title: string;
  description?: string;
  imageUrl?: string;
  shareText?: string;
  hashtags?: string[];
  showMetrics?: boolean;
}

interface CreateLinkResponse {
  ok?: boolean;
  link?: {
    code: string;
    shortUrl: string;
    canonicalUrl: string;
    platform: SharePlatform;
  };
  error?: string;
}

interface SummaryResponse {
  ok?: boolean;
  summary?: ShareSummary;
}

const platformLabels: Record<SharePlatform, string> = {
  x: 'X',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  copy: 'Copy',
  native: 'Native',
  unknown: 'Share',
};

export function VibesShareMenu({
  objectType,
  objectId,
  slug,
  canonicalPath,
  title,
  description,
  imageUrl,
  shareText,
  hashtags,
  showMetrics = false,
}: VibesShareMenuProps) {
  const [busy, setBusy] = useState<SharePlatform | 'clean' | null>(null);
  const [copied, setCopied] = useState<'tracked' | 'clean' | null>(null);
  const [latestUrl, setLatestUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ShareSummary | null>(null);

  const cleanUrl = useMemo(() => absolutePublicUrl(canonicalPath), [canonicalPath]);
  const target = useMemo(
    () => ({
      objectType,
      objectId,
      slug,
      canonicalPath,
      title,
      description,
      imageUrl,
    }),
    [canonicalPath, description, imageUrl, objectId, objectType, slug, title]
  );

  useEffect(() => {
    let cancelled = false;
    async function loadSummary() {
      try {
        const res = await fetch(`/api/share/summary?canonicalPath=${encodeURIComponent(canonicalPath)}`, {
          cache: 'no-store',
        });
        const json = (await res.json()) as SummaryResponse;
        if (!cancelled && json.ok) setSummary(json.summary ?? null);
      } catch {
        if (!cancelled) setSummary(null);
      }
    }
    void loadSummary();
    return () => {
      cancelled = true;
    };
  }, [canonicalPath]);

  async function createLink(platform: SharePlatform) {
    const res = await fetch('/api/share/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target,
        platform,
        shareText: shareText ?? title,
      }),
    });
    const json = (await res.json()) as CreateLinkResponse;
    if (!json.ok || !json.link) throw new Error(json.error ?? `HTTP ${res.status}`);
    setLatestUrl(json.link.shortUrl);
    setSummary((current) =>
      current
        ? { ...current, shareLinks: current.shareLinks + 1 }
        : { ...emptySummary(), shareLinks: 1 }
    );
    return json.link;
  }

  async function record(eventType: string, platform: SharePlatform, code?: string) {
    await fetch('/api/share/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType,
        platform,
        code,
        canonicalPath,
      }),
    }).catch(() => undefined);
    if (isShareActionEvent(eventType)) {
      setSummary((current) => incrementShareAction(current, platform));
    }
  }

  async function sharePlatform(platform: SharePlatform) {
    setBusy(platform);
    setError(null);
    try {
      const link = await createLink(platform);
      const href = platformShareUrl(platform, {
        url: link.shortUrl,
        title,
        text: shareText,
        hashtags,
      });
      await record('platform_clicked', platform, link.code);
      if (href) window.open(href, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function nativeShare() {
    setBusy('native');
    setError(null);
    try {
      const link = await createLink('native');
      if (!navigator.share) {
        await navigator.clipboard.writeText(link.shortUrl);
        setCopied('tracked');
        await record('copy_link', 'native', link.code);
        return;
      }
      await navigator.share({
        title,
        text: shareText ?? description,
        url: link.shortUrl,
      });
      await record('native_share_success', 'native', link.code);
    } catch (err) {
      await record('native_share_error', 'native');
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
      window.setTimeout(() => setCopied(null), 1200);
    }
  }

  async function copyTracked() {
    setBusy('copy');
    setError(null);
    try {
      const link = await createLink('copy');
      await navigator.clipboard.writeText(link.shortUrl);
      setCopied('tracked');
      await record('copy_link', 'copy', link.code);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
      window.setTimeout(() => setCopied(null), 1200);
    }
  }

  async function copyClean() {
    setBusy('clean');
    setError(null);
    try {
      await navigator.clipboard.writeText(cleanUrl);
      setCopied('clean');
      await record('copy_clean_link', 'copy');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
      window.setTimeout(() => setCopied(null), 1200);
    }
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <details className="relative">
        <summary
          data-testid="vibes-share"
          className="flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-sm border border-border-soft px-2 font-mono text-xs text-ink-dim hover:border-accent hover:text-accent [&::-webkit-details-marker]:hidden"
        >
          <Share2 size={13} strokeWidth={1.75} />
          <span>share</span>
          {summary?.shareActions ? (
            <Chip tone="neutral" size="sm" variant="ghost">
              {formatCompactNumber(summary.shareActions)}
            </Chip>
          ) : null}
        </summary>

        <div className="absolute right-0 top-full z-30 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-md border border-border-soft bg-surface-panel p-3 shadow-lg">
          <div className="flex items-center justify-between gap-2">
            <p className="font-caption text-xs uppercase text-ink-dim">share</p>
            {summary ? (
              <span className="font-mono text-2xs text-ink-dim">
                {formatCompactNumber(summary.shareActions)} shares ·{' '}
                {formatCompactNumber(summary.trackedVisits)} visits ·{' '}
                {formatCompactNumber(summary.publicPosts)} posts
              </span>
            ) : null}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-1.5">
            {SHARE_PLATFORMS.map((platform) => (
              <Button
                key={platform}
                type="button"
                variant="subtle"
                size="sm"
                onClick={() => void sharePlatform(platform)}
                disabled={Boolean(busy)}
                icon={busy === platform ? <Loader2 size={13} className="animate-spin" /> : platformIcon(platform)}
                className="justify-start"
              >
                {platformLabels[platform]}
              </Button>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void nativeShare()}
              disabled={Boolean(busy)}
              icon={busy === 'native' ? <Loader2 size={13} className="animate-spin" /> : <Share2 size={13} />}
              className="justify-start"
            >
              Native
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void copyTracked()}
              disabled={Boolean(busy)}
              icon={
                busy === 'copy' ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : copied === 'tracked' ? (
                  <Check size={13} />
                ) : (
                  <Copy size={13} />
                )
              }
              className="justify-start"
            >
              Copy short
            </Button>
          </div>

          <div className="mt-3 rounded-sm border border-border-soft bg-surface-base p-2">
            <div className="flex items-center gap-2">
              <LinkIcon size={13} className="text-ink-dim" />
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink-muted">
                {latestUrl ?? cleanUrl}
              </span>
              <button
                type="button"
                onClick={() => void copyClean()}
                disabled={Boolean(busy)}
                className="grid h-7 w-7 place-items-center rounded-sm border border-border-soft text-ink-dim hover:border-accent hover:text-accent disabled:opacity-50"
                title="copy clean link"
                aria-label="copy clean link"
              >
                {copied === 'clean' ? <Check size={13} /> : <Copy size={13} />}
              </button>
            </div>
            <p className="mt-2 font-caption text-2xs text-ink-dim">
              Short links count visits. Clean link keeps the canonical page URL.
            </p>
          </div>

          {error ? <p className="mt-2 font-caption text-2xs text-signal-error">{error}</p> : null}
        </div>
      </details>

      {showMetrics ? (
        <div data-testid="vibes-share-metrics" className="hidden min-w-0 items-center gap-1 sm:flex">
          <MetricPill icon={<Share2 size={12} />} label="shares" value={summary?.shareActions ?? 0} />
          <MetricPill icon={<Eye size={12} />} label="visits" value={summary?.trackedVisits ?? 0} />
          <MetricPill icon={<AtSign size={12} />} label="posts" value={summary?.publicPosts ?? 0} />
        </div>
      ) : null}
    </div>
  );
}

function platformIcon(platform: SharePlatform) {
  if (platform === 'x') return <AtSign size={13} />;
  if (platform === 'whatsapp') return <MessageCircle size={13} />;
  if (platform === 'telegram') return <Send size={13} />;
  return <Share2 size={13} />;
}

function absolutePublicUrl(path: string): string {
  const configured = process.env.NEXT_PUBLIC_AETHER_PUBLIC_DOMAIN;
  const origin =
    configured && configured.trim()
      ? `https://${configured.trim().replace(/^https?:\/\//, '')}`
      : typeof window !== 'undefined'
        ? window.location.origin
        : '';
  return new URL(path, origin || 'https://aether.berlayar.ai').toString();
}

function MetricPill({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <span className="inline-flex h-8 items-center gap-1 rounded-sm border border-border-soft px-2 font-mono text-2xs text-ink-dim">
      <span className="text-ink-muted">{icon}</span>
      <span className="text-ink-muted">{formatCompactNumber(value)}</span>
      <span>{label}</span>
    </span>
  );
}

function incrementShareAction(summary: ShareSummary | null, platform: SharePlatform): ShareSummary {
  const current = summary ?? emptySummary();
  const platformActions = current.platformActions ?? {};
  return {
    ...current,
    shareActions: current.shareActions + 1,
    platformActions: {
      ...platformActions,
      [platform]: (platformActions[platform] ?? 0) + 1,
    },
  };
}

function emptySummary(): ShareSummary {
  return {
    shareLinks: 0,
    shareActions: 0,
    trackedVisits: 0,
    botPreviews: 0,
    publicPosts: 0,
    platformActions: {},
    publicReach: {},
  };
}

function isShareActionEvent(eventType: string): boolean {
  return eventType === 'platform_clicked' || eventType === 'copy_link' || eventType === 'native_share_success';
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

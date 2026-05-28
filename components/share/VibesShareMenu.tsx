'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Check,
  Copy,
  Facebook,
  Linkedin,
  Loader2,
  MessageCircle,
  Send,
  Share2,
  Twitter,
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
  variant?: 'menu' | 'panel';
  className?: string;
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
const publicSharePlatforms: SharePlatform[] = ['x', 'linkedin', 'facebook'];

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
  variant = 'menu',
  className = '',
}: VibesShareMenuProps) {
  const [busy, setBusy] = useState<SharePlatform | null>(null);
  const [copied, setCopied] = useState<'tracked' | null>(null);
  const [latestCopyUrl, setLatestCopyUrl] = useState<string | null>(null);
  const [latestCopyCode, setLatestCopyCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ShareSummary | null>(null);

  const cleanUrl = useMemo(() => absolutePublicUrl(canonicalPath), [canonicalPath]);
  const displayedCopyUrl = latestCopyUrl ?? shortSharePreviewUrl();
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
      const url = socialShareUrl({
        shortUrl: link.shortUrl,
        cleanUrl,
        code: link.code,
        platform,
      });
      const href = platformShareUrl(platform, {
        url,
        title,
        text: shareText,
        hashtags,
      });
      if (!href) throw new Error('Share destination unavailable.');
      const opened = window.open(href, '_blank');
      if (!opened) throw new Error('Share window blocked.');
      opened.opener = null;
      await record('platform_clicked', platform, link.code);
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
      let url = latestCopyUrl;
      let code = latestCopyCode ?? undefined;
      if (!url) {
        const link = await createLink('copy');
        url = link.shortUrl;
        code = link.code;
        setLatestCopyUrl(link.shortUrl);
        setLatestCopyCode(link.code);
      }
      await navigator.clipboard.writeText(url);
      setCopied('tracked');
      await record('copy_link', 'copy', code);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
      window.setTimeout(() => setCopied(null), 1200);
    }
  }

  if (variant === 'panel') {
    return (
      <div
        data-testid="vibes-share-panel"
        className={`min-w-0 rounded-md border border-border-soft bg-surface-base p-3 ${className}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Share2 size={15} strokeWidth={1.75} className="text-accent" />
            <p className="font-caption text-xs uppercase text-ink-dim">share recap</p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-1.5">
          {SHARE_PLATFORMS.slice(0, 4).map((platform) => (
            <Button
              key={platform}
              type="button"
              variant="subtle"
              size="sm"
              onClick={() => void sharePlatform(platform)}
              disabled={Boolean(busy)}
              icon={busy === platform ? <Loader2 size={13} className="animate-spin" /> : platformIcon(platform)}
              trailing={<PlatformShareBadge platform={platform} summary={summary} />}
              className="justify-start"
            >
              <span className="min-w-0 flex-1 truncate text-left">{platformLabels[platform]}</span>
            </Button>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void nativeShare()}
            disabled={Boolean(busy)}
            icon={busy === 'native' ? <Loader2 size={13} className="animate-spin" /> : <Share2 size={13} />}
            trailing={<PrivateShareBadge />}
            className="justify-start"
          >
            <span className="min-w-0 flex-1 truncate text-left">Device share</span>
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
            className="col-span-2 h-auto min-h-7 justify-start py-1.5"
          >
            <span className="flex min-w-0 flex-1 flex-col items-start text-left leading-tight">
              <span>Copy link</span>
              <span className="max-w-full truncate font-mono text-2xs font-normal text-ink-dim">
                {displayedCopyUrl}
              </span>
            </span>
          </Button>
        </div>

        {error ? <p className="mt-2 font-caption text-2xs text-signal-error">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className={`flex min-w-0 items-center gap-1.5 ${className}`}>
      <details className="relative">
        <summary
          data-testid="vibes-share"
          className="flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-sm border border-border-soft px-2 font-mono text-xs text-ink-dim hover:border-accent hover:text-accent [&::-webkit-details-marker]:hidden"
        >
          <Share2 size={13} strokeWidth={1.75} />
          <span>share</span>
          {summary?.publicPosts ? (
            <Chip tone="neutral" size="sm" variant="ghost">
              {formatCompactNumber(summary.publicPosts)}
            </Chip>
          ) : null}
        </summary>

        <div className="absolute right-0 top-full z-30 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-md border border-border-soft bg-surface-panel p-3 shadow-lg">
          <div className="flex items-center justify-between gap-2">
            <p className="font-caption text-xs uppercase text-ink-dim">share</p>
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
                trailing={<PlatformShareBadge platform={platform} summary={summary} />}
                className="justify-start"
              >
                <span className="min-w-0 flex-1 truncate text-left">{platformLabels[platform]}</span>
              </Button>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void nativeShare()}
              disabled={Boolean(busy)}
              icon={busy === 'native' ? <Loader2 size={13} className="animate-spin" /> : <Share2 size={13} />}
              trailing={<PrivateShareBadge />}
              className="justify-start"
            >
              <span className="min-w-0 flex-1 truncate text-left">Device share</span>
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
              className="col-span-2 h-auto min-h-7 justify-start py-1.5"
            >
              <span className="flex min-w-0 flex-1 flex-col items-start text-left leading-tight">
                <span>Copy link</span>
                <span className="max-w-full truncate font-mono text-2xs font-normal text-ink-dim">
                  {displayedCopyUrl}
                </span>
              </span>
            </Button>
          </div>

          {error ? <p className="mt-2 font-caption text-2xs text-signal-error">{error}</p> : null}
        </div>
      </details>

      {showMetrics ? (
        <div data-testid="vibes-share-metrics" className="hidden min-w-0 items-center gap-1 sm:flex">
          {publicSharePlatforms.map((platform) => (
            <PlatformMetricPill
              key={platform}
              icon={platformIcon(platform)}
              label={platformLabels[platform]}
              value={verifiedShareCount(summary, platform)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function platformIcon(platform: SharePlatform) {
  if (platform === 'x') return <Twitter size={13} />;
  if (platform === 'linkedin') return <Linkedin size={13} />;
  if (platform === 'facebook') return <Facebook size={13} />;
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

function shortSharePreviewUrl(): string {
  const configuredOrigin = process.env.NEXT_PUBLIC_AETHER_SHARE_ORIGIN;
  if (configuredOrigin?.trim()) {
    return `${configuredOrigin.trim().replace(/\/$/, '')}/xxxx`;
  }

  const configuredDomain = process.env.NEXT_PUBLIC_AETHER_SHARE_DOMAIN;
  if (configuredDomain?.trim()) {
    return `https://${configuredDomain.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')}/xxxx`;
  }

  return 'https://s.berlayar.ai/xxxx';
}

function socialShareUrl(input: {
  shortUrl: string;
  cleanUrl: string;
  code: string;
  platform: SharePlatform;
}): string {
  try {
    const url = new URL(input.shortUrl);
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1' && url.hostname !== '::1') {
      return input.shortUrl;
    }
    const clean = new URL(input.cleanUrl);
    const publicUrl = new URL(clean.pathname, 'https://aether.berlayar.ai');
    publicUrl.searchParams.set('aether_share', input.code);
    publicUrl.searchParams.set('utm_source', input.platform);
    publicUrl.searchParams.set('utm_medium', 'share');
    return publicUrl.toString();
  } catch {
    return input.shortUrl;
  }
}

function PlatformShareBadge({ platform, summary }: { platform: SharePlatform; summary: ShareSummary | null }) {
  if (!publicSharePlatforms.includes(platform)) return <PrivateShareBadge />;
  return (
    <span
      className="rounded-sm border border-border-soft bg-surface-base px-1.5 py-0.5 font-mono text-2xs text-ink-muted"
      title={`verified public posts on ${platformLabels[platform]}`}
    >
      {formatCompactNumber(verifiedShareCount(summary, platform))}
    </span>
  );
}

function PrivateShareBadge() {
  return (
    <span
      className="rounded-sm border border-border-soft bg-surface-base px-1.5 py-0.5 font-caption text-2xs uppercase text-ink-dim"
      title="private shares cannot be verified by public URL discovery"
    >
      private
    </span>
  );
}

function PlatformMetricPill({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
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
    publicPostsByPlatform: {},
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

function verifiedShareCount(summary: ShareSummary | null, platform: SharePlatform): number {
  if (!summary || !publicSharePlatforms.includes(platform)) return 0;
  return summary.publicPostsByPlatform?.[platform as 'x' | 'linkedin' | 'facebook'] ?? 0;
}

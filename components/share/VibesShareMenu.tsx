'use client';

import { useMemo, useState } from 'react';
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
import {
  platformShareUrl,
  shareCaption as buildShareCaption,
  sharePostCopy,
  SHARE_PLATFORMS,
  type SharePlatform,
} from '@/lib/share/platforms';
import type { ShareObjectType } from '@/lib/share/store';

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
  actorId?: string;
  actorLabel?: string;
  sessionId?: string;
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
  actorId,
  actorLabel,
  sessionId,
  variant = 'menu',
  className = '',
}: VibesShareMenuProps) {
  const [busy, setBusy] = useState<SharePlatform | null>(null);
  const [copied, setCopied] = useState<'tracked' | null>(null);
  const [latestCopyUrl, setLatestCopyUrl] = useState<string | null>(null);
  const [latestCopyCode, setLatestCopyCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  async function createLink(platform: SharePlatform) {
    const res = await fetch('/api/share/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target,
        platform,
        actorId,
        actorLabel,
        sessionId,
        shareText: shareText ?? title,
        metadata: clientShareMetadata(platform, variant),
      }),
    });
    const json = (await res.json()) as CreateLinkResponse;
    if (!json.ok || !json.link) throw new Error(json.error ?? `HTTP ${res.status}`);
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
        metadata: clientShareMetadata(platform, variant),
      }),
    }).catch(() => undefined);
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
      if (platform === 'linkedin') {
        await writeClipboard(buildShareCaption({ url, title, text: shareText, hashtags }));
      }
      if (platform === 'facebook') {
        await writeClipboard(sharePostCopy({ url, title, text: shareText, hashtags }));
        window.alert?.('Post copy copied. Facebook will open next. Paste it into the Facebook composer before sharing.');
      }
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
        await writeClipboard(link.shortUrl);
        setCopied('tracked');
        await record('copy_link', 'native', link.code);
        return;
      }
      await navigator.share({
        title,
        text: buildShareCaption({ url: '', title, text: shareText ?? description, hashtags }),
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
      await writeClipboard(url);
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
            className="h-auto min-h-7 justify-start py-1.5"
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
              className="h-auto min-h-7 justify-start py-1.5"
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
    return `${sharePreviewOrigin(configuredOrigin)}/xxxx`;
  }

  const configuredDomain = process.env.NEXT_PUBLIC_AETHER_SHARE_DOMAIN;
  if (configuredDomain?.trim()) {
    return `${sharePreviewOrigin(configuredDomain)}/xxxx`;
  }

  return 'https://s.berlayar.ai/xxxx';
}

function sharePreviewOrigin(value: string): string {
  const raw = value.trim().replace(/\/$/, '');
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw.replace(/^https?:\/\//i, '')}`;
  try {
    const url = new URL(candidate);
    return shortOriginForAppHost(url.hostname) ?? url.origin;
  } catch {
    return raw;
  }
}

function shortOriginForAppHost(hostname: string): string | null {
  const host = hostname.toLowerCase();
  if (host === 'aether.berlayar.ai') return 'https://s.berlayar.ai';
  const staging = host.match(/^aether-(.+)\.berlayar\.ai$/);
  if (staging) return `https://s-${staging[1]}.berlayar.ai`;
  return null;
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
    return publicUrl.toString();
  } catch {
    return input.shortUrl;
  }
}

function clientShareMetadata(platform: SharePlatform, surface: 'menu' | 'panel'): Record<string, unknown> {
  if (typeof window === 'undefined') {
    return { source: 'vibes_share_menu', surface, requestedPlatform: platform };
  }
  const nav = window.navigator as Navigator & {
    userAgentData?: {
      platform?: string;
      mobile?: boolean;
      brands?: Array<{ brand: string; version: string }>;
    };
  };
  return {
    source: 'vibes_share_menu',
    surface,
    requestedPlatform: platform,
    pageUrl: window.location.href.slice(0, 500),
    referrer: document.referrer ? document.referrer.slice(0, 500) : undefined,
    locale: nav.language,
    languages: nav.languages?.slice(0, 6).join(','),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    screen: window.screen ? `${window.screen.width}x${window.screen.height}` : undefined,
    devicePixelRatio: window.devicePixelRatio,
    userAgentPlatform: nav.userAgentData?.platform,
    userAgentBrands: nav.userAgentData?.brands?.map((brand) => `${brand.brand}/${brand.version}`).join(', '),
    userAgentMobile: nav.userAgentData?.mobile,
  };
}

async function writeClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Some embedded browsers reject Clipboard writes when the document lacks focus.
    }
  }
  const input = document.createElement('textarea');
  input.value = text;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.left = '-9999px';
  document.body.appendChild(input);
  input.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  input.remove();
  return copied;
}

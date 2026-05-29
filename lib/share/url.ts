import type { SharePlatform } from './platforms';

export function canonicalUrlFromRequest(requestUrl: string, input: string): string {
  const base = publicAppOrigin(requestUrl);
  const url = new URL(input, base);
  url.hash = '';
  return url.toString();
}

export function publicAppOrigin(requestUrl: string): string {
  const configured =
    process.env.NEXT_PUBLIC_AETHER_PUBLIC_ORIGIN ??
    (process.env.NEXT_PUBLIC_AETHER_PUBLIC_DOMAIN
      ? `https://${process.env.NEXT_PUBLIC_AETHER_PUBLIC_DOMAIN}`
      : undefined);
  if (configured) return configured.replace(/\/$/, '');
  return new URL(requestUrl).origin;
}

export function shareOrigin(requestUrl: string): string {
  const configured =
    process.env.NEXT_PUBLIC_AETHER_SHARE_ORIGIN ??
    process.env.AETHER_SHARE_ORIGIN ??
    (process.env.NEXT_PUBLIC_AETHER_SHARE_DOMAIN
      ? `https://${process.env.NEXT_PUBLIC_AETHER_SHARE_DOMAIN}`
      : undefined);
  if (configured) return normalizeShareOrigin(configured);

  const url = new URL(requestUrl);
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return url.origin;
  const shortOrigin = shortOriginForAppHost(url.hostname);
  if (shortOrigin) return shortOrigin;
  return 'https://s.berlayar.ai';
}

export function shortUrlForCode(requestUrl: string, code: string, _platform?: SharePlatform): string {
  return new URL(`${shareOrigin(requestUrl)}/${code}`).toString();
}

export function shareRedirectUrl(input: {
  canonicalUrl: string;
  code: string;
  platform?: SharePlatform;
  requestUrl?: string;
}): string {
  const target = new URL(input.canonicalUrl);
  target.searchParams.set('aether_share', input.code);
  return target.toString();
}

export function normalizeMatchedUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = '';
    if (url.pathname !== '/' && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.toString();
  } catch {
    return value.trim();
  }
}

function normalizeShareOrigin(value: string): string {
  const configured = value.trim().replace(/\/$/, '');
  const candidate = /^https?:\/\//i.test(configured)
    ? configured
    : `https://${configured.replace(/^https?:\/\//i, '')}`;
  try {
    const url = new URL(candidate);
    return shortOriginForAppHost(url.hostname) ?? url.origin;
  } catch {
    return configured;
  }
}

function shortOriginForAppHost(hostname: string): string | null {
  const host = hostname.toLowerCase();
  if (host === 'aether.berlayar.ai') return 'https://s.berlayar.ai';
  const staging = host.match(/^aether-(.+)\.berlayar\.ai$/);
  if (staging) return `https://s-${staging[1]}.berlayar.ai`;
  return null;
}

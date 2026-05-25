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
  if (configured) return configured.replace(/\/$/, '');

  const url = new URL(requestUrl);
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return url.origin;
  return 'https://s.berlayar.ai';
}

export function shortUrlForCode(requestUrl: string, code: string): string {
  return `${shareOrigin(requestUrl)}/${code}`;
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

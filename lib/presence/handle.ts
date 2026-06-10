const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;

export function normalizeXHandle(input: string): string {
  const raw = input.trim();
  if (!raw || raw === '@') return '';

  const fromUrl = handleFromUrl(raw);
  const candidate = fromUrl ?? raw.replace(/^@/, '');
  if (!HANDLE_RE.test(candidate)) return '';
  return `@${candidate}`;
}

function handleFromUrl(raw: string): string | null {
  const maybeUrl = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(maybeUrl);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (host !== 'x.com' && host !== 'twitter.com') return null;
  const first = url.pathname.split('/').filter(Boolean)[0] ?? '';
  return first && HANDLE_RE.test(first) ? first : null;
}

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const HOSTISH_RE =
  /^(localhost(?::\d+)?|(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?|[^/\s]+\.[^/\s]+)(?:[/?#].*)?$/i;

/**
 * Creator-facing URL fields should accept pasted domains like
 * `tong.berlayar.ai`, while the provider boundary still only accepts http(s).
 */
export function normalizeHttpUrlInput(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  if (SCHEME_RE.test(trimmed)) return trimmed;
  if (HOSTISH_RE.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

export function parseHttpUrlInput(input: string): URL {
  const normalized = normalizeHttpUrlInput(input);
  const url = new URL(normalized);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`unsupported URL scheme: ${url.protocol}`);
  }
  return url;
}

/**
 * Client-side Vibes auth helpers shared by the /vibes workbench and the
 * /events/:eventId report page.
 *
 * The Vibes API key is cached in localStorage so a creator who minted a key
 * on /vibes stays authorized on the linked report page — without ever
 * putting the key in a URL. The React glue (provider + hook) lives in
 * components/vibes/vibes-auth.tsx; this module is the framework-agnostic
 * storage + header layer so it can be unit-tested in isolation.
 */

export const VIBES_API_KEY_STORAGE = 'aether.vibes.apiKey';

/** Read the cached Vibes API key. Returns '' when none / unavailable. */
export function readStoredVibesKey(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(VIBES_API_KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

/** Cache (or, with an empty string, clear) the Vibes API key. */
export function writeStoredVibesKey(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (key) window.localStorage.setItem(VIBES_API_KEY_STORAGE, key);
    else window.localStorage.removeItem(VIBES_API_KEY_STORAGE);
  } catch {
    // localStorage is a convenience cache only — never fatal.
  }
}

/**
 * Headers for an unauthenticated local-dev / Playwright request. The server
 * only trusts `x-vibes-dev-user` outside production (see access.ts
 * `readDevUser`), so this is an inert no-op once deployed.
 */
export function vibesDevHeaders(): Record<string, string> {
  if (process.env.NODE_ENV === 'production') return {};
  return { 'x-vibes-dev-user': 'aether-local-dev' };
}

/**
 * Build the auth headers for a Vibes / event recap API fetch: an
 * `Authorization: Bearer <token>` when a key or Logto token is available,
 * otherwise the local-dev fallback. Never throws.
 */
export function vibesAuthHeadersFrom(token: string | null | undefined): Record<string, string> {
  const trimmed = token?.trim();
  if (trimmed) return { Authorization: `Bearer ${trimmed}` };
  return vibesDevHeaders();
}

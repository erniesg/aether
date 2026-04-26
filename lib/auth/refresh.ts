/**
 * lib/auth/refresh.ts
 *
 * Pure helpers for refreshing OAuth tokens.
 * No side-effects, no env reads — callers supply credentials.
 *
 * Supported providers:
 *   - TikTok v2 OAuth (https://open.tiktokapis.com/v2/oauth/token/)
 *   - X (Twitter) OAuth 2.0 (https://api.x.com/2/oauth2/token)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TikTokRefreshResult =
  | { accessToken: string; refreshToken: string; expiresIn: number; openId?: string }
  | { error: string };

export type XRefreshResult =
  | { accessToken: string; refreshToken: string; expiresIn: number }
  | { error: string };

// ---------------------------------------------------------------------------
// TikTok
// ---------------------------------------------------------------------------

const TIKTOK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';

/**
 * Refresh a TikTok access token using the stored refresh token.
 *
 * TikTok's refresh token typically has a 365-day TTL; the returned access
 * token lasts ~24 hours. Both new tokens must be persisted.
 *
 * @param refreshToken  The current TIKTOK_REFRESH_TOKEN value from env / store.
 * @param clientKey     TIKTOK_CLIENT_KEY from the developer portal.
 * @param clientSecret  TIKTOK_CLIENT_SECRET from the developer portal.
 */
export async function refreshTikTokToken(
  refreshToken: string,
  clientKey: string,
  clientSecret: string
): Promise<TikTokRefreshResult> {
  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  let res: Response;
  try {
    res = await fetch(TIKTOK_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cache-Control': 'no-cache',
      },
      body: body.toString(),
    });
  } catch (err) {
    return {
      error: `network error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  let json: {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    refresh_expires_in?: number;
    open_id?: string;
    scope?: string;
    token_type?: string;
    error?: string;
    error_description?: string;
  };

  try {
    json = (await res.json()) as typeof json;
  } catch {
    return { error: `failed to parse TikTok response (HTTP ${res.status})` };
  }

  if (!res.ok || json.error) {
    return {
      error: json.error ?? `HTTP ${res.status}`,
    };
  }

  return {
    accessToken: json.access_token ?? '',
    refreshToken: json.refresh_token ?? '',
    expiresIn: json.expires_in ?? 0,
    ...(json.open_id ? { openId: json.open_id } : {}),
  };
}

// ---------------------------------------------------------------------------
// X (Twitter)
// ---------------------------------------------------------------------------

const X_TOKEN_URL = 'https://api.x.com/2/oauth2/token';

/**
 * Refresh an X (Twitter) access token using the stored refresh token.
 *
 * X issues long-lived refresh tokens when `offline.access` scope is granted.
 * The returned refresh_token supersedes the one used; rotate it in storage.
 *
 * Auth strategy:
 *   - Confidential client (client_secret supplied): uses HTTP Basic auth
 *     with `Basic base64(client_id:client_secret)` and omits client_id
 *     from the request body — per RFC 6749 §2.3.1.
 *   - Public client (no client_secret): passes client_id in the body.
 *
 * @param refreshToken  The current X_OAUTH2_REFRESH_TOKEN value.
 * @param clientId      X_OAUTH2_CLIENT_ID from the developer portal.
 * @param clientSecret  X_OAUTH2_CLIENT_SECRET (optional — omit for public clients).
 */
export async function refreshXToken(
  refreshToken: string,
  clientId: string,
  clientSecret?: string
): Promise<XRefreshResult> {
  const isConfidential = Boolean(clientSecret);

  // Public client: client_id goes in the body.
  // Confidential client: client_id goes in the Basic auth header; body omits it.
  const bodyParams: Record<string, string> = {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  };
  if (!isConfidential) {
    bodyParams['client_id'] = clientId;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Cache-Control': 'no-cache',
  };
  if (isConfidential) {
    const credentials = btoa(`${clientId}:${clientSecret}`);
    headers['Authorization'] = `Basic ${credentials}`;
  }

  let res: Response;
  try {
    res = await fetch(X_TOKEN_URL, {
      method: 'POST',
      headers,
      body: new URLSearchParams(bodyParams).toString(),
    });
  } catch (err) {
    return {
      error: `network error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  let json: {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
    error?: string;
    error_description?: string;
  };

  try {
    json = (await res.json()) as typeof json;
  } catch {
    return { error: `failed to parse X response (HTTP ${res.status})` };
  }

  if (!res.ok || json.error) {
    return {
      error: json.error ?? `HTTP ${res.status}`,
    };
  }

  return {
    accessToken: json.access_token ?? '',
    refreshToken: json.refresh_token ?? '',
    expiresIn: json.expires_in ?? 0,
  };
}

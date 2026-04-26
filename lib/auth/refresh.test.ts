/**
 * lib/auth/refresh.test.ts
 *
 * TDD-first: tests for TikTok and X token refresh helpers.
 * Run with: npx vitest run lib/auth/refresh.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { refreshTikTokToken, refreshXToken } from './refresh';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// TikTok refresh
// ---------------------------------------------------------------------------

describe('refreshTikTokToken', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('happy path — calls the right URL with correct form body and returns parsed tokens', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(
      makeJsonResponse({
        access_token: 'new_access',
        refresh_token: 'new_refresh',
        expires_in: 86400,
        refresh_expires_in: 5184000,
        open_id: 'user_abc',
        scope: 'user.info.basic,video.publish',
        token_type: 'Bearer',
      })
    );
    vi.stubGlobal('fetch', mockFetch);

    const result = await refreshTikTokToken('old_refresh', 'ck_key', 'ck_secret');

    // Should NOT be an error result
    expect(result).not.toHaveProperty('error');

    const ok = result as Exclude<typeof result, { error: string }>;
    expect(ok.accessToken).toBe('new_access');
    expect(ok.refreshToken).toBe('new_refresh');
    expect(ok.expiresIn).toBe(86400);
    expect(ok.openId).toBe('user_abc');

    // Verify the outbound request
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://open.tiktokapis.com/v2/oauth/token/');
    expect(init.method).toBe('POST');

    const sentBody = new URLSearchParams(init.body as string);
    expect(sentBody.get('client_key')).toBe('ck_key');
    expect(sentBody.get('client_secret')).toBe('ck_secret');
    expect(sentBody.get('grant_type')).toBe('refresh_token');
    expect(sentBody.get('refresh_token')).toBe('old_refresh');
  });

  it('error path — HTTP 400 from TikTok returns { error }', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        makeJsonResponse(
          { error: 'invalid_grant', error_description: 'Refresh token expired' },
          400
        )
      )
    );

    const result = await refreshTikTokToken('expired_token', 'ck_key', 'ck_secret');

    expect(result).toHaveProperty('error');
    const err = result as { error: string };
    expect(err.error).toMatch(/invalid_grant|400/);
  });

  it('error path — TikTok returns 200 but body contains error field → { error }', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        makeJsonResponse({ error: 'access_denied', error_description: 'Scope mismatch' }, 200)
      )
    );

    const result = await refreshTikTokToken('some_token', 'ck_key', 'ck_secret');

    expect(result).toHaveProperty('error');
  });
});

// ---------------------------------------------------------------------------
// X refresh — public client (no client_secret)
// ---------------------------------------------------------------------------

describe('refreshXToken — public client (no client_secret)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends client_id in body and NO Authorization header', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(
      makeJsonResponse({
        access_token: 'x_access_new',
        refresh_token: 'x_refresh_new',
        expires_in: 7200,
        scope: 'tweet.read tweet.write',
        token_type: 'bearer',
      })
    );
    vi.stubGlobal('fetch', mockFetch);

    const result = await refreshXToken('x_old_refresh', 'my_client_id');

    expect(result).not.toHaveProperty('error');
    const ok = result as Exclude<typeof result, { error: string }>;
    expect(ok.accessToken).toBe('x_access_new');
    expect(ok.refreshToken).toBe('x_refresh_new');
    expect(ok.expiresIn).toBe(7200);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.x.com/2/oauth2/token');
    expect(init.method).toBe('POST');

    const headers = new Headers(init.headers as HeadersInit);
    expect(headers.has('Authorization')).toBe(false);

    const sentBody = new URLSearchParams(init.body as string);
    expect(sentBody.get('client_id')).toBe('my_client_id');
    expect(sentBody.get('grant_type')).toBe('refresh_token');
    expect(sentBody.get('refresh_token')).toBe('x_old_refresh');
  });
});

// ---------------------------------------------------------------------------
// X refresh — confidential client (with client_secret)
// ---------------------------------------------------------------------------

describe('refreshXToken — confidential client (with client_secret)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses Basic auth header and does NOT include client_id in body', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(
      makeJsonResponse({
        access_token: 'x_conf_access',
        refresh_token: 'x_conf_refresh',
        expires_in: 7200,
        scope: 'tweet.read tweet.write offline.access',
        token_type: 'bearer',
      })
    );
    vi.stubGlobal('fetch', mockFetch);

    const result = await refreshXToken('x_old_refresh', 'conf_client_id', 'conf_secret');

    expect(result).not.toHaveProperty('error');
    const ok = result as Exclude<typeof result, { error: string }>;
    expect(ok.accessToken).toBe('x_conf_access');

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers as HeadersInit);

    // Must have Basic auth
    const auth = headers.get('Authorization');
    expect(auth).not.toBeNull();
    expect(auth).toMatch(/^Basic /);

    // Verify the base64 encodes client_id:client_secret
    const decoded = atob(auth!.replace('Basic ', ''));
    expect(decoded).toBe('conf_client_id:conf_secret');

    // client_id must NOT be in body for confidential client
    const sentBody = new URLSearchParams(init.body as string);
    expect(sentBody.get('client_id')).toBeNull();
    expect(sentBody.get('grant_type')).toBe('refresh_token');
    expect(sentBody.get('refresh_token')).toBe('x_old_refresh');
  });
});

// ---------------------------------------------------------------------------
// X refresh — error path
// ---------------------------------------------------------------------------

describe('refreshXToken — error path', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('HTTP 401 from X returns { error }', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        makeJsonResponse(
          {
            error: 'unauthorized_client',
            error_description: 'Invalid client credentials',
          },
          401
        )
      )
    );

    const result = await refreshXToken('bad_refresh', 'bad_client');

    expect(result).toHaveProperty('error');
    const err = result as { error: string };
    expect(err.error).toMatch(/unauthorized_client|401/);
  });
});

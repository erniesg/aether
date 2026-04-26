/**
 * TikTok token refresh — `GET /api/social-auth/tiktok/refresh`.
 *
 * Reads the stored refresh token + client credentials from env, calls the
 * TikTok v2 token endpoint, and renders an HTML page showing the new tokens
 * so you can paste them into .env.local and restart the dev server.
 *
 * Required env:
 *   TIKTOK_CLIENT_KEY       OAuth Client Key from developers.tiktok.com
 *   TIKTOK_CLIENT_SECRET    OAuth Client Secret
 *   TIKTOK_REFRESH_TOKEN    Long-lived refresh token (from OAuth callback)
 */

import { refreshTikTokToken } from '@/lib/auth/refresh';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// HTML helpers — shared style with the callback route
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function htmlPage(body: string, status: number = 200): Response {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"/><title>aether · tiktok refresh</title><style>
      body{font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:#0c0c0e;color:#e7e7ea;padding:32px;max-width:760px;margin:0 auto;}
      h1{font:600 24px/1.2 ui-sans-serif,system-ui,sans-serif;margin:0 0 16px;}
      pre{background:#1a1a1d;border:1px solid #2a2a2e;border-radius:6px;padding:14px;overflow:auto;white-space:pre-wrap;word-break:break-all;}
      code{background:#1a1a1d;padding:2px 6px;border-radius:4px;}
      .ok{color:#5cdd84;} .err{color:#ff6b6b;} .dim{color:#7f7f87;}
      a{color:#7cc5ff;}
    </style></head><body>${body}</body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function GET(): Promise<Response> {
  const clientKey = process.env.TIKTOK_CLIENT_KEY?.trim();
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET?.trim();
  const storedRefreshToken = process.env.TIKTOK_REFRESH_TOKEN?.trim();

  const missing: string[] = [];
  if (!clientKey) missing.push('TIKTOK_CLIENT_KEY');
  if (!clientSecret) missing.push('TIKTOK_CLIENT_SECRET');
  if (!storedRefreshToken) missing.push('TIKTOK_REFRESH_TOKEN');

  if (missing.length > 0) {
    return htmlPage(
      `<h1 class="err">missing env vars</h1>
       <p>Set these in <code>.env.local</code> before calling this endpoint:</p>
       <pre>${escapeHtml(missing.join('\n'))}</pre>
       <p class="dim">Run the OAuth flow at
       <a href="/api/social-auth/tiktok/start">/api/social-auth/tiktok/start</a>
       to obtain a refresh token initially.</p>`,
      400
    );
  }

  const result = await refreshTikTokToken(storedRefreshToken!, clientKey!, clientSecret!);

  if ('error' in result) {
    return htmlPage(
      `<h1 class="err">TikTok refresh failed</h1>
       <p>Error: <code>${escapeHtml(result.error)}</code></p>
       <p class="dim">Your refresh token may be expired. Re-run the OAuth flow at
       <a href="/api/social-auth/tiktok/start">/api/social-auth/tiktok/start</a>.</p>`,
      400
    );
  }

  const expiryDays = Math.round(result.expiresIn / 86400);

  return htmlPage(
    `<h1 class="ok">&#10003; TikTok tokens refreshed</h1>
     <p class="dim">Paste these into <code>.env.local</code> and restart your dev server.</p>
     <pre># TikTok — refreshed ${new Date().toISOString()}
TIKTOK_ACCESS_TOKEN=${escapeHtml(result.accessToken)}
TIKTOK_REFRESH_TOKEN=${escapeHtml(result.refreshToken)}${result.openId ? `\nTIKTOK_OPEN_ID=${escapeHtml(result.openId)}` : ''}
# access_token expires_in = ${result.expiresIn}s (~${expiryDays} day${expiryDays === 1 ? '' : 's'})</pre>
     <p class="dim">Refresh again before the token expires, or revisit this endpoint.</p>`
  );
}

/**
 * X (Twitter) token refresh — `GET /api/social-auth/x/refresh`.
 *
 * Reads the stored refresh token + client credentials from env, calls the
 * X OAuth 2.0 token endpoint, and renders an HTML page showing the new tokens
 * so you can paste them into .env.local and restart the dev server.
 *
 * Client type is determined automatically:
 *   - X_OAUTH2_CLIENT_SECRET set   → confidential client (Basic auth)
 *   - X_OAUTH2_CLIENT_SECRET unset → public client (client_id in body)
 *
 * Required env:
 *   X_OAUTH2_CLIENT_ID       OAuth 2.0 Client ID from developer.twitter.com
 *   X_OAUTH2_REFRESH_TOKEN   Long-lived refresh token (from OAuth callback)
 *
 * Optional env:
 *   X_OAUTH2_CLIENT_SECRET   Client secret (confidential clients only)
 */

import { refreshXToken } from '@/lib/auth/refresh';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// HTML helpers — shared style with the sibling OAuth routes
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
    `<!doctype html><html><head><meta charset="utf-8"/><title>aether · x refresh</title><style>
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
  const clientId = process.env.X_OAUTH2_CLIENT_ID?.trim();
  const clientSecret = process.env.X_OAUTH2_CLIENT_SECRET?.trim() || undefined;
  const storedRefreshToken = process.env.X_OAUTH2_REFRESH_TOKEN?.trim();

  const missing: string[] = [];
  if (!clientId) missing.push('X_OAUTH2_CLIENT_ID');
  if (!storedRefreshToken) missing.push('X_OAUTH2_REFRESH_TOKEN');

  if (missing.length > 0) {
    return htmlPage(
      `<h1 class="err">missing env vars</h1>
       <p>Set these in <code>.env.local</code> before calling this endpoint:</p>
       <pre>${escapeHtml(missing.join('\n'))}</pre>
       <p class="dim">Run the OAuth flow at
       <a href="/api/social-auth/x/start">/api/social-auth/x/start</a>
       to obtain a refresh token initially.
       Include <code>offline.access</code> in scopes to receive a refresh token.</p>`,
      400
    );
  }

  const clientType = clientSecret ? 'confidential (Basic auth)' : 'public (client_id in body)';

  const result = await refreshXToken(storedRefreshToken!, clientId!, clientSecret);

  if ('error' in result) {
    return htmlPage(
      `<h1 class="err">X token refresh failed</h1>
       <p>Error: <code>${escapeHtml(result.error)}</code></p>
       <p>Client type detected: <code>${escapeHtml(clientType)}</code></p>
       <p class="dim">Your refresh token may be expired or revoked. Re-run the OAuth flow at
       <a href="/api/social-auth/x/start">/api/social-auth/x/start</a>.</p>`,
      400
    );
  }

  const expiryMins = Math.round(result.expiresIn / 60);

  return htmlPage(
    `<h1 class="ok">&#10003; X tokens refreshed</h1>
     <p class="dim">Paste these into <code>.env.local</code> and restart your dev server.</p>
     <pre># X (Twitter) — refreshed ${new Date().toISOString()}
X_OAUTH2_ACCESS_TOKEN=${escapeHtml(result.accessToken)}
X_OAUTH2_REFRESH_TOKEN=${escapeHtml(result.refreshToken)}
# access_token expires_in = ${result.expiresIn}s (~${expiryMins} min)</pre>
     <p class="dim">Client type: <code>${escapeHtml(clientType)}</code>. Refresh again before the token expires.</p>`
  );
}

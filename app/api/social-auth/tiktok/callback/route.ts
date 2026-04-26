/**
 * TikTok OAuth callback — `/api/social-auth/tiktok/callback`.
 *
 * TikTok redirects here after the user authorizes the app. We:
 *   1. Verify state against the cookie set in /start (CSRF guard).
 *   2. Exchange the code for access_token + refresh_token via the
 *      v2 token endpoint.
 *   3. Render an HTML page that shows the tokens for manual paste into
 *      .env.local. (For the hackathon — production stores in Convex.)
 *
 * Required env:
 *   TIKTOK_CLIENT_KEY
 *   TIKTOK_CLIENT_SECRET
 *   TIKTOK_REDIRECT_URI  (optional — derived from request.url when absent)
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TIKTOK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';

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
    `<!doctype html><html><head><meta charset="utf-8"/><title>aether · tiktok auth</title><style>
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

function buildRedirectUri(request: Request): string {
  const fromEnv = process.env.TIKTOK_REDIRECT_URI?.trim();
  if (fromEnv) return fromEnv;
  const origin = new URL(request.url).origin;
  return `${origin}/api/social-auth/tiktok/callback`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');
  const errorDescription = url.searchParams.get('error_description');

  if (errorParam) {
    return htmlPage(
      `<h1 class="err">TikTok rejected the authorization</h1>
       <p>error: <code>${escapeHtml(errorParam)}</code></p>
       <p>${escapeHtml(errorDescription ?? '')}</p>
       <p><a href="/api/social-auth/tiktok/start">try again</a></p>`,
      400
    );
  }
  if (!code || !state) {
    return htmlPage(
      `<h1 class="err">missing code or state</h1>
       <p>TikTok didn't include the required query params. <a href="/api/social-auth/tiktok/start">retry</a>.</p>`,
      400
    );
  }

  // CSRF check — state must match the cookie set in /start.
  const cookieHeader = request.headers.get('cookie') ?? '';
  const cookieState = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('tiktok_oauth_state='))
    ?.split('=')[1];
  if (!cookieState || cookieState !== state) {
    return htmlPage(
      `<h1 class="err">state mismatch</h1>
       <p>CSRF guard tripped. The cookie state didn't match TikTok's reply.
       Retry from <a href="/api/social-auth/tiktok/start">/api/social-auth/tiktok/start</a>.</p>`,
      400
    );
  }

  const clientKey = process.env.TIKTOK_CLIENT_KEY?.trim();
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET?.trim();
  if (!clientKey || !clientSecret) {
    return htmlPage(
      `<h1 class="err">missing TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET</h1>`,
      500
    );
  }
  const redirectUri = buildRedirectUri(request);

  // POST x-www-form-urlencoded per TikTok v2 OAuth spec.
  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });

  let tokenJson: {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    refresh_expires_in?: number;
    open_id?: string;
    scope?: string;
    token_type?: string;
    error?: string;
    error_description?: string;
  } = {};
  try {
    const res = await fetch(TIKTOK_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cache-Control': 'no-cache',
      },
      body: body.toString(),
    });
    tokenJson = (await res.json()) as typeof tokenJson;
    if (!res.ok || tokenJson.error) {
      return htmlPage(
        `<h1 class="err">token exchange failed</h1>
         <p>HTTP ${res.status}</p>
         <pre>${escapeHtml(JSON.stringify(tokenJson, null, 2))}</pre>`,
        res.ok ? 400 : res.status
      );
    }
  } catch (err) {
    return htmlPage(
      `<h1 class="err">token exchange threw</h1>
       <pre>${escapeHtml(err instanceof Error ? err.message : String(err))}</pre>`,
      500
    );
  }

  const accessToken = tokenJson.access_token ?? '';
  const refreshToken = tokenJson.refresh_token ?? '';
  const openId = tokenJson.open_id ?? '';
  const expiresIn = tokenJson.expires_in ?? 0;

  return htmlPage(
    `<h1 class="ok">✓ TikTok connected</h1>
     <p class="dim">Paste these into <code>.env.local</code> and restart your dev server.</p>
     <pre># TikTok user-context tokens (from OAuth flow)
TIKTOK_OPEN_ID=${escapeHtml(openId)}
TIKTOK_ACCESS_TOKEN=${escapeHtml(accessToken)}
TIKTOK_REFRESH_TOKEN=${escapeHtml(refreshToken)}
# expires_in = ${expiresIn}s (~${Math.round(expiresIn / 86400)} days);
# refresh with the refresh_token before expiry.</pre>
     <p>scopes: <code>${escapeHtml(tokenJson.scope ?? '')}</code></p>
     <p class="dim">After pasting + restarting, post via <a href="/auto-mode">/auto-mode</a> or
     <a href="/inspect">/inspect</a> a previous run.</p>`
  );
}

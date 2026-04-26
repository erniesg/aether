/**
 * X OAuth 2.0 callback — `/api/social-auth/x/callback`.
 *
 * X redirects here after the user authorizes the app. We:
 *   1. Verify state against the `x_oauth_state` cookie (CSRF guard).
 *   2. Read the `x_oauth_pkce` cookie to recover the code_verifier.
 *   3. Exchange the code for access_token + refresh_token via the
 *      X v2 token endpoint (POST x-www-form-urlencoded).
 *   4. Render an HTML page that shows the tokens for manual paste into
 *      .env.local. (For the hackathon — production stores in Convex.)
 *
 * Required env:
 *   X_OAUTH2_CLIENT_ID
 *
 * Optional env:
 *   X_OAUTH2_CLIENT_SECRET   Set only for confidential clients; when present
 *                            we send HTTP Basic auth on the token request.
 *                            Public clients (PKCE-only) omit this.
 *   X_OAUTH2_REDIRECT_URI    Absolute callback URL; derived from request.url
 *                            when absent — must match the value used in /start.
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const X_TOKEN_URL = 'https://api.x.com/2/oauth2/token';

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
    `<!doctype html><html><head><meta charset="utf-8"/><title>aether · x auth</title><style>
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
  const fromEnv = process.env.X_OAUTH2_REDIRECT_URI?.trim();
  if (fromEnv) return fromEnv;
  const origin = new URL(request.url).origin;
  return `${origin}/api/social-auth/x/callback`;
}

/** Parse a single named cookie value from the Cookie header. */
function parseCookie(header: string, name: string): string | undefined {
  return header
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export async function GET(request: Request) {
  const reqUrl = new URL(request.url);
  const code = reqUrl.searchParams.get('code');
  const state = reqUrl.searchParams.get('state');
  const errorParam = reqUrl.searchParams.get('error');
  const errorDescription = reqUrl.searchParams.get('error_description');

  // X redirected with an error (e.g. user denied access).
  if (errorParam) {
    return htmlPage(
      `<h1 class="err">X rejected the authorization</h1>
       <p>error: <code>${escapeHtml(errorParam)}</code></p>
       <p>${escapeHtml(errorDescription ?? '')}</p>
       <p><a href="/api/social-auth/x/start">try again</a></p>`,
      400
    );
  }

  if (!code || !state) {
    return htmlPage(
      `<h1 class="err">missing code or state</h1>
       <p>X didn't include the required query params. <a href="/api/social-auth/x/start">retry</a>.</p>`,
      400
    );
  }

  // CSRF check — state must match the cookie set in /start.
  const cookieHeader = request.headers.get('cookie') ?? '';
  const cookieState = parseCookie(cookieHeader, 'x_oauth_state');
  if (!cookieState || cookieState !== state) {
    return htmlPage(
      `<h1 class="err">state mismatch</h1>
       <p>CSRF guard tripped. The cookie state didn't match X's reply.
       Retry from <a href="/api/social-auth/x/start">/api/social-auth/x/start</a>.</p>`,
      400
    );
  }

  // PKCE verifier — stored in cookie by /start.
  const codeVerifier = parseCookie(cookieHeader, 'x_oauth_pkce');
  if (!codeVerifier) {
    return htmlPage(
      `<h1 class="err">missing PKCE verifier cookie</h1>
       <p>The <code>x_oauth_pkce</code> cookie was absent or expired (10-min TTL).
       Retry from <a href="/api/social-auth/x/start">/api/social-auth/x/start</a>.</p>`,
      400
    );
  }

  const clientId = process.env.X_OAUTH2_CLIENT_ID?.trim();
  if (!clientId) {
    return htmlPage(
      `<h1 class="err">missing X_OAUTH2_CLIENT_ID</h1>
       <p>Set <code>X_OAUTH2_CLIENT_ID</code> in <code>.env.local</code> and restart the dev server.</p>`,
      500
    );
  }
  const clientSecret = process.env.X_OAUTH2_CLIENT_SECRET?.trim();
  const redirectUri = buildRedirectUri(request);

  // POST x-www-form-urlencoded per X OAuth 2.0 spec.
  // Public client (no secret): client_id in body only, no Authorization header.
  // Confidential client (secret set): HTTP Basic auth header.
  const body = new URLSearchParams({
    code,
    grant_type: 'authorization_code',
    client_id: clientId,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Cache-Control': 'no-cache',
  };
  if (clientSecret) {
    const credentials = btoa(`${clientId}:${clientSecret}`);
    headers['Authorization'] = `Basic ${credentials}`;
  }

  type TokenResponse = {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };

  let tokenJson: TokenResponse = {};
  try {
    const res = await fetch(X_TOKEN_URL, {
      method: 'POST',
      headers,
      body: body.toString(),
    });
    tokenJson = (await res.json()) as TokenResponse;
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
  const expiresIn = tokenJson.expires_in ?? 0;
  const scope = tokenJson.scope ?? '';

  // Clear the PKCE and state cookies now that the flow is complete.
  const clearCookieOpts = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/api/social-auth/x',
    maxAge: 0,
  };
  const pageResponse = htmlPage(
    `<h1 class="ok">✓ X connected</h1>
     <p class="dim">Paste these into <code>.env.local</code> and restart your dev server.</p>
     <pre># X OAuth 2.0 user-context tokens (from OAuth flow)
X_OAUTH2_ACCESS_TOKEN=${escapeHtml(accessToken)}
X_OAUTH2_REFRESH_TOKEN=${escapeHtml(refreshToken)}
# expires_in = ${expiresIn}s (~${Math.round(expiresIn / 86400)} days)
# scope = ${escapeHtml(scope)}</pre>
     <p>scopes granted: <code>${escapeHtml(scope)}</code></p>
     <p class="dim">After pasting + restarting, post via <a href="/auto-mode">/auto-mode</a> or
     <a href="/inspect">/inspect</a> a previous run.</p>`
  );

  // Attach Set-Cookie headers to clear the flow cookies.
  const nextRes = NextResponse.next();
  nextRes.cookies.set('x_oauth_state', '', clearCookieOpts);
  nextRes.cookies.set('x_oauth_pkce', '', clearCookieOpts);

  // We need to return a plain Response (htmlPage returns one), so we attach
  // the clear-cookie headers manually.
  const clearHeaders = nextRes.headers.getSetCookie?.() ?? [];
  const finalHeaders = new Headers(pageResponse.headers);
  for (const h of clearHeaders) {
    finalHeaders.append('Set-Cookie', h);
  }

  return new Response(pageResponse.body, {
    status: pageResponse.status,
    headers: finalHeaders,
  });
}

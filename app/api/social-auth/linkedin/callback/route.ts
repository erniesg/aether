/**
 * LinkedIn OAuth 2.0 callback — `/api/social-auth/linkedin/callback`.
 *
 * LinkedIn redirects here after the user authorizes the app. We:
 *   1. Verify state against the `li_oauth_state` cookie (CSRF guard).
 *   2. Exchange the code for an access_token via the LinkedIn token endpoint
 *      (POST application/x-www-form-urlencoded with HTTP Basic auth).
 *   3. Call GET /v2/userinfo with the token to retrieve the `sub` field
 *      (the numeric member id — needed as LINKEDIN_MEMBER_ID).
 *   4. Render an HTML page that shows LINKEDIN_ACCESS_TOKEN and
 *      LINKEDIN_MEMBER_ID for manual paste into .env.local.
 *      (For the hackathon — production stores in Convex.)
 *
 * Required env:
 *   LINKEDIN_OAUTH2_CLIENT_ID
 *   LINKEDIN_OAUTH2_CLIENT_SECRET
 *
 * Optional env:
 *   LINKEDIN_OAUTH2_REDIRECT_URI   Absolute callback URL; derived from
 *                                  request.url when absent — must match /start.
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LI_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const LI_USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';

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
    `<!doctype html><html><head><meta charset="utf-8"/><title>aether · linkedin auth</title><style>
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
  const fromEnv = process.env.LINKEDIN_OAUTH2_REDIRECT_URI?.trim();
  if (fromEnv) return fromEnv;
  const origin = new URL(request.url).origin;
  return `${origin}/api/social-auth/linkedin/callback`;
}

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

  if (errorParam) {
    return htmlPage(
      `<h1 class="err">LinkedIn rejected the authorization</h1>
       <p>error: <code>${escapeHtml(errorParam)}</code></p>
       <p>${escapeHtml(errorDescription ?? '')}</p>
       <p><a href="/api/social-auth/linkedin/start">try again</a></p>`,
      400
    );
  }

  if (!code || !state) {
    return htmlPage(
      `<h1 class="err">missing code or state</h1>
       <p>LinkedIn didn't include the required query params. <a href="/api/social-auth/linkedin/start">retry</a>.</p>`,
      400
    );
  }

  // CSRF check — state must match the cookie set in /start.
  const cookieHeader = request.headers.get('cookie') ?? '';
  const cookieState = parseCookie(cookieHeader, 'li_oauth_state');
  if (!cookieState || cookieState !== state) {
    return htmlPage(
      `<h1 class="err">state mismatch</h1>
       <p>CSRF guard tripped. The cookie state didn't match LinkedIn's reply.
       Retry from <a href="/api/social-auth/linkedin/start">/api/social-auth/linkedin/start</a>.</p>`,
      400
    );
  }

  const clientId = process.env.LINKEDIN_OAUTH2_CLIENT_ID?.trim();
  const clientSecret = process.env.LINKEDIN_OAUTH2_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return htmlPage(
      `<h1 class="err">missing LinkedIn OAuth credentials</h1>
       <p>Set <code>LINKEDIN_OAUTH2_CLIENT_ID</code> and <code>LINKEDIN_OAUTH2_CLIENT_SECRET</code>
       in <code>.env.local</code> and restart.</p>`,
      500
    );
  }

  const redirectUri = buildRedirectUri(request);

  // POST x-www-form-urlencoded per LinkedIn token endpoint spec.
  // LinkedIn requires HTTP Basic auth (client_id:client_secret) on confidential clients.
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });

  type TokenResponse = {
    access_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
    error?: string;
    error_description?: string;
  };

  let tokenJson: TokenResponse = {};
  try {
    const tokenRes = await fetch(LI_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cache-Control': 'no-cache',
      },
      body: body.toString(),
    });
    tokenJson = (await tokenRes.json()) as TokenResponse;
    if (!tokenRes.ok || tokenJson.error) {
      return htmlPage(
        `<h1 class="err">token exchange failed</h1>
         <p>HTTP ${tokenRes.status}</p>
         <pre>${escapeHtml(JSON.stringify(tokenJson, null, 2))}</pre>`,
        tokenRes.ok ? 400 : tokenRes.status
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
  const expiresIn = tokenJson.expires_in ?? 0;
  const scope = tokenJson.scope ?? '';

  // Retrieve the member id from /v2/userinfo — the `sub` field is the numeric
  // member urn id that becomes LINKEDIN_MEMBER_ID.
  type UserInfo = {
    sub?: string;
    name?: string;
    email?: string;
    picture?: string;
  };

  let userInfo: UserInfo = {};
  let userInfoError = '';
  try {
    const uiRes = await fetch(LI_USERINFO_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'LinkedIn-Version': '202405',
        'X-Restli-Protocol-Version': '2.0.0',
      },
    });
    if (uiRes.ok) {
      userInfo = (await uiRes.json()) as UserInfo;
    } else {
      userInfoError = `HTTP ${uiRes.status}`;
    }
  } catch (err) {
    userInfoError = err instanceof Error ? err.message : String(err);
  }

  const memberId = userInfo.sub ?? '';
  const memberName = userInfo.name ?? '';

  // Clear the state cookie.
  const clearCookieOpts = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/api/social-auth/linkedin',
    maxAge: 0,
  };

  const memberSection = memberId
    ? `LINKEDIN_MEMBER_ID=${escapeHtml(memberId)}`
    : `# LINKEDIN_MEMBER_ID — could not retrieve${userInfoError ? ` (${escapeHtml(userInfoError)})` : ''}`;

  const pageResponse = htmlPage(
    `<h1 class="ok">✓ LinkedIn connected${memberName ? ` — ${escapeHtml(memberName)}` : ''}</h1>
     <p class="dim">Paste these into <code>.env.local</code> and restart your dev server.</p>
     <pre># LinkedIn OAuth 2.0 tokens
LINKEDIN_ACCESS_TOKEN=${escapeHtml(accessToken)}
${memberSection}
# expires_in = ${expiresIn}s (~${Math.round(expiresIn / 86400)} days)
# scope = ${escapeHtml(scope)}</pre>
     <p>scopes granted: <code>${escapeHtml(scope)}</code></p>
     ${memberId ? `<p>member id (sub): <code>${escapeHtml(memberId)}</code></p>` : `<p class="err">Could not retrieve member id — call <code>GET /v2/userinfo</code> manually with the token above.</p>`}
     <p class="dim">After pasting + restarting, post via <a href="/auto-mode">/auto-mode</a>.</p>`
  );

  // Attach Set-Cookie header to clear the flow cookie.
  const nextRes = NextResponse.next();
  nextRes.cookies.set('li_oauth_state', '', clearCookieOpts);
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

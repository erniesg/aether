/**
 * LinkedIn OAuth 2.0 start — `/api/social-auth/linkedin/start`.
 *
 * Generates CSRF state, builds the LinkedIn authorization URL, stores state
 * in a short-lived httpOnly cookie, then redirects to linkedin.com to authorize.
 * After authorization LinkedIn redirects to /api/social-auth/linkedin/callback
 * with ?code=…&state=… which exchanges the code for an access token and
 * retrieves the member id from /v2/userinfo.
 *
 * LinkedIn uses a standard OAuth 2.0 Authorization Code flow.
 * PKCE is NOT required by LinkedIn for confidential clients, but we include
 * state for CSRF protection.
 *
 * Required env:
 *   LINKEDIN_OAUTH2_CLIENT_ID      OAuth 2.0 Client ID (from LinkedIn Developer Portal)
 *   LINKEDIN_OAUTH2_CLIENT_SECRET  OAuth 2.0 Client Secret
 *
 * Optional env:
 *   LINKEDIN_OAUTH2_REDIRECT_URI   absolute callback URL; defaults to
 *                                  {origin}/api/social-auth/linkedin/callback
 *
 * Scopes:
 *   openid profile email w_member_social
 *   - openid + profile + email → enables /v2/userinfo for member id retrieval
 *   - w_member_social → posting on behalf of the member
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LI_AUTHORIZE_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const SCOPES = ['openid', 'profile', 'email', 'w_member_social'] as const;

function buildRedirectUri(request: Request): string {
  const fromEnv = process.env.LINKEDIN_OAUTH2_REDIRECT_URI?.trim();
  if (fromEnv) return fromEnv;
  const origin = new URL(request.url).origin;
  return `${origin}/api/social-auth/linkedin/callback`;
}

export async function GET(request: Request) {
  const clientId = process.env.LINKEDIN_OAUTH2_CLIENT_ID?.trim();
  if (!clientId) {
    return NextResponse.json(
      { ok: false, error: 'LINKEDIN_OAUTH2_CLIENT_ID not set in environment' },
      { status: 500 }
    );
  }

  const redirectUri = buildRedirectUri(request);

  // Random CSRF state — round-tripped via cookie.
  const state = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPES.join(' '),
    state,
  });
  const url = `${LI_AUTHORIZE_URL}?${params.toString()}`;

  const res = NextResponse.redirect(url, 302);

  res.cookies.set('li_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/social-auth/linkedin',
    maxAge: 600, // 10 minutes
  });

  return res;
}

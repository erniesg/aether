/**
 * X OAuth 2.0 start — `/api/social-auth/x/start`.
 *
 * Generates the PKCE code_verifier + code_challenge, builds the
 * authorization URL, stores state and code_verifier in two short-lived
 * httpOnly cookies, then redirects the user to twitter.com to authorize.
 * After authorization X redirects to /api/social-auth/x/callback?code=…&state=…
 * which exchanges the code for access + refresh tokens.
 *
 * X OAuth 2.0 mandates PKCE for all clients:
 *   code_verifier  — random URL-safe string (43-128 chars)
 *   code_challenge — base64url(sha256(code_verifier)), method=S256
 *
 * Required env:
 *   X_OAUTH2_CLIENT_ID      OAuth 2.0 Client ID from developer.twitter.com
 *
 * Optional env:
 *   X_OAUTH2_REDIRECT_URI   absolute callback URL; defaults to
 *                           {origin}/api/social-auth/x/callback
 *
 * Scopes (space-separated):
 *   tweet.read tweet.write users.read media.write offline.access
 *   (offline.access is required to receive a refresh_token)
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const X_AUTHORIZE_URL = 'https://twitter.com/i/oauth2/authorize';
const SCOPES = [
  'tweet.read',
  'tweet.write',
  'users.read',
  'media.write',
  'offline.access',
] as const;

function buildRedirectUri(request: Request): string {
  const fromEnv = process.env.X_OAUTH2_REDIRECT_URI?.trim();
  if (fromEnv) return fromEnv;
  const origin = new URL(request.url).origin;
  return `${origin}/api/social-auth/x/callback`;
}

/** Generate a cryptographically random URL-safe string of `byteLength` bytes. */
function randomUrlSafe(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  // base64url-encode and strip padding — all chars are URL-safe
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** base64url(sha256(ascii)) — no padding, URL-safe alphabet. */
async function sha256Base64Url(plain: string): Promise<string> {
  const data = new TextEncoder().encode(plain);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function GET(request: Request) {
  const clientId = process.env.X_OAUTH2_CLIENT_ID?.trim();
  if (!clientId) {
    return NextResponse.json(
      {
        ok: false,
        error: 'X_OAUTH2_CLIENT_ID not set in environment',
      },
      { status: 500 }
    );
  }

  const redirectUri = buildRedirectUri(request);

  // CSRF state — round-tripped via cookie.
  const state = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // PKCE — code_verifier stored in cookie; code_challenge sent to X.
  // 32 bytes → 43 base64url chars, well within the 43-128 char limit.
  const codeVerifier = randomUrlSafe(32);
  const codeChallenge = await sha256Base64Url(codeVerifier);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPES.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  const url = `${X_AUTHORIZE_URL}?${params.toString()}`;

  const res = NextResponse.redirect(url, 302);

  const cookieOpts = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/api/social-auth/x',
    maxAge: 600, // 10 minutes
  };

  // Two cookies: state for CSRF, pkce for the PKCE verifier.
  res.cookies.set('x_oauth_state', state, cookieOpts);
  res.cookies.set('x_oauth_pkce', codeVerifier, cookieOpts);

  return res;
}

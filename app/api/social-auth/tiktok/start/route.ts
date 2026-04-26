/**
 * TikTok OAuth start — `/api/social-auth/tiktok/start`.
 *
 * Generates the authorization URL with the right scopes for posting and
 * redirects the user to TikTok. After they authorize, TikTok redirects
 * to /api/social-auth/tiktok/callback?code=…&state=… which exchanges
 * the code for access + refresh tokens.
 *
 * Required env:
 *   TIKTOK_CLIENT_KEY     OAuth Client Key from developers.tiktok.com
 *   TIKTOK_CLIENT_SECRET  OAuth Client Secret (used in callback)
 *   TIKTOK_REDIRECT_URI   absolute callback URL (must match the app's
 *                         registered redirect URI exactly). Optional —
 *                         defaults to derived-from-request /callback.
 *
 * Scopes:
 *   user.info.basic     read username + display name
 *   video.publish       publish videos directly to user's profile
 *   video.upload        upload draft videos for user to review in app
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TIKTOK_AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const SCOPES = ['user.info.basic', 'video.publish', 'video.upload'] as const;

function buildRedirectUri(request: Request): string {
  const fromEnv = process.env.TIKTOK_REDIRECT_URI?.trim();
  if (fromEnv) return fromEnv;
  const origin = new URL(request.url).origin;
  return `${origin}/api/social-auth/tiktok/callback`;
}

export async function GET(request: Request) {
  const clientKey = process.env.TIKTOK_CLIENT_KEY?.trim();
  if (!clientKey) {
    return NextResponse.json(
      {
        ok: false,
        error: 'TIKTOK_CLIENT_KEY not set in environment',
      },
      { status: 500 }
    );
  }
  const redirectUri = buildRedirectUri(request);
  // CSRF state — TikTok requires it. We use a random hex string and
  // round-trip via cookie. Production would store in a session store;
  // for the hackathon a short-lived cookie keeps the surface minimal.
  const state = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const params = new URLSearchParams({
    client_key: clientKey,
    response_type: 'code',
    scope: SCOPES.join(','),
    redirect_uri: redirectUri,
    state,
  });
  const url = `${TIKTOK_AUTHORIZE_URL}?${params.toString()}`;

  const res = NextResponse.redirect(url, 302);
  // Short-lived (10 min) cookie so the callback can verify the round-trip.
  res.cookies.set('tiktok_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/social-auth/tiktok',
    maxAge: 600,
  });
  return res;
}

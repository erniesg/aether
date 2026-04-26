import { NextResponse } from 'next/server';
import { computeCrcResponse, verifySignature } from '@/lib/webhooks/x-verify';
import { recordInboundReply } from '@/lib/convex/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SIG_HEADER = 'x-twitter-webhooks-signature';

function getSecret(): string | null {
  return process.env.X_WEBHOOK_CONSUMER_SECRET ?? null;
}

function isDevMode(): boolean {
  const env = process.env.AETHER_ENV ?? process.env.NEXTJS_ENV ?? '';
  return env === 'development';
}

// ── CRC challenge (GET) ──────────────────────────────────────────────────────

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const crcToken = url.searchParams.get('crc_token');

  if (!crcToken) {
    return NextResponse.json({ ok: false, error: 'missing crc_token' }, { status: 400 });
  }

  const secret = getSecret();

  if (!secret) {
    if (isDevMode()) {
      console.warn('[x-webhook] DEV MODE: X_WEBHOOK_CONSUMER_SECRET not set — using placeholder HMAC');
      const placeholder = computeCrcResponse(crcToken, 'dev_placeholder_secret');
      return NextResponse.json({ response_token: placeholder });
    }
    console.error('[x-webhook] X_WEBHOOK_CONSUMER_SECRET is not configured');
    return NextResponse.json({ ok: false, error: 'webhook not configured' }, { status: 500 });
  }

  const responseToken = computeCrcResponse(crcToken, secret);
  return NextResponse.json({ response_token: responseToken });
}

// ── Event delivery (POST) ────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    console.error('[x-webhook] failed to read request body');
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const sigHeader = request.headers.get(SIG_HEADER);
  const secret = getSecret();

  if (!secret) {
    if (isDevMode()) {
      console.warn('[x-webhook] DEV MODE: skipping signature verification (no secret set)');
    } else {
      console.error('[x-webhook] X_WEBHOOK_CONSUMER_SECRET is not configured — rejecting');
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
  } else {
    if (!sigHeader || !verifySignature(rawBody, sigHeader, secret)) {
      console.warn('[x-webhook] signature verification failed');
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
  }

  try {
    await dispatchEvent(rawBody);
  } catch (err) {
    console.error('[x-webhook] dispatch error', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

interface TweetCreateEvent {
  id_str?: string;
  text?: string;
  user?: { screen_name?: string };
  in_reply_to_status_id_str?: string | null;
}

interface XEventPayload {
  tweet_create_events?: TweetCreateEvent[];
  [key: string]: unknown;
}

async function dispatchEvent(rawBody: string): Promise<void> {
  let payload: XEventPayload;
  try {
    payload = JSON.parse(rawBody) as XEventPayload;
  } catch {
    console.warn('[x-webhook] non-JSON body — ignoring event');
    return;
  }

  const replies = payload.tweet_create_events ?? [];

  for (const evt of replies) {
    if (!evt.in_reply_to_status_id_str) continue;

    const externalId = evt.id_str ?? '';
    const postExternalId = evt.in_reply_to_status_id_str;
    const replyText = evt.text ?? '';
    const replyAuthor = evt.user?.screen_name ?? '';

    console.info('[x-webhook] inbound reply', { externalId, postExternalId, replyAuthor });

    await recordInboundReply({ externalId, postExternalId, replyText, replyAuthor });
  }
}

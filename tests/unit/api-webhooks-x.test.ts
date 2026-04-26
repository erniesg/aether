import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';

// ── helpers ──────────────────────────────────────────────────────────────────

const SECRET = 'test_consumer_secret';

function hmacB64(data: string, key: string): string {
  return crypto.createHmac('sha256', key).update(data).digest('base64');
}

function makeXSignature(body: string, key: string): string {
  return `sha256=${hmacB64(body, key)}`;
}

function crcRequest(crcToken: string): Request {
  return new Request(`http://localhost/api/webhooks/x?crc_token=${crcToken}`, {
    method: 'GET',
  });
}

function eventRequest(body: string, sigHeader: string): Request {
  return new Request('http://localhost/api/webhooks/x', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-twitter-webhooks-signature': sigHeader,
    },
    body,
  });
}

// Minimal X DM create event payload shape from the spec.
function xEvent(tweetId = 'tweet_001', text = 'Hello!', authorId = 'user_42'): string {
  return JSON.stringify({
    direct_message_events: [
      {
        id: tweetId,
        message_create: {
          message_data: { text },
          sender_id: authorId,
        },
        // target tweet / post the reply references
        tweet_create_events: [{ id_str: tweetId }],
      },
    ],
    // Some event shapes also carry tweet_create_events at the top level
    for_user_id: 'owner_999',
  });
}

// A minimal tweet_create event (replies to a published post)
function replyEvent(
  replyId = 'tweet_reply_001',
  text = 'Great post!',
  authorHandle = 'fanuser',
  inReplyToId = 'tweet_published_999'
): string {
  return JSON.stringify({
    tweet_create_events: [
      {
        id_str: replyId,
        text,
        user: { screen_name: authorHandle },
        in_reply_to_status_id_str: inReplyToId,
      },
    ],
    for_user_id: 'owner_999',
  });
}

// ── env snapshot helpers ──────────────────────────────────────────────────────

const ENV_KEY = 'X_WEBHOOK_CONSUMER_SECRET';

let envSnapshot: string | undefined;

// ── tests ────────────────────────────────────────────────────────────────────

describe('GET /api/webhooks/x — CRC challenge', () => {
  beforeEach(() => {
    vi.resetModules();
    envSnapshot = process.env[ENV_KEY];
    process.env[ENV_KEY] = SECRET;
  });

  afterEach(() => {
    if (envSnapshot === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = envSnapshot;
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('responds 200 with response_token when crc_token is provided', async () => {
    const { GET } = await import('@/app/api/webhooks/x/route');
    const token = 'random_crc_token_xyz';
    const res = await GET(crcRequest(token));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty('response_token');
    expect(json.response_token).toMatch(/^sha256=/);
  });

  it('response_token is sha256= + base64(HMAC-SHA256(crc_token, secret))', async () => {
    const { GET } = await import('@/app/api/webhooks/x/route');
    const token = 'deterministic_token';
    const res = await GET(crcRequest(token));

    const json = await res.json();
    const expected = `sha256=${hmacB64(token, SECRET)}`;
    expect(json.response_token).toBe(expected);
  });

  it('responds 400 when crc_token query param is missing', async () => {
    const { GET } = await import('@/app/api/webhooks/x/route');
    const req = new Request('http://localhost/api/webhooks/x', { method: 'GET' });
    const res = await GET(req);

    expect(res.status).toBe(400);
  });

  it('in DEV MODE accepts request even when secret is missing (logs warning)', async () => {
    delete process.env[ENV_KEY];
    process.env.AETHER_ENV = 'development';
    const { GET } = await import('@/app/api/webhooks/x/route');

    const res = await GET(crcRequest('any_token'));
    // Dev mode: returns 200 with a placeholder response_token
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty('response_token');
  });
});

describe('POST /api/webhooks/x — event delivery', () => {
  beforeEach(() => {
    vi.resetModules();
    envSnapshot = process.env[ENV_KEY];
    process.env[ENV_KEY] = SECRET;
  });

  afterEach(() => {
    if (envSnapshot === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = envSnapshot;
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('rejects 401 when x-twitter-webhooks-signature header is missing', async () => {
    const { POST } = await import('@/app/api/webhooks/x/route');
    const req = new Request('http://localhost/api/webhooks/x', {
      method: 'POST',
      body: '{}',
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('rejects 401 when signature is wrong', async () => {
    const { POST } = await import('@/app/api/webhooks/x/route');
    const body = replyEvent();
    const badSig = makeXSignature(body, 'wrong_secret');
    const res = await POST(eventRequest(body, badSig));

    expect(res.status).toBe(401);
  });

  it('accepts 200 when signature is valid (tweet_create_events reply shape)', async () => {
    const { POST } = await import('@/app/api/webhooks/x/route');
    const body = replyEvent('r1', 'Nice!', 'fan', 'post_pub');
    const sig = makeXSignature(body, SECRET);
    const res = await POST(eventRequest(body, sig));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true });
  });

  it('accepts 200 and returns ok for unknown/unhandled event shapes', async () => {
    const { POST } = await import('@/app/api/webhooks/x/route');
    const body = JSON.stringify({ unknown_event: [{ id: '1' }] });
    const sig = makeXSignature(body, SECRET);
    const res = await POST(eventRequest(body, sig));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true });
  });

  it('does not expose stack traces on errors (500 is safe)', async () => {
    // Simulate a crash inside dispatch by sending a body that parses to null
    // (non-object). The route should catch and return 500 without a stack.
    const { POST } = await import('@/app/api/webhooks/x/route');
    // Valid sig but body is a raw string that won't survive JSON.parse for dispatch
    const body = 'not-json-at-all';
    const sig = makeXSignature(body, SECRET);
    const req = new Request('http://localhost/api/webhooks/x', {
      method: 'POST',
      headers: { 'x-twitter-webhooks-signature': sig },
      body,
    });
    const res = await POST(req);
    // Route should handle gracefully — either 200 (ignored parse fail) or 500 (caught)
    // but MUST NOT expose a stack trace in the body.
    const json = await res.json();
    expect(json).not.toHaveProperty('stack');
  });

  it('in DEV MODE (no secret) accepts and processes the event', async () => {
    delete process.env[ENV_KEY];
    process.env.AETHER_ENV = 'development';
    const { POST } = await import('@/app/api/webhooks/x/route');

    const body = replyEvent();
    // Sig doesn't matter in dev mode — pass a wrong one
    const res = await POST(eventRequest(body, 'sha256=bad'));

    expect(res.status).toBe(200);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

describe('/api/voice/session', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  it('mints an ephemeral client_secret and never surfaces the primary key', async () => {
    process.env.OPENAI_API_KEY = 'sk-primary-must-not-leak';
    process.env.VOICE_PROVIDER = 'openai-realtime';

    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toContain('/v1/realtime/sessions');
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer sk-primary-must-not-leak',
      });
      return new Response(
        JSON.stringify({
          id: 'sess_ephemeral',
          model: 'gpt-4o-realtime-preview',
          voice: 'alloy',
          client_secret: {
            value: 'ek_short_lived_abc',
            expires_at: Math.floor(Date.now() / 1000) + 60,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as unknown as typeof fetch;

    const { issueVoiceSession, POST } = await import('@/app/api/voice/session/route');
    const direct = await issueVoiceSession({ fetchImpl });
    expect(direct.clientSecret).toBe('ek_short_lived_abc');
    expect(direct.clientSecret).not.toContain('sk-primary');
    expect(direct.provider).toBe('openai-realtime');

    // The default POST handler uses the real fetch — swap it out and assert
    // the JSON body it sends to the client never contains the primary key.
    const realFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try {
      const response = await POST();
      const body = await response.text();
      expect(response.status).toBe(200);
      expect(body).not.toContain('sk-primary-must-not-leak');
      const json = JSON.parse(body);
      expect(json.ok).toBe(true);
      expect(json.session.clientSecret).toBe('ek_short_lived_abc');
      expect(json.session.provider).toBe('openai-realtime');
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('declares all five voice tools when minting a session', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}'));
      expect(body.tools).toHaveLength(5);
      expect(body.tools.map((t: { name: string }) => t.name)).toEqual([
        'focus_format',
        'pan_zoom',
        'remove_background',
        'run_capability',
        'run_generate',
      ]);
      return new Response(
        JSON.stringify({
          id: 'sess',
          client_secret: { value: 'ek', expires_at: Math.floor(Date.now() / 1000) + 60 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as unknown as typeof fetch;

    const { issueVoiceSession } = await import('@/app/api/voice/session/route');
    const session = await issueVoiceSession({ fetchImpl });
    expect(session.clientSecret).toBe('ek');
  });

  it('mints a Gemini Live auth token and never surfaces the primary Google key', async () => {
    process.env.GOOGLE_GEMINI_API_KEY = 'gk-primary-must-not-leak';
    process.env.VOICE_PROVIDER = 'gemini-live';
    process.env.GEMINI_LIVE_MODEL = 'gemini-live-2.5-flash-native-audio';
    process.env.GEMINI_LIVE_VOICE = 'Kore';

    const issueGeminiTokenImpl = vi.fn(async (params: {
      apiKey: string;
      model: string;
      voice: string;
    }) => {
      expect(params).toEqual({
        apiKey: 'gk-primary-must-not-leak',
        model: 'gemini-live-2.5-flash-native-audio',
        voice: 'Kore',
      });
      return {
        name: 'tokens/ephemeral_gemini_123',
        expireTime: new Date(Date.now() + 60_000).toISOString(),
      };
    });

    const { issueVoiceSession } = await import('@/app/api/voice/session/route');
    const session = await issueVoiceSession({ issueGeminiTokenImpl });

    expect(session).toEqual(
      expect.objectContaining({
        sessionId: 'tokens/ephemeral_gemini_123',
        clientSecret: 'tokens/ephemeral_gemini_123',
        model: 'gemini-live-2.5-flash-native-audio',
        voice: 'Kore',
        provider: 'gemini-live',
      })
    );
    expect(JSON.stringify(session)).not.toContain('gk-primary-must-not-leak');
  });

  it('returns 503 when OPENAI_API_KEY is missing', async () => {
    delete process.env.OPENAI_API_KEY;
    const { POST } = await import('@/app/api/voice/session/route');
    const response = await POST();
    expect(response.status).toBe(503);
    const json = await response.json();
    expect(json.ok).toBe(false);
    expect(json.error).toMatch(/OPENAI_API_KEY/);
  });

  it('returns 503 when GOOGLE_GEMINI_API_KEY is missing', async () => {
    process.env.VOICE_PROVIDER = 'gemini-live';
    delete process.env.GOOGLE_GEMINI_API_KEY;
    const { POST } = await import('@/app/api/voice/session/route');
    const response = await POST();
    expect(response.status).toBe(503);
    const json = await response.json();
    expect(json.ok).toBe(false);
    expect(json.error).toMatch(/GOOGLE_GEMINI_API_KEY/);
  });

  it('returns 502 when OpenAI rejects the session request', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    const fetchImpl = vi.fn(async () => new Response('rate limited', { status: 429 })) as unknown as typeof fetch;
    const { issueVoiceSession } = await import('@/app/api/voice/session/route');
    await expect(issueVoiceSession({ fetchImpl })).rejects.toThrow(/429/);
  });

  it('GET reports configuration state without exposing secrets', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    const { GET } = await import('@/app/api/voice/session/route');
    const response = await GET();
    const json = await response.json();
    expect(json).toEqual(
      expect.objectContaining({
        ok: true,
        provider: 'openai-realtime',
        configured: true,
      })
    );
    expect(JSON.stringify(json)).not.toContain('sk-test');
  });

  it('GET reports Gemini Live defaults and configuration state without exposing secrets', async () => {
    process.env.VOICE_PROVIDER = 'gemini-live';
    process.env.GOOGLE_GEMINI_API_KEY = 'gk-test';
    process.env.GEMINI_LIVE_MODEL = 'gemini-live-2.5-flash-native-audio';
    process.env.GEMINI_LIVE_VOICE = 'Kore';
    const { GET } = await import('@/app/api/voice/session/route');
    const response = await GET();
    const json = await response.json();
    expect(json).toEqual(
      expect.objectContaining({
        ok: true,
        provider: 'gemini-live',
        model: 'gemini-live-2.5-flash-native-audio',
        voice: 'Kore',
        configured: true,
      })
    );
    expect(JSON.stringify(json)).not.toContain('gk-test');
  });
});

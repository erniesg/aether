import { beforeEach, describe, expect, it } from 'vitest';
import { createEventRecap, refreshEventRecap } from '@/lib/research/event-recap/pipeline';
import { __resetEventRunEventsMemory } from '@/lib/research/event-recap/run-events';

async function seedMockEvent(eventId: string): Promise<void> {
  await createEventRecap({ eventId, name: 'Auth Probe Event', liveMode: 'mock' });
  await refreshEventRecap({ eventId, name: 'Auth Probe Event', liveMode: 'mock' });
}

describe('/api/events/:eventId', () => {
  beforeEach(() => {
    __resetEventRunEventsMemory();
  });

  it('rejects requests without a Vibes API key or Logto token', async () => {
    const { GET } = await import('@/app/api/events/[eventId]/route');
    const res = await GET(new Request('http://localhost/api/events/evt'), {
      params: Promise.resolve({ eventId: 'evt' }),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false });
  });

  it('returns the bundle for an authorized request and hides raw provider payloads', async () => {
    await withDailyLimit('50', async () => {
      await seedMockEvent('events-hide-raw');
      const { GET } = await import('@/app/api/events/[eventId]/route');
      const res = await GET(
        new Request('http://localhost/api/events/events-hide-raw', {
          headers: { 'x-vibes-dev-user': 'events-reader' },
        }),
        { params: Promise.resolve({ eventId: 'events-hide-raw' }) }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.bundle.posts.length).toBeGreaterThan(0);
      expect(json.bundle.runs.length).toBeGreaterThan(0);
      expect(json.bundle.runEvents.length).toBeGreaterThan(0);

      // non-debug: scrape payloads, run inputs, and streaming URLs are stripped
      for (const post of json.bundle.posts) {
        expect(post.raw).toMatchObject({ redacted: true });
      }
      for (const run of json.bundle.runs) {
        expect(run.inputs).toMatchObject({ redacted: true });
        expect(run.streamingUrls).toEqual([]);
      }
    });
  });

  it('exposes raw run and provider detail when ?debug=1', async () => {
    await withDailyLimit('50', async () => {
      await seedMockEvent('events-debug');
      const { GET } = await import('@/app/api/events/[eventId]/route');
      const res = await GET(
        new Request('http://localhost/api/events/events-debug?debug=1', {
          headers: { 'x-vibes-dev-user': 'events-reader-debug' },
        }),
        { params: Promise.resolve({ eventId: 'events-debug' }) }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.bundle.posts[0].raw).not.toMatchObject({ redacted: true });
      expect(json.bundle.runs[0].inputs).not.toMatchObject({ redacted: true });
      expect(json.bundle.runs[0].streamingUrls.length).toBeGreaterThan(0);
    });
  });
});

describe('/api/events/:eventId/raw source pack', () => {
  it('rejects source-pack downloads without auth', async () => {
    const { GET } = await import('@/app/api/events/[eventId]/raw/route');
    const res = await GET(
      new Request('http://localhost/api/events/evt/raw?format=json&download=1'),
      { params: Promise.resolve({ eventId: 'evt' }) }
    );
    expect(res.status).toBe(401);
  });

  it('serves the source pack for an authorized request', async () => {
    await withDailyLimit('50', async () => {
      await seedMockEvent('events-source-pack');
      const { GET } = await import('@/app/api/events/[eventId]/raw/route');
      const res = await GET(
        new Request('http://localhost/api/events/events-source-pack/raw?format=json&download=1', {
          headers: { 'x-vibes-dev-user': 'source-pack-reader' },
        }),
        { params: Promise.resolve({ eventId: 'events-source-pack' }) }
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/json');
    });
  });
});

async function withDailyLimit<T>(
  value: string | undefined,
  fn: () => Promise<T>
): Promise<T> {
  const previous = process.env.VIBES_DAILY_CALL_LIMIT;
  if (value === undefined) delete process.env.VIBES_DAILY_CALL_LIMIT;
  else process.env.VIBES_DAILY_CALL_LIMIT = value;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.VIBES_DAILY_CALL_LIMIT;
    else process.env.VIBES_DAILY_CALL_LIMIT = previous;
  }
}

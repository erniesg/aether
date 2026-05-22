import { describe, expect, it } from 'vitest';
import { __resetEventRunEventsMemory } from '@/lib/research/event-recap/run-events';

describe('/api/vibes mock run', () => {
  it('returns a plan and a sanitized artifact bundle from a mock collection', async () => {
    __resetEventRunEventsMemory();
    const res = await withDailyLimit('5', async () => {
      const { POST } = await import('@/app/api/vibes/route');
      return POST(
        new Request('http://localhost/api/vibes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-vibes-dev-user': 'vibes-mock-runner' },
          body: JSON.stringify({
            brief: 'Track the Aurora keyboard launch across X, LinkedIn, and YouTube.',
            liveMode: 'mock',
          }),
        })
      );
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.plan?.subject).toBeTruthy();
    expect(json.reportUrl).toMatch(/^\/events\//);

    expect(json.bundle.posts.length).toBeGreaterThan(0);
    expect(json.bundle.runs.length).toBeGreaterThan(0);
    expect(json.bundle.runEvents.length).toBeGreaterThan(0);
    expect(Array.isArray(json.bundle.themes)).toBe(true);
    expect(Array.isArray(json.bundle.voices)).toBe(true);
    expect(json.bundle.runEvents.some((event: { tag: string }) => event.tag === 'run.done')).toBe(
      true
    );

    // non-debug: raw provider payloads are hidden from the primary response
    expect(json.bundle.posts[0].raw).toMatchObject({ redacted: true });
    expect(json.bundle.runs[0].inputs).toMatchObject({ redacted: true });
  });

  it('exposes raw provider payloads when debug is requested', async () => {
    __resetEventRunEventsMemory();
    const res = await withDailyLimit('5', async () => {
      const { POST } = await import('@/app/api/vibes/route');
      return POST(
        new Request('http://localhost/api/vibes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-vibes-dev-user': 'vibes-mock-debug' },
          body: JSON.stringify({
            brief: 'Track the Lumen speaker launch.',
            liveMode: 'mock',
            debug: true,
          }),
        })
      );
    });

    const json = await res.json();
    expect(json.bundle.posts[0].raw).not.toMatchObject({ redacted: true });
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

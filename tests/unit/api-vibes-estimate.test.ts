import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  estimateEventCounts: vi.fn(),
}));

vi.mock('@/lib/research/event-recap/counts', () => ({
  estimateEventCounts: mocks.estimateEventCounts,
}));

describe('/api/vibes/estimate', () => {
  afterEach(() => {
    vi.resetModules();
    mocks.estimateEventCounts.mockReset();
  });

  it('returns 400 when brief is missing', async () => {
    const { POST } = await import('@/app/api/vibes/estimate/route');
    const res = await POST(
      new Request('http://localhost/api/vibes/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: 'brief is required' });
  });

  it('returns 401 with code missing_auth when no auth header is provided', async () => {
    const { POST } = await import('@/app/api/vibes/estimate/route');
    const res = await POST(
      new Request('http://localhost/api/vibes/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief: 'Track AI Engineer Summit Singapore' }),
      })
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false, code: 'missing_auth' });
  });

  it('returns 200 with plan and counts for an authenticated request', async () => {
    mocks.estimateEventCounts.mockResolvedValueOnce({
      eventName: 'AI Engineer Summit Singapore',
      querySet: ['AI Engineer Summit Singapore'],
      windowStart: new Date(Date.now() - 86400000).toISOString(),
      windowEnd: new Date().toISOString(),
      estimates: [{ platform: 'x', totalLowerBound: 42, status: 'completed' }],
      warnings: [],
    });

    const res = await withDailyLimit('5', async () => {
      const { POST } = await import('@/app/api/vibes/estimate/route');
      return POST(
        new Request('http://localhost/api/vibes/estimate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-vibes-dev-user': 'user-vibes-estimate',
          },
          body: JSON.stringify({
            brief: 'Track AI Engineer Summit Singapore across X and LinkedIn. Add @aiDotEngineer, #AIE2026.',
            platforms: ['x', 'linkedin'],
          }),
        })
      );
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.plan).toBeDefined();
    expect(typeof json.plan.subject).toBe('string');
    expect(json.counts).toBeDefined();

    expect(mocks.estimateEventCounts).toHaveBeenCalledWith(
      expect.objectContaining({
        querySet: expect.arrayContaining([expect.any(String)]),
        platforms: expect.arrayContaining(['x', 'linkedin']),
      })
    );
  });

  it('anchors the estimate window to explicit windowStart/windowEnd for past events', async () => {
    mocks.estimateEventCounts.mockResolvedValueOnce({
      eventName: 'AI Engineer World’s Fair 2025',
      querySet: ['AI Engineer World’s Fair'],
      windowStart: '2025-06-02T00:00:00.000Z',
      windowEnd: '2025-06-08T00:00:00.000Z',
      estimates: [],
      warnings: [],
    });

    const res = await withDailyLimit('5', async () => {
      const { POST } = await import('@/app/api/vibes/estimate/route');
      return POST(
        new Request('http://localhost/api/vibes/estimate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-vibes-dev-user': 'user-vibes-estimate-past',
          },
          body: JSON.stringify({
            brief: 'Recap AI Engineer World’s Fair 2025 across X and LinkedIn.',
            platforms: ['x', 'linkedin'],
            windowStart: '2025-06-02T00:00:00.000Z',
            windowEnd: '2025-06-08T00:00:00.000Z',
          }),
        })
      );
    });

    expect(res.status).toBe(200);
    expect(mocks.estimateEventCounts).toHaveBeenCalledWith(
      expect.objectContaining({
        windowStart: '2025-06-02T00:00:00.000Z',
        windowEnd: '2025-06-08T00:00:00.000Z',
      })
    );
  });

  it('clamps an explicit windowEnd in the future back to now', async () => {
    mocks.estimateEventCounts.mockResolvedValueOnce({ estimates: [], warnings: [] });

    const res = await withDailyLimit('5', async () => {
      const { POST } = await import('@/app/api/vibes/estimate/route');
      return POST(
        new Request('http://localhost/api/vibes/estimate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-vibes-dev-user': 'user-vibes-estimate-clamp',
          },
          body: JSON.stringify({
            brief: 'Track an upcoming event.',
            windowStart: '2020-01-01T00:00:00.000Z',
            windowEnd: '2999-01-01T00:00:00.000Z',
          }),
        })
      );
    });

    expect(res.status).toBe(200);
    const call = mocks.estimateEventCounts.mock.calls.at(-1)![0] as {
      windowEnd: string;
    };
    expect(Date.parse(call.windowEnd)).toBeLessThanOrEqual(Date.now());
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

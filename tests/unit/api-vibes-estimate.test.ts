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

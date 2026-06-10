import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createEventRecap: vi.fn(),
  refreshEventRecap: vi.fn(),
}));

vi.mock('@/lib/research/event-recap/pipeline', () => ({
  createEventRecap: mocks.createEventRecap,
  refreshEventRecap: mocks.refreshEventRecap,
}));

describe('/api/vibes', () => {
  afterEach(() => {
    vi.resetModules();
    mocks.createEventRecap.mockReset();
    mocks.refreshEventRecap.mockReset();
  });

  it('creates an auditable report from a natural-language brief and reviewed terms', async () => {
    mocks.createEventRecap.mockResolvedValueOnce({
      eventId: 'nothing-phone-launch',
      name: 'Nothing Phone launch',
      status: 'draft',
      querySet: [],
      sourceUrls: [],
      usedCredits: 0,
      daysBefore: 30,
      daysAfter: 0,
      refreshIntervalHours: 6,
      maxItemsPerPlatform: 25,
      monthlyCreditBudget: 50,
      liveMode: 'mock',
      createdAt: 1,
      updatedAt: 1,
    });
    mocks.refreshEventRecap.mockResolvedValueOnce({
      event: {
        eventId: 'nothing-phone-launch',
        name: 'Nothing Phone launch',
        status: 'ready',
        querySet: ['#LaunchDay "Nothing Phone launch"'],
        sourceUrls: ['https://nothing.tech/'],
      },
      runs: [],
      posts: [],
      themes: [],
      voices: [],
    });

    const res = await withDailyLimit('1', async () => {
      const { POST } = await import('@/app/api/vibes/route');
      return await POST(
        new Request('http://localhost/api/vibes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-vibes-dev-user': 'user-vibes-report' },
          body: JSON.stringify({
            brief:
              'Social listening for Nothing Phone launch with #LaunchDay, @nothing, and https://nothing.tech/',
            hashtags: ['#LaunchDay'],
            accounts: ['@nothing'],
            sourceLinks: ['https://nothing.tech/'],
            refresh: true,
          }),
        })
      );
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.reportUrl).toBe('/events/nothing-phone-launch');
    expect(mocks.createEventRecap).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'nothing-phone-launch',
        initialQuerySet: expect.arrayContaining(['#LaunchDay "Nothing Phone launch"']),
        sourceUrls: ['https://nothing.tech/'],
      })
    );
    expect(mocks.refreshEventRecap).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'nothing-phone-launch',
        extraQuerySet: expect.arrayContaining(['@nothing "Nothing Phone launch"']),
        sourceUrls: ['https://nothing.tech/'],
      })
    );
  });

  it('passes explicit past event dates through to create and refresh', async () => {
    mocks.createEventRecap.mockResolvedValueOnce({
      eventId: 'aie-worlds-fair-2025',
      name: "AIE World's Fair 2025",
      status: 'draft',
      startsAt: '2025-06-03',
      endsAt: '2025-06-05',
      querySet: [],
      sourceUrls: [],
      usedCredits: 0,
      daysBefore: 7,
      daysAfter: 14,
      refreshIntervalHours: 6,
      maxItemsPerPlatform: 25,
      monthlyCreditBudget: 50,
      liveMode: 'mock',
      createdAt: 1,
      updatedAt: 1,
    });
    mocks.refreshEventRecap.mockResolvedValueOnce({
      event: {
        eventId: 'aie-worlds-fair-2025',
        name: "AIE World's Fair 2025",
        status: 'ready',
        startsAt: '2025-06-03',
        endsAt: '2025-06-05',
        querySet: [],
        sourceUrls: [],
      },
      runs: [{ windowStart: '2025-05-27T00:00:00.000Z', windowEnd: '2025-06-19T00:00:00.000Z' }],
      posts: [],
      themes: [],
      voices: [],
    });

    const res = await withDailyLimit('1', async () => {
      const { POST } = await import('@/app/api/vibes/route');
      return await POST(
        new Request('http://localhost/api/vibes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-vibes-dev-user': 'user-vibes-past' },
          body: JSON.stringify({
            brief: "Track AIE World's Fair 2025",
            subject: "AIE World's Fair 2025",
            subjectKind: 'event',
            startsAt: '2025-06-03',
            endsAt: '2025-06-05',
            daysBefore: 7,
            daysAfter: 14,
            liveMode: 'mock',
          }),
        })
      );
    });

    expect(res.status).toBe(200);
    expect(mocks.createEventRecap).toHaveBeenCalledWith(
      expect.objectContaining({
        startsAt: '2025-06-03',
        endsAt: '2025-06-05',
        daysBefore: 7,
        daysAfter: 14,
      })
    );
    expect(mocks.refreshEventRecap).toHaveBeenCalledWith(
      expect.objectContaining({
        startsAt: '2025-06-03',
        endsAt: '2025-06-05',
        daysBefore: 7,
        daysAfter: 14,
      })
    );
  });

  it('returns 400 when the brief is missing', async () => {
    const { POST } = await import('@/app/api/vibes/route');
    const res = await POST(
      new Request('http://localhost/api/vibes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false });
  });

  it('requires Logto or Vibes API-key auth before planning', async () => {
    const { POST } = await import('@/app/api/vibes/plan/route');
    const res = await POST(
      new Request('http://localhost/api/vibes/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief: 'Track a product launch' }),
      })
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false, code: 'missing_auth' });
  });

  it('defaults signed-in users to zero free Vibes calls', async () => {
    const { POST } = await import('@/app/api/vibes/plan/route');
    const res = await withDailyLimit(undefined, () =>
      POST(
        new Request('http://localhost/api/vibes/plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-vibes-dev-user': 'user-vibes-zero-free' },
          body: JSON.stringify({ brief: 'Track a product launch' }),
        })
      )
    );

    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ ok: false, code: 'quota_exceeded' });
  });

  it('enforces the per-user daily Vibes quota', async () => {
    await withDailyLimit('1', async () => {
      const { POST } = await import('@/app/api/vibes/plan/route');
      const request = () =>
        POST(
          new Request('http://localhost/api/vibes/plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-vibes-dev-user': 'user-vibes-quota' },
            body: JSON.stringify({ brief: 'Track a new soda brand' }),
          })
        );

      expect((await request()).status).toBe(200);
      const limited = await request();
      expect(limited.status).toBe(429);
      expect(await limited.json()).toMatchObject({ ok: false, code: 'quota_exceeded' });
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

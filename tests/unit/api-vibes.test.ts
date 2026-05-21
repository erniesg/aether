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

    const { POST } = await import('@/app/api/vibes/route');
    const res = await POST(
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

  it('enforces the per-user daily Vibes quota', async () => {
    const previous = process.env.VIBES_DAILY_CALL_LIMIT;
    process.env.VIBES_DAILY_CALL_LIMIT = '1';
    try {
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
    } finally {
      if (previous === undefined) delete process.env.VIBES_DAILY_CALL_LIMIT;
      else process.env.VIBES_DAILY_CALL_LIMIT = previous;
    }
  });
});

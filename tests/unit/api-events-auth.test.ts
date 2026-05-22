import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createEventRecap: vi.fn(),
  refreshEventRecap: vi.fn(),
  warmLinkedInSessionViaTinyFish: vi.fn(),
}));

vi.mock('@/lib/research/event-recap/pipeline', () => ({
  createEventRecap: mocks.createEventRecap,
  refreshEventRecap: mocks.refreshEventRecap,
}));

vi.mock('@/lib/research/event-recap/tinyfish', () => ({
  warmLinkedInSessionViaTinyFish: mocks.warmLinkedInSessionViaTinyFish,
}));

describe('/api/events auth gate', () => {
  afterEach(() => {
    vi.resetModules();
    mocks.createEventRecap.mockReset();
    mocks.refreshEventRecap.mockReset();
    mocks.warmLinkedInSessionViaTinyFish.mockReset();
  });

  it('requires auth before creating an event recap', async () => {
    const { POST } = await import('@/app/api/events/route');
    const res = await POST(
      new Request('http://localhost/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'AI Engineer Summit Singapore', liveMode: 'tinyfish' }),
      })
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false, code: 'missing_auth' });
    expect(mocks.createEventRecap).not.toHaveBeenCalled();
    expect(mocks.refreshEventRecap).not.toHaveBeenCalled();
  });

  it('allows zero free event recap calls after login by default', async () => {
    const { POST } = await import('@/app/api/events/route');
    const res = await withDailyLimit(undefined, () =>
      POST(
        new Request('http://localhost/api/events', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-vibes-dev-user': 'user-events-zero-free',
          },
          body: JSON.stringify({ name: 'AI Engineer Summit Singapore', liveMode: 'tinyfish' }),
        })
      )
    );

    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ ok: false, code: 'quota_exceeded' });
    expect(mocks.createEventRecap).not.toHaveBeenCalled();
    expect(mocks.refreshEventRecap).not.toHaveBeenCalled();
  });

  it('runs TinyFish only when authenticated quota is configured', async () => {
    mocks.createEventRecap.mockResolvedValueOnce({
      eventId: 'ai-engineer-summit-singapore',
      name: 'AI Engineer Summit Singapore',
      status: 'draft',
      querySet: [],
      sourceUrls: [],
      usedCredits: 0,
      daysBefore: 1,
      daysAfter: 3,
      refreshIntervalHours: 6,
      maxItemsPerPlatform: 25,
      monthlyCreditBudget: 50,
      liveMode: 'tinyfish',
      createdAt: 1,
      updatedAt: 1,
    });

    const { POST } = await import('@/app/api/events/route');
    const res = await withDailyLimit('1', () =>
      POST(
        new Request('http://localhost/api/events', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-vibes-dev-user': 'user-events-paid-quota',
          },
          body: JSON.stringify({
            name: 'AI Engineer Summit Singapore',
            liveMode: 'tinyfish',
            refresh: false,
          }),
        })
      )
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(mocks.createEventRecap).toHaveBeenCalledWith(
      expect.objectContaining({ liveMode: 'tinyfish' })
    );
    expect(mocks.refreshEventRecap).not.toHaveBeenCalled();
  });

  it('requires auth before warming a LinkedIn TinyFish session', async () => {
    const { POST } = await import('@/app/api/events/linkedin-session/route');
    const res = await POST(
      new Request('http://localhost/api/events/linkedin-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false, code: 'missing_auth' });
    expect(mocks.warmLinkedInSessionViaTinyFish).not.toHaveBeenCalled();
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

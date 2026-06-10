import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EventRecapRecord } from '@/lib/research/event-recap/types';
import { selectDueRefreshEvents } from '@/lib/research/event-recap/refresh-due';

const mocks = vi.hoisted(() => ({
  listEventRecaps: vi.fn(),
  refreshEventRecap: vi.fn(),
}));

vi.mock('@/lib/research/event-recap/store', () => ({
  listEventRecaps: mocks.listEventRecaps,
}));

vi.mock('@/lib/research/event-recap/pipeline', () => ({
  refreshEventRecap: mocks.refreshEventRecap,
}));

describe('POST /api/events/refresh-due', () => {
  afterEach(() => {
    vi.resetModules();
    mocks.listEventRecaps.mockReset();
    mocks.refreshEventRecap.mockReset();
    delete process.env.CRON_REFRESH_SECRET;
  });

  it('selects due events and reports budget skips', () => {
    const now = Date.parse('2026-06-10T18:00:00.000Z');
    const due = eventFixture('due-event', {
      nextRefreshAt: now - 1,
      usedCredits: 2,
      monthlyCreditBudget: 10,
    });
    const future = eventFixture('future-event', {
      nextRefreshAt: now + 60_000,
      usedCredits: 2,
      monthlyCreditBudget: 10,
    });
    const budget = eventFixture('budget-event', {
      nextRefreshAt: now - 1,
      usedCredits: 10,
      monthlyCreditBudget: 10,
    });

    expect(selectDueRefreshEvents([due, future, budget], now)).toEqual([
      { event: due, skipped: undefined },
      { event: budget, skipped: 'budget' },
    ]);
  });

  it('rejects requests without the cron secret', async () => {
    process.env.CRON_REFRESH_SECRET = crypto.randomUUID();
    const { POST } = await import('@/app/api/events/refresh-due/route');

    const res = await POST(new Request('http://localhost/api/events/refresh-due', { method: 'POST' }));

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false, error: 'unauthorized' });
    expect(mocks.listEventRecaps).not.toHaveBeenCalled();
    expect(mocks.refreshEventRecap).not.toHaveBeenCalled();
  });

  it('refreshes due events and excludes future events', async () => {
    const now = Date.parse('2026-06-10T18:00:00.000Z');
    const cronSecret = crypto.randomUUID();
    process.env.CRON_REFRESH_SECRET = cronSecret;
    vi.setSystemTime(now);
    mocks.listEventRecaps.mockResolvedValueOnce([
      eventFixture('due-event', { nextRefreshAt: now - 1 }),
      eventFixture('future-event', { nextRefreshAt: now + 60_000 }),
    ]);
    mocks.refreshEventRecap.mockResolvedValueOnce({
      runs: [{ runId: 'run_due_1' }],
    });
    const { POST } = await import('@/app/api/events/refresh-due/route');

    const res = await POST(
      new Request('http://localhost/api/events/refresh-due', {
        method: 'POST',
        headers: { authorization: `Bearer ${cronSecret}` },
      })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ eventId: 'due-event', runId: 'run_due_1' }]);
    expect(mocks.refreshEventRecap).toHaveBeenCalledTimes(1);
    expect(mocks.refreshEventRecap).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'due-event', liveMode: 'mock' })
    );
  });

  it('does not create a scrape run for over-budget due events', async () => {
    const now = Date.parse('2026-06-10T18:00:00.000Z');
    const cronSecret = crypto.randomUUID();
    process.env.CRON_REFRESH_SECRET = cronSecret;
    vi.setSystemTime(now);
    mocks.listEventRecaps.mockResolvedValueOnce([
      eventFixture('budget-event', {
        nextRefreshAt: now - 1,
        usedCredits: 50,
        monthlyCreditBudget: 50,
      }),
    ]);
    const { POST } = await import('@/app/api/events/refresh-due/route');

    const res = await POST(
      new Request('http://localhost/api/events/refresh-due', {
        method: 'POST',
        headers: { authorization: `Bearer ${cronSecret}` },
      })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ eventId: 'budget-event', skipped: 'budget' }]);
    expect(mocks.refreshEventRecap).not.toHaveBeenCalled();
  });
});

function eventFixture(
  eventId: string,
  overrides: Partial<EventRecapRecord> = {}
): EventRecapRecord {
  return {
    eventId,
    name: eventId,
    contextHint: 'mock event',
    status: 'ready',
    daysBefore: 1,
    daysAfter: 3,
    refreshIntervalHours: 6,
    maxItemsPerPlatform: 10,
    monthlyCreditBudget: 50,
    liveMode: 'mock',
    usedCredits: 0,
    querySet: ['aether event'],
    sourceUrls: [],
    lastRunAt: Date.parse('2026-06-10T12:00:00.000Z'),
    nextRefreshAt: Date.parse('2026-06-10T17:00:00.000Z'),
    createdAt: Date.parse('2026-06-09T12:00:00.000Z'),
    updatedAt: Date.parse('2026-06-10T12:00:00.000Z'),
    ...overrides,
  };
}

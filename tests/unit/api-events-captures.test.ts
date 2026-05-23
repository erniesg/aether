/**
 * Tests for POST /api/events/captures
 *
 * Covers:
 *  1. Auth guard — 401 without x-vibes-dev-user
 *  2. Happy path — engine called with caller's runId, returns {ok,run}
 *  3. Run-event timeline — capture.start and capture.done are logged
 *  4. Bundle type — captureRun field exists on EventRecapBundle
 *  5. Sanitizer — non-debug strips screenshotPath; debug retains it
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventPostCaptureRun } from '@/lib/research/event-recap/post-capture';
import {
  __resetEventRunEventsMemory,
  listEventRunEvents,
} from '@/lib/research/event-recap/run-events';
import { toPublicEventBundle } from '@/lib/research/event-recap/public-bundle';
import type { EventRecapBundle } from '@/lib/research/event-recap/types';

// ---------------------------------------------------------------------------
// Canned capture run fixture
// ---------------------------------------------------------------------------

const CANNED_RUN: EventPostCaptureRun = {
  eventId: 'captures-test-event',
  runId: 'scrape_runX',
  provider: 'local-playwright',
  targetCount: 3,
  capturedCount: 2,
  resumedCount: 0,
  pageCapturedCount: 0,
  blockedCount: 1,
  failedCount: 0,
  outputDir: '/abs/outputs/event-recap-captures-test-event/captures/scrape_runX',
  manifestPath:
    '/abs/outputs/event-recap-captures-test-event/captures/scrape_runX/manifest.json',
  startedAt: 1_700_000_000_000,
  finishedAt: 1_700_000_010_000,
  captures: [
    {
      eventId: 'captures-test-event',
      runId: 'scrape_runX',
      provider: 'local-playwright',
      status: 'captured',
      platform: 'x',
      url: 'https://x.com/user/status/1',
      capturedAt: 1_700_000_001_000,
      screenshotPath: '/abs/outputs/event-recap-captures-test-event/captures/scrape_runX/x-user-abc123.png',
      screenshotRelPath: 'outputs/event-recap-captures-test-event/captures/scrape_runX/x-user-abc123.png',
      screenshotBytes: 12345,
      screenshotSha256: 'deadbeef',
      viewport: { width: 1280, height: 1600 },
      warnings: [],
    },
    {
      eventId: 'captures-test-event',
      runId: 'scrape_runX',
      provider: 'local-playwright',
      status: 'captured',
      platform: 'linkedin',
      url: 'https://linkedin.com/posts/activity-1',
      capturedAt: 1_700_000_002_000,
      screenshotPath: '/abs/outputs/event-recap-captures-test-event/captures/scrape_runX/linkedin-user-def456.png',
      screenshotRelPath: 'outputs/event-recap-captures-test-event/captures/scrape_runX/linkedin-user-def456.png',
      screenshotBytes: 23456,
      screenshotSha256: 'cafebabe',
      viewport: { width: 1280, height: 1600 },
      warnings: [],
    },
    {
      eventId: 'captures-test-event',
      runId: 'scrape_runX',
      provider: 'local-playwright',
      status: 'blocked',
      platform: 'x',
      url: 'https://x.com/user/status/2',
      capturedAt: 1_700_000_003_000,
      blockedReason: 'x render failed or rate limited',
      viewport: { width: 1280, height: 1600 },
      warnings: [],
    },
  ],
};

// ---------------------------------------------------------------------------
// Mock the capture engine — must be hoisted so vi.mock() works
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  captureEventPostScreenshots: vi.fn<() => Promise<EventPostCaptureRun>>(),
}));

vi.mock('@/lib/research/event-recap/post-capture', () => ({
  captureEventPostScreenshots: mocks.captureEventPostScreenshots,
  selectCaptureTargets: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function withDailyLimit<T>(value: string | undefined, fn: () => Promise<T>): Promise<T> {
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

async function seedMockEvent(eventId: string): Promise<void> {
  const { createEventRecap, refreshEventRecap } = await import(
    '@/lib/research/event-recap/pipeline'
  );
  await createEventRecap({ eventId, name: 'Captures Test Event', liveMode: 'mock' });
  await refreshEventRecap({ eventId, name: 'Captures Test Event', liveMode: 'mock' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/events/captures', () => {
  beforeEach(() => {
    __resetEventRunEventsMemory();
    mocks.captureEventPostScreenshots.mockReset();
    vi.resetModules();
  });

  // 1. Auth guard
  it('returns 401 without x-vibes-dev-user header', async () => {
    const { POST } = await import('@/app/api/events/captures/route');
    const res = await POST(
      new Request('http://localhost/api/events/captures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: 'captures-auth-probe', all: true }),
      })
    );
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  // 2. Happy path — engine receives caller's runId, returns {ok, run}
  it('calls captureEventPostScreenshots with scrape runId and returns the run', async () => {
    mocks.captureEventPostScreenshots.mockResolvedValueOnce({
      ...CANNED_RUN,
      eventId: 'captures-happy',
    });

    await withDailyLimit('50', async () => {
      await seedMockEvent('captures-happy');
      const { POST } = await import('@/app/api/events/captures/route');
      const res = await POST(
        new Request('http://localhost/api/events/captures', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-vibes-dev-user': 'captures-tester',
          },
          body: JSON.stringify({
            eventId: 'captures-happy',
            all: true,
            runId: 'scrape_runX',
            perPlatform: 25,
            resume: true,
          }),
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.run).toBeDefined();

      // Engine was called with the caller's runId
      expect(mocks.captureEventPostScreenshots).toHaveBeenCalledOnce();
      expect(mocks.captureEventPostScreenshots).toHaveBeenCalledWith(
        expect.objectContaining({
          runId: 'scrape_runX',
          eventId: 'captures-happy',
          all: true,
          perPlatform: 25,
          resume: true,
          onProgress: expect.any(Function),
        })
      );
    });
  });

  // 3. Run-event timeline — capture.start and capture.done logged
  it('logs capture.start and capture.done run events for the given runId', async () => {
    const eventId = 'captures-run-events';
    mocks.captureEventPostScreenshots.mockResolvedValueOnce({
      ...CANNED_RUN,
      eventId,
    });

    await withDailyLimit('50', async () => {
      await seedMockEvent(eventId);
      const { POST } = await import('@/app/api/events/captures/route');
      await POST(
        new Request('http://localhost/api/events/captures', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-vibes-dev-user': 'captures-tester',
          },
          body: JSON.stringify({
            eventId,
            all: true,
            runId: 'scrape_runX',
          }),
        })
      );
    });

    // listEventRunEvents is async but in-memory — the log already happened
    const events = await listEventRunEvents(eventId);
    const tags = events.map((e) => e.tag);

    expect(tags).toContain('capture.start');
    expect(tags).toContain('capture.done');

    const startEvent = events.find((e) => e.tag === 'capture.start');
    expect(startEvent?.runId).toBe('scrape_runX');
    expect(startEvent?.data?.source).toBe('captures-route');

    const doneEvent = events.find((e) => e.tag === 'capture.done');
    expect(doneEvent?.runId).toBe('scrape_runX');
    expect(doneEvent?.data?.targetCount).toBe(3);
    expect(doneEvent?.data?.capturedCount).toBe(2);
  });

  // 4. Bundle type — captureRun field is declared on EventRecapBundle
  it('EventRecapBundle type accepts captureRun field', () => {
    // Compile-time check: constructing a bundle with captureRun must not error.
    const bundle: EventRecapBundle = {
      event: {} as EventRecapBundle['event'],
      runs: [],
      posts: [],
      themes: [],
      voices: [],
      captureRun: CANNED_RUN,
    };
    // Runtime check: field is reachable
    expect('captureRun' in bundle).toBe(true);
    expect(bundle.captureRun?.runId).toBe('scrape_runX');
  });
});

// ---------------------------------------------------------------------------
// Sanitizer: toPublicEventBundle captureRun handling
// ---------------------------------------------------------------------------

describe('toPublicEventBundle — captureRun sanitization', () => {
  function makeBundle(overrides?: Partial<EventRecapBundle>): EventRecapBundle {
    return {
      event: {
        eventId: 'sanitizer-test',
        name: 'Sanitizer Test',
        daysBefore: 0,
        daysAfter: 0,
        refreshIntervalHours: 24,
        maxItemsPerPlatform: 0,
        monthlyCreditBudget: 0,
        liveMode: 'mock',
        status: 'ready',
        usedCredits: 0,
        querySet: [],
        sourceUrls: [],
        createdAt: 0,
        updatedAt: 0,
      },
      runs: [],
      posts: [],
      themes: [],
      voices: [],
      captureRun: CANNED_RUN,
      ...overrides,
    };
  }

  // 5a. Non-debug: screenshotPath stripped, screenshotRelPath kept
  it('strips screenshotPath from captureRun.captures in non-debug mode', () => {
    const bundle = makeBundle();
    const pub = toPublicEventBundle(bundle, { debug: false });

    expect(pub.captureRun).toBeDefined();
    for (const capture of pub.captureRun!.captures) {
      expect('screenshotPath' in capture).toBe(false);
    }
    // screenshotRelPath and other safe fields are preserved
    const captured = pub.captureRun!.captures.find((c) => c.status === 'captured');
    expect(captured?.screenshotRelPath).toBeTruthy();
    expect(captured?.url).toBeTruthy();
    expect(captured?.platform).toBeTruthy();
    expect(captured?.status).toBeTruthy();
  });

  // 5b. Debug: captureRun returned unchanged including screenshotPath
  it('retains screenshotPath in captureRun.captures in debug mode', () => {
    const bundle = makeBundle();
    const pub = toPublicEventBundle(bundle, { debug: true });

    expect(pub.captureRun).toBeDefined();
    const captured = pub.captureRun!.captures.find((c) => c.status === 'captured');
    expect(captured?.screenshotPath).toBeTruthy();
    expect(captured?.screenshotPath?.startsWith('/')).toBe(true);
  });

  // 5c. No captureRun on bundle → undefined in public output
  it('passes through undefined captureRun cleanly', () => {
    const bundle = makeBundle({ captureRun: undefined });
    const pub = toPublicEventBundle(bundle, { debug: false });
    expect(pub.captureRun).toBeUndefined();
  });
});

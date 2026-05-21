import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EventRecapBundle } from '@/lib/research/event-recap/types';

const mocks = vi.hoisted(() => ({
  getEventBundle: vi.fn(),
  recordEventRawAccess: vi.fn(),
}));

vi.mock('@/lib/research/event-recap/store', () => ({
  getEventBundle: mocks.getEventBundle,
}));

vi.mock('@/lib/research/event-recap/access-log', () => ({
  recordEventRawAccess: mocks.recordEventRawAccess,
}));

describe('/api/events/[eventId]/raw', () => {
  afterEach(() => {
    mocks.getEventBundle.mockReset();
    mocks.recordEventRawAccess.mockReset();
  });

  it('exports raw JSON with metadata and tracks download metadata', async () => {
    mocks.getEventBundle.mockResolvedValueOnce(bundle());
    const { GET } = await import('@/app/api/events/[eventId]/raw/route');
    const res = await GET(
      new Request('http://localhost/api/events/ai-engineer-singapore/raw?format=json&scope=raw', {
        headers: {
          'user-agent': 'vitest',
          'cf-connecting-ip': '203.0.113.10',
        },
      }),
      { params: Promise.resolve({ eventId: 'ai-engineer-singapore' }) }
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toContain('ai-engineer-singapore-source-pack.json');
    const json = await res.json();
    expect(json.metadata).toMatchObject({
      schemaVersion: 'event-recap.raw.v1',
      eventId: 'ai-engineer-singapore',
      counts: { posts: 1, mediaItems: 1, rawPostPayloads: 1 },
      latestRun: { runId: 'run_1', queryCount: 1 },
    });
    expect(json.posts[0].raw).toEqual({ provider: 'fixture' });
    expect(mocks.recordEventRawAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'ai-engineer-singapore',
        action: 'download',
        format: 'json',
        scope: 'raw',
        postCount: 1,
        mediaCount: 1,
        userAgent: 'vitest',
        ip: '203.0.113.10',
      })
    );
  });

  it('exports posts CSV without raw payloads for spreadsheet inspection', async () => {
    mocks.getEventBundle.mockResolvedValueOnce(bundle());
    const { GET } = await import('@/app/api/events/[eventId]/raw/route');
    const res = await GET(
      new Request('http://localhost/api/events/ai-engineer-singapore/raw?format=csv'),
      { params: Promise.resolve({ eventId: 'ai-engineer-singapore' }) }
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    const text = await res.text();
    expect(text).toContain('"postId","platform","url"');
    expect(text).toContain('"post_1","x","https://x.example/post_1"');
    expect(text).not.toContain('provider');
  });

  it('defaults JSON exports to source posts without provider payloads', async () => {
    mocks.getEventBundle.mockResolvedValueOnce(bundle());
    const { GET } = await import('@/app/api/events/[eventId]/raw/route');
    const res = await GET(
      new Request('http://localhost/api/events/ai-engineer-singapore/raw?format=json'),
      { params: Promise.resolve({ eventId: 'ai-engineer-singapore' }) }
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.metadata.scope).toBe('posts');
    expect(json.posts[0].raw).toBeUndefined();
    expect(mocks.recordEventRawAccess).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'download', format: 'json', scope: 'posts' })
    );
  });
});

function bundle(): EventRecapBundle {
  return {
    event: {
      eventId: 'ai-engineer-singapore',
      name: 'AI Engineer Summit Singapore',
      status: 'ready',
      daysBefore: 1,
      daysAfter: 3,
      refreshIntervalHours: 24,
      maxItemsPerPlatform: 25,
      monthlyCreditBudget: 100,
      usedCredits: 1,
      querySet: ['AIE2026'],
      sourceUrls: ['https://aie.example'],
      liveMode: 'tinyfish',
      createdAt: 1,
      updatedAt: 2,
    },
    runs: [
      {
        runId: 'run_1',
        eventId: 'ai-engineer-singapore',
        status: 'completed',
        mode: 'tinyfish',
        provider: 'fixture-provider',
        platforms: ['x'],
        querySet: ['AIE2026'],
        windowStart: '2026-04-20',
        windowEnd: '2026-04-25',
        maxItemsPerPlatform: 25,
        estimatedCredits: 1,
        actualCredits: 1,
        streamingUrls: [],
        warnings: [],
        inputs: {},
        outputs: {},
        startedAt: 1,
        finishedAt: 2,
      },
    ],
    posts: [
      {
        postId: 'post_1',
        eventId: 'ai-engineer-singapore',
        runId: 'run_1',
        platform: 'x',
        url: 'https://x.example/post_1',
        authorName: 'Builder',
        authorHandle: 'builder',
        text: 'AIE2026 recap',
        postedAt: '2026-04-22T00:00:00.000Z',
        capturedAt: 1,
        updatedAt: 2,
        metrics: { likes: 3 },
        media: [{ url: 'https://x.example/image.jpg', type: 'image' }],
        reachScore: 1,
        tags: ['recap'],
        raw: { provider: 'fixture' },
      },
    ],
    themes: [
      {
        themeId: 'theme_1',
        eventId: 'ai-engineer-singapore',
        label: 'Recaps',
        summary: 'People shared recaps.',
        keywords: ['recap'],
        postIds: ['post_1'],
        score: 1,
        updatedAt: 2,
      },
    ],
    voices: [],
  };
}

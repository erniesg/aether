import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const convexQuery = vi.fn();
  const ConvexHttpClient = vi.fn(function () {
    return { query: convexQuery };
  });
  return { convexQuery, ConvexHttpClient };
});

vi.mock('convex/browser', () => ({
  ConvexHttpClient: mocks.ConvexHttpClient,
}));

describe('/api/presence/insights', () => {
  const originalConvexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_CONVEX_URL = 'https://example.convex.cloud';
    mocks.convexQuery.mockReset();
    mocks.ConvexHttpClient.mockClear();
  });

  afterEach(() => {
    if (originalConvexUrl === undefined) delete process.env.NEXT_PUBLIC_CONVEX_URL;
    else process.env.NEXT_PUBLIC_CONVEX_URL = originalConvexUrl;
    vi.resetModules();
  });

  it('returns a deterministic what-works digest for a profile corpus', async () => {
    mocks.convexQuery.mockResolvedValueOnce([
      post('https://x.com/a/status/1', '42% fewer failures after schema changes.', '2026-06-01T04:00:00Z', 40, 8, 4),
      post('https://x.com/a/status/2', 'How do you evaluate agents?', '2026-06-01T08:00:00Z', 12, 1, 7),
      post('https://x.com/b/status/3', 'Demo video: review gate in action.', '2026-06-01T10:00:00Z', 50, 10, 3, true),
      post('https://x.com/b/status/4', 'The bottleneck was permissions, not models.', '2026-06-01T13:00:00Z', 60, 14, 4),
    ]);

    const { GET } = await import('@/app/api/presence/insights/route');
    const res = await GET(
      new Request('http://localhost/api/presence/insights?workspaceId=demo-ws&profileId=profile_personal')
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.digest).toMatchObject({
      postCount: 4,
      exemplarPostUrls: [
        'https://x.com/b/status/4',
        'https://x.com/b/status/3',
        'https://x.com/a/status/1',
        'https://x.com/a/status/2',
      ],
    });
    expect(json.digest.medianEngagementByHook).toEqual({
      claim: 70.5,
      'number-led': 52,
      question: 20,
    });
    expect(mocks.convexQuery).toHaveBeenCalledWith(expect.anything(), {
      workspaceId: 'demo-ws',
      profileId: 'profile_personal',
    });
  });
});

function post(
  postUrl: string,
  text: string,
  postedAt: string,
  likes: number,
  reposts: number,
  replies: number,
  hasMedia = false
) {
  return {
    workspaceId: 'demo-ws',
    profileId: 'profile_personal',
    handle: '@ref',
    postUrl,
    text,
    postedAt,
    capturedAt: '2026-06-02T00:00:00Z',
    hasMedia,
    metrics: { likes, reposts, replies },
  };
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const collectReferenceAccountPosts = vi.fn();
  const convexMutation = vi.fn();
  const ConvexHttpClient = vi.fn(function () {
    return { mutation: convexMutation };
  });
  return { collectReferenceAccountPosts, convexMutation, ConvexHttpClient };
});

vi.mock('@/lib/research/account-analysis-lap', () => ({
  collectReferenceAccountPosts: mocks.collectReferenceAccountPosts,
  clampPostLimit: (value: unknown) =>
    Math.max(
      1,
      Math.min(50, typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 50)
    ),
}));

vi.mock('convex/browser', () => ({
  ConvexHttpClient: mocks.ConvexHttpClient,
}));

describe('/api/presence/insights/lap', () => {
  const originalConvexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const originalLapSecret = process.env.PRESENCE_LAP_SECRET;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_CONVEX_URL = 'https://example.convex.cloud';
    process.env.PRESENCE_LAP_SECRET = 'lap_secret';
    mocks.collectReferenceAccountPosts.mockReset();
    mocks.convexMutation.mockReset();
    mocks.ConvexHttpClient.mockClear();
  });

  afterEach(() => {
    if (originalConvexUrl === undefined) delete process.env.NEXT_PUBLIC_CONVEX_URL;
    else process.env.NEXT_PUBLIC_CONVEX_URL = originalConvexUrl;
    if (originalLapSecret === undefined) delete process.env.PRESENCE_LAP_SECRET;
    else process.env.PRESENCE_LAP_SECRET = originalLapSecret;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('secret-gates, caps each handle to 50 posts, persists the lap, and logs collected count', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    mocks.collectReferenceAccountPosts.mockResolvedValueOnce([
      {
        handle: '@openai',
        postUrl: 'https://x.com/openai/status/1',
        text: '42% fewer failures after schema changes.',
        postedAt: '2026-06-01T04:00:00.000Z',
        capturedAt: '2026-06-02T00:00:00.000Z',
        hasMedia: false,
        metrics: { likes: 40, reposts: 8, replies: 4, impressions: 1200 },
      },
    ]);
    mocks.convexMutation.mockResolvedValueOnce({ inserted: 1, skipped: 0 });

    const { POST } = await import('@/app/api/presence/insights/lap/route');
    const res = await POST(
      new Request('http://localhost/api/presence/insights/lap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: 'Bearer lap_secret',
        },
        body: JSON.stringify({
          workspaceId: 'demo-ws',
          profileId: 'profile_personal',
          handles: ['@openai'],
          maxPostsPerHandle: 80,
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      workspaceId: 'demo-ws',
      profileId: 'profile_personal',
      postsCollected: 1,
      persistence: { inserted: 1, skipped: 0 },
    });
    expect(mocks.collectReferenceAccountPosts).toHaveBeenCalledWith(
      expect.objectContaining({
        handles: ['@openai'],
        maxPostsPerHandle: 50,
      })
    );
    expect(mocks.convexMutation).toHaveBeenCalledWith(expect.anything(), {
      workspaceId: 'demo-ws',
      profileId: 'profile_personal',
      posts: [
        expect.objectContaining({
          handle: '@openai',
          postUrl: 'https://x.com/openai/status/1',
        }),
      ],
    });
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining('account-analysis.lap.posts=1')
    );
  });

  it('rejects requests without the lap secret', async () => {
    const { POST } = await import('@/app/api/presence/insights/lap/route');
    const res = await POST(
      new Request('http://localhost/api/presence/insights/lap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'demo-ws',
          profileId: 'profile_personal',
          handles: ['@openai'],
        }),
      })
    );

    expect(res.status).toBe(401);
    expect(mocks.collectReferenceAccountPosts).not.toHaveBeenCalled();
    expect(mocks.convexMutation).not.toHaveBeenCalled();
  });
});

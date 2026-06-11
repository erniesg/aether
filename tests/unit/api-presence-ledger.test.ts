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

describe('/api/presence/ledger', () => {
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

  it('returns snapshot-stable per-pillar ledger JSON for a profile', async () => {
    mocks.convexQuery.mockResolvedValueOnce([
      metric('agent harnesses', 12, 3, 1),
      metric('untagged', 5, 1, 9),
      metric('agent harnesses', 30, 8, 2),
    ]);

    const { GET } = await import('@/app/api/presence/ledger/route');
    const res = await GET(
      new Request('http://localhost/api/presence/ledger?workspaceId=demo-ws&profileId=profile_personal')
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchInlineSnapshot(`
      {
        "ledger": [
          {
            "medianEngagement": 28,
            "pillar": "agent harnesses",
            "posts": 2,
          },
          {
            "medianEngagement": 15,
            "pillar": "untagged",
            "posts": 1,
          },
        ],
        "ok": true,
        "profileId": "profile_personal",
        "workspaceId": "demo-ws",
      }
    `);
    expect(mocks.convexQuery).toHaveBeenCalledWith(expect.anything(), {
      workspaceId: 'demo-ws',
      profileId: 'profile_personal',
    });
  });
});

function metric(pillar: string, likes: number, reposts: number, replies: number) {
  return {
    workspaceId: 'demo-ws',
    profileId: 'profile_personal',
    postUrl: `https://x.com/aether/status/${likes}`,
    capturedAt: '2026-06-11T00:00:00.000Z',
    likes,
    reposts,
    replies,
    impressions: 1000,
    pillar,
  };
}

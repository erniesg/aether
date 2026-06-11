import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const collectOwnHandleMetrics = vi.fn();
  const convexMutation = vi.fn();
  const ConvexHttpClient = vi.fn(function () {
    return { mutation: convexMutation };
  });
  return { collectOwnHandleMetrics, convexMutation, ConvexHttpClient };
});

vi.mock('@/lib/research/presence-metrics-lap', () => ({
  collectOwnHandleMetrics: mocks.collectOwnHandleMetrics,
  clampPresenceMetricLimit: (value: unknown) =>
    Math.max(
      1,
      Math.min(50, typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 50)
    ),
}));

vi.mock('convex/browser', () => ({
  ConvexHttpClient: mocks.ConvexHttpClient,
}));

describe('/api/presence/ledger/lap', () => {
  const originalConvexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const originalLapSecret = process.env.PRESENCE_LAP_SECRET;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_CONVEX_URL = 'https://example.convex.cloud';
    process.env.PRESENCE_LAP_SECRET = 'lap_secret';
    mocks.collectOwnHandleMetrics.mockReset();
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

  it('secret-gates, caps the own-handle lap, persists snapshots, and logs row count', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    mocks.collectOwnHandleMetrics.mockResolvedValueOnce([
      {
        profileId: 'profile_personal',
        postUrl: 'https://x.com/aether/status/100',
        capturedAt: '2026-06-11T00:00:00.000Z',
        likes: 12,
        reposts: 3,
        replies: 1,
        impressions: 1200,
      },
    ]);
    mocks.convexMutation.mockResolvedValueOnce({ inserted: 1 });

    const { POST } = await import('@/app/api/presence/ledger/lap/route');
    const res = await POST(
      new Request('http://localhost/api/presence/ledger/lap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: 'Bearer lap_secret',
        },
        body: JSON.stringify({
          workspaceId: 'demo-ws',
          profileId: 'profile_personal',
          handle: '@aether',
          maxPosts: 80,
        }),
      })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      workspaceId: 'demo-ws',
      profileId: 'profile_personal',
      postsCollected: 1,
      persistence: { inserted: 1 },
    });
    expect(mocks.collectOwnHandleMetrics).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: 'profile_personal',
        handle: '@aether',
        maxPosts: 50,
      })
    );
    expect(mocks.convexMutation).toHaveBeenCalledWith(expect.anything(), {
      workspaceId: 'demo-ws',
      profileId: 'profile_personal',
      metrics: [
        expect.objectContaining({
          postUrl: 'https://x.com/aether/status/100',
          likes: 12,
        }),
      ],
    });
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining('presence-ledger.lap.posts=1')
    );
  });

  it('rejects requests without the lap secret', async () => {
    const { POST } = await import('@/app/api/presence/ledger/lap/route');
    const res = await POST(
      new Request('http://localhost/api/presence/ledger/lap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'demo-ws',
          profileId: 'profile_personal',
          handle: '@aether',
        }),
      })
    );

    expect(res.status).toBe(401);
    expect(mocks.collectOwnHandleMetrics).not.toHaveBeenCalled();
    expect(mocks.convexMutation).not.toHaveBeenCalled();
  });
});

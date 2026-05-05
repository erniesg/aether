import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mutation: vi.fn(),
  setAdminAuth: vi.fn(),
}));

vi.mock('convex/browser', () => ({
  ConvexHttpClient: vi.fn(function ConvexHttpClient() {
    return {
    mutation: mocks.mutation,
    setAdminAuth: mocks.setAdminAuth,
    };
  }),
}));

vi.mock('convex/server', () => ({
  anyApi: {
    campaigns: {
      updateVariationOverlay: 'campaigns.updateVariationOverlay',
    },
  },
}));

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/campaigns/overlay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function validBody(extra: Record<string, unknown> = {}) {
  return {
    variationId: 'variation_1',
    heroDirectionId: 'hero-a',
    locale: 'en-SG',
    format: '16x9',
    scope: 'global',
    role: 'headline',
    text: 'Cooler sleep starts tonight',
    ...extra,
  };
}

describe('POST /api/campaigns/overlay', () => {
  const originalConvexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const originalDeployKey = process.env.CONVEX_DEPLOY_KEY;

  beforeEach(() => {
    vi.resetModules();
    mocks.mutation.mockReset();
    mocks.setAdminAuth.mockReset();
    delete process.env.NEXT_PUBLIC_CONVEX_URL;
    delete process.env.CONVEX_DEPLOY_KEY;
  });

  afterEach(() => {
    vi.resetModules();
    if (originalConvexUrl === undefined) delete process.env.NEXT_PUBLIC_CONVEX_URL;
    else process.env.NEXT_PUBLIC_CONVEX_URL = originalConvexUrl;
    if (originalDeployKey === undefined) delete process.env.CONVEX_DEPLOY_KEY;
    else process.env.CONVEX_DEPLOY_KEY = originalDeployKey;
  });

  it('returns a no-op success when Convex is not configured', async () => {
    const { POST } = await import('@/app/api/campaigns/overlay/route');

    const res = await POST(postRequest(validBody()));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      skipped: 'no-convex',
    });
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it('fails soft when local Convex is configured but unavailable', async () => {
    process.env.NEXT_PUBLIC_CONVEX_URL = 'http://127.0.0.1:3210';
    mocks.mutation.mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:3210'));
    const { POST } = await import('@/app/api/campaigns/overlay/route');

    const res = await POST(postRequest(validBody()));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      persisted: false,
      skipped: 'convex-unavailable',
    });
  });

  it('marks successful Convex writes as persisted', async () => {
    process.env.NEXT_PUBLIC_CONVEX_URL = 'http://127.0.0.1:3210';
    process.env.CONVEX_DEPLOY_KEY = 'deploy-key';
    mocks.mutation.mockResolvedValueOnce(null);
    const { POST } = await import('@/app/api/campaigns/overlay/route');

    const res = await POST(postRequest(validBody({ translateLinked: true })));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      persisted: true,
    });
    expect(mocks.setAdminAuth).toHaveBeenCalledWith('deploy-key');
    expect(mocks.mutation).toHaveBeenCalledWith(
      'campaigns.updateVariationOverlay',
      expect.objectContaining({
        variationId: 'variation_1',
        heroDirectionId: 'hero-a',
        translateLinked: true,
      })
    );
  });

  it('rejects malformed overlay edits', async () => {
    const { POST } = await import('@/app/api/campaigns/overlay/route');

    const res = await POST(postRequest(validBody({ variationId: undefined })));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      error: 'missing required fields',
    });
  });
});

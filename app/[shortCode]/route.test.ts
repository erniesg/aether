import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  __resetShareStoreMemoryForTests,
  createShareLink,
  getShareSummary,
  type ShareTargetInput,
} from '@/lib/share/store';

const ORIGINAL_CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;
const ORIGINAL_CONVEX_DEPLOY_KEY = process.env.CONVEX_DEPLOY_KEY;

describe('/[shortCode] enrichment probes', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_CONVEX_URL;
    delete process.env.CONVEX_DEPLOY_KEY;
    __resetShareStoreMemoryForTests();
  });

  afterEach(() => {
    __resetShareStoreMemoryForTests();
    restoreEnv('NEXT_PUBLIC_CONVEX_URL', ORIGINAL_CONVEX_URL);
    restoreEnv('CONVEX_DEPLOY_KEY', ORIGINAL_CONVEX_DEPLOY_KEY);
  });

  it('returns mapping JSON for enrichment requests without incrementing visits', async () => {
    const target = shareTarget('enrichment-no-count');
    const link = await createShareLink({
      requestUrl: 'http://localhost/api/share/link',
      target,
      platform: 'linkedin',
    });
    const { GET } = await import('./route');

    const probe = await GET(
      new Request(`http://localhost/${link.code}`, {
        headers: {
          'user-agent': 'aether-share-enrichment',
          'x-aether-enrichment': '1',
        },
      }),
      { params: Promise.resolve({ shortCode: link.code }) }
    );

    expect(probe.status).toBe(200);
    await expect(probe.json()).resolves.toMatchObject({
      ok: true,
      code: link.code,
      canonicalUrl: target.canonicalUrl,
      platform: 'linkedin',
    });
    expect(probe.headers.get('cache-control')).toBe('private, no-store');

    expect(await getShareSummary(target.canonicalUrl)).toMatchObject({
      trackedVisits: 0,
      botPreviews: 0,
    });

    const visit = await GET(new Request(`http://localhost/${link.code}`), {
      params: Promise.resolve({ shortCode: link.code }),
    });
    expect(visit.status).toBe(302);
    expect(visit.headers.get('location')).toBe(target.canonicalUrl);

    expect(await getShareSummary(target.canonicalUrl)).toMatchObject({
      trackedVisits: 1,
      botPreviews: 0,
    });
  });
});

function shareTarget(slug: string): ShareTargetInput {
  return {
    canonicalUrl: `http://localhost/events/${slug}`,
    objectType: 'event_recap',
    objectId: slug,
    slug,
    title: `Event recap ${slug}`,
    description: 'A creator-facing recap.',
  };
}

function restoreEnv(key: 'NEXT_PUBLIC_CONVEX_URL' | 'CONVEX_DEPLOY_KEY', value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  __resetShareStoreMemoryForTests,
  createShareLink,
  getShareSummary,
  recordShareEvent,
  type ShareTargetInput,
} from './store';

const ORIGINAL_CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;
const ORIGINAL_CONVEX_DEPLOY_KEY = process.env.CONVEX_DEPLOY_KEY;

describe('share summary metrics', () => {
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

  it('counts creator share actions separately from tracked short-link visits', async () => {
    const target = shareTarget('share-summary-metrics');
    const link = await createShareLink({
      requestUrl: 'http://localhost/api/share/link',
      target,
      platform: 'x',
      label: 'recap header',
    });

    await recordShareEvent({ eventType: 'platform_clicked', platform: 'x', code: link.code });
    await recordShareEvent({ eventType: 'copy_link', platform: 'copy', canonicalUrl: target.canonicalUrl });
    await recordShareEvent({ eventType: 'copy_clean_link', platform: 'copy', canonicalUrl: target.canonicalUrl });
    await recordShareEvent({
      eventType: 'native_share_error',
      platform: 'native',
      canonicalUrl: target.canonicalUrl,
    });
    await recordShareEvent({ eventType: 'share_link_visit', platform: 'x', code: link.code });
    await recordShareEvent({ eventType: 'share_link_bot_preview', platform: 'x', code: link.code });

    const summary = await getShareSummary(target.canonicalUrl);

    expect(summary.shareLinks).toBe(1);
    expect(summary.shareActions).toBe(2);
    expect(summary.trackedVisits).toBe(1);
    expect(summary.botPreviews).toBe(1);
    expect(summary.publicPostsByPlatform).toEqual({});
    expect(summary.platformActions).toMatchObject({ x: 1, copy: 1 });
    expect(summary.platformActions.native).toBeUndefined();
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

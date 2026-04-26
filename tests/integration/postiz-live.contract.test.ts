import { describe, expect, it } from 'vitest';
import { createPostizPublisher } from '@/lib/providers/publisher/postiz';
import { createInMemoryScheduledPostStorage } from '@/lib/providers/publisher/memory-storage';
import type { ScheduledPost } from '@/lib/providers/publisher/types';

/**
 * Track 5A — live contract test against a real Postiz instance.
 *
 * Gated behind `POSTIZ_API_URL`. Skips cleanly when unset so `npm test` stays
 * green for everyone (CI, fresh clones, demo machines without a hosted Postiz).
 * When `POSTIZ_API_URL` IS set the test actually exercises the public API the
 * adapter calls — upload, schedule, list, cancel — to prove the contract still
 * matches what aether expects after each Postiz upgrade.
 *
 * Requires (when enabled):
 *   POSTIZ_API_URL                    e.g. https://postiz-xyz.run.app/public/v1
 *   POSTIZ_API_KEY                    Postiz Settings → API Keys
 *   POSTIZ_INTEGRATION_<PLATFORM>     at least one (default: instagram)
 *   POSTIZ_LIVE_PLATFORM              optional override of which platform to
 *                                     exercise; falls back to the first
 *                                     integration env var that is set
 *   POSTIZ_LIVE_MEDIA_URL             optional public HTTPS image URL; defaults
 *                                     to a 1×1 transparent PNG data URL so
 *                                     uploads exercise the multipart path
 *
 * Safety: the scheduled date is +30 days from runtime so the post sits in
 * Postiz's queue without firing during the test window. The test also DELETEs
 * the post it created so live runs are net-zero.
 */

const apiUrl = process.env.POSTIZ_API_URL?.trim();
const apiKey = process.env.POSTIZ_API_KEY?.trim();

const PLATFORM_ENV_KEYS = {
  instagram: 'POSTIZ_INTEGRATION_INSTAGRAM',
  tiktok: 'POSTIZ_INTEGRATION_TIKTOK',
  x: 'POSTIZ_INTEGRATION_X',
  linkedin: 'POSTIZ_INTEGRATION_LINKEDIN',
  'youtube-shorts': 'POSTIZ_INTEGRATION_YOUTUBE_SHORTS',
  pinterest: 'POSTIZ_INTEGRATION_PINTEREST',
} as const;

type LivePlatform = keyof typeof PLATFORM_ENV_KEYS;

function pickPlatform(): { platform: LivePlatform; integrationId: string } | null {
  const requested = (process.env.POSTIZ_LIVE_PLATFORM ?? '').trim() as LivePlatform;
  if (requested && PLATFORM_ENV_KEYS[requested]) {
    const id = process.env[PLATFORM_ENV_KEYS[requested]]?.trim();
    if (id) return { platform: requested, integrationId: id };
  }
  for (const platform of Object.keys(PLATFORM_ENV_KEYS) as LivePlatform[]) {
    const id = process.env[PLATFORM_ENV_KEYS[platform]]?.trim();
    if (id) return { platform, integrationId: id };
  }
  return null;
}

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZwkmBYAAAAASUVORK5CYII=';

const liveEnabled = Boolean(apiUrl && apiKey);

// Vitest's describe.skipIf keeps the suite visible in the report as "skipped"
// when the gate is off, instead of hiding it — the demo-day reviewer can see
// at a glance that a live Postiz instance was not configured.
describe.skipIf(!liveEnabled)('PostizPublisher · live contract (POSTIZ_API_URL gate)', () => {
  it('round-trips upload → schedule → list → cancel against a real Postiz instance', async () => {
    const selection = pickPlatform();
    if (!selection) {
      throw new Error(
        'POSTIZ_API_URL is set but no POSTIZ_INTEGRATION_<PLATFORM> env var is. Set at least one before running this test.'
      );
    }

    const { platform, integrationId } = selection;
    const mediaUrl = process.env.POSTIZ_LIVE_MEDIA_URL?.trim() || TINY_PNG;
    const scheduledAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
    const storage = createInMemoryScheduledPostStorage();

    const publisher = createPostizPublisher({
      workspaceId: 'ws_live_contract',
      apiKey: apiKey!,
      apiBaseUrl: apiUrl!,
      integrationIds: { [platform]: integrationId },
      pinterestBoardId: process.env.POSTIZ_PINTEREST_BOARD_ID?.trim(),
      pinterestLinkUrl: process.env.POSTIZ_PINTEREST_LINK_URL?.trim(),
      storage,
    });

    const post: ScheduledPost = {
      id: '',
      platform,
      mediaUrls: [mediaUrl],
      caption: `aether live-contract test · ${new Date().toISOString()}`,
      hashtags: ['aether', 'contract'],
      scheduledAt,
    };

    expect(publisher.canPublish(post)).toBe(true);

    const result = await publisher.schedule(post);
    expect(typeof result.previewUrl).toBe('string');
    expect(result.externalId, 'Postiz must return an externalId on schedule').toBeTruthy();

    try {
      const local = await publisher.list('ws_live_contract');
      expect(local.length).toBeGreaterThan(0);
      expect(local[0].provider).toBe('postiz');

      // Round-trip a public-API GET so we're sure auth + base-URL work end to end.
      const listRes = await fetch(`${apiUrl!.replace(/\/+$/, '')}/posts`, {
        headers: { Authorization: apiKey! },
      });
      expect(listRes.ok, `GET /posts → HTTP ${listRes.status}`).toBe(true);
    } finally {
      // Always clean up — the test must be net-zero on a live instance.
      await publisher.cancel(result.externalId!);
    }

    // Re-cancel the same id; the adapter treats 404 as already-gone so this
    // must not throw, even on a live server.
    await expect(publisher.cancel(result.externalId!)).resolves.toBeUndefined();
  }, 60_000);
});

// A tiny non-skipped test so vitest reports something even when the gate is
// off — keeps the file visible in the suite list and prevents "0 tests"
// surprises on CI.
describe('PostizPublisher · live contract (gate self-check)', () => {
  it('skips the live block when POSTIZ_API_URL is unset', () => {
    if (liveEnabled) {
      expect(apiUrl).toMatch(/^https?:\/\//);
      expect(apiKey?.length ?? 0).toBeGreaterThan(0);
    } else {
      expect(liveEnabled).toBe(false);
    }
  });
});

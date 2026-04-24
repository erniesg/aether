import { describe, expect, it, beforeEach } from 'vitest';
import { createPreviewPublisher } from './preview';
import { createInMemoryScheduledPostStorage } from './memory-storage';
import {
  PUBLISH_PLATFORMS,
  type ScheduledPost,
  type ScheduledPostStorage,
} from './types';

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZwkmBYAAAAASUVORK5CYII=';

const FIXTURE_SCHEDULED_AT = '2026-05-01T12:00:00.000Z';
const WS_ID = 'ws_demo_1';

function postFor(platform: ScheduledPost['platform']): ScheduledPost {
  return {
    // Empty id on the caller; PreviewPublisher assigns a persistent id on insert.
    id: '',
    platform,
    mediaUrls: [TINY_PNG],
    caption: `hero drop · ${platform}`,
    hashtags: ['aether', platform.replace(/-/g, '')],
    scheduledAt: FIXTURE_SCHEDULED_AT,
  };
}

describe('PreviewPublisher · contract', () => {
  let storage: ScheduledPostStorage;

  beforeEach(() => {
    storage = createInMemoryScheduledPostStorage();
  });

  it('exposes the provider id "preview" and canPublish is true for every supported platform', () => {
    const publisher = createPreviewPublisher({
      workspaceId: WS_ID,
      storage,
      baseUrl: 'https://aether.test',
    });
    expect(publisher.id).toBe('preview');
    for (const platform of PUBLISH_PLATFORMS) {
      expect(publisher.canPublish(postFor(platform))).toBe(true);
    }
  });

  it('schedule() persists the post and returns a previewUrl deep-linking into the workspace shell', async () => {
    const publisher = createPreviewPublisher({
      workspaceId: WS_ID,
      storage,
      baseUrl: 'https://aether.test',
    });
    const result = await publisher.schedule(postFor('instagram'));

    // The previewUrl must stay inside the single workspace shell (CLAUDE.md
    // hard rule #1 — no per-step wizard routes). Deep-linking via query param
    // keeps the preview as a lens over the canvas, not a separate route.
    expect(result.previewUrl).toMatch(
      /^https:\/\/aether\.test\/workspace\/ws_demo_1\?publishPreview=[^&]+$/
    );
    expect(result.externalId).toBeUndefined();

    const list = await publisher.list(WS_ID);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      platform: 'instagram',
      caption: 'hero drop · instagram',
      hashtags: ['aether', 'instagram'],
      scheduledAt: FIXTURE_SCHEDULED_AT,
    });
    expect(list[0]!.id).toBeTruthy();
    // postId inside previewUrl must match the stored record.
    const postIdInUrl = new URL(result.previewUrl).searchParams.get('publishPreview');
    expect(postIdInUrl).toBe(list[0]!.id);
  });

  it('schedule() is idempotent on fresh input — each call creates a new record', async () => {
    const publisher = createPreviewPublisher({
      workspaceId: WS_ID,
      storage,
      baseUrl: 'https://aether.test',
    });
    await publisher.schedule(postFor('tiktok'));
    await publisher.schedule(postFor('tiktok'));
    const list = await publisher.list(WS_ID);
    expect(list).toHaveLength(2);
    expect(list[0]!.id).not.toBe(list[1]!.id);
  });

  it('schedule() rejects posts with no mediaUrls (cannot preview without media)', async () => {
    const publisher = createPreviewPublisher({
      workspaceId: WS_ID,
      storage,
      baseUrl: 'https://aether.test',
    });
    const empty: ScheduledPost = { ...postFor('x'), mediaUrls: [] };
    await expect(publisher.schedule(empty)).rejects.toThrow(/mediaUrls required/);
    expect(await publisher.list(WS_ID)).toEqual([]);
  });

  it('list() is workspace-scoped — posts from other workspaces do not leak', async () => {
    const publisherA = createPreviewPublisher({
      workspaceId: 'ws_a',
      storage,
      baseUrl: 'https://aether.test',
    });
    const publisherB = createPreviewPublisher({
      workspaceId: 'ws_b',
      storage,
      baseUrl: 'https://aether.test',
    });
    await publisherA.schedule(postFor('linkedin'));
    await publisherB.schedule(postFor('pinterest'));
    const a = await publisherA.list('ws_a');
    const b = await publisherB.list('ws_b');
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0]!.platform).toBe('linkedin');
    expect(b[0]!.platform).toBe('pinterest');
  });

  it('cancel() drops the scheduled post from list()', async () => {
    const publisher = createPreviewPublisher({
      workspaceId: WS_ID,
      storage,
      baseUrl: 'https://aether.test',
    });
    const { previewUrl } = await publisher.schedule(postFor('youtube-shorts'));
    const postId = new URL(previewUrl).searchParams.get('publishPreview')!;
    expect((await publisher.list(WS_ID))).toHaveLength(1);
    await publisher.cancel(postId);
    expect(await publisher.list(WS_ID)).toEqual([]);
  });

  it('round-trips every supported platform shape through schedule → list', async () => {
    const publisher = createPreviewPublisher({
      workspaceId: WS_ID,
      storage,
      baseUrl: 'https://aether.test',
    });
    for (const platform of PUBLISH_PLATFORMS) {
      await publisher.schedule(postFor(platform));
    }
    const list = await publisher.list(WS_ID);
    expect(list.map((p) => p.platform).sort()).toEqual(
      [...PUBLISH_PLATFORMS].sort()
    );
  });

  it('previewUrl falls back to a relative path when baseUrl is omitted', async () => {
    const publisher = createPreviewPublisher({ workspaceId: WS_ID, storage });
    const { previewUrl } = await publisher.schedule(postFor('douyin'));
    expect(previewUrl.startsWith('/workspace/ws_demo_1?publishPreview=')).toBe(
      true
    );
  });
});

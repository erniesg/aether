import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSocialAutoUploadPublisher } from './social-auto-upload';
import type { ScheduledPost } from './types';

const WS_ID = 'ws_cjk';
const SCHEDULED_AT = '2026-05-02T09:30:00.000Z';

function postFor(platform: ScheduledPost['platform']): ScheduledPost {
  return {
    id: '',
    platform,
    mediaUrls: ['https://cdn.aether.test/clip.mp4'],
    caption: `hero drop ${platform}`,
    hashtags: ['aether', 'cjk'],
    scheduledAt: SCHEDULED_AT,
    accountId: 'creator-main',
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}

describe('SocialAutoUploadPublisher · contract', () => {
  const originalFetch = global.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('supports CJK / browser-automation platforms only', () => {
    const publisher = createSocialAutoUploadPublisher({
      workspaceId: WS_ID,
      endpoint: 'https://sau.test',
      token: 'sau_token',
    });

    for (const platform of ['tiktok', 'douyin', 'xhs', 'bilibili', 'kuaishou'] as const) {
      expect(publisher.canPublish(postFor(platform))).toBe(true);
    }
    for (const platform of ['instagram', 'x', 'linkedin', 'youtube-shorts', 'pinterest'] as const) {
      expect(publisher.canPublish(postFor(platform))).toBe(false);
    }
  });

  it('schedule() sends a thin sidecar job with screenshot-on-failure enabled', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'sau_job_1' }));

    const publisher = createSocialAutoUploadPublisher({
      workspaceId: WS_ID,
      endpoint: 'https://sau.test/',
      token: 'sau_token',
    });

    const result = await publisher.schedule(postFor('xhs'));

    expect(result).toEqual({
      externalId: 'sau_job_1',
      previewUrl: 'https://sau.test/jobs/sau_job_1',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://sau.test/v1/posts',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer sau_token',
        },
      })
    );

    const [, init] = fetchMock.mock.calls[0]!;
    const payload = JSON.parse(String(init.body));
    expect(payload).toEqual({
      workspaceId: WS_ID,
      platform: 'xiaohongshu',
      accountId: 'creator-main',
      mediaUrls: ['https://cdn.aether.test/clip.mp4'],
      caption: 'hero drop xhs',
      hashtags: ['aether', 'cjk'],
      scheduledAt: SCHEDULED_AT,
      screenshotOnFailure: true,
    });
  });

  it('list() maps sidecar jobs back to ScheduledPost rows', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        posts: [
          {
            id: 'sau_job_1',
            platform: 'douyin',
            accountId: 'creator-main',
            mediaUrls: ['https://cdn.aether.test/douyin.mp4'],
            caption: 'douyin drop',
            hashtags: ['aether'],
            scheduledAt: SCHEDULED_AT,
            status: 'scheduled',
          },
        ],
      })
    );

    const publisher = createSocialAutoUploadPublisher({
      workspaceId: WS_ID,
      endpoint: 'https://sau.test',
      token: 'sau_token',
    });

    await expect(publisher.list(WS_ID)).resolves.toEqual([
      {
        id: 'sau_job_1',
        platform: 'douyin',
        accountId: 'creator-main',
        mediaUrls: ['https://cdn.aether.test/douyin.mp4'],
        caption: 'douyin drop',
        hashtags: ['aether'],
        scheduledAt: SCHEDULED_AT,
      },
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://sau.test/v1/posts?workspaceId=ws_cjk',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('cancel() deletes by sidecar job id', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const publisher = createSocialAutoUploadPublisher({
      workspaceId: WS_ID,
      endpoint: 'https://sau.test',
      token: 'sau_token',
    });

    await publisher.cancel('sau_job_1');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://sau.test/v1/posts/sau_job_1',
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});

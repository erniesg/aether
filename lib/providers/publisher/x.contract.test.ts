/**
 * Contract tests for XPublisher (twitter-api-v2 direct adapter).
 *
 * All twitter-api-v2 client calls are mocked via vi.hoisted so they are
 * available at module parse time. The mock shape mirrors the v1/v2 client
 * methods we actually call:
 *   - client.v1.uploadMedia  → returns a media_id_string
 *   - client.v2.tweet        → returns { data: { id, text } }
 *   - client.v2.deleteTweet  → returns { data: { deleted: true } }
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScheduledPost } from './types';

// Hoist mock factories so they are available before module imports.
const mocks = vi.hoisted(() => {
  const uploadMedia = vi.fn();
  const tweet = vi.fn();
  const deleteTweet = vi.fn();
  return { uploadMedia, tweet, deleteTweet };
});

vi.mock('twitter-api-v2', () => {
  class TwitterApi {
    v1 = { uploadMedia: mocks.uploadMedia };
    v2 = { tweet: mocks.tweet, deleteTweet: mocks.deleteTweet };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(_opts: any) {}
  }
  return { default: TwitterApi, TwitterApi };
});

import {
  createXPublisher,
  createXPublisherFromEnv,
  isXPublisherConfigured,
} from './x';

function post(overrides: Partial<ScheduledPost> = {}): ScheduledPost {
  return {
    id: 'sp_x_1',
    platform: 'x',
    mediaUrls: ['https://cdn.aether.test/hero.png'],
    caption: 'slow glow key visual',
    hashtags: ['aether', 'launch'],
    scheduledAt: new Date(Date.now() - 60_000).toISOString(), // 1 min in the past → immediate
    ...overrides,
  };
}

describe('XPublisher · contract', () => {
  beforeEach(() => {
    mocks.uploadMedia.mockReset();
    mocks.tweet.mockReset();
    mocks.deleteTweet.mockReset();
  });

  it('is configured when all four env vars are present', () => {
    expect(
      isXPublisherConfigured({
        X_API_KEY: 'key',
        X_API_KEY_SECRET: 'secret',
        X_ACCESS_TOKEN: 'token',
        X_ACCESS_TOKEN_SECRET: 'token_secret',
      })
    ).toBe(true);
  });

  it('is NOT configured when any env var is missing', () => {
    expect(
      isXPublisherConfigured({
        X_API_KEY: 'key',
        X_API_KEY_SECRET: 'secret',
        // X_ACCESS_TOKEN missing
        X_ACCESS_TOKEN_SECRET: 'token_secret',
      })
    ).toBe(false);
    expect(isXPublisherConfigured({})).toBe(false);
  });

  it('createXPublisherFromEnv returns null when not configured', () => {
    const result = createXPublisherFromEnv({}, {});
    expect(result).toBeNull();
  });

  it('canPublish is true for x posts when configured', () => {
    const publisher = createXPublisher({
      apiKey: 'key',
      apiKeySecret: 'secret',
      accessToken: 'token',
      accessTokenSecret: 'token_secret',
    });
    expect(publisher.canPublish(post())).toBe(true);
  });

  it('canPublish is false for non-x platform', () => {
    const publisher = createXPublisher({
      apiKey: 'key',
      apiKeySecret: 'secret',
      accessToken: 'token',
      accessTokenSecret: 'token_secret',
    });
    expect(publisher.canPublish(post({ platform: 'instagram' }))).toBe(false);
  });

  it('schedule happy path: uploads media then tweets, returns permalink', async () => {
    mocks.uploadMedia.mockResolvedValueOnce('media_id_12345');
    mocks.tweet.mockResolvedValueOnce({
      data: { id: 'tweet_abc123', text: 'slow glow key visual #aether #launch' },
    });

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
        { status: 200, headers: { 'Content-Type': 'image/png' } }
      )
    );

    const publisher = createXPublisher({
      apiKey: 'key',
      apiKeySecret: 'secret',
      accessToken: 'token',
      accessTokenSecret: 'token_secret',
      fetch: mockFetch,
    });

    const result = await publisher.schedule(post());

    expect(result.externalId).toBe('tweet_abc123');
    expect(result.previewUrl).toContain('twitter.com');
    expect(result.previewUrl).toContain('tweet_abc123');
    expect(mocks.uploadMedia).toHaveBeenCalledTimes(1);
    expect(mocks.tweet).toHaveBeenCalledTimes(1);
    // Caption includes hashtags
    expect(mocks.tweet.mock.calls[0][0].text).toContain('#aether');
  });

  it('schedule rejects future-scheduled posts with a clear error', async () => {
    const publisher = createXPublisher({
      apiKey: 'key',
      apiKeySecret: 'secret',
      accessToken: 'token',
      accessTokenSecret: 'token_secret',
    });

    const futurePost = post({
      scheduledAt: new Date(Date.now() + 10 * 60_000).toISOString(), // 10 min future
    });

    await expect(publisher.schedule(futurePost)).rejects.toThrow(
      /does not support future scheduling/
    );
  });

  it('list returns empty array (unsupported at this API tier)', async () => {
    const publisher = createXPublisher({
      apiKey: 'key',
      apiKeySecret: 'secret',
      accessToken: 'token',
      accessTokenSecret: 'token_secret',
    });

    const result = await publisher.list('ws_test');
    expect(result).toEqual([]);
  });

  it('cancel calls deleteTweet with the given id', async () => {
    mocks.deleteTweet.mockResolvedValueOnce({ data: { deleted: true } });

    const publisher = createXPublisher({
      apiKey: 'key',
      apiKeySecret: 'secret',
      accessToken: 'token',
      accessTokenSecret: 'token_secret',
    });

    await expect(publisher.cancel('tweet_abc123')).resolves.toBeUndefined();
    expect(mocks.deleteTweet).toHaveBeenCalledWith('tweet_abc123');
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  KNOWN_PUBLISHER_IDS,
  createInMemoryStorageForTests,
  listAvailablePublishers,
  resolvePublisherForPost,
  resolvePublisher,
} from './registry';
import type { ScheduledPost } from './types';

const PUBLISHER_ENV_KEYS = [
  'PUBLISHER_PROVIDER',
  'POSTIZ_API_KEY',
  'POSTIZ_API_URL',
  'POSTIZ_INTEGRATION_INSTAGRAM',
] as const;

function postFor(platform: ScheduledPost['platform']): ScheduledPost {
  return {
    id: '',
    platform,
    mediaUrls: ['https://cdn.aether.test/hero.png'],
    caption: 'publish me',
    hashtags: [],
    scheduledAt: '2026-05-01T12:00:00.000Z',
  };
}

describe('publisher registry', () => {
  const snapshot: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of PUBLISHER_ENV_KEYS) {
      snapshot[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of PUBLISHER_ENV_KEYS) {
      if (snapshot[k] === undefined) delete process.env[k];
      else process.env[k] = snapshot[k];
    }
  });

  it('exposes the three publisher ids defined for the seam', () => {
    expect(new Set(KNOWN_PUBLISHER_IDS)).toEqual(
      new Set(['preview', 'postiz', 'social-auto-upload'])
    );
  });

  it('default resolution returns "preview" — no OAuth required, always demo-ready', () => {
    const publisher = resolvePublisher({
      workspaceId: 'ws_x',
      storage: createInMemoryStorageForTests(),
    });
    expect(publisher.id).toBe('preview');
  });

  it('PUBLISHER_PROVIDER=postiz falls through to preview when credentials are absent', () => {
    process.env.PUBLISHER_PROVIDER = 'postiz';
    const publisher = resolvePublisher({
      workspaceId: 'ws_x',
      storage: createInMemoryStorageForTests(),
    });
    expect(publisher.id).toBe('preview');
  });

  it('PUBLISHER_PROVIDER=postiz resolves the real adapter when configured', () => {
    process.env.PUBLISHER_PROVIDER = 'postiz';
    process.env.POSTIZ_API_KEY = 'postiz-key';
    process.env.POSTIZ_INTEGRATION_INSTAGRAM = 'ig_integration';
    const publisher = resolvePublisher({
      workspaceId: 'ws_x',
      storage: createInMemoryStorageForTests(),
    });
    expect(publisher.id).toBe('postiz');
  });

  it('explicit preferredId beats env default', () => {
    process.env.PUBLISHER_PROVIDER = 'postiz';
    const publisher = resolvePublisher({
      workspaceId: 'ws_x',
      storage: createInMemoryStorageForTests(),
      preferredId: 'preview',
    });
    expect(publisher.id).toBe('preview');
  });

  it('listAvailablePublishers returns preview by default', () => {
    const list = listAvailablePublishers();
    expect(list.map((p) => p.id)).toEqual(['preview']);
    expect(list[0]!.displayName).toBeTruthy();
  });

  it('listAvailablePublishers includes Postiz when configured', () => {
    process.env.POSTIZ_API_KEY = 'postiz-key';
    process.env.POSTIZ_INTEGRATION_INSTAGRAM = 'ig_integration';
    const list = listAvailablePublishers();
    expect(list.map((p) => p.id)).toEqual(['preview', 'postiz']);
  });

  it('resolvePublisherForPost routes western and CJK platforms to configured real adapters before preview', () => {
    process.env.POSTIZ_BASE_URL = 'https://postiz.test';
    process.env.POSTIZ_API_KEY = 'postiz_key';
    process.env.SOCIAL_AUTO_UPLOAD_URL = 'https://sau.test';
    process.env.SOCIAL_AUTO_UPLOAD_TOKEN = 'sau_key';

    const instagram = resolvePublisherForPost({
      workspaceId: 'ws_x',
      storage: createInMemoryStorageForTests(),
      post: postFor('instagram'),
    });
    const xhs = resolvePublisherForPost({
      workspaceId: 'ws_x',
      storage: createInMemoryStorageForTests(),
      post: postFor('xhs'),
    });

    expect(instagram.id).toBe('postiz');
    expect(xhs.id).toBe('social-auto-upload');
  });

  it('resolvePublisherForPost falls through from an env default when that adapter cannot publish the platform', () => {
    process.env.PUBLISHER_PROVIDER = 'postiz';
    process.env.POSTIZ_BASE_URL = 'https://postiz.test';
    process.env.POSTIZ_API_KEY = 'postiz_key';
    process.env.SOCIAL_AUTO_UPLOAD_URL = 'https://sau.test';
    process.env.SOCIAL_AUTO_UPLOAD_TOKEN = 'sau_key';

    const publisher = resolvePublisherForPost({
      workspaceId: 'ws_x',
      storage: createInMemoryStorageForTests(),
      post: postFor('douyin'),
    });

    expect(publisher.id).toBe('social-auto-upload');
  });

  it('resolvePublisherForPost uses preview when no real adapter is configured', () => {
    const publisher = resolvePublisherForPost({
      workspaceId: 'ws_x',
      storage: createInMemoryStorageForTests(),
      post: postFor('pinterest'),
    });

    expect(publisher.id).toBe('preview');
  });
});

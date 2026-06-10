import { describe, expect, it } from 'vitest';
import type { EventPost, EventTheme } from '@/lib/research/event-recap/types';
import {
  bundleToReferences,
  themeToReferences,
} from '@/lib/research/recap-to-references';

const CAPTURED_AT = '2026-06-10T00:00:00.000Z';

function makeTheme(overrides: Partial<EventTheme> = {}): EventTheme {
  return {
    themeId: 'theme-1',
    eventId: 'evt-1',
    label: 'agents in production',
    summary: 'talks about shipping agents',
    keywords: ['agents', 'production', 'evals', 'tooling', 'extra'],
    postIds: ['p1', 'p2', 'p3'],
    score: 0.9,
    updatedAt: 1,
    ...overrides,
  };
}

function makePost(overrides: Partial<EventPost> = {}): EventPost {
  return {
    postId: 'p1',
    eventId: 'evt-1',
    runId: 'run-1',
    platform: 'x',
    url: 'https://x.com/a/status/1',
    authorName: 'Ada Lovelace',
    authorHandle: '@ada',
    text: 'great talk',
    capturedAt: 1,
    updatedAt: 1,
    metrics: { likes: 10 },
    media: [{ url: 'https://cdn.example/full-1.jpg', type: 'image' }],
    reachScore: 10,
    tags: [],
    raw: {},
    ...overrides,
  };
}

describe('themeToReferences', () => {
  it('maps theme posts with media into reference records with attribution', () => {
    const theme = makeTheme({ postIds: ['p1'] });
    const post = makePost();
    const refs = themeToReferences({
      theme,
      posts: [post],
      capturedAt: CAPTURED_AT,
    });
    expect(refs).toHaveLength(1);
    const ref = refs[0];
    expect(ref.id).toBe('recap:theme-1:p1');
    expect(ref.kind).toBe('image');
    expect(ref.previewUrl).toBe('https://cdn.example/full-1.jpg');
    expect(ref.fullUrl).toBe('https://cdn.example/full-1.jpg');
    expect(ref.title).toBe('agents in production');
    expect(ref.clusterId).toBe('theme-1');
    expect(ref.capturedAt).toBe(CAPTURED_AT);
    expect(ref.attribution).toEqual({
      source: 'event-recap',
      author: '@ada',
      url: 'https://x.com/a/status/1',
    });
    // platform travels in tags alongside (capped) theme keywords
    expect(ref.tags).toEqual(['x', 'agents', 'production', 'evals', 'tooling']);
  });

  it('prefers storyId for clusterId when present', () => {
    const theme = makeTheme({ postIds: ['p1'], storyId: 'story-7' });
    const refs = themeToReferences({
      theme,
      posts: [makePost()],
      capturedAt: CAPTURED_AT,
    });
    expect(refs[0].clusterId).toBe('story-7');
  });

  it('orders by reachScore, caps at maxPerTheme, and skips media-less posts', () => {
    const theme = makeTheme({ postIds: ['p1', 'p2', 'p3', 'p4'] });
    const posts = [
      makePost({ postId: 'p1', reachScore: 1, media: [{ url: 'https://cdn.example/1.jpg', type: 'image' }] }),
      makePost({ postId: 'p2', reachScore: 100, media: [{ url: 'https://cdn.example/2.jpg', type: 'image' }] }),
      makePost({ postId: 'p3', reachScore: 50, media: [] }),
      makePost({ postId: 'p4', reachScore: 10, media: [{ url: 'https://cdn.example/4.jpg', type: 'image' }] }),
    ];
    const refs = themeToReferences({
      theme,
      posts,
      capturedAt: CAPTURED_AT,
      maxPerTheme: 2,
    });
    expect(refs.map((r) => r.fullUrl)).toEqual([
      'https://cdn.example/2.jpg',
      'https://cdn.example/4.jpg',
    ]);
  });

  it('uses the media previewUrl for video posts and marks kind video', () => {
    const theme = makeTheme({ postIds: ['p1'] });
    const post = makePost({
      media: [
        {
          url: 'https://cdn.example/clip.mp4',
          type: 'video',
          previewUrl: 'https://cdn.example/poster.jpg',
        },
      ],
    });
    const refs = themeToReferences({
      theme,
      posts: [post],
      capturedAt: CAPTURED_AT,
    });
    expect(refs[0].kind).toBe('video');
    expect(refs[0].previewUrl).toBe('https://cdn.example/poster.jpg');
    expect(refs[0].fullUrl).toBe('https://cdn.example/clip.mp4');
  });

  it('skips video media without a poster previewUrl', () => {
    const theme = makeTheme({ postIds: ['p1'] });
    const post = makePost({
      media: [{ url: 'https://cdn.example/clip.mp4', type: 'video' }],
    });
    const refs = themeToReferences({
      theme,
      posts: [post],
      capturedAt: CAPTURED_AT,
    });
    expect(refs).toHaveLength(0);
  });

  it('falls back to authorName when no handle exists', () => {
    const theme = makeTheme({ postIds: ['p1'] });
    const post = makePost({ authorHandle: undefined });
    const refs = themeToReferences({
      theme,
      posts: [post],
      capturedAt: CAPTURED_AT,
    });
    expect(refs[0].attribution.author).toBe('Ada Lovelace');
  });
});

describe('bundleToReferences', () => {
  it('builds references across themes and dedupes shared media URLs', () => {
    const themeA = makeTheme({ themeId: 'theme-a', postIds: ['p1', 'p2'] });
    const themeB = makeTheme({ themeId: 'theme-b', postIds: ['p2', 'p3'] });
    const posts = [
      makePost({ postId: 'p1', media: [{ url: 'https://cdn.example/1.jpg', type: 'image' }] }),
      makePost({ postId: 'p2', media: [{ url: 'https://cdn.example/2.jpg', type: 'image' }] }),
      makePost({ postId: 'p3', media: [{ url: 'https://cdn.example/3.jpg', type: 'image' }] }),
    ];
    const refs = bundleToReferences(
      { themes: [themeA, themeB], posts },
      { capturedAt: CAPTURED_AT }
    );
    // p2's media appears once (themeA claims it first)
    expect(refs.map((r) => r.fullUrl)).toEqual([
      'https://cdn.example/1.jpg',
      'https://cdn.example/2.jpg',
      'https://cdn.example/3.jpg',
    ]);
    expect(refs.find((r) => r.fullUrl === 'https://cdn.example/2.jpg')?.clusterId).toBe(
      'theme-a'
    );
  });

  it('filters to requested themeIds', () => {
    const themeA = makeTheme({ themeId: 'theme-a', postIds: ['p1'] });
    const themeB = makeTheme({ themeId: 'theme-b', postIds: ['p2'] });
    const posts = [
      makePost({ postId: 'p1', media: [{ url: 'https://cdn.example/1.jpg', type: 'image' }] }),
      makePost({ postId: 'p2', media: [{ url: 'https://cdn.example/2.jpg', type: 'image' }] }),
    ];
    const refs = bundleToReferences(
      { themes: [themeA, themeB], posts },
      { themeIds: ['theme-b'], capturedAt: CAPTURED_AT }
    );
    expect(refs).toHaveLength(1);
    expect(refs[0].clusterId).toBe('theme-b');
  });
});

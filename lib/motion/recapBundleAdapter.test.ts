import { describe, expect, it } from 'vitest';
import { buildEventRecapMotionProject } from './recapMotion';
import { toEventRecapMotionInput } from './recapBundleAdapter';

const OPTS = {
  id: 'motion-recap-test',
  workspaceId: 'ws-test',
  createdAt: 1_750_000_000_000,
};

function makeBundle(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    eventId: 'ai-engineer-singapore',
    eventName: 'AI Engineer Singapore',
    stats: {
      total: 1331,
      byPlatform: { x: 553, linkedin: 754, youtube: 24 },
      relevantByPlatform: { x: 553, linkedin: 754, youtube: 24 },
      crossSurfaceObserved: { knownViews: 4679086, knownLikes: 27425 },
    },
    themes: [
      {
        themeId: 'story-keynote',
        label: 'Builder keynote',
        summary: 'The keynote set the tone.',
        score: 500,
        postIds: ['x:2', 'x:1'],
      },
      {
        themeId: 'story-recaps',
        label: 'Event recaps',
        summary: 'Hallway dispatches.',
        score: 900,
        rootPostIds: ['x:1'],
        postIds: ['x:1', 'x:2'],
      },
    ],
    posts: [
      {
        postId: 'x:1',
        rowType: 'parent',
        platform: 'x',
        url: 'https://x.com/builder/status/1',
        authorName: 'Builder One',
        text: 'Best conference hallway track I have joined all year.',
        reachScore: 900,
      },
      {
        postId: 'x:2',
        rowType: 'parent',
        platform: 'x',
        url: 'https://x.com/builder2/status/2',
        authorName: 'Builder Two',
        text: 'Watch the replay https://example.com/replay now.',
        reachScore: 2000,
      },
      {
        postId: 'x:3',
        rowType: 'reply',
        platform: 'x',
        url: 'https://x.com/builder3/status/3',
        authorName: 'Builder Three',
        text: 'Nice recap.',
        reachScore: 5000,
      },
    ],
    ...overrides,
  };
}

describe('toEventRecapMotionInput', () => {
  it('maps identity, stats, and platforms from the bundle', () => {
    const input = toEventRecapMotionInput(makeBundle(), OPTS);

    expect(input.eventId).toBe('ai-engineer-singapore');
    expect(input.eventName).toBe('AI Engineer Singapore');
    expect(input.stats.postCount).toBe(1331);
    expect(input.stats.viewCount).toBe(4679086);
    expect(input.stats.platforms).toEqual(['x', 'linkedin', 'youtube']);
  });

  it('orders themes by score and resolves top post urls from the post index', () => {
    const input = toEventRecapMotionInput(makeBundle(), OPTS);

    expect(input.themes.map((theme) => theme.id)).toEqual(['story-recaps', 'story-keynote']);
    // Cluster roots come first, then remaining postIds fill up to the cap.
    expect(input.themes[0].topPostUrls).toEqual([
      'https://x.com/builder/status/1',
      'https://x.com/builder2/status/2',
    ]);
    expect(input.themes[1].topPostUrls).toEqual([
      'https://x.com/builder2/status/2',
      'https://x.com/builder/status/1',
    ]);
  });

  it('extracts verbatim quotes from parent posts, skipping link-bearing and reply posts', () => {
    const input = toEventRecapMotionInput(makeBundle(), OPTS);

    expect(input.quotes).toHaveLength(1);
    // Byte-for-byte verbatim — never stripped or rewritten.
    expect(input.quotes![0]).toEqual({
      text: 'Best conference hallway track I have joined all year.',
      author: 'Builder One',
      sourceUrl: 'https://x.com/builder/status/1',
    });
  });

  it('produces input that buildEventRecapMotionProject accepts end-to-end', () => {
    const project = buildEventRecapMotionProject(toEventRecapMotionInput(makeBundle(), OPTS));

    expect(project.exports.length).toBeGreaterThanOrEqual(5);
    expect(project.story.some((beat) => beat.id === 'beat-recap-quote')).toBe(true);
  });

  it('caps themes at maxThemes', () => {
    const input = toEventRecapMotionInput(makeBundle(), { ...OPTS, maxThemes: 1 });
    expect(input.themes).toHaveLength(1);
    expect(input.themes[0].id).toBe('story-recaps');
  });

  it('throws when the bundle is missing event identity', () => {
    expect(() => toEventRecapMotionInput({ themes: [] }, OPTS)).toThrow(/eventId/i);
  });
});

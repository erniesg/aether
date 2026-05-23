import { describe, expect, it } from 'vitest';
import { buildStoryAssignedThemes } from './story-assignment';
import type { EventPost } from './types';
import { loadEventConfig, type EventConfig } from './event-config';

const basePost = (overrides: Partial<EventPost> = {}): EventPost => ({
  postId: 'p1',
  eventId: 'aie-2026',
  runId: 'r1',
  platform: 'x',
  url: 'https://x.com/test/status/1',
  authorName: 'Test Author',
  authorHandle: 'test',
  text: '',
  capturedAt: Date.now(),
  updatedAt: Date.now(),
  metrics: { likes: 10, reposts: 1, replies: 0, views: 500 },
  reachScore: 0.1,
  tags: [],
  raw: {},
  ...overrides,
});

const customStoriesConfig = {
  stories: [
    {
      storyId: 'sample-story',
      label: 'Sample',
      summary: 'Sample story.',
      keywords: ['banana'],
      signals: [
        { pattern: /\bbanana\b/i, weight: 5 },
        { pattern: /\bfruit\b/i, weight: 3 },
      ],
    },
    {
      storyId: 'overall-event-recaps',
      label: 'Catch-all',
      summary: 'Catch-all.',
      keywords: ['recap'],
      signals: [{ pattern: /\brecap\b/i, weight: 4 }],
    },
  ],
  smallStoryMergeTargets: {},
  primaryStoryOverrides: [],
};

describe('story assignment — parameterization (slice 2)', () => {
  it('uses the AIE 2026 config by default and assigns Vivian-keyed posts to the keynote story', async () => {
    // Backwards compat: no explicit config → legacy AIE 2026 behavior preserved.
    // Need 8+ posts to clear the small-story merge threshold.
    const posts = Array.from({ length: 8 }, (_, i) =>
      basePost({
        postId: `p-vivian-${i}`,
        text: `Minister Vivian Balakrishnan walked through NanoClaw on Raspberry Pi — the briefed on line really lands. ${i}`,
      })
    );

    const result = buildStoryAssignedThemes('aie-2026', posts);

    for (const post of posts) {
      expect(result.posts.find((p) => p.postId === post.postId)?.primaryStoryId).toBe('vivian-builder-keynote');
    }
  });

  it('honors a custom config when explicitly passed', () => {
    // Need 8+ posts per non-fallback story to clear the small-story merge
    // threshold (story-assignment merges stories with <8 posts AND <6 roots
    // into their mergeTarget or the FALLBACK_STORY_ID).
    const bananaPosts = Array.from({ length: 8 }, (_, i) =>
      basePost({
        postId: `p-banana-${i}`,
        text: `I love a good banana for breakfast at the conference. ${i}`,
      })
    );
    const recapPost = basePost({ postId: 'p-recap', text: 'Quick recap of yesterday: lots happened.' });

    const result = buildStoryAssignedThemes('aie-2026', [...bananaPosts, recapPost], customStoriesConfig);

    for (const bananaPost of bananaPosts) {
      expect(result.posts.find((p) => p.postId === bananaPost.postId)?.primaryStoryId).toBe('sample-story');
    }
    expect(result.posts.find((p) => p.postId === 'p-recap')?.primaryStoryId).toBe('overall-event-recaps');
  });

  it('falls back to overall-event-recaps when no story signal hits and config has the catch-all', () => {
    const posts = [
      basePost({ postId: 'p-blank', text: 'Just here, no specific signal at all.' }),
    ];

    const result = buildStoryAssignedThemes('aie-2026', posts, customStoriesConfig);

    expect(result.posts[0].primaryStoryId).toBe('overall-event-recaps');
  });

  it('exposes the AIE 2026 stories via the event-config loader', async () => {
    const config = await loadEventConfig('aie-2026');
    expect(config).toBeDefined();
    expect(config?.stories.length).toBeGreaterThan(0);
    expect(config?.stories.find((s) => s.storyId === 'vivian-builder-keynote')).toBeDefined();
    expect(config?.stories.find((s) => s.storyId === 'openai-codex-presence')).toBeDefined();
    expect(config?.stories.find((s) => s.storyId === 'overall-event-recaps')).toBeDefined();
  });
});

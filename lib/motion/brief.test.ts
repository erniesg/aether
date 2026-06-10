import { describe, expect, it } from 'vitest';
import type { EventPost, EventTheme } from '@/lib/research/event-recap/types';
import { briefFromBrand, briefFromRecap } from './brief';

function makePost(overrides: Partial<EventPost> = {}): EventPost {
  return {
    postId: 'p1',
    eventId: 'evt-1',
    runId: 'r1',
    platform: 'x',
    url: 'https://x.com/a/status/1',
    authorName: 'Ada Lovelace',
    authorHandle: '@ada',
    text: 'The harness is the product. Everything else is plumbing.',
    capturedAt: 1,
    updatedAt: 1,
    metrics: {},
    reachScore: 10,
    tags: [],
    raw: {},
    ...overrides,
  };
}

function makeTheme(overrides: Partial<EventTheme> = {}): EventTheme {
  return {
    themeId: 'theme-1',
    eventId: 'evt-1',
    label: 'agents in production',
    summary: '',
    keywords: [],
    postIds: ['p1'],
    score: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('briefFromRecap', () => {
  it('builds quotes from the highest-reach posts with theme context', () => {
    const posts = [
      makePost({ postId: 'p1', reachScore: 5, text: 'Quote one is fine.' }),
      makePost({
        postId: 'p2',
        reachScore: 50,
        authorHandle: '@grace',
        text: 'Evals are the new tests. Ship them first.',
      }),
    ];
    const themes = [makeTheme({ postIds: ['p1', 'p2'] })];
    const brief = briefFromRecap(
      { eventName: 'AI Engineer 2026', themes, posts },
      { maxQuotes: 2 }
    );

    expect(brief.quotes).toHaveLength(2);
    // reach-ordered: p2 first
    expect(brief.quotes[0].who).toBe('@grace');
    expect(brief.quotes[0].text).toBe('Evals are the new tests.');
    expect(brief.quotes[0].ctx).toContain('agents in production');
    expect(brief.footerRight).toBe('AI Engineer 2026');
  });

  it('skips posts with no usable text and caps at maxQuotes', () => {
    const posts = [
      makePost({ postId: 'p1', text: '', reachScore: 99 }),
      makePost({ postId: 'p2', text: 'Real words here.', reachScore: 5 }),
      makePost({ postId: 'p3', text: 'More real words.', reachScore: 4 }),
      makePost({ postId: 'p4', text: 'Even more words.', reachScore: 3 }),
    ];
    const themes = [makeTheme({ postIds: ['p1', 'p2', 'p3', 'p4'] })];
    const brief = briefFromRecap(
      { eventName: 'AIE', themes, posts },
      { maxQuotes: 3 }
    );
    expect(brief.quotes).toHaveLength(3);
    expect(brief.quotes.every((q) => q.text.length > 0)).toBe(true);
  });

  it('truncates long post text to the first sentence', () => {
    const longText =
      'Agents will reshape every workflow we know today. ' +
      'And here is a second sentence that should not appear.';
    const posts = [makePost({ text: longText })];
    const themes = [makeTheme()];
    const brief = briefFromRecap({ eventName: 'AIE', themes, posts }, {});
    expect(brief.quotes[0].text).toBe(
      'Agents will reshape every workflow we know today.'
    );
  });
});

describe('briefFromBrand', () => {
  it('turns brand claims into quotes attributed to the brand', () => {
    const brief = briefFromBrand({
      name: 'Kopi Labs',
      voice: 'warm, direct',
      claims: ['Brewed in small batches.', 'Roasted in Singapore.'],
    });
    expect(brief.quotes).toHaveLength(2);
    expect(brief.quotes[0].who).toBe('Kopi Labs');
    expect(brief.quotes[0].text).toBe('Brewed in small batches.');
    expect(brief.footerRight).toBe('Kopi Labs');
  });
});

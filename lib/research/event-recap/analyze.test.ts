import { describe, expect, it } from 'vitest';
import { analyzePosts } from './analyze';
import type { EventPost } from './types';
import { scorePostsByPlatform } from './utils';

function post(input: Partial<EventPost> & Pick<EventPost, 'postId' | 'platform' | 'text'>): EventPost {
  return {
    eventId: 'ai-engineer-summit-singapore',
    runId: 'run_1',
    url: `https://example.com/${input.postId}`,
    authorName: input.authorName ?? input.postId,
    capturedAt: Date.now(),
    updatedAt: Date.now(),
    metrics: input.metrics ?? {},
    reachScore: input.reachScore ?? 0,
    tags: input.tags ?? [],
    raw: {},
    ...input,
  };
}

describe('event recap analysis', () => {
  it('clusters one X + LinkedIn + YouTube corpus and attaches context refs', () => {
    const posts = scorePostsByPlatform([
      post({
        postId: 'x_evals',
        platform: 'x',
        authorName: 'X Builder',
        authorHandle: 'xbuilder',
        text: 'AI Engineer Singapore takeaway: evals, latency, traces and agent reliability matter more than model demos.',
        metrics: { likes: 80, reposts: 20, views: 10000 },
      }),
      post({
        postId: 'li_evals',
        platform: 'linkedin',
        authorName: 'LinkedIn Builder',
        authorHandle: 'li-builder',
        text: 'Long recap from AI Engineer Singapore: product teams need owned evaluation datasets, observable workflows, and explicit provenance for AI systems.',
        metrics: { reactions: 140, comments: 24, impressions: 9000 },
      }),
      post({
        postId: 'yt_keynote',
        platform: 'youtube',
        authorName: 'AI Engineer',
        authorHandle: '@aiDotEngineer',
        text: 'AI Engineer Singapore Day 1 video recap: practical agents, eval loops, and Vivian Balakrishnan on building a personal AI agent.',
        metrics: { views: 20000, likes: 300, comments: 8 },
        media: [{ url: 'https://i.ytimg.com/vi/yt_keynote/hqdefault.jpg', type: 'image' }],
      }),
      post({
        postId: 'x_hiring',
        platform: 'x',
        authorName: 'Hiring Voice',
        text: 'Hiring signal: AI engineer roles are software engineering roles with evals, data pipelines and product judgment.',
        metrics: { likes: 20, reposts: 4, views: 2000 },
      }),
      post({
        postId: 'x_announcement',
        platform: 'x',
        authorName: 'Promo Voice',
        text: 'Join us at AI Engineer Singapore for a keynote and panel session. Register now.',
        metrics: { likes: 200, reposts: 60, views: 50000 },
      }),
      post({
        postId: 'li_comment',
        platform: 'linkedin',
        authorName: 'Commenter',
        text: 'This was useful context from the Singapore session.',
        tags: ['linkedin-comment'],
        metrics: { reactions: 5 },
      }),
      post({
        postId: 'x_reply',
        platform: 'x',
        authorName: 'Reply Voice',
        text: 'The Vivian keynote line about governing technology was the standout Singapore moment.',
        tags: ['x-reply', 'conversation:vivian'],
        metrics: { likes: 4 },
      }),
    ]);

    const result = analyzePosts('ai-engineer-summit-singapore', posts);

    expect(result.themes.length).toBeGreaterThan(0);
    expect(result.voices.map((voice) => voice.platform).sort()).toEqual([
      'linkedin',
      'x',
      'x',
      'x',
      'youtube',
    ]);

    const summaries = result.themes.map((theme) => theme.summary).join('\n');
    expect(summaries).toContain('https://example.com/');
    expect(result.themes.flatMap((theme) => theme.postIds)).toEqual(
      expect.arrayContaining([
        'x_evals',
        'li_evals',
        'yt_keynote',
        'x_announcement',
        'x_hiring',
        'li_comment',
        'x_reply',
      ])
    );
    expect(result.themes.flatMap((theme) => theme.rootPostIds ?? [])).toEqual(
      expect.arrayContaining(['x_evals', 'li_evals', 'yt_keynote', 'x_announcement', 'x_hiring'])
    );
    expect(result.themes.flatMap((theme) => theme.rootPostIds ?? [])).not.toContain('li_comment');
    expect(result.themes.flatMap((theme) => theme.attachedPostIds ?? [])).toEqual(
      expect.arrayContaining(['li_comment', 'x_reply'])
    );
  });
});

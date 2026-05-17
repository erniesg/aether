import { describe, expect, it } from 'vitest';
import { deriveExpansionPlan } from './expand';
import type { EventPost } from './types';
import { scorePostsByPlatform } from './utils';

function post(input: Partial<EventPost> & Pick<EventPost, 'postId' | 'platform' | 'text'>): EventPost {
  return {
    eventId: 'ai-engineer-summit-singapore',
    runId: 'run_1',
    url: `https://example.com/${input.postId}`,
    authorName: input.authorName ?? input.postId,
    capturedAt: Date.now(),
    metrics: input.metrics ?? {},
    reachScore: input.reachScore ?? 0,
    tags: input.tags ?? [],
    raw: {},
    ...input,
  };
}

describe('event recap expansion planning', () => {
  it('mines one mixed X + LinkedIn corpus for shared expansion anchors', () => {
    const posts = scorePostsByPlatform([
      post({
        postId: 'x_official',
        platform: 'x',
        authorName: 'AI Engineer',
        authorHandle: 'aiDotEngineer',
        text: '@aiDotEngineer Singapore recap with @SherryYanJiang, @agrimsingh and #AgenticAI.',
        metrics: { likes: 120, reposts: 30, views: 40000 },
      }),
      post({
        postId: 'li_speaker',
        platform: 'linkedin',
        authorName: 'Sherry Yan Jiang',
        authorHandle: 'sherryyanjiang',
        text: 'AI Engineer Summit Singapore notes on AgenticAI, Convex, evals and production workflows.',
        metrics: { reactions: 80, comments: 12, impressions: 9000 },
      }),
      post({
        postId: 'li_noise',
        platform: 'linkedin',
        authorName: 'Recruiter',
        text: 'Hiring AI Engineer in Singapore, apply now #Hiring #AIJobs #TechHiring.',
        metrics: { reactions: 5 },
        tags: ['hiring_noise'],
      }),
    ]);

    const plan = deriveExpansionPlan('AI Engineer Summit Singapore', posts, {
      baseQueries: ['AI Engineer Summit Singapore'],
      maxQueries: 8,
    });

    expect(plan.corpus.platforms).toEqual({ x: 1, linkedin: 2 });
    expect(plan.anchors[0].value).toBe('@aiDotEngineer');
    expect(plan.querySet).toContain('@aiDotEngineer Singapore');
    expect(plan.querySet.join('\n')).toMatch(/SherryYanJiang|Sherry Yan Jiang/i);
    expect(plan.anchors.some((anchor) => anchor.value === '#Hiring')).toBe(false);
    expect(plan.warnings.join('\n')).toContain('Filtered 1 hiring/candidate-noise');
  });

  it('keeps cross-platform hashtags as one conversation anchor', () => {
    const posts = scorePostsByPlatform([
      post({
        postId: 'x_agentic',
        platform: 'x',
        authorName: 'X Builder',
        text: 'AI Engineer Singapore hallway track was all #AgenticAI and evals.',
        metrics: { likes: 20 },
      }),
      post({
        postId: 'li_agentic',
        platform: 'linkedin',
        authorName: 'LinkedIn Builder',
        text: 'Long AI Engineer Singapore recap: #AgenticAI has moved into product engineering.',
        metrics: { reactions: 30 },
      }),
    ]);

    const plan = deriveExpansionPlan('AI Engineer Summit Singapore', posts, {
      maxQueries: 6,
    });
    const agentic = plan.anchors.find((anchor) => anchor.value === '#AgenticAI');

    expect(agentic?.platforms.sort()).toEqual(['linkedin', 'x']);
    expect(agentic?.query).toBe('#AgenticAI Singapore');
  });
});

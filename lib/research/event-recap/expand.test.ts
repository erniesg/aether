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
    updatedAt: Date.now(),
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

    expect(plan.corpus.platforms).toEqual({ x: 1, linkedin: 2, youtube: 0 });
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

  it('keeps generic product expansion queries scoped to the subject', () => {
    const posts = scorePostsByPlatform([
      post({
        postId: 'x_camera',
        platform: 'x',
        eventId: 'nothing-phone-launch',
        authorName: 'Phone Reviewer',
        authorHandle: 'phonereviewer',
        text: 'Nothing Phone launch samples are all about #ShotOnNothing and Creator Kit clips.',
        metrics: { likes: 30, reposts: 4, views: 5000 },
      }),
    ]);

    const plan = deriveExpansionPlan('Nothing Phone launch', posts, {
      maxAnchors: 10,
      maxQueries: 8,
    });
    const creatorKit = plan.anchors.find((anchor) => anchor.value === 'Creator Kit');

    expect(plan.querySet.join('\n')).not.toMatch(/AI Engineer/);
    expect(creatorKit?.query).toBe('Creator Kit "Nothing Phone launch"');
    expect(plan.anchors.find((anchor) => anchor.value === '#ShotOnNothing')?.query).toBe(
      '#ShotOnNothing "Nothing Phone launch"'
    );
  });

  it('mines corpus phrase clues from sampled posts into follow-on queries', () => {
    const posts = scorePostsByPlatform([
      post({
        postId: 'x_side_event',
        platform: 'x',
        authorName: 'Builder',
        text: 'Road to AIE had a packed AI Builders Meetup before AI Engineer Singapore.',
        metrics: { likes: 40, reposts: 8, views: 8000 },
      }),
      post({
        postId: 'li_codex',
        platform: 'linkedin',
        authorName: 'Attendee',
        text: 'Day two: Codex Booth demos, feel-the-AGI moments, and a Second Brain talk from Dr Vivian Balakrishnan.',
        metrics: { reactions: 35, comments: 4, impressions: 4000 },
      }),
    ]);

    const plan = deriveExpansionPlan('AI Engineer Singapore', posts, {
      maxAnchors: 16,
      maxQueries: 12,
    });

    expect(plan.anchors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'query',
          value: 'Road to AIE',
          query: '"Road to AIE" Singapore',
          sourceKind: 'corpus-discovered',
        }),
        expect.objectContaining({
          kind: 'query',
          value: 'Codex Booth',
          query: '"Codex Booth" "AI Engineer Singapore"',
        }),
        expect.objectContaining({
          kind: 'query',
          value: 'Second Brain',
          query: '"Second Brain" "AI Engineer Singapore"',
        }),
      ])
    );
    expect(plan.querySet).toEqual(expect.arrayContaining(['"Road to AIE" Singapore']));
  });

  it('does not promote noisy single-word titlecase fragments as entities', () => {
    const posts = scorePostsByPlatform([
      post({
        postId: 'li_excited',
        platform: 'linkedin',
        authorName: 'Attendee',
        text: 'Excited to see Rachael at AI Engineer Singapore and hear about Cursor.',
        metrics: { reactions: 10 },
      }),
    ]);

    const plan = deriveExpansionPlan('AI Engineer Singapore', posts, {
      maxAnchors: 20,
      maxQueries: 12,
    });

    expect(plan.anchors.some((anchor) => anchor.value === 'Excited')).toBe(false);
    expect(plan.anchors.some((anchor) => anchor.value === 'Rachael')).toBe(false);
    expect(plan.anchors.some((anchor) => anchor.value === 'Cursor')).toBe(true);
  });
});

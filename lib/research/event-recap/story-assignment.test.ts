import { describe, expect, it } from 'vitest';
import { buildStoryAssignedThemes } from './story-assignment';
import type { EventPost } from './types';
import { loadEventConfig } from './event-config';

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

const expectAieStory = (
  text: string,
  storyId: string,
  overrides: Partial<EventPost> = {}
) => {
  const posts = Array.from({ length: 8 }, (_, i) =>
    basePost({
      postId: `${storyId}-${i}`,
      text: `${text} ${i}`,
      ...overrides,
    })
  );

  const result = buildStoryAssignedThemes('aie-2026', posts);

  for (const post of posts) {
    expect(result.posts.find((p) => p.postId === post.postId)?.primaryStoryId).toBe(storyId);
  }
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

  it('keeps Ralphthon build evidence in the hackathon/build-week story', () => {
    const posts = Array.from({ length: 8 }, (_, i) =>
      basePost({
        postId: `p-ralphthon-${i}`,
        text: `RalphthonSG build-week recap: agent-coding demos, Ralph Loop projects, lobster rule jokes, prizes, and winners after AI Engineer Singapore. ${i}`,
      })
    );

    const result = buildStoryAssignedThemes('aie-2026', posts);

    for (const post of posts) {
      expect(result.posts.find((p) => p.postId === post.postId)?.primaryStoryId).toBe('hackathon-build-week');
    }
  });

  it('keeps ClawCon/OpenClaw side-event evidence out of sponsor and Vivian buckets', () => {
    const posts = Array.from({ length: 8 }, (_, i) =>
      basePost({
        postId: `p-clawcon-${i}`,
        text: `ClawCon Singapore brought OpenClaw builders to the Road to AIE side event at the AWS room near Jupiter HQ for personal AI demos. ${i}`,
      })
    );

    const result = buildStoryAssignedThemes('aie-2026', posts);

    for (const post of posts) {
      expect(result.posts.find((p) => p.postId === post.postId)?.primaryStoryId).toBe('clawcon-openclaw-side-event');
    }
    expect(result.themes.find((theme) => theme.storyId === 'sponsors-booths-hiring')).toBeUndefined();
    expect(result.themes.find((theme) => theme.storyId === 'vivian-builder-keynote')).toBeUndefined();
  });

  it('keeps workshop-first posts out of the livestream story when they only mention a future recording', () => {
    const posts = Array.from({ length: 8 }, (_, i) =>
      basePost({
        postId: `p-convex-workshop-${i}`,
        text: `Just gave a fun workshop for @aiDotEngineer Singapore. Great questions from the Convex curious. Hope to have a recording uploaded soon. ${i}`,
      })
    );

    const result = buildStoryAssignedThemes('aie-2026', posts);

    for (const post of posts) {
      expect(result.posts.find((p) => p.postId === post.postId)?.primaryStoryId).toBe('agentic-workshops');
    }
    expect(result.themes.find((theme) => theme.storyId === 'livestream-video-recordings')).toBeUndefined();
  });

  it('keeps actual livestream/watch refs in the livestream story', () => {
    const posts = Array.from({ length: 8 }, (_, i) =>
      basePost({
        postId: `p-livestream-${i}`,
        text: `Livestream for the last day of @aiDotEngineer Singapore is up now. Tune in live and watch the recording after the talks. ${i}`,
      })
    );

    const result = buildStoryAssignedThemes('aie-2026', posts);

    for (const post of posts) {
      expect(result.posts.find((p) => p.postId === post.postId)?.primaryStoryId).toBe('livestream-video-recordings');
    }
  });

  it('does not treat generic attendee builder language as ClawCon/OpenClaw evidence', () => {
    const posts = Array.from({ length: 8 }, (_, i) =>
      basePost({
        postId: `p-attendee-video-${i}`,
        platform: 'youtube',
        text: `I went to AI Engineer Singapore, met a bunch of inspiring builders, gave a little talk, and wish I had caught more talks. The speaker lineup was incredible and the robots were cool as heck. ${i}`,
      })
    );

    const result = buildStoryAssignedThemes('aie-2026', posts);

    for (const post of posts) {
      expect(result.posts.find((p) => p.postId === post.postId)?.primaryStoryId).toBe('overall-event-recaps');
    }
    expect(result.themes.find((theme) => theme.storyId === 'clawcon-openclaw-side-event')).toBeUndefined();
  });

  it('keeps AI Engineer Hackathon posts in hackathon/build-week even when they mention Road to AIE', () => {
    const posts = Array.from({ length: 8 }, (_, i) =>
      basePost({
        postId: `p-aie-hackathon-${i}`,
        text: `Over the weekend I participated in the AI Engineer Hackathon, hosted by the 65labs team as part of the Road to AI Engineer Singapore. We built a demo and shipped a project. ${i}`,
      })
    );

    const result = buildStoryAssignedThemes('aie-2026', posts);

    for (const post of posts) {
      expect(result.posts.find((p) => p.postId === post.postId)?.primaryStoryId).toBe('hackathon-build-week');
    }
    expect(result.themes.find((theme) => theme.storyId === 'side-events-meetups')).toBeUndefined();
  });

  it('keeps Ralphthon agent-coding recaps in hackathon/build-week instead of side-events', () => {
    const posts = Array.from({ length: 8 }, (_, i) =>
      basePost({
        postId: `p-ralphthon-agent-code-${i}`,
        text: `We co-hosted Ralphthon during AI Engineer Singapore weekend: agents code while humans network, lobster hat fixes, OpenAI API credits, and builders shipping demos. ${i}`,
      })
    );

    const result = buildStoryAssignedThemes('aie-2026', posts);

    for (const post of posts) {
      expect(result.posts.find((p) => p.postId === post.postId)?.primaryStoryId).toBe('hackathon-build-week');
    }
  });

  it('routes student-scholarship recaps with Vivian and Codex mentions to community', () => {
    expectAieStory(
      'Honoured to be one of the 20 students selected for a sponsored ticket to attend AI Engineer Singapore. Dr Vivian Balakrishnan was inspiring, Codex was useful, and I am grateful to 65labs for supporting student tickets.',
      'students-organizers-community'
    );
  });

  it('keeps broad organizer reflections with Vivian mentions out of the Vivian-only story', () => {
    expectAieStory(
      'My closing at AI Engineer Singapore had these words on it: you are the scene. A student asked a rare question, Dr Vivian Balakrishnan stayed longer than expected, sponsors showed up, and the volunteers who did not sleep made the room possible.',
      'students-organizers-community'
    );
  });

  it('does not treat a generic keynote mention as Vivian evidence', () => {
    expectAieStory(
      'Massively proud of my son Josh. He just stepped off stage after delivering an incredible keynote speech at the AI Engineer Conference in Singapore alongside bright AI speakers.',
      'overall-event-recaps'
    );
  });

  it('routes official day videos and uploaded talks to the livestream/video story', () => {
    expectAieStory(
      'YouTube video: AIE Singapore Day 1 ft. Minister, NanoClaw, OpenAI, Google, Vercel, Cursor and more',
      'livestream-video-recordings',
      { platform: 'youtube' }
    );
    expectAieStory(
      'My talk from AI Engineer Singapore is now up. Watch the recording from the event here.',
      'livestream-video-recordings'
    );
  });

  it('keeps production-agent live interview previews in the agentic workflow story', () => {
    expectAieStory(
      'Live from AI Engineer Singapore: the gap between test performance and real world agent deployment is bigger than most people think. We will explore context infrastructure, institutional knowledge, production deployment patterns, and where memory infrastructure is heading as the agent stack matures.',
      'agentic-workshops'
    );
  });

  it('separates robotics research talks from creative robot demos', () => {
    expectAieStory(
      'Speaking at AI Engineer Singapore on scaling evals for robotics and engineering sim-to-real for open source humanoids. The talk covers robot training data, robotics deployment, and robot foundation models.',
      'research-talks-model-systems'
    );
    expectAieStory(
      'Reachy mini rap battle at AI Engineer Singapore with Pollen Robotics, a creative AI performance and live robotic demo on the demo stage.',
      'stage-demos-creative-ai'
    );
  });

  it('routes CFP and ticket logistics to broad event recap instead of creative demos', () => {
    expectAieStory(
      'Speaker applications are now open for AI Engineer Singapore. CFP closes soon for applied software, design, and robotics talks. Early bird tickets are live.',
      'overall-event-recaps'
    );
  });
});

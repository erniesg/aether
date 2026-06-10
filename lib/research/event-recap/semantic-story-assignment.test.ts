import { describe, expect, it } from 'vitest';
import { buildSemanticStoryAssignment } from './semantic-story-assignment';

/* eslint-disable @typescript-eslint/no-explicit-any */
const baseRow = (overrides: Record<string, any>) => ({
  eventId: 'ai-engineer-singapore',
  runId: 'test',
  platform: 'linkedin',
  url: `https://example.com/${overrides.postId}`,
  authorName: 'Author',
  text: 'AI Engineer Singapore evidence post',
  capturedAt: 1,
  updatedAt: 1,
  metrics: {},
  reachScore: 0.5,
  tags: ['relevant:event'],
  rowType: 'parent',
  isClusterRoot: true,
  ...overrides,
});

describe('buildSemanticStoryAssignment', () => {
  const deployedThemes = [
    {
      themeId: 'story-overall-event-recaps',
      storyId: 'overall-event-recaps',
      label: 'Event recaps',
      summary: 'Broad recap material.',
      keywords: ['recap'],
      postIds: ['existing-recap'],
      rootPostIds: ['existing-recap'],
      attachedPostIds: [],
      score: 1,
    },
    {
      themeId: 'story-agentic-workshops',
      storyId: 'agentic-workshops',
      label: 'Workshops',
      summary: 'Workshop material.',
      keywords: ['workshop'],
      postIds: ['existing-workshop'],
      rootPostIds: ['existing-workshop'],
      attachedPostIds: [],
      score: 1,
    },
    {
      themeId: 'story-students-organizers-community',
      storyId: 'students-organizers-community',
      label: 'Community',
      summary: 'Community material.',
      keywords: ['community'],
      postIds: ['existing-community'],
      rootPostIds: ['existing-community'],
      attachedPostIds: [],
      score: 1,
    },
  ];

  it('preserves deployed roots and assigns only delta roots by semantic centroid', () => {
    const rows = [
      baseRow({ postId: 'existing-workshop', primaryStoryId: undefined }),
      baseRow({ postId: 'existing-community', primaryStoryId: undefined }),
      baseRow({ postId: 'delta-workshop', text: 'Hands-on agent workflow session and implementation notes.' }),
      baseRow({
        postId: 'delta-comment',
        rowType: 'comment',
        isClusterRoot: false,
        parentPostId: 'delta-workshop',
        rootPostId: 'delta-workshop',
        tags: ['relevant:event', 'comment'],
        text: 'Comment that should stay attached.',
      }),
    ];

    const result = buildSemanticStoryAssignment({
      eventId: 'ai-engineer-singapore',
      rows,
      deployedThemes,
      deployedPosts: [{ postId: 'existing-workshop', primaryStoryId: 'agentic-workshops', storyType: 'single_story' }],
      vectors: [
        { postId: 'existing-workshop', vector: [1, 0] },
        { postId: 'existing-community', vector: [0, 1] },
        { postId: 'delta-workshop', vector: [0.99, 0.01] },
      ],
      similarityThreshold: 0.2,
      ambiguousMargin: 0.02,
      generatedAt: 123,
    });

    expect(result.posts.find((post) => post.postId === 'existing-workshop')?.primaryStoryId).toBe('agentic-workshops');
    expect(result.posts.find((post) => post.postId === 'delta-workshop')?.primaryStoryId).toBe('agentic-workshops');
    expect(result.posts.find((post) => post.postId === 'delta-comment')?.primaryStoryId).toBe('agentic-workshops');
    expect(result.posts.find((post) => post.postId === 'delta-comment')?.storyType).toBe('context');
    expect(result.themes.find((theme) => theme.storyId === 'agentic-workshops')?.rootPostIds).toContain('delta-workshop');
    expect(result.themes.find((theme) => theme.storyId === 'agentic-workshops')?.rootPostIds).not.toContain('delta-comment');
    expect(result.stats.semanticDeltaRoots).toBe(1);
    expect(result.stats.deployedRootsPreserved).toBe(2);
  });

  it('falls low-similarity delta roots back to the broad recap for review', () => {
    const result = buildSemanticStoryAssignment({
      eventId: 'ai-engineer-singapore',
      rows: [
        baseRow({ postId: 'existing-workshop' }),
        baseRow({ postId: 'delta-unknown', text: 'A vague adjacent note without a clear story fit.' }),
      ],
      deployedThemes,
      deployedPosts: [],
      vectors: [
        { postId: 'existing-workshop', vector: [1, 0] },
        { postId: 'delta-unknown', vector: [-1, 0] },
      ],
      similarityThreshold: 0.2,
      generatedAt: 123,
    });

    expect(result.posts.find((post) => post.postId === 'delta-unknown')?.primaryStoryId).toBe('overall-event-recaps');
    expect(result.diagnostics.fallbackAssignments).toEqual(
      expect.arrayContaining([expect.objectContaining({ postId: 'delta-unknown' })])
    );
  });

  it('applies reviewed root, context, and exclusion decisions before building themes', () => {
    const result = buildSemanticStoryAssignment({
      eventId: 'ai-engineer-singapore',
      rows: [
        baseRow({ postId: 'existing-workshop' }),
        baseRow({ postId: 'delta-reassign' }),
        baseRow({ postId: 'delta-context' }),
        baseRow({ postId: 'delta-exclude' }),
      ],
      deployedThemes,
      deployedPosts: [],
      vectors: [
        { postId: 'existing-workshop', vector: [1, 0] },
        { postId: 'delta-reassign', vector: [1, 0] },
        { postId: 'delta-context', vector: [1, 0] },
        { postId: 'delta-exclude', vector: [1, 0] },
      ],
      decisions: [
        {
          postId: 'delta-reassign',
          storyId: 'students-organizers-community',
          rootFit: 'root',
          reason: 'Community gratitude is the better boundary.',
        },
        {
          postId: 'delta-context',
          storyId: 'agentic-workshops',
          rootFit: 'context',
          reason: 'Useful support, not a standalone root artifact.',
        },
        {
          postId: 'delta-exclude',
          rootFit: 'exclude',
          reason: 'Off-event adjacent material.',
        },
      ],
      generatedAt: 123,
    });

    expect(result.posts.find((post) => post.postId === 'delta-reassign')?.primaryStoryId).toBe(
      'students-organizers-community'
    );
    expect(result.themes.find((theme) => theme.storyId === 'students-organizers-community')?.rootPostIds).toContain(
      'delta-reassign'
    );
    expect(result.posts.find((post) => post.postId === 'delta-context')?.storyType).toBe('context');
    expect(result.themes.find((theme) => theme.storyId === 'agentic-workshops')?.rootPostIds).not.toContain(
      'delta-context'
    );
    expect(result.posts.find((post) => post.postId === 'delta-exclude')?.tags).toContain('irrelevant:event');
    expect(result.themes.some((theme) => theme.postIds.includes('delta-exclude'))).toBe(false);
  });

  it('excludes reviewed off-event Codex roots and attached rows from public stories', () => {
    const result = buildSemanticStoryAssignment({
      eventId: 'ai-engineer-singapore',
      rows: [
        baseRow({ postId: 'existing-workshop' }),
        baseRow({
          postId: 'linkedin_1nk0i10',
          text: 'Post-event OpenAI and Sea Regional Codex Hackathon announcement after AIE Singapore.',
        }),
        baseRow({
          postId: 'linkedin_db1c35ac5e9d',
          text: 'Off-region OpenAI Codex meetup in a different AI Engineer Conference context.',
        }),
        baseRow({
          postId: 'linkedin_db1c35ac5e9d_comment',
          rowType: 'comment',
          isClusterRoot: false,
          parentPostId: 'linkedin_db1c35ac5e9d',
          rootPostId: 'linkedin_db1c35ac5e9d',
          tags: ['relevant:event', 'linkedin-comment'],
          text: 'Attached comment that should not survive its excluded parent.',
        }),
      ],
      deployedThemes,
      deployedPosts: [],
      vectors: [
        { postId: 'existing-workshop', vector: [1, 0] },
        { postId: 'linkedin_1nk0i10', vector: [0.95, 0.05] },
        { postId: 'linkedin_db1c35ac5e9d', vector: [0.9, 0.1] },
      ],
      decisions: [
        {
          postId: 'linkedin_1nk0i10',
          rootFit: 'exclude',
          reason: 'Adjacent post-event Codex hackathon announcement.',
        },
        {
          postId: 'linkedin_db1c35ac5e9d',
          rootFit: 'exclude',
          reason: 'Off-region Codex meetup context.',
        },
      ],
      generatedAt: 123,
    });

    for (const postId of ['linkedin_1nk0i10', 'linkedin_db1c35ac5e9d', 'linkedin_db1c35ac5e9d_comment']) {
      const post = result.posts.find((candidate) => candidate.postId === postId);
      expect(post?.semanticPublicExcluded).toBe(true);
      expect(post?.tags).toContain('irrelevant:event');
      expect(result.themes.some((theme) => theme.postIds.includes(postId))).toBe(false);
    }
    expect(result.stats.totalRefs).toBe(1);
    expect(result.stats.rootRefs).toBe(1);
    expect(result.stats.attachedRefs).toBe(0);
  });
});

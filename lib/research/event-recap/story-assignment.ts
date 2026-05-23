import type { EventPost, EventPostStoryType, EventStoryMention, EventTheme } from './types';
import { engagement, shortExcerpt } from './utils';
import type {
  PrimaryStoryOverride,
  StoryAssignmentConfig,
  StoryDefinitionConfig,
} from './event-config';
import aie2026Config from './fixtures/aie-2026.config';

/**
 * @deprecated Re-exported from event-config.ts for legacy callers. New code
 *   should import StoryDefinitionConfig directly.
 */
export type StoryDefinition = StoryDefinitionConfig;

export type StoryAssignmentResult = {
  posts: EventPost[];
  themes: EventTheme[];
  stats: {
    totalRefs: number;
    rootRefs: number;
    attachedRefs: number;
    multiMentionRefs: number;
    broadRecapRefs: number;
  };
};

const DEFAULT_CONFIG: StoryAssignmentConfig = {
  stories: aie2026Config.stories,
  smallStoryMergeTargets: aie2026Config.smallStoryMergeTargets,
  primaryStoryOverrides: aie2026Config.primaryStoryOverrides,
};

const FALLBACK_STORY_ID = 'overall-event-recaps';

/**
 * Assign each post to a story using the supplied config. When no config is
 * provided, defaults to the AIE 2026 fixture for backwards compatibility.
 *
 * The config controls:
 *  - stories[] — signal patterns + weights per story
 *  - smallStoryMergeTargets — small-story merge map
 *  - primaryStoryOverrides — hard rules that beat weight summation
 *
 * Other event-recap behaviors (broad-recap detection, story-type inference
 * for replies/context, evidence selection) remain shared across all events.
 */
export function buildStoryAssignedThemes(
  eventId: string,
  posts: EventPost[],
  config: StoryAssignmentConfig = DEFAULT_CONFIG
): StoryAssignmentResult {
  const ctx = buildContext(config);
  let assignedPosts = posts.map((post) => assignPostStories(post, ctx));
  const grouped = new Map<string, EventPost[]>();

  for (const post of assignedPosts) {
    const storyId = post.primaryStoryId ?? FALLBACK_STORY_ID;
    const group = grouped.get(storyId) ?? [];
    group.push(post);
    grouped.set(storyId, group);
  }

  const smallStoryIds = new Set<string>();
  for (const [storyId, group] of grouped) {
    const rootCount = group.filter(isRootPost).length;
    if (storyId !== FALLBACK_STORY_ID && group.length < 8 && rootCount < 6) {
      smallStoryIds.add(storyId);
    }
  }

  if (smallStoryIds.size) {
    const reassignedById = new Map<string, EventPost>();
    for (const storyId of smallStoryIds) {
      const targetStoryId = ctx.mergeTargets.get(storyId) ?? FALLBACK_STORY_ID;
      const target = grouped.get(targetStoryId) ?? [];
      const group = grouped.get(storyId) ?? [];
      const reassigned = group.map((post) => reassignPost(post, targetStoryId, 'secondary', ctx));
      target.push(...reassigned);
      for (const post of reassigned) {
        reassignedById.set(post.postId, post);
      }
      grouped.delete(storyId);
      grouped.set(targetStoryId, target);
    }
    assignedPosts = assignedPosts.map((post) => reassignedById.get(post.postId) ?? post);
  }

  const themes = Array.from(grouped.entries())
    .map(([storyId, group]) => toStoryTheme(eventId, storyId, group, ctx))
    .filter((theme): theme is EventTheme => Boolean(theme))
    .sort((a, b) => b.postIds.length - a.postIds.length || b.score - a.score);

  const rootIds = new Set(themes.flatMap((theme) => theme.rootPostIds ?? []));
  const attachedIds = new Set(themes.flatMap((theme) => theme.attachedPostIds ?? []));
  return {
    posts: assignedPosts,
    themes,
    stats: {
      totalRefs: assignedPosts.length,
      rootRefs: rootIds.size,
      attachedRefs: attachedIds.size,
      multiMentionRefs: assignedPosts.filter((post) => (post.storyMentions?.length ?? 0) > 1).length,
      broadRecapRefs: assignedPosts.filter((post) => post.storyType === 'broad_recap').length,
    },
  };
}

interface AssignmentContext {
  stories: StoryDefinitionConfig[];
  storyById: Map<string, StoryDefinitionConfig>;
  mergeTargets: Map<string, string>;
  primaryStoryOverrides: PrimaryStoryOverride[];
}

function buildContext(config: StoryAssignmentConfig): AssignmentContext {
  return {
    stories: config.stories,
    storyById: new Map(config.stories.map((story) => [story.storyId, story])),
    mergeTargets: new Map(Object.entries(config.smallStoryMergeTargets ?? {})),
    primaryStoryOverrides: config.primaryStoryOverrides ?? [],
  };
}

function assignPostStories(post: EventPost, ctx: AssignmentContext): EventPost {
  const scores = scoreStories(post, ctx);
  const mentions = scores
    .filter((item) => item.score >= 3)
    .map((item, index) => toMention(item.story, item.score, index === 0 ? 'primary' : 'secondary'));

  const broad = isBroadRecap(post, mentions);
  const primaryStoryId =
    applyPrimaryStoryOverride(post, ctx) ?? choosePrimaryStory(scores, mentions, broad);
  const primaryStory = ctx.storyById.get(primaryStoryId) ?? ctx.storyById.get(FALLBACK_STORY_ID);
  if (!primaryStory) {
    return post;
  }
  const primaryMention = toMention(
    primaryStory,
    scores.find((item) => item.story.storyId === primaryStoryId)?.score ?? 3,
    'primary'
  );
  const finalMentions = uniqueMentions([
    primaryMention,
    ...mentions
      .filter((mention) => mention.storyId !== primaryStoryId)
      .map((mention) => ({ ...mention, role: 'secondary' as const })),
  ]).slice(0, 5);
  const storyType = inferStoryType(post, primaryStoryId, broad, ctx);
  const tags = [
    ...(post.tags ?? []).filter((tag) => !tag.startsWith('story:') && !tag.startsWith('story-type:')),
    `story:${primaryStoryId}`,
    `story-type:${storyType}`,
  ];

  return {
    ...post,
    storyType,
    primaryStoryId,
    storyMentions: finalMentions,
    tags,
  };
}

function applyPrimaryStoryOverride(post: EventPost, ctx: AssignmentContext): string | undefined {
  const text = storyText(post);
  for (const rule of ctx.primaryStoryOverrides) {
    if (!rule.pattern.test(text)) continue;
    if (rule.subPattern && rule.subStoryId && rule.subPattern.test(text)) {
      return rule.subStoryId;
    }
    return rule.storyId;
  }
  return undefined;
}

function scoreStories(
  post: EventPost,
  ctx: AssignmentContext
): Array<{ story: StoryDefinitionConfig; score: number }> {
  const text = storyText(post);
  return ctx.stories
    .map((story) => ({
      story,
      score: story.signals.reduce((sum, signal) => sum + (signal.pattern.test(text) ? signal.weight : 0), 0),
    }))
    .sort((a, b) => b.score - a.score);
}

function choosePrimaryStory(
  scores: Array<{ story: StoryDefinitionConfig; score: number }>,
  mentions: EventStoryMention[],
  broad: boolean
): string {
  const top = scores[0];
  const second = scores[1];
  if (!top || top.score < 3) return FALLBACK_STORY_ID;
  if (top.story.storyId !== FALLBACK_STORY_ID && (top.score >= 8 || top.score >= (second?.score ?? 0) + 3)) {
    return top.story.storyId;
  }
  if (
    broad &&
    mentions.length >= 3 &&
    top.story.storyId !== FALLBACK_STORY_ID &&
    top.score < Math.max(10, (second?.score ?? 0) * 1.45)
  ) {
    return FALLBACK_STORY_ID;
  }
  return top.story.storyId;
}

function isBroadRecap(post: EventPost, mentions: EventStoryMention[]): boolean {
  const text = storyText(post);
  const longPost = text.length > 900;
  const listLike =
    /\b(favourite talks?|favorite talks?|highlights?|takeaways?|sessions? that stuck|talks i enjoyed|things that stuck|past three days|still buzzing|day [123]|full weekend)\b/i.test(
      text
    ) || /\b(1\.|2\.|3\.|4\.|5\.)\s+\w+/i.test(text);
  return (longPost && mentions.length >= 4) || (listLike && mentions.length >= 3);
}

function inferStoryType(
  post: EventPost,
  primaryStoryId: string,
  broad: boolean,
  ctx: AssignmentContext
): EventPostStoryType {
  const tags = (post.tags ?? []).map((tag) => tag.toLowerCase());
  if (tags.includes('context:event') || isReplyPost(post)) return 'context';
  if (broad || primaryStoryId === FALLBACK_STORY_ID) return 'broad_recap';
  const configured = ctx.storyById.get(primaryStoryId)?.storyType;
  if (configured) return configured;
  return 'single_story';
}

function toStoryTheme(
  eventId: string,
  storyId: string,
  posts: EventPost[],
  ctx: AssignmentContext
): EventTheme | undefined {
  const story = ctx.storyById.get(storyId);
  if (!story || !posts.length) return undefined;
  const sorted = [...posts].sort((a, b) => b.reachScore - a.reachScore || postTime(b) - postTime(a));
  const rootPostIds = sorted.filter(isRootPost).map((post) => post.postId);
  const attachedPostIds = sorted.filter((post) => !isRootPost(post)).map((post) => post.postId);
  const postIds = [...rootPostIds, ...attachedPostIds];
  const score = sorted.reduce((sum, post) => sum + storyPostScore(post), 0);
  return {
    themeId: `story-${story.storyId}`,
    eventId,
    storyId: story.storyId,
    storyType: 'story_assignment',
    label: story.label,
    summary: story.summary,
    keywords: story.keywords,
    postIds,
    rootPostIds,
    attachedPostIds,
    score: Number(score.toFixed(3)),
    updatedAt: Date.now(),
  };
}

function reassignPost(
  post: EventPost,
  storyId: string,
  role: EventStoryMention['role'],
  ctx: AssignmentContext
): EventPost {
  const story = ctx.storyById.get(storyId);
  if (!story) return post;
  const mentions = uniqueMentions([toMention(story, 3, role), ...(post.storyMentions ?? [])]);
  const storyType: EventPostStoryType =
    storyId === FALLBACK_STORY_ID ? 'broad_recap' : post.storyType ?? 'single_story';
  const tags = [
    ...(post.tags ?? []).filter((tag) => !tag.startsWith('story:') && !tag.startsWith('story-type:')),
    `story:${storyId}`,
    `story-type:${storyType}`,
  ];
  return {
    ...post,
    primaryStoryId: storyId,
    storyType,
    storyMentions: mentions,
    tags,
  };
}

function toMention(
  story: StoryDefinitionConfig,
  score: number,
  role: EventStoryMention['role']
): EventStoryMention {
  return {
    storyId: story.storyId,
    label: story.label,
    role,
    confidence: Math.max(0.35, Math.min(0.98, Number((score / 14).toFixed(2)))),
  };
}

function uniqueMentions(mentions: EventStoryMention[]): EventStoryMention[] {
  const byId = new Map<string, EventStoryMention>();
  for (const mention of mentions) {
    const current = byId.get(mention.storyId);
    if (!current || mention.role === 'primary' || mention.confidence > current.confidence) {
      byId.set(mention.storyId, mention);
    }
  }
  return Array.from(byId.values()).sort((a, b) => {
    if (a.role !== b.role) return a.role === 'primary' ? -1 : 1;
    return b.confidence - a.confidence;
  });
}

function storyPostScore(post: EventPost): number {
  return 1 + Math.log1p(engagement(post.metrics)) + Math.log1p(post.metrics.views ?? post.metrics.impressions ?? 0) / 4;
}

function isRootPost(post: EventPost): boolean {
  return !isReplyPost(post) && !(post.tags ?? []).some((tag) => tag.toLowerCase() === 'context:event');
}

function isReplyPost(post: EventPost): boolean {
  const tags = (post.tags ?? []).map((tag) => tag.toLowerCase());
  return (
    tags.includes('x-reply') ||
    tags.includes('linkedin-comment') ||
    tags.includes('youtube-comment') ||
    tags.includes('comment') ||
    post.url.includes('#comment-') ||
    (post.platform === 'youtube' && post.url.includes('&lc='))
  );
}

function storyText(post: EventPost): string {
  const stableTags = (post.tags ?? []).filter((tag) => !tag.startsWith('story:') && !tag.startsWith('story-type:'));
  return `${post.text} ${post.authorName} ${post.authorHandle ?? ''} ${stableTags.join(' ')} ${shortExcerpt(
    post.text,
    240
  )}`.toLowerCase();
}

function postTime(post: EventPost): number {
  return new Date(post.postedAt ?? post.capturedAt ?? 0).getTime() || 0;
}

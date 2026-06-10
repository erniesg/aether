import type { EventPostStoryType } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyRecord = Record<string, any>;

export interface SemanticStoryVector {
  postId: string;
  vector: number[];
}

export interface SemanticStoryDecision {
  postId: string;
  storyId?: string;
  rootFit: 'root' | 'context' | 'exclude';
  reason: string;
}

export interface SemanticStoryAssignmentOptions {
  eventId: string;
  rows: AnyRecord[];
  deployedThemes: AnyRecord[];
  deployedPosts: AnyRecord[];
  vectors: SemanticStoryVector[];
  decisions?: SemanticStoryDecision[];
  fallbackStoryId?: string;
  similarityThreshold?: number;
  ambiguousMargin?: number;
  generatedAt?: number;
}

export interface SemanticStoryAssignmentResult {
  posts: AnyRecord[];
  themes: AnyRecord[];
  stats: {
    totalRefs: number;
    rootRefs: number;
    attachedRefs: number;
    deployedRootsPreserved: number;
    semanticDeltaRoots: number;
    fallbackDeltaRoots: number;
    ambiguousDeltaRoots: number;
    multiMentionRefs: number;
  };
  diagnostics: {
    assignmentMethod: string;
    similarityThreshold: number;
    ambiguousMargin: number;
    storyCentroids: Array<{
      storyId: string;
      themeId: string;
      label: string;
      rootRefs: number;
      centroidSourceRefs: number;
    }>;
    ambiguousAssignments: Array<{
      postId: string;
      url?: string;
      assignedStoryId: string;
      assignedScore: number;
      runnerUpStoryId?: string;
      runnerUpScore?: number;
    }>;
    fallbackAssignments: Array<{
      postId: string;
      url?: string;
      reason: string;
    }>;
  };
}

const DEFAULT_FALLBACK_STORY_ID = 'overall-event-recaps';
const DEFAULT_SIMILARITY_THRESHOLD = 0.2;
const DEFAULT_AMBIGUOUS_MARGIN = 0.035;

function uniqueStrings(values: unknown[]): string[] {
  return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0)));
}

function storyIdForTheme(theme: AnyRecord): string {
  const explicit = theme.storyId;
  if (typeof explicit === 'string' && explicit) return explicit;
  return String(theme.themeId ?? '').replace(/^story-/, '');
}

function themeIdForStory(storyId: string): string {
  return storyId.startsWith('story-') ? storyId : `story-${storyId}`;
}

function isReplyOrComment(row: AnyRecord): boolean {
  const tags = (row.tags ?? []).map((tag: string) => tag.toLowerCase());
  return (
    row.rowType === 'reply' ||
    row.rowType === 'comment' ||
    tags.includes('reply') ||
    tags.includes('comment') ||
    tags.includes('x-reply') ||
    tags.includes('linkedin-comment') ||
    tags.includes('youtube-comment')
  );
}

function isRootRow(row: AnyRecord): boolean {
  return row.rowType === 'parent' && row.isClusterRoot !== false && !row.contentDuplicateOf;
}

function postTime(row: AnyRecord): number {
  const value = row.postedAt ?? row.capturedAt ?? row.updatedAt;
  const time = typeof value === 'number' ? value : Date.parse(String(value ?? ''));
  return Number.isFinite(time) ? time : 0;
}

function storyPostScore(row: AnyRecord): number {
  const metrics = row.metrics ?? {};
  const engagement =
    Number(metrics.likes ?? 0) +
    Number(metrics.reposts ?? 0) * 2 +
    Number(metrics.replies ?? metrics.comments ?? 0) +
    Number(metrics.reactions ?? 0);
  return Number(row.reachScore ?? 0) + Math.log1p(Math.max(0, engagement)) / 100;
}

function dotVector(a: number[], b: number[]): number {
  let sum = 0;
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) sum += (a[index] ?? 0) * (b[index] ?? 0);
  return sum;
}

function normalizedMean(vectors: number[][]): number[] {
  const dims = vectors[0]?.length ?? 0;
  const mean = Array.from({ length: dims }, () => 0);
  for (const vector of vectors) {
    for (let index = 0; index < dims; index += 1) mean[index] += vector[index] ?? 0;
  }
  const norm = Math.sqrt(mean.reduce((sum, value) => sum + value * value, 0)) || 1;
  return mean.map((value) => value / norm);
}

function confidenceFromSimilarity(score: number): number {
  return Number(Math.max(0, Math.min(0.99, 0.5 + score / 2)).toFixed(4));
}

function storyTypeFor(row: AnyRecord, storyId: string, existing?: AnyRecord): EventPostStoryType {
  const tags = (row.tags ?? []).map((tag: string) => tag.toLowerCase());
  if (isReplyOrComment(row) || tags.includes('context:event') || row.isClusterRoot === false) return 'context';
  if (existing?.storyType) return existing.storyType as EventPostStoryType;
  if (storyId === DEFAULT_FALLBACK_STORY_ID) return 'broad_recap';
  if (/side-events?|meetups?/.test(storyId)) return 'side_event';
  if (/sponsors?|booths?|hiring/.test(storyId)) return 'sponsor';
  return 'single_story';
}

function addStoryTags(tags: string[] = [], storyId: string, storyType: string): string[] {
  const kept = tags.filter((tag) => !tag.startsWith('story:') && !tag.startsWith('story-type:'));
  return uniqueStrings([...kept, `story:${storyId}`, `story-type:${storyType}`]);
}

function addTag(tags: string[], tag: string): string[] {
  return tags.some((existing) => existing.toLowerCase() === tag.toLowerCase()) ? tags : [...tags, tag];
}

function removeRelevantTags(tags: string[] = []): string[] {
  return tags.filter((tag) => !['relevant:event', 'relevance:core', 'relevance:context'].includes(tag.toLowerCase()));
}

function rowWithStory(row: AnyRecord, storyId: string, mentions: AnyRecord[], existing?: AnyRecord): AnyRecord {
  const storyType = storyTypeFor(row, storyId, existing);
  return {
    ...row,
    primaryStoryId: storyId,
    storyMentions: mentions,
    storyType,
    tags: addStoryTags(row.tags ?? [], storyId, storyType),
  };
}

function rowExcludedFromPublic(row: AnyRecord, reason: string): AnyRecord {
  return {
    ...row,
    semanticPublicExcluded: true,
    semanticReviewReason: reason,
    isClusterRoot: false,
    primaryStoryId: undefined,
    storyMentions: [],
    storyType: 'context',
    tags: addTag(removeRelevantTags(row.tags ?? []), 'irrelevant:event'),
  };
}

export function buildSemanticStoryAssignment(options: SemanticStoryAssignmentOptions): SemanticStoryAssignmentResult {
  const fallbackStoryId = options.fallbackStoryId ?? DEFAULT_FALLBACK_STORY_ID;
  const similarityThreshold = options.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;
  const ambiguousMargin = options.ambiguousMargin ?? DEFAULT_AMBIGUOUS_MARGIN;
  const generatedAt = options.generatedAt ?? Date.now();
  const vectorsByPostId = new Map(options.vectors.map((item) => [item.postId, item.vector]));
  const deployedPostsById = new Map(options.deployedPosts.map((post) => [String(post.postId), post]));
  const decisionByPostId = new Map((options.decisions ?? []).map((decision) => [decision.postId, decision]));
  const deployedStoryByPostId = new Map<string, string>();
  const storyThemeById = new Map<string, AnyRecord>();
  const rootStoryByPostId = new Map<string, string>();

  for (const theme of options.deployedThemes) {
    const storyId = storyIdForTheme(theme);
    storyThemeById.set(storyId, theme);
    for (const postId of uniqueStrings([...(theme.rootPostIds ?? []), ...(theme.postIds ?? [])])) {
      deployedStoryByPostId.set(postId, storyId);
    }
    for (const postId of uniqueStrings(theme.rootPostIds ?? [])) {
      rootStoryByPostId.set(postId, storyId);
    }
  }

  for (const post of options.deployedPosts) {
    if (typeof post.primaryStoryId === 'string' && post.primaryStoryId) {
      deployedStoryByPostId.set(String(post.postId), post.primaryStoryId);
    }
  }

  const centroids = options.deployedThemes
    .map((theme) => {
      const storyId = storyIdForTheme(theme);
      const rootPostIds = uniqueStrings(theme.rootPostIds?.length ? theme.rootPostIds : theme.postIds ?? []);
      const sourceVectors = rootPostIds.map((postId) => vectorsByPostId.get(postId)).filter((vector): vector is number[] => Boolean(vector));
      return {
        storyId,
        themeId: String(theme.themeId ?? themeIdForStory(storyId)),
        label: String(theme.label ?? storyId),
        keywords: theme.keywords ?? [],
        rootRefs: rootPostIds.length,
        centroidSourceRefs: sourceVectors.length,
        centroid: sourceVectors.length ? normalizedMean(sourceVectors) : undefined,
      };
    })
    .filter((item): item is typeof item & { centroid: number[] } => Boolean(item.centroid));

  const ambiguousAssignments: SemanticStoryAssignmentResult['diagnostics']['ambiguousAssignments'] = [];
  const fallbackAssignments: SemanticStoryAssignmentResult['diagnostics']['fallbackAssignments'] = [];
  const assignedRootStory = new Map<string, string>();
  const excludedRootIds = new Set<string>();
  let deployedRootsPreserved = 0;
  let semanticDeltaRoots = 0;
  let fallbackDeltaRoots = 0;
  let ambiguousDeltaRoots = 0;

  const assignedRoots = options.rows.map((row) => {
    if (!isRootRow(row)) return row;
    const postId = String(row.postId);
    const existing = deployedPostsById.get(postId);
    const decision = decisionByPostId.get(postId);
    const deployedStoryId = deployedStoryByPostId.get(postId);
    const vector = vectorsByPostId.get(postId);

    if (decision?.rootFit === 'exclude') {
      excludedRootIds.add(postId);
      return rowExcludedFromPublic(row, decision.reason);
    }

    if (decision?.storyId && storyThemeById.has(decision.storyId)) {
      const reviewedRow =
        decision.rootFit === 'context'
          ? {
              ...row,
              isClusterRoot: false,
              tags: addTag(row.tags ?? [], 'context:event'),
            }
          : row;
      const reviewedStoryId = decision.storyId;
      const theme = storyThemeById.get(reviewedStoryId);
      assignedRootStory.set(postId, reviewedStoryId);
      return rowWithStory(reviewedRow, reviewedStoryId, [
        {
          storyId: reviewedStoryId,
          label: String(theme?.label ?? reviewedStoryId),
          role: 'primary',
          confidence: 0.99,
          evidence: `Human/LLM review decision: ${decision.reason}`,
        },
      ], existing);
    }

    if (deployedStoryId && storyThemeById.has(deployedStoryId)) {
      deployedRootsPreserved += 1;
      assignedRootStory.set(postId, deployedStoryId);
      const theme = storyThemeById.get(deployedStoryId);
      return rowWithStory(row, deployedStoryId, [
        {
          storyId: deployedStoryId,
          label: String(theme?.label ?? deployedStoryId),
          role: 'primary',
          confidence: 0.98,
          evidence: 'Preserved from deployed recap scaffold.',
        },
      ], existing);
    }

    if (!vector || !centroids.length) {
      fallbackDeltaRoots += 1;
      fallbackAssignments.push({
        postId,
        url: row.url,
        reason: !vector ? 'No embedding vector available for root post.' : 'No deployed story centroid available.',
      });
      assignedRootStory.set(postId, fallbackStoryId);
      const theme = storyThemeById.get(fallbackStoryId);
      return rowWithStory(row, fallbackStoryId, [
        {
          storyId: fallbackStoryId,
          label: String(theme?.label ?? fallbackStoryId),
          role: 'primary',
          confidence: 0.5,
          evidence: 'Fell back to overall recap because semantic assignment was unavailable.',
        },
      ], existing);
    }

    const ranked = centroids
      .map((theme) => ({ theme, score: dotVector(vector, theme.centroid) }))
      .sort((a, b) => b.score - a.score || a.theme.storyId.localeCompare(b.theme.storyId));
    const best = ranked[0];
    const runnerUp = ranked[1];
    const assignedStoryId = best && best.score >= similarityThreshold ? best.theme.storyId : fallbackStoryId;
    const primaryTheme = storyThemeById.get(assignedStoryId);
    const ambiguous = Boolean(best && runnerUp && best.score - runnerUp.score < ambiguousMargin);

    if (assignedStoryId === fallbackStoryId && best?.theme.storyId !== fallbackStoryId) {
      fallbackDeltaRoots += 1;
      fallbackAssignments.push({
        postId,
        url: row.url,
        reason: `Best semantic story ${best?.theme.storyId ?? 'none'} scored below threshold.`,
      });
    } else {
      semanticDeltaRoots += 1;
    }

    if (ambiguous && best && runnerUp) {
      ambiguousDeltaRoots += 1;
      ambiguousAssignments.push({
        postId,
        url: row.url,
        assignedStoryId,
        assignedScore: Number(best.score.toFixed(4)),
        runnerUpStoryId: runnerUp.theme.storyId,
        runnerUpScore: Number(runnerUp.score.toFixed(4)),
      });
    }

    assignedRootStory.set(postId, assignedStoryId);
    const mentions = ranked
      .filter((item, index) => index === 0 || item.score >= Math.max(similarityThreshold, (best?.score ?? 0) - 0.08))
      .slice(0, 5)
      .map((item, index) => ({
        storyId: item.theme.storyId,
        label: item.theme.label,
        role: index === 0 ? 'primary' : 'secondary',
        confidence: confidenceFromSimilarity(item.score),
        evidence: `Semantic similarity ${item.score.toFixed(4)} to deployed story centroid.`,
      }));
    if (!mentions.some((mention) => mention.storyId === assignedStoryId)) {
      mentions.unshift({
        storyId: assignedStoryId,
        label: String(primaryTheme?.label ?? assignedStoryId),
        role: 'primary',
        confidence: 0.5,
        evidence: 'Fallback assignment.',
      });
    }
    return rowWithStory(row, assignedStoryId, mentions.map((mention, index) => ({
      ...mention,
      role: index === 0 ? 'primary' : 'secondary',
    })), existing);
  });

  const assignedById = new Map(assignedRoots.map((row) => [String(row.postId), row]));
  const assignedPosts = assignedRoots.map((row) => {
    if (row.semanticPublicExcluded) return row;
    if (isRootRow(row)) return row;
    const postId = String(row.postId);
    const existing = deployedPostsById.get(postId);
    const parentPostId = typeof row.parentPostId === 'string' ? row.parentPostId : undefined;
    const rootPostId = typeof row.rootPostId === 'string' ? row.rootPostId : undefined;
    const attachedToExcludedRoot =
      (parentPostId ? excludedRootIds.has(parentPostId) || assignedById.get(parentPostId)?.semanticPublicExcluded : false) ||
      (rootPostId ? excludedRootIds.has(rootPostId) || assignedById.get(rootPostId)?.semanticPublicExcluded : false);
    if (attachedToExcludedRoot) {
      return rowExcludedFromPublic(row, 'Parent/root post was excluded from public recap evidence.');
    }
    const parentStoryId =
      (parentPostId ? assignedRootStory.get(parentPostId) : undefined) ??
      (rootPostId ? assignedRootStory.get(rootPostId) : undefined) ??
      (parentPostId ? assignedById.get(parentPostId)?.primaryStoryId : undefined) ??
      deployedStoryByPostId.get(postId) ??
      fallbackStoryId;
    const theme = storyThemeById.get(parentStoryId);
    return rowWithStory(row, parentStoryId, [
      {
        storyId: parentStoryId,
        label: String(theme?.label ?? parentStoryId),
        role: 'primary',
        confidence: existing ? 0.9 : 0.7,
        evidence: 'Attached to the semantic story of its parent/root post.',
      },
    ], existing);
  });

  const postsByStory = new Map<string, AnyRecord[]>();
  for (const post of assignedPosts) {
    if (post.semanticPublicExcluded) continue;
    const storyId = String(post.primaryStoryId ?? fallbackStoryId);
    const group = postsByStory.get(storyId) ?? [];
    group.push(post);
    postsByStory.set(storyId, group);
  }

  const themes = options.deployedThemes.reduce<AnyRecord[]>((acc, theme) => {
    const storyId = storyIdForTheme(theme);
    const posts = postsByStory.get(storyId) ?? [];
    if (!posts.length) return acc;
    const sorted = [...posts].sort((a, b) => storyPostScore(b) - storyPostScore(a) || postTime(b) - postTime(a));
    const rootPostIds = sorted.filter(isRootRow).map((post) => post.postId);
    const attachedPostIds = sorted.filter((post) => !isRootRow(post)).map((post) => post.postId);
    acc.push({
      ...theme,
      eventId: options.eventId,
      storyId,
      themeId: String(theme.themeId ?? themeIdForStory(storyId)),
      storyType: 'story_assignment',
      assignmentMethod: 'semantic_delta_to_deployed_story_centroid',
      postIds: [...rootPostIds, ...attachedPostIds],
      rootPostIds,
      attachedPostIds,
      score: sorted.reduce((sum, post) => sum + storyPostScore(post), 0),
      updatedAt: generatedAt,
    });
    return acc;
  }, []);

  const publicAssignedPosts = assignedPosts.filter((post) => !post.semanticPublicExcluded);

  return {
    posts: assignedPosts,
    themes,
    stats: {
      totalRefs: publicAssignedPosts.length,
      rootRefs: publicAssignedPosts.filter(isRootRow).length,
      attachedRefs: publicAssignedPosts.filter((post) => !isRootRow(post)).length,
      deployedRootsPreserved,
      semanticDeltaRoots,
      fallbackDeltaRoots,
      ambiguousDeltaRoots,
      multiMentionRefs: publicAssignedPosts.filter((post) => (post.storyMentions ?? []).length > 1).length,
    },
    diagnostics: {
      assignmentMethod:
        'deployed public recap scaffold preserved; new root refs embedded and assigned to nearest deployed story centroid; comments/replies inherit parent/root story',
      similarityThreshold,
      ambiguousMargin,
      storyCentroids: centroids.map((item) => ({
        storyId: item.storyId,
        themeId: item.themeId,
        label: item.label,
        rootRefs: item.rootRefs,
        centroidSourceRefs: item.centroidSourceRefs,
      })),
      ambiguousAssignments,
      fallbackAssignments,
    },
  };
}

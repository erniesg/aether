import type {
  EventPlatform,
  EventPost,
  EventTheme,
  EventThemeDraft,
  EventVoice,
  ThemeEvidenceSample,
} from './types';
import { engagement, shortExcerpt, slugify, tokenize } from './utils';

type SparseVector = Map<string, number>;

interface ClusterDocument {
  post: EventPost;
  terms: string[];
  vector: SparseVector;
  weight: number;
}

interface SimilarityNeighbor {
  index: number;
  weight: number;
}

const MAX_VECTOR_TERMS = 80;
const CLUSTER_ITERATIONS = 5;
const MAX_CLUSTERS = 12;
const MAX_GRAPH_NEIGHBORS = 12;
const MIN_GRAPH_SIMILARITY = 0.055;
const CLUSTER_STOPWORDS = new Set([
  'already',
  'agent',
  'agents',
  'agrim',
  'aiengineer',
  'aiengineers',
  'aiengineersingapore',
  'aidotengineer',
  'all',
  'around',
  'back',
  'actually',
  'before',
  'best',
  'better',
  'big',
  'build',
  'builder',
  'builders',
  'building',
  'came',
  'come',
  'com',
  'conference',
  'create',
  'day',
  'doing',
  'engineer',
  'engineers',
  'engineering',
  'event',
  'events',
  'every',
  'excited',
  'first',
  'free',
  'get',
  'getting',
  'going',
  'good',
  'great',
  'here',
  'her',
  'his',
  'how',
  'https',
  'join',
  'jiang',
  'know',
  'last',
  'like',
  'linkedin',
  'lot',
  'made',
  'make',
  'many',
  'may',
  'meet',
  'model',
  'models',
  'need',
  'now',
  'one',
  'only',
  'over',
  'people',
  'policy',
  'question',
  'rachael',
  'ready',
  'real',
  'really',
  'room',
  'see',
  'sherry',
  'sherryyanjiang',
  'sign',
  'singh',
  'singapore',
  'some',
  'something',
  'status',
  'summit',
  'take',
  'team',
  'thank',
  'thanks',
  'thing',
  'things',
  'most',
  'they',
  'time',
  'today',
  'together',
  'use',
  'using',
  'want',
  'way',
  'week',
  'weekend',
  'what',
  'when',
  'where',
  'who',
  'will',
  'well',
  'work',
  'world',
  'www',
  'twitter',
  'next',
  'still',
  'think',
]);

export interface AnalyzePostsResult {
  themes: EventTheme[];
  voices: EventVoice[];
}

export function analyzePosts(eventId: string, posts: EventPost[]): AnalyzePostsResult {
  const voicePosts = posts.filter((post) => !isReplyPost(post));
  const clusterPostsSource = voicePosts.length ? voicePosts : posts;
  const drafts = clusterPosts(clusterPostsSource);
  const rootThemes = drafts.map((draft) => toTheme(eventId, draft));
  return {
    themes: attachContextPostsToThemes(rootThemes, posts),
    voices: rankVoices(eventId, voicePosts.length ? voicePosts : posts),
  };
}

function isReplyPost(post: EventPost): boolean {
  return (
    post.tags.includes('x-reply') ||
    post.tags.includes('linkedin-comment') ||
    post.url.includes('#comment-')
  );
}

function conversationTags(post: EventPost): string[] {
  return post.tags.filter((tag) => tag.startsWith('conversation:'));
}

export function attachContextPostsToThemes(themes: EventTheme[], posts: EventPost[]): EventTheme[] {
  if (!themes.length || !posts.length) return themes;

  const postById = new Map(posts.map((post) => [post.postId, post]));
  const assigned = new Set<string>();
  const nextThemes = themes.map((theme) => {
    const rootPostIds = (theme.rootPostIds?.length
      ? theme.rootPostIds
      : theme.postIds.filter((postId) => {
          const post = postById.get(postId);
          return post ? !isReplyPost(post) : true;
        })
    ).filter((postId, index, ids) => ids.indexOf(postId) === index);
    const attachedPostIds = (theme.attachedPostIds ?? []).filter(
      (postId, index, ids) => ids.indexOf(postId) === index
    );
    const postIds = [...rootPostIds, ...attachedPostIds].filter((postId, index, ids) => {
      if (!postById.has(postId)) return false;
      return ids.indexOf(postId) === index;
    });
    for (const postId of postIds) assigned.add(postId);
    return {
      ...theme,
      postIds,
      rootPostIds,
      attachedPostIds,
    };
  });

  const themeIndexByPostId = new Map<string, number>();
  nextThemes.forEach((theme, themeIndex) => {
    for (const postId of theme.rootPostIds ?? theme.postIds) {
      themeIndexByPostId.set(postId, themeIndex);
    }
  });

  const themeIndexByConversation = new Map<string, number>();
  for (const post of posts) {
    const themeIndex = themeIndexByPostId.get(post.postId);
    if (themeIndex === undefined) continue;
    for (const tag of conversationTags(post)) {
      if (!themeIndexByConversation.has(tag)) themeIndexByConversation.set(tag, themeIndex);
    }
  }

  const docs = buildDocuments(posts);
  const docIndexByPostId = new Map(docs.map((doc, index) => [doc.post.postId, index]));
  const themeCentroids = nextThemes.map((theme) => {
    const indexes = (theme.rootPostIds ?? theme.postIds)
      .map((postId) => docIndexByPostId.get(postId))
      .filter((index): index is number => index !== undefined);
    return indexes.length ? centroidFor(docs, indexes) : undefined;
  });

  let attachedCount = 0;
  for (const post of posts) {
    if (assigned.has(post.postId)) continue;
    const themeIndex = conversationTags(post)
      .map((tag) => themeIndexByConversation.get(tag))
      .find((index): index is number => index !== undefined) ?? nearestThemeIndex(post, docs, docIndexByPostId, themeCentroids, nextThemes);
    if (themeIndex === undefined) continue;

    const theme = nextThemes[themeIndex];
    theme.postIds = [...theme.postIds, post.postId];
    theme.attachedPostIds = [...(theme.attachedPostIds ?? []), post.postId];
    assigned.add(post.postId);
    attachedCount++;
  }

  if (attachedCount) {
    const updatedAt = Date.now();
    return nextThemes.map((theme) =>
      theme.attachedPostIds?.length
        ? {
            ...theme,
            updatedAt,
          }
        : theme
    );
  }

  return nextThemes;
}

function nearestThemeIndex(
  post: EventPost,
  docs: ClusterDocument[],
  docIndexByPostId: Map<string, number>,
  themeCentroids: Array<SparseVector | undefined>,
  themes: EventTheme[]
): number | undefined {
  const docIndex = docIndexByPostId.get(post.postId);
  if (docIndex === undefined) return largestThemeIndex(themes);
  let bestIndex: number | undefined;
  let bestScore = -Infinity;
  themeCentroids.forEach((centroid, index) => {
    if (!centroid) return;
    const score = cosine(docs[docIndex].vector, centroid);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex ?? largestThemeIndex(themes);
}

function largestThemeIndex(themes: EventTheme[]): number | undefined {
  if (!themes.length) return undefined;
  return themes.reduce(
    (bestIndex, theme, index) => (theme.postIds.length > themes[bestIndex].postIds.length ? index : bestIndex),
    0
  );
}

/**
 * Deterministic corpus clustering for event refs.
 * It uses TF-IDF vectors, diverse anchor selection, and a few centroid
 * refinement passes. LLM calls may relabel/summarize clusters later, but the
 * membership itself is local, reproducible, and covers every supplied root ref.
 */
export function clusterPosts(posts: EventPost[]): EventThemeDraft[] {
  const docs = buildDocuments(posts);
  if (!docs.length) return [];

  const targetCount = targetClusterCount(docs.length);
  const clusters = graphClusterDocuments(docs, targetCount);

  return clusters
    .map((indexes) => indexes.map((index) => docs[index].post))
    .filter((cluster) => cluster.length > 0)
    .map((cluster) => {
      const keywords = topKeywords(cluster, []);
      return {
        cluster,
        keywords,
        score: clusterScore(cluster),
      };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ cluster, keywords, score }, index) => {
      const label = labelFromKeywords(keywords);
      const stem = slugify(keywords.slice(0, 3).join('-') || label);
      return {
        themeId: `atlas-${String(index + 1).padStart(2, '0')}-${stem}`,
        label,
        keywords,
        postIds: cluster.map((post) => post.postId),
        score,
        evidence: selectEvidence(cluster),
      };
    });
}

function buildDocuments(posts: EventPost[]): ClusterDocument[] {
  const termsByPost = posts.map((post) => termsForPost(post));
  const documentFrequency = new Map<string, number>();

  for (const terms of termsByPost) {
    for (const term of new Set(terms)) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  return posts.map((post, index) => {
    const terms = termsByPost[index];
    return {
      post,
      terms,
      vector: vectorize(terms, documentFrequency, posts.length),
      weight: postWeight(post),
    };
  });
}

function graphClusterDocuments(docs: ClusterDocument[], targetCount: number): number[][] {
  if (docs.length <= 1) return docs.map((_, index) => [index]);
  const neighbors = buildSimilarityGraph(docs);
  let labels = docs.map((_, index) => index);

  for (let iteration = 0; iteration < 10; iteration++) {
    let changed = false;
    for (let index = 0; index < docs.length; index++) {
      const scores = new Map<number, number>();
      for (const neighbor of neighbors[index]) {
        const label = labels[neighbor.index];
        scores.set(label, (scores.get(label) ?? 0) + neighbor.weight);
      }
      scores.set(labels[index], (scores.get(labels[index]) ?? 0) + 0.01);
      const nextLabel = Array.from(scores.entries()).sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return a[0] - b[0];
      })[0]?.[0];
      if (nextLabel !== undefined && nextLabel !== labels[index]) {
        labels[index] = nextLabel;
        changed = true;
      }
    }
    if (!changed) break;
  }

  const communities = new Map<number, number[]>();
  labels.forEach((label, index) => {
    const group = communities.get(label) ?? [];
    group.push(index);
    communities.set(label, group);
  });

  return consolidateCommunities(docs, Array.from(communities.values()), targetCount);
}

function buildSimilarityGraph(docs: ClusterDocument[]): SimilarityNeighbor[][] {
  const neighbors = Array.from({ length: docs.length }, () => [] as SimilarityNeighbor[]);
  for (let left = 0; left < docs.length; left++) {
    for (let right = left + 1; right < docs.length; right++) {
      const score = cosine(docs[left].vector, docs[right].vector);
      if (score < MIN_GRAPH_SIMILARITY) continue;
      neighbors[left].push({ index: right, weight: score });
      neighbors[right].push({ index: left, weight: score });
    }
  }

  return neighbors.map((group, index) => {
    const nearest = group.sort((a, b) => b.weight - a.weight).slice(0, MAX_GRAPH_NEIGHBORS);
    return nearest.length ? nearest : [{ index, weight: 0.01 }];
  });
}

function consolidateCommunities(
  docs: ClusterDocument[],
  communities: number[][],
  targetCount: number
): number[][] {
  const minSize = docs.length >= 80 ? 4 : 1;
  const maxClusters = Math.min(MAX_CLUSTERS, Math.max(targetCount, Math.ceil(docs.length / 70)));
  const clusters = communities
    .filter((community) => community.length > 0)
    .sort((a, b) => clusterScore(b.map((index) => docs[index].post)) - clusterScore(a.map((index) => docs[index].post)));

  const stable = clusters.filter((cluster) => cluster.length >= minSize);
  const tiny = clusters.filter((cluster) => cluster.length < minSize).flat();
  if (!stable.length) stable.push(...clusters.slice(0, maxClusters));

  mergeIndexesIntoNearest(docs, stable, tiny);

  while (stable.length > maxClusters) {
    const smallestIndex = stable.reduce(
      (best, cluster, index) => (cluster.length < stable[best].length ? index : best),
      0
    );
    const [smallest] = stable.splice(smallestIndex, 1);
    mergeIndexesIntoNearest(docs, stable, smallest);
  }

  return stable.filter((cluster) => cluster.length > 0);
}

function mergeIndexesIntoNearest(
  docs: ClusterDocument[],
  clusters: number[][],
  indexes: number[]
): void {
  if (!indexes.length || !clusters.length) return;
  let centroids = clusters.map((cluster) => centroidFor(docs, cluster));
  for (const index of indexes) {
    let bestIndex = 0;
    let bestScore = -Infinity;
    centroids.forEach((centroid, centroidIndex) => {
      const score = cosine(docs[index].vector, centroid);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = centroidIndex;
      }
    });
    clusters[bestIndex].push(index);
    centroids[bestIndex] = centroidFor(docs, clusters[bestIndex]);
  }
}

function termsForPost(post: EventPost): string[] {
  const tokens = tokenize(post.text).filter(isClusterTerm);
  const fallbackTokens = tokenize(`${post.authorHandle ?? ''} ${post.authorName}`).filter(
    isClusterTerm
  );
  const phrases: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    const left = tokens[i];
    const right = tokens[i + 1];
    if (left === right) continue;
    phrases.push(`${left}_${right}`);
  }
  return tokens.length ? [...tokens, ...phrases] : fallbackTokens.length ? fallbackTokens : [post.platform];
}

function rebalanceLargeClusters(
  docs: ClusterDocument[],
  clusters: number[][],
  targetCount: number
): number[][] {
  const maxClusters = Math.min(MAX_CLUSTERS, Math.max(targetCount, Math.ceil(docs.length / 60)));
  const maxSize = Math.max(80, Math.ceil((docs.length / Math.max(targetCount, 1)) * 1.6));
  let next = clusters.filter((cluster) => cluster.length > 0);

  while (next.length < maxClusters) {
    const largestIndex = next.reduce(
      (best, cluster, index) => (cluster.length > next[best].length ? index : best),
      0
    );
    if (next[largestIndex].length <= maxSize) break;
    const split = splitCluster(docs, next[largestIndex]);
    if (split.length < 2) break;
    next = [
      ...next.slice(0, largestIndex),
      ...split,
      ...next.slice(largestIndex + 1),
    ];
  }

  return next;
}

function splitCluster(docs: ClusterDocument[], indexes: number[]): number[][] {
  if (indexes.length < 8) return [indexes];
  const scopedDocs = indexes.map((index) => docs[index]);
  const anchors = pickAnchorIndexes(scopedDocs, 2);
  if (anchors.length < 2) return [indexes];

  let centroids = anchors.map((index) => scopedDocs[index].vector);
  let scopedClusters = assignDocumentsBalanced(scopedDocs, centroids);
  for (let i = 0; i < CLUSTER_ITERATIONS; i++) {
    centroids = centroids.map((centroid, index) =>
      scopedClusters[index]?.length ? centroidFor(scopedDocs, scopedClusters[index]) : centroid
    );
    scopedClusters = assignDocumentsBalanced(scopedDocs, centroids);
  }

  return scopedClusters
    .filter((cluster) => cluster.length > 0)
    .map((cluster) => cluster.map((scopedIndex) => indexes[scopedIndex]));
}

function assignDocumentsBalanced(docs: ClusterDocument[], centroids: SparseVector[]): number[][] {
  if (centroids.length !== 2) return assignDocuments(docs, centroids);
  const midpoint = Math.ceil(docs.length / 2);
  const scored = docs
    .map((doc, index) => ({
      index,
      score: cosine(doc.vector, centroids[0]) - cosine(doc.vector, centroids[1]),
    }))
    .sort((a, b) => b.score - a.score);
  return [
    scored.slice(0, midpoint).map((item) => item.index),
    scored.slice(midpoint).map((item) => item.index),
  ];
}

function isClusterTerm(term: string): boolean {
  return term.length >= 3 && !CLUSTER_STOPWORDS.has(term) && !/^\d+$/.test(term);
}

function vectorize(
  terms: string[],
  documentFrequency: Map<string, number>,
  documentCount: number
): SparseVector {
  const counts = new Map<string, number>();
  for (const term of terms) counts.set(term, (counts.get(term) ?? 0) + 1);

  const weighted = Array.from(counts.entries())
    .map(([term, count]) => {
      const df = documentFrequency.get(term) ?? 1;
      const idf = Math.log(1 + documentCount / (1 + df));
      const phraseBoost = term.includes('_') ? 1.35 : 1;
      return [term, Math.log1p(count) * idf * phraseBoost] as const;
    })
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_VECTOR_TERMS);

  return normalizeVector(new Map(weighted));
}

function postWeight(post: EventPost): number {
  return 1 + Math.log1p(engagement(post.metrics)) + Math.max(0, post.reachScore) * 0.5;
}

function targetClusterCount(count: number): number {
  if (count <= 1) return count;
  if (count < 10) return Math.min(2, count);
  if (count < 30) return Math.min(4, Math.ceil(count / 8));
  return Math.min(MAX_CLUSTERS, Math.max(5, Math.round(Math.sqrt(count / 7))));
}

function pickAnchorIndexes(docs: ClusterDocument[], targetCount: number): number[] {
  const anchors: number[] = [];
  const first = docs.reduce(
    (best, doc, index) => (doc.weight > docs[best].weight ? index : best),
    0
  );
  anchors.push(first);

  while (anchors.length < targetCount && anchors.length < docs.length) {
    let bestIndex = -1;
    let bestScore = -Infinity;
    for (let index = 0; index < docs.length; index++) {
      if (anchors.includes(index)) continue;
      const nearestSimilarity = Math.max(
        ...anchors.map((anchor) => cosine(docs[index].vector, docs[anchor].vector))
      );
      const diversity = 1 - nearestSimilarity;
      const importance = Math.log1p(docs[index].weight) / 4;
      const score = diversity * 0.8 + importance * 0.2;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    if (bestIndex < 0) break;
    anchors.push(bestIndex);
  }

  return anchors;
}

function assignDocuments(docs: ClusterDocument[], centroids: SparseVector[]): number[][] {
  const clusters = Array.from({ length: centroids.length }, () => [] as number[]);
  docs.forEach((doc, index) => {
    let bestIndex = 0;
    let bestScore = -Infinity;
    centroids.forEach((centroid, centroidIndex) => {
      const score = cosine(doc.vector, centroid);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = centroidIndex;
      }
    });
    clusters[bestIndex].push(index);
  });
  return clusters;
}

function centroidFor(docs: ClusterDocument[], indexes: number[]): SparseVector {
  const centroid = new Map<string, number>();
  for (const index of indexes) {
    const doc = docs[index];
    for (const [term, value] of doc.vector) {
      centroid.set(term, (centroid.get(term) ?? 0) + value * doc.weight);
    }
  }
  return normalizeVector(centroid);
}

function mergeTinyClusters(
  docs: ClusterDocument[],
  clusters: number[][],
  centroids: SparseVector[]
): number[][] {
  const minSize = docs.length >= 80 ? 4 : 1;
  const stable = clusters.filter((cluster) => cluster.length >= minSize);
  const tiny = clusters.filter((cluster) => cluster.length > 0 && cluster.length < minSize).flat();
  if (!tiny.length || !stable.length) return clusters.filter((cluster) => cluster.length > 0);

  const stableCentroids = stable.map((cluster) => centroidFor(docs, cluster));
  for (const index of tiny) {
    let bestIndex = 0;
    let bestScore = -Infinity;
    stableCentroids.forEach((centroid, centroidIndex) => {
      const score = cosine(docs[index].vector, centroid);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = centroidIndex;
      }
    });
    stable[bestIndex].push(index);
    stableCentroids[bestIndex] = centroidFor(docs, stable[bestIndex]);
  }

  return stable;
}

function normalizeVector(vector: SparseVector): SparseVector {
  const norm = Math.sqrt(Array.from(vector.values()).reduce((sum, value) => sum + value ** 2, 0));
  if (!norm) return vector;
  for (const [term, value] of vector) vector.set(term, value / norm);
  return vector;
}

function cosine(a: SparseVector, b: SparseVector): number {
  let score = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const [term, value] of small) score += value * (large.get(term) ?? 0);
  return score;
}

function topKeywords(posts: EventPost[], fallback: string[] = []): string[] {
  const counts = new Map<string, number>();
  for (const post of posts) {
    for (const token of termsForPost(post)) {
      const keyword = token.replace(/_/g, ' ');
      counts.set(keyword, (counts.get(keyword) ?? 0) + (token.includes('_') ? 1.4 : 1));
    }
  }
  const ranked = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word);
  return ranked.length ? ranked : fallback.slice(0, 5);
}

function labelFromKeywords(keywords: string[]): string {
  const label = keywords
    .slice(0, 3)
    .map((keyword) => keyword.replace(/\b[a-z]/g, (letter) => letter.toUpperCase()))
    .join(' / ');
  return label || 'Event References';
}

function clusterScore(posts: EventPost[]): number {
  const reach = posts.reduce((sum, post) => sum + Math.max(0, post.reachScore), 0);
  const publicEngagement = posts.reduce((sum, post) => sum + Math.log1p(engagement(post.metrics)), 0);
  return Number((posts.length + reach + publicEngagement / 10).toFixed(3));
}

function selectEvidence(posts: EventPost[]): ThemeEvidenceSample[] {
  const byPlatform = new Map<EventPlatform, EventPost[]>();
  for (const post of posts) {
    const group = byPlatform.get(post.platform) ?? [];
    group.push(post);
    byPlatform.set(post.platform, group);
  }

  const picked = new Map<string, EventPost>();
  for (const group of byPlatform.values()) {
    const topReach = [...group].sort((a, b) => b.reachScore - a.reachScore)[0];
    if (topReach) picked.set(topReach.postId, topReach);
    const longestUseful = [...group].sort((a, b) => b.text.length - a.text.length)[0];
    if (longestUseful) picked.set(longestUseful.postId, longestUseful);
  }

  return Array.from(picked.values())
    .sort((a, b) => b.reachScore - a.reachScore)
    .slice(0, 6)
    .map((post) => ({
      postId: post.postId,
      platform: post.platform,
      url: post.url,
      author: post.authorHandle ?? post.authorName,
      text: shortExcerpt(post.text, 260),
      reachScore: post.reachScore,
    }));
}

function toTheme(eventId: string, draft: EventThemeDraft): EventTheme {
  const citations = draft.evidence
    .slice(0, 4)
    .map((sample) => `[${sample.postId}](${sample.url})`)
    .join(', ');
  const platformMix = Array.from(new Set(draft.evidence.map((sample) => sample.platform))).join(
    ' + '
  );
  return {
    themeId: draft.themeId || slugify(draft.label),
    eventId,
    label: draft.label,
    summary: `${draft.postIds.length} posts clustered around ${draft.keywords
      .slice(0, 4)
      .join(', ')}${platformMix ? ` across ${platformMix}` : ''}. Evidence: ${citations}.`,
    keywords: draft.keywords,
    postIds: draft.postIds,
    score: draft.score,
    updatedAt: Date.now(),
  };
}

export function rankVoices(eventId: string, posts: EventPost[]): EventVoice[] {
  const groups = new Map<string, EventPost[]>();
  for (const post of posts) {
    const key = `${post.platform}:${post.authorHandle ?? post.authorName}`.toLowerCase();
    const group = groups.get(key) ?? [];
    group.push(post);
    groups.set(key, group);
  }

  return Array.from(groups.values())
    .map((group) => {
      const first = group[0];
      const totalEngagement = group.reduce((sum, post) => sum + engagement(post.metrics), 0);
      const reachScore =
        group.reduce((sum, post) => sum + Math.max(0, post.reachScore), 0) +
        Math.log1p(totalEngagement);
      return {
        voiceId: slugify(`${first.platform}-${first.authorHandle ?? first.authorName}`),
        eventId,
        platform: first.platform,
        name: first.authorName,
        handle: first.authorHandle,
        profileUrl: first.authorUrl,
        postCount: group.length,
        totalEngagement: Number(totalEngagement.toFixed(3)),
        reachScore: Number(reachScore.toFixed(3)),
        samplePostUrls: group
          .sort((a, b) => b.reachScore - a.reachScore)
          .slice(0, 3)
          .map((post) => post.url),
        updatedAt: Date.now(),
      } satisfies EventVoice;
    })
    .sort((a, b) => b.reachScore - a.reachScore);
}

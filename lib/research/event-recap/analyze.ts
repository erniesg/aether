import type {
  EventPlatform,
  EventPost,
  EventTheme,
  EventThemeDraft,
  EventVoice,
  ThemeEvidenceSample,
} from './types';
import { engagement, shortExcerpt, slugify, tokenize } from './utils';

interface ClusterSeed {
  themeId: string;
  label: string;
  keywords: string[];
}

const SEEDS: ClusterSeed[] = [
  {
    themeId: 'building-ai-products',
    label: 'Building AI products',
    keywords: ['product', 'ship', 'prototype', 'workflow', 'agents', 'evals', 'quality'],
  },
  {
    themeId: 'engineering-practice',
    label: 'Engineering practice',
    keywords: ['rag', 'latency', 'infra', 'deployment', 'observability', 'guardrails', 'testing'],
  },
  {
    themeId: 'careers-and-hiring',
    label: 'Careers and hiring',
    keywords: ['hire', 'hiring', 'career', 'role', 'salary', 'skills', 'interview'],
  },
  {
    themeId: 'singapore-ecosystem',
    label: 'Singapore ecosystem',
    keywords: ['singapore', 'sg', 'aisg', 'imda', 'govtech', 'meetup', 'community'],
  },
  {
    themeId: 'models-and-tools',
    label: 'Models and tools',
    keywords: ['claude', 'openai', 'gemini', 'llama', 'cursor', 'mcp', 'tool'],
  },
  {
    themeId: 'event-recap',
    label: 'Event recap',
    keywords: ['talk', 'speaker', 'panel', 'summit', 'session', 'takeaway', 'slides'],
  },
];

export interface AnalyzePostsResult {
  themes: EventTheme[];
  voices: EventVoice[];
}

export function analyzePosts(eventId: string, posts: EventPost[]): AnalyzePostsResult {
  const drafts = clusterPosts(posts);
  return {
    themes: drafts.map((draft) => toTheme(eventId, draft)),
    voices: rankVoices(eventId, posts),
  };
}

/**
 * Scaffold clustering path.
 *
 * Production should swap the seeded lexical vectors for embeddings and
 * HDBSCAN/UMAP. The contract is intentionally the same: unsupervised groups
 * first, representative evidence second, LLM labels/summaries last.
 */
export function clusterPosts(posts: EventPost[]): EventThemeDraft[] {
  const assignments = new Map<string, EventPost[]>();
  for (const seed of SEEDS) assignments.set(seed.themeId, []);

  for (const post of posts) {
    const tokens = new Set(tokenize(post.text));
    let bestSeed = SEEDS[SEEDS.length - 1];
    let bestScore = -1;
    for (const seed of SEEDS) {
      const overlap = seed.keywords.reduce(
        (score, keyword) => score + (tokens.has(keyword) ? 1 : 0),
        0
      );
      if (overlap > bestScore) {
        bestSeed = seed;
        bestScore = overlap;
      }
    }
    assignments.get(bestSeed.themeId)?.push(post);
  }

  return SEEDS.map((seed) => {
    const cluster = assignments.get(seed.themeId) ?? [];
    return {
      themeId: seed.themeId,
      label: seed.label,
      keywords: topKeywords(cluster, seed.keywords),
      postIds: cluster.map((post) => post.postId),
      score: cluster.length
        ? Number(
            (
              cluster.length +
              cluster.reduce((sum, post) => sum + Math.max(0, post.reachScore), 0)
            ).toFixed(3)
          )
        : 0,
      evidence: selectEvidence(cluster),
    };
  })
    .filter((draft) => draft.postIds.length > 0)
    .sort((a, b) => b.score - a.score);
}

function topKeywords(posts: EventPost[], fallback: string[]): string[] {
  const counts = new Map<string, number>();
  for (const post of posts) {
    for (const token of tokenize(post.text)) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }
  const ranked = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word);
  return ranked.length ? ranked : fallback.slice(0, 5);
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
    .sort((a, b) => b.reachScore - a.reachScore)
    .slice(0, 20);
}

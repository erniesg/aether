import type {
  EventPlatform,
  EventPost,
  EventResolution,
  EventScrapeRun,
  PlatformScrapeResult,
} from './types';
import { makePostId, normalizeQuerySet, scorePostsByPlatform } from './utils';

const MOCK_STARTED_AT = '2026-05-16T01:30:00.000Z';
const MOCK_ENDED_AT = '2026-05-16T10:30:00.000Z';

interface MockPostSeed {
  platform: EventPlatform;
  url: string;
  authorName: string;
  authorHandle?: string;
  authorUrl?: string;
  authorMeta?: EventPost['authorMeta'];
  text: string;
  postedAt: string;
  metrics: EventPost['metrics'];
  media?: EventPost['media'];
  tags: string[];
}

const SEEDS: MockPostSeed[] = [
  {
    platform: 'x',
    url: 'https://x.com/mock/status/1001',
    authorName: 'AI Singapore',
    authorHandle: 'AISingapore',
    authorUrl: 'https://x.com/AISingapore',
    text:
      'Big recurring theme at AI Engineer Singapore: teams are moving from model demos to evals, latency budgets, and product feedback loops. The job is looking more like systems engineering than prompt tinkering.',
    postedAt: '2026-05-16T04:10:00.000Z',
    metrics: { likes: 91, reposts: 28, replies: 7, views: 18200 },
    tags: ['evals', 'engineering-practice'],
  },
  {
    platform: 'x',
    url: 'https://x.com/mock/status/1002',
    authorName: 'Swyx',
    authorHandle: 'swyx',
    authorUrl: 'https://x.com/swyx',
    text:
      'Singapore AI engineers seem less interested in benchmark theatre and more interested in agent reliability: tool calls, retries, traces, and when to keep humans in the loop.',
    postedAt: '2026-05-16T05:02:00.000Z',
    metrics: { likes: 240, reposts: 54, replies: 18, views: 52000 },
    tags: ['agents', 'reliability'],
  },
  {
    platform: 'x',
    url: 'https://x.com/mock/status/1003',
    authorName: 'GovTech Builders',
    authorHandle: 'govtechbuilders',
    authorUrl: 'https://x.com/govtechbuilders',
    text:
      'Practical takeaway: retrieval quality, document permissions, and audit logs are still the hard parts for enterprise GenAI. Not glamorous, but this is where adoption lives.',
    postedAt: '2026-05-16T07:20:00.000Z',
    metrics: { likes: 65, reposts: 19, replies: 4, views: 11900 },
    tags: ['rag', 'governance'],
  },
  {
    platform: 'x',
    url: 'https://x.com/mock/status/1004',
    authorName: 'NUS Hackers',
    authorHandle: 'nushackers',
    authorUrl: 'https://x.com/nushackers',
    text:
      'Students asking the sharpest questions today: what should I learn after Python + APIs? Answer from multiple speakers: evals, data pipelines, and how products fail in the wild.',
    postedAt: '2026-05-16T09:15:00.000Z',
    metrics: { likes: 48, reposts: 12, replies: 6, views: 8700 },
    tags: ['careers', 'learning'],
  },
  {
    platform: 'youtube',
    url: 'https://www.youtube.com/watch?v=mockAIE2026d1',
    authorName: 'AI Engineer',
    authorHandle: '@aiDotEngineer',
    authorUrl: 'https://www.youtube.com/@aiDotEngineer',
    authorMeta: {
      followers: 38000,
      posts: 240,
      profileImageUrl: 'https://i.ytimg.com/vi/mockAIE2026d1/default.jpg',
    },
    text:
      'AI Engineer Singapore Day 1 keynote clips: practical agents, evals, and builders sharing what moved from demos into production.',
    postedAt: '2026-05-17T03:00:00.000Z',
    metrics: { views: 20248, impressions: 20248, likes: 375, comments: 6 },
    media: [
      {
        url: 'https://i.ytimg.com/vi/mockAIE2026d1/maxresdefault.jpg',
        type: 'image',
        source: 'youtube-thumbnail',
        altText: 'Video thumbnail: AI Engineer Singapore Day 1',
      },
    ],
    tags: ['youtube-video', 'keynote', 'event-recap'],
  },
  {
    platform: 'linkedin',
    url: 'https://www.linkedin.com/feed/update/mock-2001/',
    authorName: 'Priya Menon',
    authorHandle: 'priya-menon-ai',
    authorUrl: 'https://www.linkedin.com/in/priya-menon-ai/',
    text:
      'My recap from AI Engineer Singapore: the most mature conversations were not about which model wins this week. They were about how to make AI features observable, testable, and maintainable. Three patterns stood out: small task-specific agents, retrieval with explicit provenance, and evaluation datasets owned by product teams.',
    postedAt: '2026-05-16T11:42:00.000Z',
    metrics: { reactions: 186, comments: 24, reposts: 17, impressions: 12800 },
    tags: ['event-recap', 'observability', 'provenance'],
  },
  {
    platform: 'linkedin',
    url: 'https://www.linkedin.com/feed/update/mock-2002/',
    authorName: 'Kenneth Tan',
    authorHandle: 'kenneth-tan-product-ai',
    authorUrl: 'https://www.linkedin.com/in/kenneth-tan-product-ai/',
    text:
      'The hiring signal from today was clear. AI engineer roles in Singapore are converging around product-minded software engineers who can own the loop from data to eval to deployment. The phrase "prompt engineer" barely came up; the phrase "shipping reliable workflows" came up constantly.',
    postedAt: '2026-05-16T12:15:00.000Z',
    metrics: { reactions: 142, comments: 31, reposts: 9, impressions: 9400 },
    tags: ['hiring', 'careers'],
  },
  {
    platform: 'linkedin',
    url: 'https://www.linkedin.com/feed/update/mock-2003/',
    authorName: 'Maya Lim',
    authorHandle: 'maya-lim-design-tech',
    authorUrl: 'https://www.linkedin.com/in/maya-lim-design-tech/',
    text:
      'One under-discussed thread from AI Engineer Singapore: designers and engineers are starting to share the same prototyping space. Canvas tools, multimodal references, and structured briefs help teams test taste faster before a build sprint gets expensive.',
    postedAt: '2026-05-16T14:02:00.000Z',
    metrics: { reactions: 96, comments: 18, reposts: 6, impressions: 6100 },
    tags: ['product', 'workflow', 'creative-tools'],
  },
  {
    platform: 'linkedin',
    url: 'https://www.linkedin.com/feed/update/mock-2004/',
    authorName: 'AI Professionals Singapore',
    authorHandle: 'ai-professionals-singapore',
    authorUrl: 'https://www.linkedin.com/company/ai-professionals-singapore/',
    text:
      'Community note: several meetups are forming around AI evaluation, MCP/tooling, and production RAG. If the summit showed anything, it is that Singapore has moved beyond curiosity and into craft.',
    postedAt: '2026-05-16T15:35:00.000Z',
    metrics: { reactions: 220, comments: 42, reposts: 34, impressions: 20100 },
    tags: ['singapore-ecosystem', 'community'],
  },
];

export function mockResolveEvent(name: string, contextHint?: string): EventResolution {
  const querySet = normalizeQuerySet([
    name,
    `${name} Singapore`,
    '"AI engineer" Singapore',
    '#AIEngineer',
    '#AISingapore',
    '#SGTech',
    contextHint ?? '',
  ]);
  return {
    canonicalName: name,
    location: 'Singapore',
    startsAt: MOCK_STARTED_AT,
    endsAt: MOCK_ENDED_AT,
    querySet,
    sourceUrls: [
      `https://api.search.tinyfish.ai?query=${encodeURIComponent(name)}`,
      `https://x.com/search?q=${encodeURIComponent(name)}`,
      `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(name)}`,
      `https://www.youtube.com/results?search_query=${encodeURIComponent(name)}`,
    ],
    warnings: ['mock event resolution; live TinyFish Search/Fetch not called'],
  };
}

export function mockScrapePlatform(
  platform: EventPlatform,
  eventId: string,
  runId: string,
  maxItems: number
): PlatformScrapeResult {
  const now = Date.now();
  const posts = scorePostsByPlatform(
    SEEDS.filter((seed) => seed.platform === platform)
      .slice(0, maxItems)
      .map((seed) => ({
        postId: makePostId(seed.platform, seed.url, seed.text),
        eventId,
        runId,
        platform: seed.platform,
        url: seed.url,
        authorName: seed.authorName,
        authorHandle: seed.authorHandle,
        authorUrl: seed.authorUrl,
        authorMeta: seed.authorMeta,
        text: seed.text,
        postedAt: seed.postedAt,
        capturedAt: now,
        updatedAt: now,
        metrics: seed.metrics,
        media: seed.media,
        reachScore: 0,
        tags: seed.tags,
        raw: seed,
      }))
  );
  return {
    platform,
    posts: posts.map(({
      eventId: _eventId,
      runId: _runId,
      capturedAt: _capturedAt,
      updatedAt: _updatedAt,
      reachScore: _reachScore,
      ...post
    }) => post),
    streamingUrl: `https://agent.tinyfish.ai/mock/${eventId}/${runId}/${platform}`,
    warnings: ['mock platform scrape; no TinyFish Agent credits used'],
    raw: { seedCount: posts.length },
  };
}

export function mockRunShell(input: {
  runId: string;
  eventId: string;
  platforms?: EventPlatform[];
  querySet: string[];
  windowStart: string;
  windowEnd: string;
  maxItemsPerPlatform: number;
}): EventScrapeRun {
  return {
    runId: input.runId,
    eventId: input.eventId,
    status: 'running',
    mode: 'mock',
    provider: 'tinyfish-mock',
    platforms: input.platforms ?? ['x', 'linkedin', 'youtube'],
    querySet: input.querySet,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    maxItemsPerPlatform: input.maxItemsPerPlatform,
    estimatedCredits: 0,
    streamingUrls: [],
    warnings: [],
    inputs: input,
    outputs: {},
    startedAt: Date.now(),
  };
}

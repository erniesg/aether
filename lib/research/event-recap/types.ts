export type EventPlatform = 'x' | 'linkedin';
export type EventRecapMode = 'mock' | 'tinyfish';
export type EventStatus = 'draft' | 'resolving' | 'ready' | 'refreshing' | 'error';
export type EventRunStatus = 'running' | 'completed' | 'failed' | 'skipped';

export interface EventRecapConfig {
  eventId: string;
  workspaceId?: string;
  name: string;
  contextHint?: string;
  daysBefore: number;
  daysAfter: number;
  refreshIntervalHours: number;
  maxItemsPerPlatform: number;
  monthlyCreditBudget: number;
  liveMode: EventRecapMode;
}

export interface EventRecapRecord extends EventRecapConfig {
  status: EventStatus;
  canonicalName?: string;
  officialUrl?: string;
  location?: string;
  startsAt?: string;
  endsAt?: string;
  usedCredits: number;
  querySet: string[];
  sourceUrls: string[];
  lastRunAt?: number;
  nextRefreshAt?: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface EventPostMetrics {
  likes?: number;
  reposts?: number;
  replies?: number;
  comments?: number;
  reactions?: number;
  impressions?: number;
  views?: number;
}

export interface EventPost {
  postId: string;
  eventId: string;
  runId: string;
  platform: EventPlatform;
  url: string;
  authorName: string;
  authorHandle?: string;
  authorUrl?: string;
  text: string;
  postedAt?: string;
  capturedAt: number;
  metrics: EventPostMetrics;
  reachScore: number;
  tags: string[];
  raw: unknown;
}

export interface EventTheme {
  themeId: string;
  eventId: string;
  label: string;
  summary: string;
  keywords: string[];
  postIds: string[];
  score: number;
  updatedAt: number;
}

export interface EventVoice {
  voiceId: string;
  eventId: string;
  platform: EventPlatform;
  name: string;
  handle?: string;
  profileUrl?: string;
  postCount: number;
  totalEngagement: number;
  reachScore: number;
  samplePostUrls: string[];
  updatedAt: number;
}

export interface EventScrapeRun {
  runId: string;
  eventId: string;
  status: EventRunStatus;
  mode: EventRecapMode;
  provider: string;
  platforms: EventPlatform[];
  querySet: string[];
  windowStart: string;
  windowEnd: string;
  maxItemsPerPlatform: number;
  estimatedCredits: number;
  actualCredits?: number;
  streamingUrls: Array<{ platform: EventPlatform; url: string }>;
  warnings: string[];
  error?: string;
  inputs: unknown;
  outputs: unknown;
  startedAt: number;
  finishedAt?: number;
}

export interface EventRecapBundle {
  event: EventRecapRecord;
  runs: EventScrapeRun[];
  posts: EventPost[];
  themes: EventTheme[];
  voices: EventVoice[];
}

export interface EventResolution {
  canonicalName: string;
  officialUrl?: string;
  location?: string;
  startsAt?: string;
  endsAt?: string;
  querySet: string[];
  sourceUrls: string[];
  warnings: string[];
}

export interface PlatformScrapeResult {
  platform: EventPlatform;
  posts: Omit<EventPost, 'eventId' | 'runId' | 'capturedAt' | 'reachScore'>[];
  streamingUrl?: string;
  warnings: string[];
  raw: unknown;
}

export interface ThemeEvidenceSample {
  postId: string;
  platform: EventPlatform;
  url: string;
  author: string;
  text: string;
  reachScore: number;
}

export interface EventThemeDraft {
  themeId: string;
  label: string;
  keywords: string[];
  postIds: string[];
  score: number;
  evidence: ThemeEvidenceSample[];
}

export type EventExpansionAnchorKind = 'mention' | 'hashtag' | 'author' | 'entity' | 'query';

export interface EventExpansionAnchor {
  kind: EventExpansionAnchorKind;
  value: string;
  query: string;
  score: number;
  count: number;
  platforms: EventPlatform[];
  samplePostIds: string[];
  reason: string;
}

export interface EventExpansionPlan {
  eventName: string;
  generatedAt: number;
  corpus: {
    posts: number;
    platforms: Record<EventPlatform, number>;
  };
  anchors: EventExpansionAnchor[];
  querySet: string[];
  warnings: string[];
}

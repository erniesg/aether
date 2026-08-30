import type { EventPostCaptureRun } from './post-capture';

export type { EventPostCaptureRun };

export const EVENT_PLATFORMS = ['x', 'linkedin', 'youtube'] as const;
export type EventPlatform = (typeof EVENT_PLATFORMS)[number];
export type EventRecapMode = 'mock' | 'tinyfish';
export type EventStatus = 'draft' | 'resolving' | 'ready' | 'refreshing' | 'error';
export type EventRunStatus = 'running' | 'completed' | 'failed' | 'skipped';

export function isEventPlatform(value: unknown): value is EventPlatform {
  return typeof value === 'string' && (EVENT_PLATFORMS as readonly string[]).includes(value);
}

export function emptyEventPlatformCounts(): Record<EventPlatform, number> {
  return EVENT_PLATFORMS.reduce((acc, platform) => {
    acc[platform] = 0;
    return acc;
  }, {} as Record<EventPlatform, number>);
}

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

export interface EventPostMedia {
  url: string;
  type: 'image' | 'video' | 'gif' | 'unknown';
  source?: string;
  pageUrl?: string;
  previewUrl?: string;
  altText?: string;
  width?: number;
  height?: number;
  localPath?: string;
  contentType?: string;
  bytes?: number;
  downloadedAt?: number;
  durationMs?: number;
  variants?: Array<{
    url: string;
    contentType?: string;
    bitrate?: number;
  }>;
}

export type EventPostStoryType =
  | 'single_story'
  | 'broad_recap'
  | 'side_event'
  | 'logistics'
  | 'sponsor'
  | 'context';

export interface EventStoryMention {
  storyId: string;
  label: string;
  role: 'primary' | 'secondary';
  confidence: number;
  evidence?: string;
}

export interface EventAuthorMeta {
  description?: string;
  headline?: string;
  location?: string;
  followers?: number;
  following?: number;
  posts?: number;
  listed?: number;
  verified?: boolean;
  verifiedType?: string;
  profileImageUrl?: string;
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
  authorMeta?: EventAuthorMeta;
  text: string;
  postedAt?: string;
  capturedAt: number;
  updatedAt: number;
  metrics: EventPostMetrics;
  media?: EventPostMedia[];
  reachScore: number;
  tags: string[];
  storyType?: EventPostStoryType;
  primaryStoryId?: string;
  storyMentions?: EventStoryMention[];
  raw: unknown;
}

export interface EventTheme {
  themeId: string;
  eventId: string;
  label: string;
  summary: string;
  keywords: string[];
  postIds: string[];
  rootPostIds?: string[];
  attachedPostIds?: string[];
  storyId?: string;
  storyType?: 'story_assignment' | 'tfidf_cluster';
  sourceThemeIds?: string[];
  score: number;
  updatedAt: number;
}

export interface EventClusterQuality {
  algorithm: string;
  selectedBy: string;
  silhouetteScore: number;
  silhouetteClusterCount?: number;
  elbowClusterCount?: number;
  inertia?: number;
  clusterCount: number;
  rootRefCount: number;
  sampleSize: number;
  clusterSizeMin: number;
  clusterSizeMedian: number;
  clusterSizeMax: number;
  candidateScores?: Array<{
    requestedClusterCount: number;
    clusterCount: number;
    silhouetteScore: number;
    inertia: number;
    elbowScore: number;
    selectionScore: number;
    clusterSizeMin: number;
    clusterSizeMedian: number;
    clusterSizeMax: number;
  }>;
  rawClusterCount?: number;
  storyClusterCount?: number;
  assignmentMethod?: string;
  storyAssignment?: {
    totalRefs: number;
    rootRefs: number;
    attachedRefs: number;
    multiMentionRefs: number;
    broadRecapRefs: number;
  };
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

export type EventRunEventLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * One structured step in a refresh run — emitted by the pipeline as it
 * resolves the event, budgets credits, collects each platform, clusters,
 * and finishes. Persisted through Convex with an in-memory fallback (mirrors
 * the `lapEvent` pattern). `tag` is a dot-delimited hierarchy so the UI can
 * group by stage (`collect.x.ok`, `cluster.ok`, `run.done`). `data` carries
 * only safe counts/ids — never raw provider payloads.
 */
export interface EventRecapRunEvent {
  id: string;
  eventId: string;
  runId: string;
  tag: string;
  level: EventRunEventLevel;
  message: string;
  platform?: EventPlatform;
  data?: Record<string, unknown>;
  ts: number;
}

export interface EventRecapBundle {
  event: EventRecapRecord;
  runs: EventScrapeRun[];
  posts: EventPost[];
  themes: EventTheme[];
  voices: EventVoice[];
  clustering?: EventClusterQuality;
  /** Phased timeline for the visible runs — oldest event first. */
  runEvents?: EventRecapRunEvent[];
  /** Latest capture run from the post-screenshot engine, if one exists on disk. */
  captureRun?: EventPostCaptureRun;
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
  posts: Omit<EventPost, 'eventId' | 'runId' | 'capturedAt' | 'updatedAt' | 'reachScore'>[];
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
export type EventFrontierSourceKind =
  | 'broad-public-search'
  | 'official-schedule'
  | 'speaker-account'
  | 'sponsor-org'
  | 'corpus-discovered'
  | 'engagement-graph';

export interface EventExpansionAnchor {
  kind: EventExpansionAnchorKind;
  sourceKind: EventFrontierSourceKind;
  value: string;
  query: string;
  score: number;
  count: number;
  platforms: EventPlatform[];
  samplePostIds: string[];
  bias: string;
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

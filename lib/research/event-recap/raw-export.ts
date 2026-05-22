import type { EventPlatform, EventPost, EventRecapBundle } from './types';
import { captureByPostUrl } from './capture-export';
import type { EventPostCapture, EventPostCaptureRun } from './post-capture';

export type EventRawExportFormat = 'json' | 'csv';
export type EventRawExportScope = 'raw' | 'posts';

export interface EventRawExportMetadata {
  schemaVersion: 'event-recap.raw.v1';
  eventId: string;
  generatedAt: string;
  scope: EventRawExportScope;
  counts: {
    posts: number;
    themes: number;
    voices: number;
    runs: number;
    mediaItems: number;
    rawPostPayloads: number;
    captures?: number;
    capturedPosts?: number;
    pageCapturedPosts?: number;
    blockedCaptures?: number;
    failedCaptures?: number;
  };
  platforms: Record<EventPlatform, number>;
  latestRun?: {
    runId: string;
    status: string;
    provider: string;
    mode: string;
    startedAt: number;
    finishedAt?: number;
    windowStart: string;
    windowEnd: string;
    queryCount: number;
    warningCount: number;
  };
  captureRunId?: string;
}

export function buildEventRawExport(
  bundle: EventRecapBundle,
  scope: EventRawExportScope,
  captureRun?: EventPostCaptureRun | null
) {
  const captures = captureByPostUrl(captureRun);
  return {
    metadata: eventRawExportMetadata(bundle, scope, captureRun),
    event: bundle.event,
    runs: bundle.runs,
    themes: bundle.themes,
    voices: bundle.voices,
    clustering: bundle.clustering,
    captureRun: captureRun ? publicCaptureRun(captureRun) : undefined,
    posts: bundle.posts.map((post) => {
      const capture = captures.get(postUrlKey(post.url));
      const row = scope === 'raw' ? post : publicPost(post);
      return capture ? { ...row, capture: publicCapture(capture) } : row;
    }),
  };
}

export function eventRawExportMetadata(
  bundle: EventRecapBundle,
  scope: EventRawExportScope,
  captureRun?: EventPostCaptureRun | null
): EventRawExportMetadata {
  const latestRun = bundle.runs[0];
  return {
    schemaVersion: 'event-recap.raw.v1',
    eventId: bundle.event.eventId,
    generatedAt: new Date().toISOString(),
    scope,
    counts: {
      posts: bundle.posts.length,
      themes: bundle.themes.length,
      voices: bundle.voices.length,
      runs: bundle.runs.length,
      mediaItems: bundle.posts.reduce((sum, post) => sum + (post.media?.length ?? 0), 0),
      rawPostPayloads: bundle.posts.filter((post) => post.raw !== undefined && post.raw !== null).length,
      captures: captureRun?.captures.length,
      capturedPosts: captureRun?.capturedCount,
      pageCapturedPosts: captureRun?.pageCapturedCount,
      blockedCaptures: captureRun?.blockedCount,
      failedCaptures: captureRun?.failedCount,
    },
    captureRunId: captureRun?.runId,
    platforms: bundle.posts.reduce(
      (counts, post) => {
        counts[post.platform] += 1;
        return counts;
      },
      { x: 0, linkedin: 0, youtube: 0 } satisfies Record<EventPlatform, number>
    ),
    latestRun: latestRun
      ? {
          runId: latestRun.runId,
          status: latestRun.status,
          provider: latestRun.provider,
          mode: latestRun.mode,
          startedAt: latestRun.startedAt,
          finishedAt: latestRun.finishedAt,
          windowStart: latestRun.windowStart,
          windowEnd: latestRun.windowEnd,
          queryCount: latestRun.querySet.length,
          warningCount: latestRun.warnings.length,
        }
      : undefined,
  };
}

export function eventPostsCsv(bundle: EventRecapBundle, captureRun?: EventPostCaptureRun | null): string {
  const captures = captureByPostUrl(captureRun);
  const header = [
    'postId',
    'platform',
    'url',
    'authorName',
    'authorHandle',
    'authorUrl',
    'postedAt',
    'capturedAt',
    'text',
    'likes',
    'reposts',
    'replies',
    'comments',
    'reactions',
    'impressions',
    'views',
    'reachScore',
    'tags',
    'mediaCount',
    'captureRunId',
    'captureStatus',
    'captureScreenshot',
    'captureWarnings',
  ];
  const rows = bundle.posts.map((post) => {
    const capture = captures.get(postUrlKey(post.url));
    return [
      post.postId,
      post.platform,
      post.url,
      post.authorName,
      post.authorHandle ?? '',
      post.authorUrl ?? '',
      post.postedAt ?? '',
      String(post.capturedAt),
      post.text,
      numberCell(post.metrics.likes),
      numberCell(post.metrics.reposts),
      numberCell(post.metrics.replies),
      numberCell(post.metrics.comments),
      numberCell(post.metrics.reactions),
      numberCell(post.metrics.impressions),
      numberCell(post.metrics.views),
      String(post.reachScore),
      post.tags.join('|'),
      String(post.media?.length ?? 0),
      capture?.runId ?? '',
      capture?.status ?? '',
      capture?.screenshotRelPath ?? '',
      capture?.warnings.join('|') ?? '',
    ];
  });
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

function publicPost(post: EventPost) {
  const { raw: _raw, ...rest } = post;
  return rest;
}

function publicCaptureRun(run: EventPostCaptureRun) {
  return {
    eventId: run.eventId,
    runId: run.runId,
    provider: run.provider,
    targetCount: run.targetCount,
    capturedCount: run.capturedCount,
    pageCapturedCount: run.pageCapturedCount,
    blockedCount: run.blockedCount,
    failedCount: run.failedCount,
    captures: run.captures.map(publicCapture),
  };
}

function publicCapture(capture: EventPostCapture) {
  return {
    runId: capture.runId,
    provider: capture.provider,
    status: capture.status,
    platform: capture.platform,
    url: capture.url,
    finalUrl: capture.finalUrl,
    postId: capture.postId,
    authorName: capture.authorName,
    authorHandle: capture.authorHandle,
    capturedAt: capture.capturedAt,
    screenshotRelPath: capture.screenshotRelPath,
    screenshotBytes: capture.screenshotBytes,
    screenshotSha256: capture.screenshotSha256,
    blockedReason: capture.blockedReason,
    warnings: capture.warnings,
  };
}

function postUrlKey(url: string): string {
  try {
    const parsed = new URL(url.trim());
    parsed.hash = '';
    parsed.search = '';
    parsed.hostname = parsed.hostname.replace(/^www\./, '').toLowerCase();
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    return parsed.toString().toLowerCase();
  } catch {
    return url.trim().split(/[?#]/)[0].replace(/\/+$/, '').toLowerCase();
  }
}

function numberCell(value: number | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

import type { EventPlatform, EventPost, EventRecapBundle } from './types';

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
}

export function buildEventRawExport(bundle: EventRecapBundle, scope: EventRawExportScope) {
  return {
    metadata: eventRawExportMetadata(bundle, scope),
    event: bundle.event,
    runs: bundle.runs,
    themes: bundle.themes,
    voices: bundle.voices,
    clustering: bundle.clustering,
    posts: scope === 'raw' ? bundle.posts : bundle.posts.map(publicPost),
  };
}

export function eventRawExportMetadata(
  bundle: EventRecapBundle,
  scope: EventRawExportScope
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
    },
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

export function eventPostsCsv(bundle: EventRecapBundle): string {
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
  ];
  const rows = bundle.posts.map((post) => [
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
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

function publicPost(post: EventPost) {
  const { raw: _raw, ...rest } = post;
  return rest;
}

function numberCell(value: number | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

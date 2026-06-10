export type ReferencePostFormat = 'thread' | 'single' | 'media' | 'link';
export type ReferencePostHookShape = 'number-led' | 'question' | 'claim' | 'story';
export type ReferencePostLengthBucket = 'short' | 'medium' | 'long';

export interface ReferenceAccountPost {
  handle: string;
  postUrl: string;
  text: string;
  postedAt: string;
  capturedAt: string;
  hasMedia?: boolean;
  metrics: {
    likes?: number;
    reposts?: number;
    replies?: number;
    impressions?: number;
  };
}

export interface ReferencePostFeatures {
  format: ReferencePostFormat;
  hookShape: ReferencePostHookShape;
  lengthBucket: ReferencePostLengthBucket;
  postingHourUtc: number;
}

export interface ReferenceAccountDigest {
  postCount: number;
  medianEngagementByFormat: Partial<Record<ReferencePostFormat, number>>;
  medianEngagementByHook: Partial<Record<ReferencePostHookShape, number>>;
  medianEngagementByLength: Partial<Record<ReferencePostLengthBucket, number>>;
  topQuartilePostingHoursUtc: number[];
  exemplarPostUrls: string[];
}

const URL_RE = /https?:\/\/\S+/i;

export function classifyReferencePost(post: ReferenceAccountPost): ReferencePostFeatures {
  const text = post.text.trim();
  return {
    format: classifyFormat(post),
    hookShape: classifyHook(text),
    lengthBucket: classifyLength(text),
    postingHourUtc: new Date(post.postedAt).getUTCHours(),
  };
}

export function buildReferenceAccountDigest(
  posts: ReferenceAccountPost[]
): ReferenceAccountDigest {
  const rows = posts.map((post) => ({
    post,
    features: classifyReferencePost(post),
    engagement: engagementScore(post),
  }));
  return {
    postCount: posts.length,
    medianEngagementByFormat: groupedMedian(rows, (row) => row.features.format),
    medianEngagementByHook: groupedMedian(rows, (row) => row.features.hookShape),
    medianEngagementByLength: groupedMedian(rows, (row) => row.features.lengthBucket),
    topQuartilePostingHoursUtc: topQuartileHours(posts),
    exemplarPostUrls: [...rows]
      .sort((a, b) => sortByEngagementThenPostedAt(a, b))
      .slice(0, 5)
      .map((row) => row.post.postUrl),
  };
}

export function topQuartileHours(posts: ReferenceAccountPost[]): number[] {
  const rows = posts
    .map((post) => ({ post, engagement: engagementScore(post) }))
    .sort((a, b) => sortByEngagementThenPostedAt(a, b));
  const topCount = Math.max(1, Math.ceil(rows.length / 4));
  return rows
    .slice(0, topCount)
    .map((row) => new Date(row.post.postedAt).getUTCHours())
    .sort((a, b) => a - b);
}

function sortByEngagementThenPostedAt(
  a: { post: ReferenceAccountPost; engagement: number },
  b: { post: ReferenceAccountPost; engagement: number }
): number {
  const engagementDelta = b.engagement - a.engagement;
  if (engagementDelta !== 0) return engagementDelta;
  return Date.parse(b.post.postedAt) - Date.parse(a.post.postedAt);
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

export function engagementScore(post: ReferenceAccountPost): number {
  return (
    (post.metrics.likes ?? 0) +
    (post.metrics.reposts ?? 0) +
    (post.metrics.replies ?? 0)
  );
}

function classifyFormat(post: ReferenceAccountPost): ReferencePostFormat {
  const text = post.text.trim();
  if (/^(?:\d+\/|thread\b)|\bthread\b/i.test(text)) return 'thread';
  if (post.hasMedia) return 'media';
  if (URL_RE.test(text)) return 'link';
  return 'single';
}

function classifyHook(text: string): ReferencePostHookShape {
  const first = text.slice(0, 120);
  if (/\d/.test(first)) return 'number-led';
  if (/\?/.test(first)) return 'question';
  if (/^(?:i|we)\b/i.test(first) || /\b(learned|failed|shipped|rebuilt|hit)\b/i.test(first)) {
    return 'story';
  }
  return 'claim';
}

function classifyLength(text: string): ReferencePostLengthBucket {
  const count = Array.from(text).length;
  if (count <= 60) return 'short';
  if (count <= 180) return 'medium';
  return 'long';
}

function groupedMedian<T extends string>(
  rows: Array<{ features: ReferencePostFeatures; engagement: number }>,
  keyFor: (row: { features: ReferencePostFeatures; engagement: number }) => T
): Partial<Record<T, number>> {
  const groups = new Map<T, number[]>();
  for (const row of rows) {
    const key = keyFor(row);
    groups.set(key, [...(groups.get(key) ?? []), row.engagement]);
  }
  return Object.fromEntries(
    [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, values]) => [key, median(values)])
  ) as Partial<Record<T, number>>;
}

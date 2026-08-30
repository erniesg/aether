import type { EventAuthorMeta, EventPostMedia, PlatformScrapeResult } from './types';
import { bestDisplayAuthorName, makePostId, normalizeQuerySet } from './utils';

type ApifyEnv = Partial<Record<string, string | undefined>>;
type Fetcher = typeof fetch;

export type ApifyXSort = 'Top' | 'Latest' | 'Latest + Top';
export type ApifyLinkedInSort = 'date' | 'relevance';
export type ApifyLinkedInContentType = 'all' | 'documents' | 'images' | 'videos' | 'articles';

export const APIFY_TWEET_SCRAPER_ACTOR_ID = '61RPP7dywgiy0JPD0';
export const APIFY_TWITTER_SCRAPER_LITE_ACTOR_ID = 'nfp1fpt5gUlBwPcor';
export const APIFY_LINKEDIN_POST_SEARCH_ACTOR_ID = 'harvestapi~linkedin-post-search';

interface ApifyRunInput {
  startUrls?: string[];
  searchTerms?: string[];
  maxItems: number;
  sort?: ApifyXSort;
  tweetLanguage?: string;
  includeSearchTerms?: boolean;
  start?: string;
  end?: string;
}

export interface ApifyXSearchInput {
  querySet: string[];
  windowStart: string;
  windowEnd: string;
  maxItems: number;
  maxQueries?: number;
  actorId?: string;
  sort?: ApifyXSort;
  tweetLanguage?: string;
  candidateMultiplier?: number;
  seenPostUrls?: string[];
}

export interface ApifyLinkedInSearchInput {
  querySet: string[];
  windowStart: string;
  windowEnd: string;
  maxItems: number;
  maxQueries?: number;
  actorId?: string;
  sortBy?: ApifyLinkedInSort;
  contentType?: ApifyLinkedInContentType;
  candidateMultiplier?: number;
  seenPostUrls?: string[];
  scrapeComments?: boolean;
  maxComments?: number;
  scrapeReactions?: boolean;
  maxReactions?: number;
  postNestedComments?: boolean;
}

export function isApifyConfigured(env: ApifyEnv = process.env): boolean {
  return Boolean(env.APIFY_API_TOKEN?.trim() || env.APIFY_TOKEN?.trim());
}

export async function searchXViaApify(
  input: ApifyXSearchInput,
  env: ApifyEnv = process.env,
  fetcher: Fetcher = fetch
): Promise<PlatformScrapeResult> {
  const token = apifyToken(env);
  if (!token) {
    return {
      platform: 'x',
      posts: [],
      warnings: ['Apify token is not configured'],
      raw: {},
    };
  }

  const actorId = input.actorId?.trim() || env.APIFY_X_ACTOR_ID?.trim() || APIFY_TWEET_SCRAPER_ACTOR_ID;
  const seenUrls = new Set((input.seenPostUrls ?? []).map(xPostUrlKey));
  const runInput = buildApifyXRunInput(input);
  const res = await fetcher(
    `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(runInput),
    }
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Apify X actor failed: HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const items = parseApifyItems(text);
  const sentinelItems = items.filter(isApifySentinelItem);
  let skippedSeen = 0;
  const byUrl = new Map<string, PlatformScrapeResult['posts'][number]>();
  for (const item of items) {
    if (isApifySentinelItem(item)) continue;
    const post = normalizeApifyXTweet(item);
    if (!post) continue;
    const key = xPostUrlKey(post.url);
    if (seenUrls.has(key)) {
      skippedSeen += 1;
      continue;
    }
    byUrl.set(key, post);
    if (byUrl.size >= input.maxItems) break;
  }

  return {
    platform: 'x',
    posts: Array.from(byUrl.values()).slice(0, input.maxItems),
    warnings: apifyWarnings({
      actorId,
      itemsReturned: items.length,
      sentinelItems: sentinelItems.length,
      skippedSeen,
      posts: byUrl.size,
    }),
    raw: {
      actorId,
      input: runInput,
      itemsReturned: items.length,
      sentinelItems: sentinelItems.length,
      skippedSeen,
    },
  };
}

export async function searchLinkedInViaApify(
  input: ApifyLinkedInSearchInput,
  env: ApifyEnv = process.env,
  fetcher: Fetcher = fetch
): Promise<PlatformScrapeResult> {
  const token = apifyToken(env);
  if (!token) {
    return {
      platform: 'linkedin',
      posts: [],
      warnings: ['Apify token is not configured'],
      raw: {},
    };
  }

  const actorId =
    input.actorId?.trim() || env.APIFY_LINKEDIN_ACTOR_ID?.trim() || APIFY_LINKEDIN_POST_SEARCH_ACTOR_ID;
  const seenUrls = new Set((input.seenPostUrls ?? []).map(linkedInPostUrlKey));
  const runInput = buildApifyLinkedInRunInput(input);
  const searchQueries = Array.isArray(runInput.searchQueries) ? runInput.searchQueries : [];
  if (!searchQueries.length) {
    return {
      platform: 'linkedin',
      posts: [],
      warnings: ['Apify LinkedIn search skipped because no keyword queries remained after removing direct LinkedIn URLs.'],
      raw: { actorId, input: runInput, skippedSeen: 0 },
    };
  }

  const res = await fetcher(
    `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(runInput),
    }
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Apify LinkedIn actor failed: HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const items = parseApifyItems(text);
  let skippedSeen = 0;
  const byUrl = new Map<string, PlatformScrapeResult['posts'][number]>();
  for (const item of items) {
    const post = normalizeApifyLinkedInPost(item);
    if (!post) continue;
    const key = linkedInPostUrlKey(post.url);
    if (seenUrls.has(key)) {
      skippedSeen += 1;
      continue;
    }
    byUrl.set(key, post);
    for (const comment of normalizeApifyLinkedInComments(item, post.url)) {
      const commentKey = linkedInPostUrlKey(comment.url);
      if (seenUrls.has(commentKey) || byUrl.has(commentKey)) continue;
      byUrl.set(commentKey, comment);
    }
    if (byUrl.size >= input.maxItems) break;
  }

  const posts = Array.from(byUrl.values()).slice(0, input.maxItems);
  return {
    platform: 'linkedin',
    posts,
    warnings: [
      `Apify LinkedIn actor ${actorId} returned ${items.length} rows; skipped ${skippedSeen} already-seen LinkedIn activity URLs.`,
      ...(posts.length ? [] : ['Apify returned no usable LinkedIn posts after dedupe and normalization.']),
    ],
    raw: {
      actorId,
      input: runInput,
      itemsReturned: items.length,
      skippedSeen,
    },
  };
}

export function normalizeApifyXTweet(item: unknown): PlatformScrapeResult['posts'][number] | null {
  if (!item || typeof item !== 'object') return null;
  const record = item as Record<string, unknown>;
  const id = stringValue(
    record.id ??
      record.tweetId ??
      record.tweet_id ??
      record.id_str ??
      record.rest_id ??
      record.restId
  );
  const author = objectValue(record.author) ?? objectValue(record.user) ?? {};
  const handle = stripAt(
    stringValue(
      record.authorHandle ??
        record.authorUsername ??
        record.userName ??
        record.username ??
        record.screenName ??
        author.userName ??
        author.username ??
        author.screen_name ??
        author.screenName
    )
  );
  const url =
    normalizeXPostUrl(stringValue(record.url ?? record.twitterUrl ?? record.tweetUrl)) ??
    (handle && id ? `https://x.com/${handle}/status/${id}` : undefined);
  const text = stringValue(record.fullText ?? record.text ?? record.tweetText ?? record.content);
  if (!url || !text) return null;

  return {
    postId: makePostId('x', url, text),
    platform: 'x',
    url,
    authorName:
      stringValue(record.authorName ?? record.name ?? author.name ?? author.fullName) || handle || 'unknown',
    authorHandle: handle,
    authorUrl: handle ? `https://x.com/${handle}` : undefined,
    authorMeta: authorMetaFromApify(record, author),
    text,
    postedAt: stringValue(record.createdAt ?? record.created_at ?? record.timestamp) || undefined,
    metrics: {
      likes: numberValue(record.likeCount ?? record.favoriteCount ?? record.favorites ?? record.likes),
      reposts: combinedReposts(record),
      replies: numberValue(record.replyCount ?? record.replies),
      impressions: numberValue(record.viewCount ?? record.views ?? record.impressionCount),
      views: numberValue(record.viewCount ?? record.views ?? record.impressionCount),
    },
    media: mediaFromApifyTweet(record),
    tags: ['apify-x'],
    raw: item,
  };
}

export function normalizeApifyLinkedInPost(
  item: unknown
): PlatformScrapeResult['posts'][number] | null {
  if (!item || typeof item !== 'object') return null;
  const record = item as Record<string, unknown>;
  const author = objectValue(record.author) ?? {};
  const url = normalizeLinkedInPostUrl(
    stringValue(
      record.linkedinUrl ??
        record.linkedin_url ??
        record.shareLinkedinUrl ??
        record.shareLinkedInUrl ??
        objectValue(record.header)?.linkedinUrl ??
        objectValue(record.socialContent)?.shareUrl
    )
  );
  const text = stringValue(record.content ?? record.text ?? record.body ?? objectValue(record.article)?.description);
  if (!url || !text) return null;

  const handle = stripLinkedInHandle(
    stringValue(author.publicIdentifier ?? author.universalName ?? record.authorHandle ?? record.author_handle)
  );
  const authorUrl =
    normalizeLinkedInProfileUrl(
      stringValue(author.linkedinUrl ?? record.authorUrl ?? record.author_url)
    ) ?? (handle ? `https://www.linkedin.com/in/${handle}/` : undefined);

  return {
    postId: makePostId('linkedin', url, text),
    platform: 'linkedin',
    url,
    authorName: bestDisplayAuthorName({
      platform: 'linkedin',
      authorName: stringValue(author.name ?? record.authorName ?? record.author_name) || undefined,
      authorHandle: handle,
      raw: record,
    }),
    authorHandle: handle,
    authorUrl,
    authorMeta: authorMetaFromApifyLinkedIn(author),
    text,
    postedAt: linkedInPostedAt(record.postedAt ?? record.posted_at ?? record.createdAt),
    metrics: metricsFromApifyLinkedIn(record),
    media: mediaFromApifyLinkedInPost(record),
    tags: ['apify-linkedin', 'apify-linkedin-post-search'],
    raw: item,
  };
}

function buildApifyLinkedInRunInput(input: ApifyLinkedInSearchInput): Record<string, unknown> {
  const rawQueries = normalizeQuerySet(input.querySet, Math.max(input.maxQueries ?? 12, 1));
  const searchQueries = normalizeQuerySet(
    rawQueries
      .filter((query) => !isLinkedInUrl(query))
      .map((query) => truncateLinkedInSearchQuery(query)),
    input.maxQueries ?? 12
  );
  const multiplier =
    typeof input.candidateMultiplier === 'number' && Number.isFinite(input.candidateMultiplier)
      ? Math.max(1, Math.min(5, input.candidateMultiplier))
      : 1;
  const perQueryTarget = Math.ceil(input.maxItems / Math.max(1, searchQueries.length));
  const maxPosts = Math.max(1, Math.min(1000, Math.ceil(perQueryTarget * multiplier)));
  const postedLimitDate = isoDateOnly(input.windowStart);
  return {
    searchQueries,
    maxPosts,
    sortBy: input.sortBy ?? 'date',
    contentType: input.contentType ?? 'all',
    ...(postedLimitDate ? { postedLimitDate } : { postedLimit: 'month' }),
    scrapeComments: input.scrapeComments ?? false,
    ...(typeof input.maxComments === 'number'
      ? { maxComments: Math.max(0, Math.min(100, Math.round(input.maxComments))) }
      : {}),
    scrapeReactions: input.scrapeReactions ?? false,
    ...(typeof input.maxReactions === 'number'
      ? { maxReactions: Math.max(0, Math.min(1000, Math.round(input.maxReactions))) }
      : {}),
    ...(typeof input.postNestedComments === 'boolean' ? { postNestedComments: input.postNestedComments } : {}),
  };
}

function buildApifyXRunInput(input: ApifyXSearchInput): ApifyRunInput {
  const queries = normalizeQuerySet(input.querySet, input.maxQueries ?? 12);
  const startUrls = normalizeQuerySet(
    queries.filter((query) => normalizeXPostUrl(query) || isXUrl(query)),
    200
  );
  const searchTerms = normalizeQuerySet(
    queries
      .filter((query) => !normalizeXPostUrl(query) && !isXUrl(query))
      .map((query) => query.replace(/\s+-is:retweet\b/gi, '').trim()),
    input.maxQueries ?? 12
  );
  const multiplier =
    typeof input.candidateMultiplier === 'number' && Number.isFinite(input.candidateMultiplier)
      ? Math.max(1, Math.min(5, input.candidateMultiplier))
      : 1;
  const maxItems = Math.max(1, Math.min(1000, Math.ceil(input.maxItems * multiplier)));
  return {
    ...(startUrls.length ? { startUrls } : {}),
    ...(searchTerms.length ? { searchTerms } : {}),
    maxItems,
    sort: input.sort ?? 'Latest',
    tweetLanguage: input.tweetLanguage ?? 'en',
    includeSearchTerms: true,
    start: isoDateOnly(input.windowStart),
    end: isoDateOnly(input.windowEnd),
  };
}

function normalizeApifyLinkedInComments(
  item: unknown,
  parentUrl: string
): PlatformScrapeResult['posts'] {
  if (!item || typeof item !== 'object') return [];
  const record = item as Record<string, unknown>;
  const comments = Array.isArray(record.comments) ? record.comments : [];
  return comments
    .map((comment, index) => normalizeApifyLinkedInComment(comment, parentUrl, index))
    .filter((comment): comment is PlatformScrapeResult['posts'][number] => Boolean(comment));
}

function normalizeApifyLinkedInComment(
  value: unknown,
  parentUrl: string,
  index: number
): PlatformScrapeResult['posts'][number] | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const author = objectValue(record.author) ?? objectValue(record.commenter) ?? {};
  const text = stringValue(record.content ?? record.text ?? record.body);
  if (!text) return null;
  const explicitUrl = normalizeLinkedInPostUrl(
    stringValue(record.linkedinUrl ?? record.url ?? record.commentUrl ?? record.comment_url)
  );
  const url = explicitUrl ?? `${parentUrl}#comment-${index + 1}-${makePostId('linkedin', parentUrl, text)}`;
  const handle = stripLinkedInHandle(
    stringValue(author.publicIdentifier ?? author.universalName ?? record.authorHandle ?? record.author_handle)
  );
  return {
    postId: makePostId('linkedin', url, text),
    platform: 'linkedin',
    url,
    authorName: stringValue(author.name ?? record.authorName ?? record.author_name) || handle || 'unknown',
    authorHandle: handle,
    authorUrl:
      normalizeLinkedInProfileUrl(stringValue(author.linkedinUrl ?? record.authorUrl ?? record.author_url)) ??
      (handle ? `https://www.linkedin.com/in/${handle}/` : undefined),
    authorMeta: authorMetaFromApifyLinkedIn(author),
    text,
    postedAt: linkedInPostedAt(record.postedAt ?? record.posted_at ?? record.createdAt),
    metrics: metricsFromApifyLinkedIn(record),
    tags: ['apify-linkedin', 'linkedin-comment', 'comment', 'conversation'],
    raw: value,
  };
}

function apifyWarnings(input: {
  actorId: string;
  itemsReturned: number;
  sentinelItems: number;
  skippedSeen: number;
  posts: number;
}): string[] {
  const warnings = [
    `Apify X actor ${input.actorId} returned ${input.itemsReturned} rows; skipped ${input.skippedSeen} already-seen X URLs.`,
  ];
  if (input.sentinelItems > 0) {
    warnings.push(
      `Apify returned ${input.sentinelItems} sentinel rows such as noResults/demo; if every row is sentinel, check actor plan/API access and run logs.`
    );
  }
  if (input.posts === 0) {
    warnings.push('Apify returned no usable X posts after dedupe and sentinel filtering.');
  }
  return warnings;
}

function parseApifyItems(text: string): unknown[] {
  const parsed = JSON.parse(text || '[]') as unknown;
  return Array.isArray(parsed) ? parsed : [];
}

function isApifySentinelItem(item: unknown): boolean {
  if (!item || typeof item !== 'object') return false;
  const record = item as Record<string, unknown>;
  return record.noResults === true || record.demo === true;
}

function authorMetaFromApify(
  record: Record<string, unknown>,
  author: Record<string, unknown>
): EventAuthorMeta | undefined {
  const meta: EventAuthorMeta = {
    description: stringValue(record.authorDescription ?? author.description) || undefined,
    location: stringValue(record.location ?? author.location) || undefined,
    followers: numberValue(record.followers ?? record.followersCount ?? author.followers ?? author.followersCount),
    following: numberValue(record.following ?? record.followingCount ?? author.following ?? author.followingCount),
    posts: numberValue(record.statusesCount ?? record.tweetCount ?? author.statusesCount ?? author.tweetCount),
    verified: booleanValue(record.verified ?? author.verified),
    verifiedType: stringValue(record.verifiedType ?? author.verifiedType) || undefined,
    profileImageUrl:
      stringValue(record.profileImageUrl ?? record.profile_image_url ?? author.profileImageUrl ?? author.profile_image_url) ||
      undefined,
  };
  return Object.values(meta).some((value) => value !== undefined) ? meta : undefined;
}

function authorMetaFromApifyLinkedIn(author: Record<string, unknown>): EventAuthorMeta | undefined {
  const info = stringValue(author.info ?? author.headline ?? author.description);
  const meta: EventAuthorMeta = {
    headline: info || undefined,
    description: stringValue(author.description) || undefined,
    followers: numberValue(author.followers ?? author.followersCount) ?? parseLinkedInFollowerCount(info),
    verified: booleanValue(author.verified),
    verifiedType: stringValue(author.verifiedType) || undefined,
    profileImageUrl: stringValue(objectValue(author.avatar)?.url ?? author.profileImageUrl ?? author.profile_image_url) || undefined,
  };
  return Object.values(meta).some((value) => value !== undefined) ? meta : undefined;
}

function combinedReposts(record: Record<string, unknown>): number | undefined {
  const explicit = numberValue(record.repostCount ?? record.reposts);
  if (explicit !== undefined) return explicit;
  const retweets = numberValue(record.retweetCount ?? record.retweets) ?? 0;
  const quotes = numberValue(record.quoteCount ?? record.quotes) ?? 0;
  const total = retweets + quotes;
  return total > 0 ? total : undefined;
}

function metricsFromApifyLinkedIn(record: Record<string, unknown>): PlatformScrapeResult['posts'][number]['metrics'] {
  const engagement = objectValue(record.engagement) ?? {};
  const reactionRows = Array.isArray(engagement.reactions)
    ? engagement.reactions.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    : Array.isArray(record.reactions)
      ? record.reactions.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      : [];
  const summedReactions = reactionRows.reduce((sum, item) => sum + (numberValue(item.count) ?? 0), 0);
  const reactions =
    numberValue(engagement.likes ?? engagement.reactionsCount ?? record.reactionsCount ?? record.likes) ??
    (summedReactions > 0 ? summedReactions : undefined);
  return {
    comments: numberValue(engagement.comments ?? record.commentsCount ?? record.commentCount ?? record.comments),
    reactions,
    reposts: numberValue(engagement.shares ?? record.shares ?? record.reposts ?? record.repostCount),
    impressions: numberValue(engagement.impressions ?? record.impressions ?? engagement.views ?? record.views),
    views: numberValue(engagement.views ?? record.views ?? engagement.impressions ?? record.impressions),
  };
}

function mediaFromApifyTweet(record: Record<string, unknown>): EventPostMedia[] | undefined {
  const out = new Map<string, EventPostMedia>();
  const add = (media: EventPostMedia) => {
    const url = media.url.trim();
    if (!url || out.has(url)) return;
    out.set(url, { ...media, url });
  };
  for (const source of [
    record.media,
    record.photos,
    record.images,
    record.videos,
    objectValue(record.entities)?.media,
    objectValue(record.extendedEntities)?.media,
    objectValue(record.extended_entities)?.media,
  ]) {
    collectMedia(source, add);
  }
  const media = Array.from(out.values());
  return media.length ? media : undefined;
}

function mediaFromApifyLinkedInPost(record: Record<string, unknown>): EventPostMedia[] | undefined {
  const out = new Map<string, EventPostMedia>();
  const add = (media: EventPostMedia) => {
    const url = media.url.trim();
    if (!url || out.has(url) || !isLikelyLinkedInMediaUrl(url)) return;
    out.set(url, { ...media, url });
  };

  for (const source of [
    record.postImages,
    record.images,
    record.media,
    record.postVideos,
    record.videos,
    objectValue(record.article)?.image,
    objectValue(record.article)?.thumbnail,
    objectValue(record.article)?.thumbnailUrl,
    objectValue(record.article)?.imageUrl,
    objectValue(record.document)?.coverImage,
    objectValue(record.document)?.coverImages,
  ]) {
    collectLinkedInMedia(source, add);
  }
  const media = Array.from(out.values());
  return media.length ? media : undefined;
}

function collectMedia(value: unknown, add: (media: EventPostMedia) => void) {
  if (!value) return;
  if (typeof value === 'string') {
    if (isLikelyXMediaUrl(value)) {
      add({ url: value, type: mediaTypeFromUrl(value), source: 'apify-x' });
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectMedia(item, add);
    return;
  }
  if (typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  const url = stringValue(
    record.media_url_https ??
      record.media_url ??
      record.mediaUrl ??
      record.url ??
      record.fullUrl ??
      record.expandedUrl ??
      record.preview_image_url ??
      record.previewUrl ??
      record.thumbnailUrl
  );
  const previewUrl = stringValue(record.preview_image_url ?? record.previewUrl ?? record.thumbnailUrl);
  const pickedUrl = url || previewUrl;
  if (pickedUrl && isLikelyXMediaUrl(pickedUrl)) {
    add({
      url: pickedUrl,
      type: mediaTypeFromValue(stringValue(record.type), pickedUrl),
      source: 'apify-x',
      previewUrl: previewUrl || undefined,
      altText: stringValue(record.altText ?? record.ext_alt_text ?? record.alt_text) || undefined,
      width: numberValue(record.width),
      height: numberValue(record.height),
    });
  }
}

function collectLinkedInMedia(value: unknown, add: (media: EventPostMedia) => void) {
  if (!value) return;
  if (typeof value === 'string') {
    add({
      url: value,
      type: mediaTypeFromLinkedInValue('', value),
      source: 'apify-linkedin',
    });
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectLinkedInMedia(item, add);
    return;
  }
  if (typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  const url = stringValue(
    record.url ??
      record.src ??
      record.imageUrl ??
      record.image_url ??
      record.thumbnailUrl ??
      record.thumbnail_url ??
      record.previewUrl ??
      record.preview_url
  );
  const previewUrl = stringValue(record.previewUrl ?? record.preview_url ?? record.thumbnailUrl ?? record.thumbnail_url);
  const pickedUrl = url || previewUrl;
  if (!pickedUrl) return;
  add({
    url: pickedUrl,
    type: mediaTypeFromLinkedInValue(stringValue(record.type), pickedUrl),
    source: 'apify-linkedin',
    previewUrl: previewUrl || undefined,
    altText: stringValue(record.altText ?? record.alt_text ?? record.alt) || undefined,
    width: numberValue(record.width),
    height: numberValue(record.height),
  });
}

function mediaTypeFromValue(value: string, url: string): EventPostMedia['type'] {
  const normalized = value.toLowerCase();
  if (normalized.includes('gif')) return 'gif';
  if (normalized.includes('video')) return 'video';
  if (normalized.includes('photo') || normalized.includes('image')) return 'image';
  return mediaTypeFromUrl(url);
}

function mediaTypeFromLinkedInValue(value: string, url: string): EventPostMedia['type'] {
  const normalized = value.toLowerCase();
  if (normalized.includes('video')) return 'video';
  if (normalized.includes('gif')) return 'gif';
  if (normalized.includes('document')) return 'image';
  if (normalized.includes('image') || normalized.includes('photo')) return 'image';
  return mediaTypeFromUrl(url);
}

function mediaTypeFromUrl(url: string): EventPostMedia['type'] {
  const lower = url.toLowerCase();
  if (/\.(mp4|mov|webm|m4v)(?:$|\?)/.test(lower)) return 'video';
  if (/\.gif(?:$|\?)/.test(lower)) return 'gif';
  if (/\.(png|jpe?g|webp|avif)(?:$|\?)/.test(lower) || lower.includes('pbs.twimg.com/media')) {
    return 'image';
  }
  return 'unknown';
}

function isLikelyLinkedInMediaUrl(url: string): boolean {
  const lower = url.toLowerCase();
  if (!lower.includes('media.licdn.com')) return false;
  if (
    [
      'profile-displayphoto',
      'profile-displaybackgroundimage',
      'company-logo',
      'company-background',
      'static.licdn.com',
    ].some((marker) => lower.includes(marker))
  ) {
    return false;
  }
  return (
    lower.includes('/image') ||
    lower.includes('/video') ||
    lower.includes('feedshare') ||
    lower.includes('document-cover') ||
    lower.includes('video-thumbnail') ||
    /\.(png|jpe?g|webp|gif|mp4|mov|webm|m4v)(?:$|\?)/.test(lower)
  );
}

function isLikelyXMediaUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes('pbs.twimg.com/media') ||
    lower.includes('video.twimg.com') ||
    lower.includes('ton.twitter.com') ||
    /\.(png|jpe?g|webp|gif|mp4|mov|webm|m4v)(?:$|\?)/.test(lower)
  );
}

function normalizeXPostUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    const url = new URL(trimmed);
    if (!/(^|\.)x\.com$|(^|\.)twitter\.com$/i.test(url.hostname)) return undefined;
    const match = url.pathname.match(/^\/([^/]+)\/status\/(\d+)/i);
    if (!match) return undefined;
    return `https://x.com/${match[1]}/status/${match[2]}`;
  } catch {
    return undefined;
  }
}

function normalizeLinkedInPostUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    const url = new URL(trimmed);
    if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) return undefined;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'feed' && parts[1] === 'update' && parts[2]) {
      return `https://www.linkedin.com/feed/update/${decodeURIComponent(parts[2])}`;
    }
    if (parts[0] === 'posts' && parts[1]) {
      const activity = parts[1].match(/activity-(\d+)/i)?.[1];
      return activity
        ? `https://www.linkedin.com/feed/update/urn:li:activity:${activity}`
        : `https://www.linkedin.com/posts/${parts[1]}`;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function normalizeLinkedInProfileUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    const url = new URL(trimmed);
    if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) return undefined;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'in' && parts[1]) return `https://www.linkedin.com/in/${parts[1]}/`;
    if (parts[0] === 'company' && parts[1]) return `https://www.linkedin.com/company/${parts[1]}/`;
    return undefined;
  } catch {
    return undefined;
  }
}

function linkedInPostUrlKey(value: string): string {
  const normalized = normalizeLinkedInPostUrl(value);
  try {
    const parsed = new URL(value);
    if (parsed.hash && normalized) return `${normalized}${parsed.hash}`.toLowerCase();
  } catch {
    // Fall through to the plain canonical key for non-URL fragments.
  }
  return (normalized ?? value.trim().split(/[?#]/)[0].replace(/\/$/, '')).toLowerCase();
}

function isLinkedInUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return /(^|\.)linkedin\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function xPostUrlKey(value: string): string {
  const normalized = normalizeXPostUrl(value);
  return (normalized ?? value.trim().split(/[?#]/)[0].replace(/\/$/, '')).toLowerCase();
}

function isXUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return /(^|\.)x\.com$|(^|\.)twitter\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function isoDateOnly(value: string): string | undefined {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return undefined;
  return new Date(time).toISOString().slice(0, 10);
}

function linkedInPostedAt(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString();
  const record = objectValue(value);
  if (!record) return undefined;
  const date = stringValue(record.date);
  if (date) return date;
  const timestamp = numberValue(record.timestamp);
  return timestamp !== undefined ? new Date(timestamp).toISOString() : undefined;
}

function parseLinkedInFollowerCount(value: string): number | undefined {
  const match = value.match(/([\d,.]+)\s*([kKmM])?\s+followers?\b/);
  if (!match) return undefined;
  const base = Number(match[1]?.replace(/,/g, ''));
  if (!Number.isFinite(base)) return undefined;
  const multiplier = match[2]?.toLowerCase() === 'm' ? 1_000_000 : match[2]?.toLowerCase() === 'k' ? 1_000 : 1;
  return Math.round(base * multiplier);
}

function truncateLinkedInSearchQuery(value: string): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized.length <= 85 ? normalized : normalized.slice(0, 85).trim();
}

function apifyToken(env: ApifyEnv): string | undefined {
  return env.APIFY_API_TOKEN?.trim() || env.APIFY_TOKEN?.trim() || undefined;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function stripAt(value: string): string | undefined {
  const stripped = value.replace(/^@/, '').trim();
  return stripped || undefined;
}

function stripLinkedInHandle(value: string): string | undefined {
  const stripped = value.replace(/^@/, '').trim();
  return stripped || undefined;
}

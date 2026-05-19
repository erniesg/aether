import fs from 'node:fs';
import path from 'node:path';

const EVENT_DIR = path.resolve(process.cwd(), 'outputs/event-recap-ai-engineer-singapore');
const archivePath = path.join(EVENT_DIR, 'archive.json');
const outPath = path.join(EVENT_DIR, 'public.json');

type AnyRecord = Record<string, any>;

function isRelevant(post: AnyRecord): boolean {
  return (post.tags ?? []).some((tag: string) => tag.toLowerCase() === 'relevant:event');
}

function isReply(post: AnyRecord): boolean {
  return (post.tags ?? []).some((tag: string) => tag.toLowerCase() === 'x-reply');
}

function mediaPath(localPath: unknown): string | undefined {
  if (typeof localPath !== 'string') return undefined;
  const marker = `${path.sep}outputs${path.sep}`;
  const index = localPath.indexOf(marker);
  if (index === -1) return undefined;
  return localPath.slice(index + marker.length).split(path.sep).join('/');
}

function trimPost(post: AnyRecord): AnyRecord {
  return {
    postId: post.postId,
    platform: post.platform,
    url: post.url,
    authorName: post.authorName,
    authorHandle: post.authorHandle,
    authorUrl: post.authorUrl,
    text: post.text,
    postedAt: post.postedAt,
    capturedAt: post.capturedAt,
    updatedAt: post.updatedAt,
    reachScore: post.reachScore,
    metrics: post.metrics ?? {},
    tags: post.tags ?? [],
    isReply: isReply(post),
    media: (post.media ?? []).map((item: AnyRecord) => ({
      url: item.url,
      type: item.type,
      source: item.source,
      previewUrl: item.previewUrl,
      altText: item.altText,
      width: item.width,
      height: item.height,
      contentType: item.contentType,
      bytes: item.bytes,
      downloadedAt: item.downloadedAt,
      path: mediaPath(item.localPath),
    })),
  };
}

function clusterCoverage(posts: AnyRecord[], themes: AnyRecord[]): AnyRecord {
  const postIds = new Set(posts.map((post) => post.postId).filter(Boolean));
  const clusteredIds = new Set<string>();
  const rootIds = new Set<string>();
  const attachedIds = new Set<string>();

  for (const theme of themes) {
    for (const postId of theme.postIds ?? []) {
      if (postIds.has(postId)) clusteredIds.add(postId);
    }
    for (const postId of theme.rootPostIds ?? []) {
      if (postIds.has(postId)) rootIds.add(postId);
    }
    for (const postId of theme.attachedPostIds ?? []) {
      if (postIds.has(postId)) attachedIds.add(postId);
    }
  }

  const unclusteredByPlatform: Record<string, number> = {};
  for (const post of posts) {
    if (clusteredIds.has(post.postId)) continue;
    unclusteredByPlatform[post.platform] = (unclusteredByPlatform[post.platform] ?? 0) + 1;
  }

  return {
    totalRefs: posts.length,
    clusteredRefs: clusteredIds.size,
    rootRefs: rootIds.size || clusteredIds.size,
    attachedRefs: attachedIds.size,
    unclusteredRefs: Math.max(0, posts.length - clusteredIds.size),
    unclusteredByPlatform,
  };
}

const archive = JSON.parse(fs.readFileSync(archivePath, 'utf8')) as AnyRecord;
const posts = (archive.posts ?? []).filter(isRelevant).map(trimPost);
const postedTimes = posts
  .map((post: AnyRecord) => new Date(post.postedAt ?? post.capturedAt ?? 0).getTime())
  .filter((value: number) => Number.isFinite(value) && value > 0);
const sourceDateRange = postedTimes.length
  ? {
      start: new Date(Math.min(...postedTimes)).toISOString(),
      end: new Date(Math.max(...postedTimes)).toISOString(),
    }
  : undefined;
const publicData = {
  eventId: archive.eventId,
  eventName: archive.eventName,
  windowStart: archive.windowStart,
  windowEnd: archive.windowEnd,
  generatedAt: archive.generatedAt,
  updatedAt: archive.updatedAt,
  querySet: archive.querySet,
  methodology: {
    label: 'seeded digital snowball sampling',
    sourceDateRange,
    collectionWindow: {
      start: archive.windowStart,
      end: archive.windowEnd,
    },
    querySet: archive.querySet,
    expansionQueries: archive.expansion?.querySet ?? [],
    youtubeQueries: archive.youtube?.queries ?? [],
    youtubeSources: (archive.youtube?.topVideos ?? []).map((video: AnyRecord) => ({
      title: video.title,
      url: video.url,
      channel: video.channel,
      views: video.viewCount,
      comments: video.commentCount,
    })),
    limitations: [
      'The corpus is a public evidence sample, not a representative survey or full social-listening panel.',
      'X and YouTube expose public views; LinkedIn public collection here does not expose impressions.',
      'Query counts are not additive because surfaces rank, dedupe, and expose search differently.',
      'Clusters are built from root refs, then replies/comments/context refs are attached to their nearest evidence cluster.',
    ],
  },
  stats: archive.stats,
  clusterCoverage: clusterCoverage(posts, archive.themes ?? []),
  posts,
  themes: archive.themes ?? [],
  voices: archive.voices ?? [],
};

fs.writeFileSync(outPath, `${JSON.stringify(publicData)}\n`);
console.log(`wrote ${outPath} (${posts.length} relevant refs)`);

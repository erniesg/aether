import type {
  ReferenceFetcher,
  ReferenceRecord,
} from '@/lib/providers/reference/types';
import type { ResearchPlatform, ResearchTarget } from './research';

type SignalPlatform = 'instagram' | 'tiktok' | 'xiaohongshu';
type ExecutionMode = 'live' | 'mock' | 'preflight';

interface SignalResult {
  platform: SignalPlatform;
  keyword: string;
  type: string;
  title?: string;
  caption?: string;
  author?: string;
  stats?: Record<string, number | string | undefined>;
  hashtags?: string[];
  videoPageUrl?: string;
  sourceUrl?: string;
  thumbnailUrl?: string;
  coverUrl?: string;
  videoUrl?: string;
  scrapedAt?: string;
  provider?: string;
}

export interface SignalSearchOutcome {
  records: ReferenceRecord[];
  warnings: string[];
  tried: boolean;
}

export interface SignalSearchOptions {
  limit?: number;
  fetcher?: ReferenceFetcher;
  now?: string;
}

const APIFY_BASE = 'https://api.apify.com/v2';
const RAPIDAPI_HOST = 'xiaohongshu-all-api.p.rapidapi.com';
const IG_HASHTAG_ACTOR = 'apify/instagram-hashtag-scraper';
const DEFAULT_LIMIT = 3;
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const PLATFORM_COLORS: Record<SignalPlatform, [string, string, string]> = {
  instagram: ['#342657', '#bd5aa8', '#f3def1'],
  tiktok: ['#102026', '#2fc6c8', '#f2efe8'],
  xiaohongshu: ['#55211e', '#d55744', '#f6dcd1'],
};

function env(name: string): string {
  return process.env[name]?.trim() ?? '';
}

function rapidApiKey(): string {
  return env('RAPIDAPI_KEY') || env('X-RapidAPI-Key');
}

function envNumber(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number(env(name));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function executionMode(): ExecutionMode {
  const raw = (
    env('SIGNALS_EXECUTION_MODE') ||
    (env('SIGNALS_MOCK') === 'true' || env('SIGNALS_MOCK') === '1' ? 'mock' : 'live')
  ).toLowerCase();
  return raw === 'mock' || raw === 'preflight' ? raw : 'live';
}

function signalPlatform(platform: ResearchPlatform): SignalPlatform | null {
  if (platform === 'instagram' || platform === 'tiktok') return platform;
  if (platform === 'xhs') return 'xiaohongshu';
  return null;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/https?:\/\//g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 54);
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readFirstString(...values: unknown[]): string {
  for (const value of values) {
    const str = readString(value);
    if (str) return str;
  }
  return '';
}

function parseCount(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;
  const clean = value.trim().toLowerCase().replace(/,/g, '');
  const match = clean.match(/^([\d.]+)\s*([kmb]|万)?/);
  if (!match) return undefined;
  const base = Number(match[1]);
  if (!Number.isFinite(base)) return undefined;
  const multiplier =
    match[2] === 'k'
      ? 1_000
      : match[2] === 'm'
        ? 1_000_000
        : match[2] === 'b'
          ? 1_000_000_000
          : match[2] === '万'
            ? 10_000
            : 1;
  return Math.round(base * multiplier);
}

function firstCount(...values: unknown[]): number | undefined {
  for (const value of values) {
    const parsed = parseCount(value);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

function timeoutSignal(timeoutMs: number): AbortSignal | undefined {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs);
  }
  return undefined;
}

class HttpStatusError extends Error {
  constructor(public readonly status: number) {
    super(`HTTP ${status}`);
    this.name = 'HttpStatusError';
  }
}

async function fetchJson(
  fetcher: ReferenceFetcher,
  url: string,
  init: RequestInit = {},
  timeoutMs = 15_000
): Promise<unknown> {
  const res = await fetcher(url, {
    ...init,
    signal: init.signal ?? timeoutSignal(timeoutMs),
  });
  if (!res.ok) throw new HttpStatusError(res.status);
  return res.json();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function targetKeyword(target: ResearchTarget): string {
  const clean = target.value.replace(/^[@#]+/, '').trim();
  if (target.platform === 'instagram' && target.kind !== 'account') {
    return clean.replace(/[^a-z0-9_]/gi, '');
  }
  return clean;
}

function platformLabel(platform: SignalPlatform): string {
  return platform === 'xiaohongshu' ? 'xhs' : platform;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function signalPreviewDataUrl(
  target: ResearchTarget,
  result: SignalResult,
  index: number
): string {
  const [ink, accent, paper] = PLATFORM_COLORS[result.platform];
  const title = result.title || result.caption || target.value;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="840" viewBox="0 0 640 840">`,
    `<rect width="640" height="840" fill="${paper}"/>`,
    `<rect x="52" y="64" width="536" height="612" rx="18" fill="#fffaf2" opacity="0.92"/>`,
    `<circle cx="${172 + (index % 4) * 44}" cy="${194 + (index % 3) * 36}" r="108" fill="${accent}" opacity="0.72"/>`,
    `<rect x="104" y="360" width="432" height="182" rx="8" fill="${ink}" opacity="0.9"/>`,
    `<text x="88" y="724" fill="${ink}" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700">${escapeXml(platformLabel(result.platform))}</text>`,
    `<text x="88" y="766" fill="${ink}" font-family="Arial, Helvetica, sans-serif" font-size="32">${escapeXml(title.slice(0, 30))}</text>`,
    `<text x="88" y="804" fill="${ink}" opacity="0.68" font-family="Arial, Helvetica, sans-serif" font-size="20">${escapeXml(result.type || target.kind)} signal</text>`,
    `</svg>`,
  ].join('');
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function statsSummary(stats?: SignalResult['stats']): string {
  if (!stats) return '';
  const parts = [
    ['views', parseCount(stats.views)],
    ['likes', parseCount(stats.likes)],
    ['comments', parseCount(stats.comments)],
    ['shares', parseCount(stats.shares)],
    ['collects', parseCount(stats.collects)],
  ]
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
    .map(([label, count]) => `${label} ${count.toLocaleString('en-US')}`);
  return parts.join(' · ');
}

function engagementScore(result: SignalResult): number {
  const stats = result.stats ?? {};
  const views = parseCount(stats.views) ?? 0;
  const likes = parseCount(stats.likes) ?? 0;
  const comments = parseCount(stats.comments) ?? 0;
  const shares = parseCount(stats.shares) ?? 0;
  const collects = parseCount(stats.collects) ?? 0;
  return views * 0.04 + likes + comments * 3 + shares * 2 + collects * 2;
}

function compactTitle(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 96);
}

function signalUrl(result: SignalResult, target: ResearchTarget): string {
  return (
    result.videoPageUrl ||
    result.sourceUrl ||
    (result.platform === 'xiaohongshu'
      ? `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(result.keyword)}`
      : target.sourceUrl)
  );
}

function signalToReferenceRecord(
  target: ResearchTarget,
  result: SignalResult,
  index: number,
  capturedAt: string
): ReferenceRecord {
  const sourceUrl = signalUrl(result, target);
  const title = compactTitle(result.title || result.caption || target.label);
  const previewUrl =
    result.thumbnailUrl ||
    result.coverUrl ||
    signalPreviewDataUrl(target, result, index);
  const hashtags = (result.hashtags ?? [])
    .map((tag) => tag.replace(/^#/, '').toLowerCase())
    .filter(Boolean)
    .slice(0, 6);
  const stats = statsSummary(result.stats);
  const provider = result.provider ? `${platformLabel(result.platform)} ${result.provider}` : platformLabel(result.platform);

  return {
    id: `ref_signal_${platformLabel(result.platform)}_${slug(sourceUrl || title) || index}`,
    kind: result.type === 'video' || result.type === 'reel' ? 'video' : 'image',
    previewUrl,
    fullUrl: sourceUrl,
    attribution: {
      source: platformLabel(result.platform),
      author: result.author || undefined,
      url: sourceUrl,
    },
    capturedAt,
    title,
    usageIntent: 'research signal',
    tags: Array.from(
      new Set([
        ...target.tags,
        'signal',
        platformLabel(result.platform),
        result.type,
        ...hashtags,
      ].filter(Boolean))
    ),
    notes: [provider, target.reason, stats].filter(Boolean).join('; '),
  };
}

function mockSignals(
  platform: SignalPlatform,
  keyword: string,
  limit: number
): SignalResult[] {
  return Array.from({ length: Math.min(limit, 3) }, (_, index) => ({
    platform,
    keyword,
    type: platform === 'tiktok' ? 'video' : platform === 'instagram' ? 'post' : 'note',
    title: `${keyword} ${platformLabel(platform)} signal ${index + 1}`,
    author: `creator_${index + 1}`,
    stats: {
      views: (index + 1) * 125_000,
      likes: (index + 1) * 8_400,
      comments: (index + 1) * 120,
    },
    videoPageUrl:
      platform === 'instagram'
        ? `https://www.instagram.com/p/mock${index}/`
        : platform === 'tiktok'
          ? `https://www.tiktok.com/@mock/video/${index}`
          : `https://www.xiaohongshu.com/explore/mock${index}`,
    scrapedAt: new Date().toISOString(),
    provider: 'mock',
  }));
}

async function runApifyActorSync(
  actorId: string,
  input: Record<string, unknown>,
  fetcher: ReferenceFetcher,
  timeoutSecs = 50
): Promise<unknown[]> {
  const token = env('APIFY_API_TOKEN');
  if (!token) throw new Error('APIFY_API_TOKEN is not configured');
  const encoded = encodeURIComponent(actorId);
  const url = `${APIFY_BASE}/acts/${encoded}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=${timeoutSecs}`;
  const data = await fetchJson(
    fetcher,
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    (timeoutSecs + 8) * 1_000
  );
  return asArray(data);
}

async function searchInstagramGraph(
  keyword: string,
  limit: number,
  fetcher: ReferenceFetcher
): Promise<SignalResult[]> {
  const token = env('INSTAGRAM_API_KEY') || env('INSTAGRAM_ACCESS_TOKEN');
  const userId = env('INSTAGRAM_USER_ID') || env('META_INSTAGRAM_USER_ID');
  if (!token || !userId) return [];
  const tag = keyword.replace(/^#/, '').replace(/\s+/g, '');
  if (!tag) return [];
  const searchParams = new URLSearchParams({
    user_id: userId,
    q: tag,
    access_token: token,
  });
  const searchData = asObject(
    await fetchJson(
      fetcher,
      `https://graph.facebook.com/v19.0/ig_hashtag_search?${searchParams}`,
      { headers: { Accept: 'application/json' } },
      12_000
    )
  );
  const hashtag = asObject(asArray(searchData.data)[0]);
  const hashtagId = readString(hashtag.id);
  if (!hashtagId) return [];
  const mediaParams = new URLSearchParams({
    user_id: userId,
    fields: 'id,caption,like_count,comments_count,permalink,thumbnail_url,media_url,media_type',
    access_token: token,
  });
  const mediaData = asObject(
    await fetchJson(
      fetcher,
      `https://graph.facebook.com/v19.0/${hashtagId}/top_media?${mediaParams}`,
      { headers: { Accept: 'application/json' } },
      12_000
    )
  );
  return asArray(mediaData.data)
    .slice(0, limit)
    .map((raw): SignalResult => {
      const item = asObject(raw);
      const caption = readString(item.caption);
      return {
        platform: 'instagram',
        keyword: `#${tag}`,
        type: readString(item.media_type).toLowerCase() === 'video' ? 'reel' : 'post',
        caption,
        stats: {
          likes: firstCount(item.like_count),
          comments: firstCount(item.comments_count),
        },
        videoPageUrl: readString(item.permalink),
        thumbnailUrl: readFirstString(item.thumbnail_url, item.media_url),
        hashtags: caption.match(/#[\w-]+/g) ?? [],
        scrapedAt: new Date().toISOString(),
        provider: 'graph',
      };
    });
}

async function searchInstagram(
  keyword: string,
  limit: number,
  fetcher: ReferenceFetcher
): Promise<{ results: SignalResult[]; warnings: string[] }> {
  const warnings: string[] = [];
  const backend =
    env('SIGNALS_SCRAPER_INSTAGRAM') ||
    (env('APIFY_API_TOKEN') ? 'apify' : env('INSTAGRAM_API_KEY') ? 'graph' : '');

  if (backend === 'apify') {
    const tag = keyword.replace(/^#/, '').replace(/\s+/g, '');
    if (!tag) return { results: [], warnings: ['instagram: empty hashtag query'] };
    try {
      const items = await runApifyActorSync(
        IG_HASHTAG_ACTOR,
        { hashtags: [tag], resultsLimit: limit },
        fetcher
      );
      const results = items.map((raw): SignalResult => {
        const item = asObject(raw);
        const caption = readString(item.caption).slice(0, 500);
        const isReel = Boolean(item.videoUrl || item.isVideo) || readString(item.type) === 'Video';
        const isCarousel =
          readString(item.type) === 'Sidecar' || asArray(item.childPosts).length > 0;
        return {
          platform: 'instagram',
          keyword: `#${tag}`,
          type: isReel ? 'reel' : isCarousel ? 'carousel' : 'post',
          author: readFirstString(item.ownerUsername, asObject(item.owner).username),
          caption,
          stats: {
            likes: firstCount(item.likesCount, item.likes),
            comments: firstCount(item.commentsCount, item.comments),
            views: firstCount(item.videoViewCount, item.playCount),
          },
          hashtags: caption.match(/#[\w\u4e00-\u9fff\uac00-\ud7af-]+/g) ?? [],
          videoPageUrl: readFirstString(item.url, item.permalink),
          thumbnailUrl: readFirstString(item.displayUrl, item.thumbnailUrl),
          scrapedAt: new Date().toISOString(),
          provider: 'apify',
        };
      });
      return { results, warnings };
    } catch (err) {
      warnings.push(`instagram/apify: ${err instanceof Error ? err.message : 'failed'}`);
    }
  }

  if (backend === 'graph' || env('INSTAGRAM_API_KEY')) {
    try {
      const results = await searchInstagramGraph(keyword, limit, fetcher);
      if (results.length > 0) return { results, warnings };
      warnings.push('instagram/graph: returned 0 results');
    } catch (err) {
      warnings.push(`instagram/graph: ${err instanceof Error ? err.message : 'failed'}`);
    }
  }

  if (!backend) warnings.push('instagram: configure APIFY_API_TOKEN or Instagram Graph envs');
  return { results: [], warnings };
}

async function searchTikTok(
  keyword: string,
  limit: number,
  fetcher: ReferenceFetcher
): Promise<{ results: SignalResult[]; warnings: string[] }> {
  const encoded = encodeURIComponent(keyword);
  try {
    const data = asObject(
      await fetchJson(
        fetcher,
        `https://www.tiktok.com/api/search/general/full/?keyword=${encoded}&offset=0&search_id=&count=${limit}`,
        {
          headers: {
            'User-Agent': USER_AGENT,
            Accept: 'application/json',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        },
        12_000
      )
    );
    const results = asArray(data.data).map((raw): SignalResult => {
      const wrapper = asObject(raw);
      const item = asObject(wrapper.item || raw);
      const author = asObject(item.author);
      const stats = asObject(item.stats);
      const video = asObject(item.video);
      const authorId = readFirstString(author.uniqueId, author.id);
      const videoId = readFirstString(item.id, item.aweme_id);
      return {
        platform: 'tiktok',
        keyword,
        type: 'video',
        title: readFirstString(item.desc, wrapper.desc),
        author: authorId,
        stats: {
          views: firstCount(stats.playCount, stats.play_count),
          likes: firstCount(stats.diggCount, stats.digg_count),
          shares: firstCount(stats.shareCount, stats.share_count),
          comments: firstCount(stats.commentCount, stats.comment_count),
        },
        videoUrl: readFirstString(asObject(video.playAddr).urlList, video.playAddr),
        thumbnailUrl: readFirstString(video.cover, video.originCover, video.dynamicCover),
        videoPageUrl:
          authorId && videoId ? `https://www.tiktok.com/@${authorId}/video/${videoId}` : '',
        scrapedAt: new Date().toISOString(),
        provider: 'public-search',
      };
    });
    return { results, warnings: [] };
  } catch (err) {
    return {
      results: [],
      warnings: [`tiktok/public-search: ${err instanceof Error ? err.message : 'failed'}`],
    };
  }
}

function xhsProviderOrder(): string[] {
  const configured = env('SIGNALS_XHS_PROVIDERS');
  if (configured) {
    return configured
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry === 'rapidapi');
  }
  return rapidApiKey() ? ['rapidapi'] : [];
}

function isRetryableRapidApiError(err: unknown): boolean {
  if (err instanceof HttpStatusError) {
    return err.status === 408 || err.status === 429 || err.status >= 500;
  }
  if (!(err instanceof Error)) return false;
  return /\b(408|429|500|502|503|504)\b/.test(err.message);
}

async function searchXhsRapidApi(
  keyword: string,
  limit: number,
  fetcher: ReferenceFetcher
): Promise<SignalResult[]> {
  const key = rapidApiKey();
  if (!key) throw new Error('RAPIDAPI_KEY is not configured');
  const maxAttempts = envNumber('SIGNALS_XHS_RETRIES', 4, 1, 8);
  const retryDelayMs = envNumber('SIGNALS_XHS_RETRY_DELAY_MS', 900, 0, 10_000);
  const timeoutMs = envNumber('SIGNALS_XHS_TIMEOUT_MS', 30_000, 5_000, 60_000);
  const params = new URLSearchParams({
    keyword,
    page: '1',
    sort: 'general',
    noteType: '_0',
  });

  let data: Record<string, unknown> | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      data = asObject(
        await fetchJson(
          fetcher,
          `https://${RAPIDAPI_HOST}/api/xiaohongshu/search-note/v2?${params}`,
          {
            headers: {
              'X-RapidAPI-Key': key,
              'X-RapidAPI-Host': RAPIDAPI_HOST,
              'Content-Type': 'application/json',
            },
          },
          timeoutMs
        )
      );
      if (data.code !== 0 && data.code !== '0') {
        throw new Error(`RapidAPI code ${String(data.code || 'unknown')}`);
      }
      break;
    } catch (err) {
      lastError = err;
      const canRetry = attempt < maxAttempts - 1 && isRetryableRapidApiError(err);
      if (!canRetry) throw err;
      await sleep(retryDelayMs * Math.max(1, attempt + 1));
    }
  }

  if (!data) {
    throw lastError instanceof Error ? lastError : new Error('RapidAPI request failed');
  }

  if (data.code !== 0 && data.code !== '0') {
    throw new Error(`RapidAPI code ${String(data.code || 'unknown')}`);
  }
  const payload = asObject(data.data);
  return asArray(payload.items)
    .slice(0, limit)
    .map((raw): SignalResult => {
      const item = asObject(raw);
      const note = asObject(item.note || item);
      const user = asObject(note.user);
      const interact = asObject(note.interact_info);
      const images = asArray(note.images_list);
      const firstImage = asObject(images[0]);
      const title = readFirstString(note.display_title, note.title, readString(note.desc).slice(0, 100));
      const noteId = readFirstString(note.note_id, note.id);
      return {
        platform: 'xiaohongshu',
        keyword,
        type: readString(note.type) === 'video' ? 'video' : 'note',
        title,
        author: readFirstString(user.nickname, user.nick_name),
        stats: {
          likes: firstCount(interact.liked_count, note.liked_count),
          collects: firstCount(interact.collected_count),
          comments: firstCount(interact.comment_count),
        },
        coverUrl: readFirstString(firstImage.url, note.cover_url),
        thumbnailUrl: readFirstString(firstImage.url, note.cover_url),
        videoPageUrl: noteId ? `https://www.xiaohongshu.com/explore/${noteId}` : '',
        scrapedAt: new Date().toISOString(),
        provider: 'rapidapi',
      };
    });
}

async function searchXhs(
  keyword: string,
  limit: number,
  fetcher: ReferenceFetcher
): Promise<{ results: SignalResult[]; warnings: string[] }> {
  const warnings: string[] = [];
  const providers = xhsProviderOrder();
  if (providers.length === 0) {
    return {
      results: [],
      warnings: ['xhs: configure RAPIDAPI_KEY or opt into APIFY_API_TOKEN provider'],
    };
  }

  for (const provider of providers) {
    try {
      const results =
        provider === 'rapidapi' ? await searchXhsRapidApi(keyword, limit, fetcher) : [];
      if (results.length > 0) return { results, warnings };
      warnings.push(`xhs/${provider}: returned 0 results`);
    } catch (err) {
      warnings.push(`xhs/${provider}: ${err instanceof Error ? err.message : 'failed'}`);
    }
  }

  return { results: [], warnings };
}

function dedupeSignals(results: SignalResult[]): SignalResult[] {
  const seen = new Set<string>();
  const out: SignalResult[] = [];
  for (const result of results) {
    const key =
      result.videoPageUrl ||
      result.sourceUrl ||
      result.thumbnailUrl ||
      `${result.platform}:${result.author ?? ''}:${result.title ?? result.caption ?? ''}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(result);
  }
  return out;
}

export async function searchSignalReferencesForTarget(
  target: ResearchTarget,
  options: SignalSearchOptions = {}
): Promise<SignalSearchOutcome> {
  const platform = signalPlatform(target.platform);
  if (!platform || target.kind === 'url') {
    return { records: [], warnings: [], tried: false };
  }

  if (target.kind === 'account' && platform === 'instagram') {
    return {
      records: [],
      warnings: ['instagram: account search is not available through configured signal APIs'],
      tried: true,
    };
  }

  const limit = Math.max(1, Math.min(8, options.limit ?? DEFAULT_LIMIT));
  const fetcher = options.fetcher ?? fetch;
  const capturedAt = options.now ?? new Date().toISOString();
  const keyword = targetKeyword(target);
  if (!keyword) return { records: [], warnings: [`${platformLabel(platform)}: empty query`], tried: true };

  const mode = executionMode();
  if (mode === 'preflight') {
    return {
      records: [],
      warnings: [`${platformLabel(platform)}: preflight mode skipped live signal search`],
      tried: true,
    };
  }

  let results: SignalResult[] = [];
  let warnings: string[] = [];
  if (mode === 'mock') {
    results = mockSignals(platform, keyword, limit);
  } else if (platform === 'instagram') {
    const outcome = await searchInstagram(keyword, limit, fetcher);
    results = outcome.results;
    warnings = outcome.warnings;
  } else if (platform === 'tiktok') {
    const outcome = await searchTikTok(keyword, limit, fetcher);
    results = outcome.results;
    warnings = outcome.warnings;
  } else {
    const outcome = await searchXhs(keyword, limit, fetcher);
    results = outcome.results;
    warnings = outcome.warnings;
  }

  const records = dedupeSignals(results)
    .sort((left, right) => engagementScore(right) - engagementScore(left))
    .slice(0, limit)
    .map((result, index) => signalToReferenceRecord(target, result, index, capturedAt));

  return { records, warnings, tried: true };
}

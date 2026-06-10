type ScopeRow = {
  platform?: string;
  postId?: string;
  url?: string;
  text?: string;
  authorName?: string;
  authorHandle?: string;
  tags?: unknown[];
  media?: Array<{ altText?: string; pageUrl?: string; url?: string }>;
  youtubeVideoId?: string;
  raw?: any;
};

const AIE_SINGAPORE_ANCHOR_RE =
  /\b(ai\s*engineer\s*(?:singapore|sg)|aie\s*(?:singapore|sg)|ai engineer summit singapore|ai\.engineer\/singapore|#(?:aiengineersingapore|aiengineersg|aiesg)|road to aie|road to ai engineer|capitol kempinski|pullman singapore)\b/i;

const OTHER_REGION_AIE_RE =
  /\b(ai\s*engineer\s*(?:europe|sf|san francisco|london|nyc|new york|world'?s?\s+fair)|aie\s*(?:europe|sf)|ai\.engineer\/(?:europe|sf|worlds?-fair|london|nyc))\b/i;

const KNOWN_AIE_SINGAPORE_YOUTUBE_VIDEO_IDS = new Set([
  '_xQnSNlBP_w',
  'm12vGjfbNlo',
]);

const KNOWN_OFF_EVENT_YOUTUBE_VIDEO_IDS = new Set([
  // Official AI Engineer channel upload whose thumbnail is AI Engineer Europe,
  // not AIE Singapore. The title/speaker matched a Singapore schedule row, so
  // keep this explicit until thumbnail OCR exists in the pipeline.
  'C_GG5g38vLU',
  // Human-reviewed false positives from the AIE Singapore video audit.
  'fOtTHWeU6B8',
  'v4F1gFy-hqg',
]);

function tags(row: ScopeRow): string[] {
  return (row.tags ?? []).map((tag) => String(tag));
}

function extractFromUrl(url: unknown, pattern: RegExp): string | undefined {
  if (typeof url !== 'string') return undefined;
  return url.match(pattern)?.[1];
}

export function aie2026YoutubeVideoId(row: ScopeRow): string | undefined {
  return (
    row.youtubeVideoId ??
    row.raw?.video?.id ??
    row.raw?.comment?.snippet?.videoId ??
    row.raw?.parentVideo?.id ??
    row.raw?.parentVideo?.postId?.replace(/^youtube:/, '') ??
    extractFromUrl(row.url, /[?&]v=([^&]+)/) ??
    String(row.postId ?? '').match(/^youtube:([^:]+)$/)?.[1] ??
    tags(row).find((tag) => tag.startsWith('parent-video:'))?.slice('parent-video:'.length)
  );
}

function rowScopeText(row: ScopeRow): string {
  const video = row.raw?.video?.snippet ?? {};
  const localized = video.localized ?? {};
  const parentVideo = row.raw?.parentVideo ?? {};
  return [
    row.text,
    row.authorName,
    row.authorHandle,
    row.url,
    ...tags(row),
    video.title,
    video.description,
    video.channelTitle,
    localized.title,
    localized.description,
    parentVideo.title,
    parentVideo.channel,
    ...(row.media ?? []).flatMap((item) => [item.altText, item.pageUrl, item.url]),
  ]
    .filter(Boolean)
    .join('\n');
}

function isOfficialAiEngineerYoutube(row: ScopeRow): boolean {
  const rowTags = tags(row).map((tag) => tag.toLowerCase());
  return (
    row.platform === 'youtube' &&
    (rowTags.includes('official-aie-channel') ||
      row.raw?.video?.snippet?.channelTitle === 'AI Engineer' ||
      row.authorName === 'AI Engineer')
  );
}

function isStandaloneYoutubeVideo(row: ScopeRow): boolean {
  return row.platform === 'youtube' && String(row.postId ?? '').startsWith('youtube:') && !String(row.url ?? '').includes('&lc=');
}

function isOfficialScheduleOnlyMatch(row: ScopeRow): boolean {
  const rowTags = tags(row).map((tag) => tag.toLowerCase());
  return rowTags.includes('official-schedule-title-and-speaker-match');
}

export function aie2026EventScopeRejectReason(row: ScopeRow): string | undefined {
  const videoId = aie2026YoutubeVideoId(row);
  const text = rowScopeText(row);
  const hasSingaporeAnchor = AIE_SINGAPORE_ANCHOR_RE.test(text);

  if (videoId && KNOWN_OFF_EVENT_YOUTUBE_VIDEO_IDS.has(videoId)) {
    return isStandaloneYoutubeVideo(row)
      ? 'youtube_off_region_video_without_singapore_anchor'
      : 'youtube_comment_under_off_region_video_without_singapore_anchor';
  }

  if (row.platform === 'youtube' && OTHER_REGION_AIE_RE.test(text) && !hasSingaporeAnchor) {
    return 'off_region_aie_without_singapore_anchor';
  }

  if (
    isOfficialAiEngineerYoutube(row) &&
    isOfficialScheduleOnlyMatch(row) &&
    isStandaloneYoutubeVideo(row) &&
    videoId &&
    !KNOWN_AIE_SINGAPORE_YOUTUBE_VIDEO_IDS.has(videoId) &&
    !hasSingaporeAnchor
  ) {
    return 'official_youtube_schedule_match_without_singapore_anchor';
  }

  return undefined;
}

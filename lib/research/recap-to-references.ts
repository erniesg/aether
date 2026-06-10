import type {
  EventPost,
  EventPostMedia,
  EventTheme,
} from '@/lib/research/event-recap/types';
import type { ReferenceRecord } from '@/lib/providers/reference/types';

/**
 * Recap → references seam. Converts the strongest evidence of a recap theme
 * (event, brand, product, or topic subject — they all arrive theme/post
 * shaped) into pinned `ReferenceRecord`s, the currency the canvas, clusters,
 * and composer already consume. Pure module: callers fetch the bundle and
 * persist the records.
 */

const DEFAULT_MAX_PER_THEME = 6;
const MAX_KEYWORD_TAGS = 4;

export interface ThemeToReferencesInput {
  theme: EventTheme;
  /** Posts available to the theme — extra posts are ignored. */
  posts: ReadonlyArray<EventPost>;
  /** Cap on records produced for this theme. */
  maxPerTheme?: number;
  /** ISO capture timestamp; injectable so callers/tests stay deterministic. */
  capturedAt?: string;
}

export interface BundleToReferencesOptions {
  /** Restrict to these themeIds; omit for all themes. */
  themeIds?: ReadonlyArray<string>;
  maxPerTheme?: number;
  capturedAt?: string;
}

interface UsableMedia {
  kind: 'image' | 'video';
  previewUrl: string;
  fullUrl: string;
}

function pickUsableMedia(media: ReadonlyArray<EventPostMedia> | undefined): UsableMedia | null {
  for (const item of media ?? []) {
    if (item.type === 'video') {
      // A video reference needs a poster the rail can render as <img>.
      if (!item.previewUrl) continue;
      return { kind: 'video', previewUrl: item.previewUrl, fullUrl: item.url };
    }
    if (item.type === 'image' || item.type === 'gif') {
      const previewUrl = item.previewUrl ?? item.url;
      if (!previewUrl) continue;
      return { kind: 'image', previewUrl, fullUrl: item.url };
    }
  }
  return null;
}

export function themeToReferences(input: ThemeToReferencesInput): ReferenceRecord[] {
  const { theme, posts } = input;
  const maxPerTheme = input.maxPerTheme ?? DEFAULT_MAX_PER_THEME;
  const capturedAt = input.capturedAt ?? new Date().toISOString();

  const byId = new Map(posts.map((post) => [post.postId, post]));
  const themed = theme.postIds
    .map((postId) => byId.get(postId))
    .filter((post): post is EventPost => Boolean(post))
    .sort((a, b) => b.reachScore - a.reachScore);

  const records: ReferenceRecord[] = [];
  const seen = new Set<string>();
  for (const post of themed) {
    if (records.length >= maxPerTheme) break;
    const media = pickUsableMedia(post.media);
    if (!media) continue;
    if (seen.has(media.fullUrl)) continue;
    seen.add(media.fullUrl);
    records.push({
      id: `recap:${theme.themeId}:${post.postId}`,
      kind: media.kind,
      previewUrl: media.previewUrl,
      fullUrl: media.fullUrl,
      attribution: {
        source: 'event-recap',
        author: post.authorHandle ?? post.authorName,
        url: post.url,
      },
      capturedAt,
      title: theme.label,
      tags: [post.platform, ...theme.keywords.slice(0, MAX_KEYWORD_TAGS)],
      clusterId: theme.storyId ?? theme.themeId,
    });
  }
  return records;
}

export function bundleToReferences(
  bundle: { themes: ReadonlyArray<EventTheme>; posts: ReadonlyArray<EventPost> },
  options: BundleToReferencesOptions = {}
): ReferenceRecord[] {
  const wanted = options.themeIds ? new Set(options.themeIds) : null;
  const records: ReferenceRecord[] = [];
  const seen = new Set<string>();
  for (const theme of bundle.themes) {
    if (wanted && !wanted.has(theme.themeId)) continue;
    for (const record of themeToReferences({
      theme,
      posts: bundle.posts,
      maxPerTheme: options.maxPerTheme,
      capturedAt: options.capturedAt,
    })) {
      const key = record.fullUrl ?? record.previewUrl;
      if (seen.has(key)) continue;
      seen.add(key);
      records.push(record);
    }
  }
  return records;
}

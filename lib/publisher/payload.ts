import type { ProposedTextOverlay } from '@/lib/agent/text-apply';
import {
  COMPOSE_FORMATS,
  COMPOSE_LOCALES,
  pickLocaleTextForFormat,
  type LocaleCode,
} from '@/lib/text-overlay/compose';
import {
  PUBLISH_PLATFORMS,
  type PublishPlatform,
  type ScheduledPost,
} from '@/lib/providers/publisher/types';
import {
  hasPlaceholderLocaleSuffix,
  isAtlasLikePublishMediaUrl,
  isValidPublishCaptionForLocale,
  sanitizePublicCaption,
} from '@/lib/publisher/public-guards';

export {
  hasPlaceholderLocaleSuffix,
  isAtlasLikePublishMediaUrl,
  isValidPublishCaptionForLocale,
  sanitizePublicCaption,
} from '@/lib/publisher/public-guards';

export type { LocaleCode } from '@/lib/text-overlay/compose';

export type PublishFormatId = (typeof COMPOSE_FORMATS)[number]['id'];

export interface PublishableVariation {
  index?: number;
  status?: 'ready' | 'failed' | string;
  heroDirectionId?: string;
  heroImageUrl?: string;
  atlasUrl?: string;
  caption?: string;
  captionsByLocale?: Partial<Record<string, string>>;
  hashtags?: string[];
  schedulePlatform?: string;
  scheduleWhenLocal?: string;
  nativePerFormatUrls?: Partial<Record<PublishFormatId, string>>;
  localizedPerFormatUrls?: Partial<
    Record<string, Partial<Record<PublishFormatId, string>>>
  >;
  textOverlays?: ProposedTextOverlay[];
}

export interface ComposePublishPayloadInput {
  variation: PublishableVariation;
  platforms: PublishPlatform[];
  locales: LocaleCode[];
  scheduledAt: string;
}

export function formatForPublishPlatform(
  platform: PublishPlatform
): PublishFormatId {
  switch (platform) {
    case 'instagram':
    case 'pinterest':
      return '4x5';
    case 'tiktok':
    case 'youtube-shorts':
    case 'douyin':
    case 'kuaishou':
      return '9x16';
    case 'linkedin':
    case 'x':
    case 'bilibili':
      return '16x9';
    default:
      return '1x1';
  }
}

export function normalizePublishPlatforms(
  values: ReadonlyArray<unknown>
): PublishPlatform[] {
  const out: PublishPlatform[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const platform = value.trim().toLowerCase();
    if (!PUBLISH_PLATFORMS.includes(platform as PublishPlatform)) continue;
    if (seen.has(platform)) continue;
    seen.add(platform);
    out.push(platform as PublishPlatform);
  }
  return out;
}

export function normalizePublishLocales(
  values: ReadonlyArray<unknown>
): LocaleCode[] {
  const out: LocaleCode[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const locale = value.trim();
    if (!COMPOSE_LOCALES.includes(locale as LocaleCode)) continue;
    if (seen.has(locale)) continue;
    seen.add(locale);
    out.push(locale as LocaleCode);
  }
  return out;
}

export function parsePublishPlatformsParam(
  value: string | null | undefined
): PublishPlatform[] {
  if (!value) return [];
  return normalizePublishPlatforms(value.split(','));
}

export function parsePublishLocalesParam(
  value: string | null | undefined
): LocaleCode[] {
  if (!value) return [];
  return normalizePublishLocales(value.split(','));
}

export function pickHeroForPublishFormat(
  variation: PublishableVariation,
  format: PublishFormatId
): string | undefined {
  const url = variation.nativePerFormatUrls?.[format];
  if (!url || isAtlasLikePublishMediaUrl(url, variation)) return undefined;
  return url;
}

type HeroScopedOverlay = ProposedTextOverlay & {
  metadata?: { heroDirectionId?: string };
};

export function filterTextOverlaysForHeroDirection(
  overlays: ProposedTextOverlay[] | undefined,
  heroDirectionId?: string
): ProposedTextOverlay[] | undefined {
  if (!overlays || overlays.length === 0 || !heroDirectionId) return overlays;
  const typed = overlays as HeroScopedOverlay[];
  if (!typed.some((overlay) => overlay.metadata?.heroDirectionId)) {
    return overlays;
  }
  const scoped = typed.filter(
    (overlay) => overlay.metadata?.heroDirectionId === heroDirectionId
  );
  return scoped.length > 0 ? scoped : overlays;
}

export function pickHeroForLocalePlatform(
  variation: PublishableVariation,
  locale: LocaleCode,
  platform: PublishPlatform
): { url?: string; format: PublishFormatId } {
  const format = formatForPublishPlatform(platform);
  return {
    format,
    url:
      rejectAtlasLikePublishMedia(
        variation.localizedPerFormatUrls?.[locale]?.[format],
        variation
      ) ??
      pickHeroForPublishFormat(variation, format),
  };
}

export function pickPublishCopyForLocaleFormat(
  variation: PublishableVariation,
  locale: LocaleCode,
  format: PublishFormatId
): string {
  const overlayText = pickLocaleTextForFormat(
    filterTextOverlaysForHeroDirection(
      variation.textOverlays,
      variation.heroDirectionId
    ),
    locale,
    format
  );
  const composed = [overlayText.headline, overlayText.caption]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join('\n');
  const overlayCaption = sanitizePublicCaption(composed);
  if (isValidPublishCaptionForLocale(locale, overlayCaption)) {
    return overlayCaption;
  }

  const localeCaption = sanitizePublicCaption(
    variation.captionsByLocale?.[locale] ?? ''
  );
  if (isValidPublishCaptionForLocale(locale, localeCaption)) {
    return localeCaption;
  }

  if (locale !== 'en-SG') return '';

  return sanitizePublicCaption(
    variation.captionsByLocale?.['en-SG'] ?? variation.caption ?? ''
  );
}

function rejectAtlasLikePublishMedia(
  url: string | undefined,
  variation: PublishableVariation
): string | undefined {
  if (!url) return undefined;
  return isAtlasLikePublishMediaUrl(url, variation) ? undefined : url;
}

export function composePublishPostsForVariation(
  input: ComposePublishPayloadInput
): ScheduledPost[] {
  const posts: ScheduledPost[] = [];
  for (const locale of input.locales) {
    for (const platform of input.platforms) {
      const picked = pickHeroForLocalePlatform(
        input.variation,
        locale,
        platform
      );
      if (!picked.url) continue;
      const caption = pickPublishCopyForLocaleFormat(
        input.variation,
        locale,
        picked.format
      );
      if (!caption) continue;
      if (locale !== 'en-SG' && hasPlaceholderLocaleSuffix(caption)) continue;
      posts.push({
        id: '',
        platform,
        locale,
        format: picked.format,
        mediaUrls: [picked.url],
        caption,
        hashtags: input.variation.hashtags ?? [],
        scheduledAt: input.scheduledAt,
      });
    }
  }
  return posts;
}

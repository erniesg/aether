export type SharePlatform =
  | 'x'
  | 'linkedin'
  | 'facebook'
  | 'whatsapp'
  | 'telegram'
  | 'copy'
  | 'native'
  | 'unknown';

export const SHARE_PLATFORMS: SharePlatform[] = [
  'x',
  'linkedin',
  'facebook',
  'whatsapp',
  'telegram',
];

export interface PlatformShareInput {
  url: string;
  title: string;
  text?: string;
  hashtags?: string[];
}

export function platformShareUrl(platform: SharePlatform, input: PlatformShareInput): string | null {
  const text = shareText(input);
  const caption = shareCaption(input);
  if (platform === 'x') {
    const url = new URL('https://x.com/intent/tweet');
    url.searchParams.set('text', text);
    url.searchParams.set('url', input.url);
    if (input.hashtags?.length) {
      url.searchParams.set('hashtags', input.hashtags.map((tag) => tag.replace(/^#/, '')).join(','));
    }
    return url.toString();
  }
  if (platform === 'linkedin') {
    const url = new URL('https://www.linkedin.com/feed/');
    url.searchParams.set('shareActive', 'true');
    url.searchParams.set('text', caption);
    url.searchParams.set('shareUrl', input.url);
    return url.toString();
  }
  if (platform === 'facebook') {
    const url = new URL('https://www.facebook.com/sharer/sharer.php');
    url.searchParams.set('u', input.url);
    url.searchParams.set('quote', sharePostCopy(input));
    return url.toString();
  }
  if (platform === 'whatsapp') {
    const url = new URL('https://wa.me/');
    url.searchParams.set('text', caption);
    return url.toString();
  }
  if (platform === 'telegram') {
    const url = new URL('https://t.me/share/url');
    url.searchParams.set('url', input.url);
    url.searchParams.set('text', shareTextWithHashtags(input));
    return url.toString();
  }
  return null;
}

export function shareText(input: PlatformShareInput): string {
  return (input.text?.trim() || input.title.trim()).slice(0, 500);
}

export function shareCaption(input: PlatformShareInput): string {
  return [shareText(input), input.url.trim(), hashtagText(input)].filter(Boolean).join('\n');
}

export function sharePostCopy(input: PlatformShareInput): string {
  return [shareText(input), hashtagText(input)].filter(Boolean).join('\n');
}

function shareTextWithHashtags(input: PlatformShareInput): string {
  return sharePostCopy(input);
}

function hashtagText(input: PlatformShareInput): string {
  const tags = input.hashtags
    ?.map((tag) => tag.trim().replace(/^#/, ''))
    .filter(Boolean)
    .map((tag) => `#${tag}`);
  return tags?.length ? tags.join(' ') : '';
}

export function isSharePlatform(value: unknown): value is SharePlatform {
  return (
    typeof value === 'string' &&
    ['x', 'linkedin', 'facebook', 'whatsapp', 'telegram', 'copy', 'native', 'unknown'].includes(value)
  );
}

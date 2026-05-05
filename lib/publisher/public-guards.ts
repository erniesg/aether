export function sanitizePublicCaption(value: string): string {
  const blockedLine = /^(?:creator request|brand|offer|campaign|signals|constraints|pinned references|reference images are attached|source urls?|raw ids?|payloads?|provider traces?|prompt internals?)\s*:/i;
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !blockedLine.test(line))
    .filter((line) => !/^https?:\/\//i.test(line))
    .join('\n')
    .trim();
}

export function hasPlaceholderLocaleSuffix(value: string): boolean {
  return /(?:\((?:中文草稿|日本語ドラフト|한국어 초안)\)|（(?:中文草稿|日本語ドラフト|한국어 초안)）)/i.test(
    value
  );
}

const LOCALE_SCRIPT_REQUIREMENTS: Partial<Record<string, RegExp>> = {
  'zh-Hans-SG': /\p{Script=Han}/u,
  'ja-JP': /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u,
  'ko-KR': /\p{Script=Hangul}/u,
  'ta-SG': /\p{Script=Tamil}/u,
};

export function isValidPublishCaptionForLocale(
  locale: string,
  caption: string
): boolean {
  const clean = sanitizePublicCaption(caption);
  if (!clean) return false;
  if (locale === 'en-SG') return true;
  if (hasPlaceholderLocaleSuffix(clean)) return false;
  const scriptRequirement = LOCALE_SCRIPT_REQUIREMENTS[locale];
  return scriptRequirement ? scriptRequirement.test(clean) : true;
}

export function isAtlasLikePublishMediaUrl(
  url: string,
  variation?: { atlasUrl?: string }
): boolean {
  if (variation?.atlasUrl && url === variation.atlasUrl) return true;
  return /(?:atlas|contact[-_ ]?sheet|collage)/i.test(url);
}

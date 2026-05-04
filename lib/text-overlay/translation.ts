import {
  DEFAULT_LOCALE,
  localeShortLabel,
  type SupportedLocaleCode,
} from '@/lib/locale/registry';

export type TranslationProviderId = 'deterministic-fallback' | 'agent';

const FALLBACK_SUFFIX: Record<SupportedLocaleCode, string> = {
  'en-SG': '',
  'zh-Hans-SG': '中文草稿',
  'ms-SG': 'draf Melayu',
  'ta-SG': 'தமிழ் வரைவு',
  'ja-JP': '日本語ドラフト',
  'ko-KR': '한국어 초안',
};

export function deterministicTranslateText(input: {
  text: string;
  sourceLocale?: string;
  targetLocale: string;
}): string {
  const text = input.text.trim();
  if (!text || input.targetLocale === input.sourceLocale) return text;
  const suffix = FALLBACK_SUFFIX[input.targetLocale as SupportedLocaleCode];
  if (!suffix) return text;
  return `${text} (${suffix})`;
}

export function deterministicTranslateContent(input: {
  sourceText: string;
  sourceLocale?: string;
  targetLocales: ReadonlyArray<string>;
}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const targetLocale of input.targetLocales) {
    if (targetLocale === (input.sourceLocale ?? DEFAULT_LOCALE)) continue;
    out[targetLocale] = deterministicTranslateText({
      text: input.sourceText,
      sourceLocale: input.sourceLocale ?? DEFAULT_LOCALE,
      targetLocale,
    });
  }
  return out;
}

export function translationFallbackNote(targetLocale: string): string {
  return `${localeShortLabel(targetLocale)} fallback`;
}

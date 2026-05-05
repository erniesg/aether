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

const KNOWN_PHRASE_TRANSLATIONS: ReadonlyArray<
  Record<SupportedLocaleCode, string>
> = [
  {
    'en-SG': 'Cooler sleep starts tonight',
    'zh-Hans-SG': '今晚开始清凉好眠',
    'ms-SG': 'Tidur lebih sejuk bermula malam ini',
    'ta-SG': 'இன்றிரவு முதல் குளிர்ந்த தூக்கம்',
    'ja-JP': '今夜から、もっと涼しい眠りを',
    'ko-KR': '오늘 밤부터 더 시원한 잠',
  },
];

export function deterministicTranslateText(input: {
  text: string;
  sourceLocale?: string;
  targetLocale: string;
}): string {
  const text = input.text.trim();
  if (!text || input.targetLocale === input.sourceLocale) return text;
  const targetLocale = input.targetLocale as SupportedLocaleCode;
  for (const translations of KNOWN_PHRASE_TRANSLATIONS) {
    if (
      Object.values(translations).some(
        (candidate) => candidate.toLocaleLowerCase() === text.toLocaleLowerCase()
      )
    ) {
      return translations[targetLocale] ?? '';
    }
  }
  return '';
}

export function deterministicTranslateContent(input: {
  sourceText: string;
  sourceLocale?: string;
  targetLocales: ReadonlyArray<string>;
}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const targetLocale of input.targetLocales) {
    if (targetLocale === (input.sourceLocale ?? DEFAULT_LOCALE)) continue;
    const translated = deterministicTranslateText({
      text: input.sourceText,
      sourceLocale: input.sourceLocale ?? DEFAULT_LOCALE,
      targetLocale,
    });
    if (translated.trim()) out[targetLocale] = translated;
  }
  return out;
}

export function translationFallbackNote(targetLocale: string): string {
  return `${localeShortLabel(targetLocale)} fallback`;
}

export function looksLikeDeterministicFallbackDraft(text: string): boolean {
  const trimmed = text.trim();
  return Object.values(FALLBACK_SUFFIX)
    .filter(Boolean)
    .some((suffix) => trimmed.endsWith(`(${suffix})`));
}

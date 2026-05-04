import { asBCP47LocaleCode, type BCP47LocaleCode } from '@/lib/text-overlay/types';

export type SupportedLocaleCode =
  | 'en-SG'
  | 'zh-Hans-SG'
  | 'ms-SG'
  | 'ta-SG'
  | 'ja-JP'
  | 'ko-KR';

export interface LocaleDefinition {
  code: BCP47LocaleCode;
  label: string;
  shortLabel: string;
  nativeLabel: string;
  languageName: string;
  market: string;
  wrapLocale: string;
  fontStack: string;
}

export const DEFAULT_LOCALE = asBCP47LocaleCode('en-SG');

export const SUPPORTED_LOCALE_DEFINITIONS: readonly LocaleDefinition[] = [
  {
    code: DEFAULT_LOCALE,
    label: 'English',
    shortLabel: 'EN',
    nativeLabel: 'English',
    languageName: 'English',
    market: 'Singapore',
    wrapLocale: 'en-SG',
    fontStack: "'Helvetica Neue','Helvetica',Arial,sans-serif",
  },
  {
    code: asBCP47LocaleCode('zh-Hans-SG'),
    label: 'Chinese',
    shortLabel: '中文',
    nativeLabel: '中文',
    languageName: 'Chinese / Mandarin',
    market: 'Singapore',
    wrapLocale: 'zh-Hans',
    fontStack:
      "'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans CJK SC',sans-serif",
  },
  {
    code: asBCP47LocaleCode('ms-SG'),
    label: 'Malay',
    shortLabel: 'MS',
    nativeLabel: 'Melayu',
    languageName: 'Malay',
    market: 'Singapore',
    wrapLocale: 'ms-SG',
    fontStack: "'Helvetica Neue','Helvetica',Arial,sans-serif",
  },
  {
    code: asBCP47LocaleCode('ta-SG'),
    label: 'Tamil',
    shortLabel: 'TA',
    nativeLabel: 'தமிழ்',
    languageName: 'Tamil',
    market: 'Singapore',
    wrapLocale: 'ta-SG',
    fontStack: "'Tamil MN','Latha','Noto Sans Tamil',sans-serif",
  },
  {
    code: asBCP47LocaleCode('ja-JP'),
    label: 'Japanese',
    shortLabel: '日本語',
    nativeLabel: '日本語',
    languageName: 'Japanese',
    market: 'Japan',
    wrapLocale: 'ja-JP',
    fontStack:
      "'Hiragino Sans','Hiragino Kaku Gothic ProN','Yu Gothic','Noto Sans JP',sans-serif",
  },
  {
    code: asBCP47LocaleCode('ko-KR'),
    label: 'Korean',
    shortLabel: '한국어',
    nativeLabel: '한국어',
    languageName: 'Korean',
    market: 'Korea',
    wrapLocale: 'ko-KR',
    fontStack:
      "'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif",
  },
] as const;

export const SUPPORTED_LOCALES: ReadonlyArray<BCP47LocaleCode> =
  SUPPORTED_LOCALE_DEFINITIONS.map((locale) => locale.code);

export const TARGET_TRANSLATION_LOCALES: ReadonlyArray<BCP47LocaleCode> =
  SUPPORTED_LOCALES.filter((locale) => locale !== DEFAULT_LOCALE);

const LOCALE_BY_CODE = new Map<string, LocaleDefinition>(
  SUPPORTED_LOCALE_DEFINITIONS.map((locale) => [locale.code, locale])
);

export function isSupportedLocaleCode(value: unknown): value is BCP47LocaleCode {
  return typeof value === 'string' && LOCALE_BY_CODE.has(value);
}

export function getLocaleDefinition(
  locale: string | BCP47LocaleCode
): LocaleDefinition | undefined {
  return LOCALE_BY_CODE.get(String(locale));
}

export function requireLocaleDefinition(
  locale: string | BCP47LocaleCode
): LocaleDefinition {
  const definition = getLocaleDefinition(locale);
  if (!definition) throw new Error(`unsupported locale: ${String(locale)}`);
  return definition;
}

export function normalizeSupportedLocale(
  value: unknown,
  fallback: BCP47LocaleCode = DEFAULT_LOCALE
): BCP47LocaleCode {
  return isSupportedLocaleCode(value) ? value : fallback;
}

export function normalizeSupportedLocaleList(
  raw: ReadonlyArray<unknown> | undefined,
  options: { includeDefault?: boolean } = {}
): BCP47LocaleCode[] {
  const seen = new Set<string>();
  const out: BCP47LocaleCode[] = [];
  if (options.includeDefault !== false) {
    seen.add(DEFAULT_LOCALE);
    out.push(DEFAULT_LOCALE);
  }
  for (const entry of raw ?? []) {
    if (!isSupportedLocaleCode(entry)) continue;
    if (seen.has(entry)) continue;
    seen.add(entry);
    out.push(entry);
  }
  return out;
}

export function localeLabel(locale: string | BCP47LocaleCode): string {
  return getLocaleDefinition(locale)?.label ?? String(locale);
}

export function localeShortLabel(locale: string | BCP47LocaleCode): string {
  return getLocaleDefinition(locale)?.shortLabel ?? String(locale);
}

export function asSupportedLocaleCode(value: BCP47LocaleCode): SupportedLocaleCode {
  if (!isSupportedLocaleCode(value)) {
    throw new Error(`unsupported locale: ${String(value)}`);
  }
  return value as unknown as SupportedLocaleCode;
}

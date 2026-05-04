import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  TARGET_TRANSLATION_LOCALES,
  localeShortLabel,
  normalizeSupportedLocale,
  normalizeSupportedLocaleList,
} from './registry';

describe('locale registry', () => {
  it('defines the six creator-facing locales with en-SG first', () => {
    expect(SUPPORTED_LOCALES.map(String)).toEqual([
      'en-SG',
      'zh-Hans-SG',
      'ms-SG',
      'ta-SG',
      'ja-JP',
      'ko-KR',
    ]);
    expect(DEFAULT_LOCALE).toBe('en-SG');
    expect(TARGET_TRANSLATION_LOCALES.map(String)).toEqual([
      'zh-Hans-SG',
      'ms-SG',
      'ta-SG',
      'ja-JP',
      'ko-KR',
    ]);
  });

  it('rejects older demo tags and falls back to en-SG', () => {
    expect(normalizeSupportedLocale('en')).toBe('en-SG');
    expect(normalizeSupportedLocale('zh-Hans')).toBe('en-SG');
    expect(normalizeSupportedLocale('ja-JP')).toBe('ja-JP');
  });

  it('dedupes selected locales while preserving the default source locale', () => {
    expect(
      normalizeSupportedLocaleList(['zh-Hans-SG', 'en-SG', 'ko-KR', 'zh-Hans-SG']).map(String)
    ).toEqual(['en-SG', 'zh-Hans-SG', 'ko-KR']);
  });

  it('exposes compact creator-facing labels', () => {
    expect(localeShortLabel('en-SG')).toBe('EN');
    expect(localeShortLabel('zh-Hans-SG')).toBe('中文');
    expect(localeShortLabel('ko-KR')).toBe('한국어');
  });
});

'use client';

import { useSyncExternalStore } from 'react';
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  TARGET_TRANSLATION_LOCALES,
  isSupportedLocaleCode,
  normalizeSupportedLocale,
  normalizeSupportedLocaleList,
} from '@/lib/locale/registry';
import type { BCP47LocaleCode } from './types';

/**
 * Session-only language state for the multilingual text-overlay layer.
 * Persisted campaign records carry locale-keyed copy; this store only tracks
 * the creator's current canvas view and enabled languages in this browser
 * session.
 */
export const CANVAS_LOCALES = SUPPORTED_LOCALES;
export const DEMO_LOCALES = CANVAS_LOCALES;
export const TRANSLATION_TARGET_LOCALES = TARGET_TRANSLATION_LOCALES;

export const DEFAULT_ACTIVE_LOCALE: BCP47LocaleCode = DEFAULT_LOCALE;
const DEFAULT_ENABLED_LOCALES: ReadonlyArray<BCP47LocaleCode> = [
  DEFAULT_ACTIVE_LOCALE,
];

export type LocaleViewMode = 'single' | 'multilingual';

type Listener = () => void;

let current: BCP47LocaleCode = DEFAULT_ACTIVE_LOCALE;
let enabled: BCP47LocaleCode[] = [...DEFAULT_ENABLED_LOCALES];
let viewMode: LocaleViewMode = 'single';
let translateLinked = true;
const listeners = new Set<Listener>();

function notify(): void {
  for (const l of listeners) l();
}

function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function getSnapshot(): BCP47LocaleCode {
  return current;
}

function getServerSnapshot(): BCP47LocaleCode {
  return DEFAULT_ACTIVE_LOCALE;
}

function getEnabledSnapshot(): ReadonlyArray<BCP47LocaleCode> {
  return enabled;
}

function getEnabledServerSnapshot(): ReadonlyArray<BCP47LocaleCode> {
  return DEFAULT_ENABLED_LOCALES;
}

function getViewModeSnapshot(): LocaleViewMode {
  return viewMode;
}

function getViewModeServerSnapshot(): LocaleViewMode {
  return 'single';
}

function getTranslateLinkedSnapshot(): boolean {
  return translateLinked;
}

function getTranslateLinkedServerSnapshot(): boolean {
  return true;
}

export function useActiveLocale(): BCP47LocaleCode {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useEnabledLocales(): ReadonlyArray<BCP47LocaleCode> {
  return useSyncExternalStore(
    subscribe,
    getEnabledSnapshot,
    getEnabledServerSnapshot
  );
}

export function useLocaleViewMode(): LocaleViewMode {
  return useSyncExternalStore(
    subscribe,
    getViewModeSnapshot,
    getViewModeServerSnapshot
  );
}

export function useTranslateLinkedLocales(): boolean {
  return useSyncExternalStore(
    subscribe,
    getTranslateLinkedSnapshot,
    getTranslateLinkedServerSnapshot
  );
}

export function setActiveLocale(locale: BCP47LocaleCode): void {
  const next = normalizeSupportedLocale(locale);
  if (current === next) return;
  current = next;
  if (!enabled.includes(next)) {
    enabled = [...enabled, next].sort(localeSort);
  }
  notify();
}

export function getActiveLocale(): BCP47LocaleCode {
  return current;
}

export function getEnabledLocales(): ReadonlyArray<BCP47LocaleCode> {
  return enabled;
}

export function setEnabledLocales(locales: ReadonlyArray<BCP47LocaleCode>): void {
  const next = normalizeSupportedLocaleList(locales, { includeDefault: true });
  if (sameLocaleList(enabled, next)) return;
  enabled = next;
  if (!enabled.includes(current)) current = DEFAULT_ACTIVE_LOCALE;
  if (enabled.length <= 1 && viewMode === 'multilingual') viewMode = 'single';
  notify();
}

export function setLocaleEnabled(locale: BCP47LocaleCode, nextEnabled: boolean): void {
  if (!isSupportedLocaleCode(locale)) return;
  const hasLocale = enabled.includes(locale);
  if (nextEnabled && hasLocale) return;
  if (!nextEnabled && locale === DEFAULT_ACTIVE_LOCALE) return;
  if (nextEnabled) {
    setEnabledLocales([...enabled, locale]);
    return;
  }
  setEnabledLocales(enabled.filter((entry) => entry !== locale));
}

export function getLocaleViewMode(): LocaleViewMode {
  return viewMode;
}

export function setLocaleViewMode(mode: LocaleViewMode): void {
  const next = mode === 'multilingual' && enabled.length <= 1 ? 'single' : mode;
  if (viewMode === next) return;
  viewMode = next;
  notify();
}

export function getTranslateLinkedLocales(): boolean {
  return translateLinked;
}

export function setTranslateLinkedLocales(next: boolean): void {
  if (translateLinked === next) return;
  translateLinked = next;
  notify();
}

export function resetActiveLocaleForTests(): void {
  current = DEFAULT_ACTIVE_LOCALE;
  enabled = [...DEFAULT_ENABLED_LOCALES];
  viewMode = 'single';
  translateLinked = true;
  notify();
}

function localeSort(a: BCP47LocaleCode, b: BCP47LocaleCode): number {
  return SUPPORTED_LOCALES.indexOf(a) - SUPPORTED_LOCALES.indexOf(b);
}

function sameLocaleList(
  a: ReadonlyArray<BCP47LocaleCode>,
  b: ReadonlyArray<BCP47LocaleCode>
): boolean {
  return a.length === b.length && a.every((locale, i) => locale === b[i]);
}

/**
 * Pick the best content string for a locale, falling back to the source
 * locale's text if the requested locale is missing — that mirrors the
 * planner's fallback (target locales mirror source on Anthropic-unavailable).
 * Empty string when content has no entries at all.
 */
export function pickLocalizedText(
  content: Record<BCP47LocaleCode, string> | undefined,
  locale: BCP47LocaleCode,
  fallback?: BCP47LocaleCode
): string {
  if (!content) return '';
  const direct = content[locale];
  if (typeof direct === 'string' && direct.length > 0) return direct;
  if (fallback) {
    const f = content[fallback];
    if (typeof f === 'string' && f.length > 0) return f;
  }
  const first = Object.values(content).find((v) => typeof v === 'string' && v.length > 0);
  return typeof first === 'string' ? first : '';
}

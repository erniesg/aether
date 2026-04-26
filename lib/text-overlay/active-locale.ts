'use client';

import { useSyncExternalStore } from 'react';
import { asBCP47LocaleCode, type BCP47LocaleCode } from './types';

/**
 * Session-only active-locale store for the multilingual text-overlay layer.
 * The text-apply planner emits one entry per requested locale; the active
 * locale picks which one the canvas renders. Kept outside Convex per hard
 * rule #9 — derived/session state never appears in the persisted payload.
 *
 * The hackathon ships with three demo locales (en · zh-Hans · ja-JP); the
 * list stays open-ended so adding `pt-BR` etc. is a one-line change in the
 * right-rail switcher.
 */
export const DEMO_LOCALES: ReadonlyArray<BCP47LocaleCode> = [
  asBCP47LocaleCode('en'),
  asBCP47LocaleCode('zh-Hans'),
  asBCP47LocaleCode('ja-JP'),
];

export const DEFAULT_ACTIVE_LOCALE: BCP47LocaleCode = DEMO_LOCALES[0];

type Listener = () => void;

let current: BCP47LocaleCode = DEFAULT_ACTIVE_LOCALE;
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

export function useActiveLocale(): BCP47LocaleCode {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function setActiveLocale(locale: BCP47LocaleCode): void {
  if (current === locale) return;
  current = locale;
  notify();
}

export function getActiveLocale(): BCP47LocaleCode {
  return current;
}

export function resetActiveLocaleForTests(): void {
  current = DEFAULT_ACTIVE_LOCALE;
  notify();
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

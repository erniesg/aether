'use client';

import { useSyncExternalStore } from 'react';
import {
  DEMO_CREATOR_CONTEXT,
  type BrandContext,
  type KnowledgeSource,
} from './model';

const LS_KEY = 'aether.brand.v1';

type Listener = () => void;

let cache: BrandContext | null = null;
const listeners = new Set<Listener>();

function normalizeHex(value: string): string | null {
  const raw = value.trim().replace(/^#/, '');
  if (!/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) return null;
  const expanded =
    raw.length === 3
      ? raw
          .split('')
          .map((ch) => `${ch}${ch}`)
          .join('')
      : raw;
  return `#${expanded.toUpperCase()}`;
}

function isKnowledgeSource(value: unknown): value is KnowledgeSource {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    (v.kind === 'url' || v.kind === 'repo' || v.kind === 'upload' || v.kind === 'asset') &&
    typeof v.label === 'string' &&
    typeof v.note === 'string'
  );
}

function coerceBrandContext(value: unknown): BrandContext | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || typeof v.name !== 'string') return null;

  const palette = Array.isArray(v.palette)
    ? v.palette
        .map((entry) => (typeof entry === 'string' ? normalizeHex(entry) : null))
        .filter((entry): entry is string => entry !== null)
    : [];
  const type = Array.isArray(v.type)
    ? v.type
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean)
    : [];
  const knowledgeSources = Array.isArray(v.knowledgeSources)
    ? v.knowledgeSources.filter(isKnowledgeSource)
    : [];

  return {
    id: v.id,
    name: v.name.trim() || DEMO_CREATOR_CONTEXT.brand.name,
    palette,
    type,
    voice: typeof v.voice === 'string' ? v.voice.trim() : '',
    knowledgeSources,
  };
}

function loadFromStorage(): BrandContext {
  if (typeof window === 'undefined') return DEMO_CREATOR_CONTEXT.brand;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return DEMO_CREATOR_CONTEXT.brand;
    return coerceBrandContext(JSON.parse(raw)) ?? DEMO_CREATOR_CONTEXT.brand;
  } catch {
    return DEMO_CREATOR_CONTEXT.brand;
  }
}

function saveToStorage(context: BrandContext) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(context));
  } catch {
    // localStorage can be unavailable; in-memory cache still updates subscribers.
  }
}

function current(): BrandContext {
  if (cache === null) cache = loadFromStorage();
  return cache;
}

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getServerSnapshot(): BrandContext {
  return DEMO_CREATOR_CONTEXT.brand;
}

export function useBrandContext(): BrandContext {
  return useSyncExternalStore(subscribe, current, getServerSnapshot);
}

export function saveBrandContext(context: BrandContext): void {
  cache = coerceBrandContext(context) ?? DEMO_CREATOR_CONTEXT.brand;
  saveToStorage(cache);
  notify();
}

export function resetBrandContextForTests(): void {
  cache = DEMO_CREATOR_CONTEXT.brand;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(LS_KEY);
    } catch {
      // ignore
    }
  }
  notify();
}

export const BRAND_CONTEXT_STORAGE_KEY = LS_KEY;

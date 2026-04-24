'use client';

import { useSyncExternalStore } from 'react';
import {
  type ClusterCard,
  type ClusterColumn,
  type ClusterStateChange,
  isClusterColumn,
} from './types';

// localStorage-backed store for the cluster kanban. Mirrors lib/signals/memory
// so the lens works end-to-end in dev + Playwright without Convex. Convex
// replaces this behind a facade when NEXT_PUBLIC_CONVEX_URL is set.

const LS_CARDS = 'aether.clusters.cards.v1';
const LS_LOG = 'aether.clusters.log.v1';

type Listener = () => void;

let cardCache: ClusterCard[] | null = null;
let logCache: ClusterStateChange[] | null = null;
const listeners = new Set<Listener>();

function isClusterCard(value: unknown): value is ClusterCard {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.referenceId === 'string' &&
    typeof v.clusterId === 'string' &&
    typeof v.clusterLabel === 'string' &&
    typeof v.thumbnailUrl === 'string' &&
    typeof v.movedAt === 'number' &&
    isClusterColumn(v.column) &&
    typeof v.attribution === 'object' &&
    v.attribution !== null
  );
}

function isStateChange(value: unknown): value is ClusterStateChange {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.cardId === 'string' &&
    typeof v.at === 'number' &&
    isClusterColumn(v.from) &&
    isClusterColumn(v.to)
  );
}

function loadCards(): ClusterCard[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LS_CARDS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isClusterCard);
  } catch {
    return [];
  }
}

function loadLog(): ClusterStateChange[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LS_LOG);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStateChange);
  } catch {
    return [];
  }
}

function saveCards(records: ClusterCard[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_CARDS, JSON.stringify(records));
  } catch {
    // quota — in-memory cache still drives the UI
  }
}

function saveLog(records: ClusterStateChange[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_LOG, JSON.stringify(records));
  } catch {
    // quota
  }
}

function currentCards(): ClusterCard[] {
  if (cardCache === null) cardCache = loadCards();
  return cardCache;
}

function currentLog(): ClusterStateChange[] {
  if (logCache === null) logCache = loadLog();
  return logCache;
}

function notify() {
  for (const l of listeners) l();
}

function updateCards(fn: (prev: ClusterCard[]) => ClusterCard[]) {
  cardCache = fn(currentCards());
  saveCards(cardCache);
  notify();
}

function appendLog(entry: ClusterStateChange) {
  logCache = [...currentLog(), entry];
  saveLog(logCache);
}

export function subscribeClustersMemory(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

const SERVER_SNAPSHOT: ClusterCard[] = [];
function getServerSnapshot(): ClusterCard[] {
  return SERVER_SNAPSHOT;
}

const SERVER_LOG: ClusterStateChange[] = [];
function getServerLogSnapshot(): ClusterStateChange[] {
  return SERVER_LOG;
}

export function useClustersMemory(): ClusterCard[] {
  return useSyncExternalStore(subscribeClustersMemory, currentCards, getServerSnapshot);
}

export function useClusterLogMemory(): ClusterStateChange[] {
  return useSyncExternalStore(subscribeClustersMemory, currentLog, getServerLogSnapshot);
}

export interface UpsertInput {
  referenceId: string;
  clusterId: string;
  clusterLabel?: string;
  thumbnailUrl: string;
  attribution: ClusterCard['attribution'];
  score?: number;
  /** Column to place the card in. Defaults to `Found` when omitted. */
  column?: ClusterColumn;
}

/**
 * Insert or update a card. The column only overwrites on first insert — a
 * fresh cluster run should not yank a creator's shortlist back to `Found`.
 */
export function upsertClusterCardMemory(input: UpsertInput): ClusterCard {
  const now = Date.now();
  let out!: ClusterCard;
  updateCards((prev) => {
    const existing = prev.find((c) => c.referenceId === input.referenceId);
    if (existing) {
      out = {
        ...existing,
        clusterId: input.clusterId,
        clusterLabel: input.clusterLabel ?? existing.clusterLabel,
        thumbnailUrl: input.thumbnailUrl,
        attribution: input.attribution,
        score: input.score ?? existing.score,
      };
      return prev.map((c) => (c.referenceId === input.referenceId ? out : c));
    }
    out = {
      referenceId: input.referenceId,
      clusterId: input.clusterId,
      clusterLabel: input.clusterLabel ?? `cluster ${input.clusterId}`,
      thumbnailUrl: input.thumbnailUrl,
      attribution: input.attribution,
      score: input.score,
      column: input.column ?? 'Found',
      movedAt: now,
    };
    return [...prev, out];
  });
  return out;
}

/** Reclassifies every card in a given cluster to a new label. Used once
 *  Claude's label route streams back names for the freshly created clusters. */
export function relabelClusterMemory(clusterId: string, label: string): number {
  let changed = 0;
  updateCards((prev) =>
    prev.map((card) => {
      if (card.clusterId !== clusterId) return card;
      changed += 1;
      return { ...card, clusterLabel: label };
    })
  );
  return changed;
}

/**
 * Drag state machine. Moves a card between columns and emits a
 * `ClusterStateChange` provenance record. Returns `null` when the card is
 * missing or the move is a no-op. When a card lands in `Hero`, any existing
 * Hero card falls back to `Shortlisted` (Hero is singleton per artboard).
 */
export function moveClusterCardMemory(
  cardId: string,
  to: ClusterColumn
): ClusterStateChange | null {
  const before = currentCards();
  const target = before.find((c) => c.referenceId === cardId);
  if (!target) return null;
  if (target.column === to) return null;
  const now = Date.now();
  const entry: ClusterStateChange = {
    cardId,
    from: target.column,
    to,
    at: now,
  };
  updateCards((prev) =>
    prev.map((card) => {
      if (card.referenceId === cardId) {
        return { ...card, column: to, movedAt: now };
      }
      if (to === 'Hero' && card.column === 'Hero') {
        return { ...card, column: 'Shortlisted', movedAt: now };
      }
      return card;
    })
  );
  appendLog(entry);
  notify();
  return entry;
}

export function removeClusterCardMemory(cardId: string): void {
  updateCards((prev) => prev.filter((c) => c.referenceId !== cardId));
}

export function clearClustersMemory(): void {
  cardCache = [];
  logCache = [];
  saveCards(cardCache);
  saveLog(logCache);
  notify();
}

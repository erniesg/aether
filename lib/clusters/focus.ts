'use client';

import { useSyncExternalStore } from 'react';
import type { ClusterCard } from './types';

// Session-only store for the right-rail "focus" on a cluster card. Not
// persisted — per hard rule #9 (graph-first persistence, session state stays
// out of Convex). Lives outside the kanban store so stores stay single-
// responsibility.

type Listener = () => void;

let current: ClusterCard | null = null;
const listeners = new Set<Listener>();

function notify() {
  for (const l of listeners) l();
}

function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function getSnapshot(): ClusterCard | null {
  return current;
}

function getServerSnapshot(): ClusterCard | null {
  return null;
}

export function useFocusedClusterCard(): ClusterCard | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function setFocusedClusterCard(card: ClusterCard | null): void {
  current = card;
  notify();
}

export function clearFocusedClusterCardForTests(): void {
  current = null;
  notify();
}

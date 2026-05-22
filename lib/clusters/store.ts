'use client';

// Cluster-kanban store facade. Broad Convex live reads are opt-in via
// NEXT_PUBLIC_AETHER_LIVE_MODE=all; otherwise the localStorage-backed memory
// store drives the UI so Playwright and dev work without realtime subscriptions.

import { isConvexEnabled } from '@/lib/convex/client';
import {
  useClustersMemory,
  useClusterLogMemory,
  upsertClusterCardMemory,
  moveClusterCardMemory,
  relabelClusterMemory,
  removeClusterCardMemory,
  clearClustersMemory,
  type UpsertInput,
} from './memory';
import {
  useClustersConvex,
  upsertClusterCardConvex,
  moveClusterCardConvex,
  relabelClusterConvex,
  removeClusterCardConvex,
} from './convex';
import type {
  ClusterCard,
  ClusterColumn,
  ClusterStateChange,
} from './types';

export type { ClusterCard, ClusterColumn, ClusterStateChange, UpsertInput };

export function useClusters(): ClusterCard[] {
  /* eslint-disable react-hooks/rules-of-hooks */
  if (isConvexEnabled()) return useClustersConvex();
  return useClustersMemory();
  /* eslint-enable react-hooks/rules-of-hooks */
}

export function useClusterLog(): ClusterStateChange[] {
  /* eslint-disable react-hooks/rules-of-hooks */
  if (isConvexEnabled()) return [];
  return useClusterLogMemory();
  /* eslint-enable react-hooks/rules-of-hooks */
}

export function upsertClusterCard(input: UpsertInput): ClusterCard {
  if (isConvexEnabled()) {
    upsertClusterCardConvex(input);
  }
  return upsertClusterCardMemory(input);
}

export function moveClusterCard(
  cardId: string,
  to: ClusterColumn
): ClusterStateChange | null {
  if (isConvexEnabled()) {
    moveClusterCardConvex(cardId, to);
  }
  return moveClusterCardMemory(cardId, to);
}

export function relabelCluster(clusterId: string, label: string): number {
  if (isConvexEnabled()) {
    relabelClusterConvex(clusterId, label);
  }
  return relabelClusterMemory(clusterId, label);
}

export function removeClusterCard(cardId: string): void {
  if (isConvexEnabled()) {
    removeClusterCardConvex(cardId);
  }
  removeClusterCardMemory(cardId);
}

export function resetClustersForTests(): void {
  clearClustersMemory();
}

'use client';

import { useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { getConvexClient } from '@/lib/convex/client';
import type { ClusterCard, ClusterColumn } from './types';
import type { UpsertInput } from './memory';

// anyApi lets us reference server functions by path without depending on the
// generated api surface. Matches the lib/signals/convex.ts pattern.
const clustersApi = (anyApi as unknown as {
  clusters: {
    list: unknown;
    upsertCard: unknown;
    moveCard: unknown;
    relabel: unknown;
    removeCard: unknown;
  };
}).clusters;

export function useClustersConvex(): ClusterCard[] {
  const data = useQuery(clustersApi.list as never, {} as never) as
    | ClusterCard[]
    | undefined;
  return data ?? [];
}

export function upsertClusterCardConvex(input: UpsertInput): void {
  const client = getConvexClient();
  if (!client) return;
  void client.mutation(clustersApi.upsertCard as never, input as never);
}

export function moveClusterCardConvex(cardId: string, to: ClusterColumn): void {
  const client = getConvexClient();
  if (!client) return;
  void client.mutation(clustersApi.moveCard as never, { cardId, to } as never);
}

export function relabelClusterConvex(clusterId: string, label: string): void {
  const client = getConvexClient();
  if (!client) return;
  void client.mutation(clustersApi.relabel as never, { clusterId, label } as never);
}

export function removeClusterCardConvex(cardId: string): void {
  const client = getConvexClient();
  if (!client) return;
  void client.mutation(clustersApi.removeCard as never, { cardId } as never);
}

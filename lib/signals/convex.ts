'use client';

import { useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { getConvexClient } from '@/lib/convex/client';
import type { SignalKind, SignalRecord } from './types';

// anyApi lets us reference server functions by path without depending on the
// generated api surface. Replace with `api.signals.*` from
// `convex/_generated/api` once `npx convex dev` has run.
const signalsApi = (anyApi as unknown as {
  signals: {
    list: unknown;
    add: unknown;
    update: unknown;
    remove: unknown;
    mute: unknown;
    unmute: unknown;
  };
}).signals;

export function useSignalsConvex(workspaceId?: string): SignalRecord[] {
  const data = useQuery(
    signalsApi.list as never,
    (workspaceId ? { workspaceId } : {}) as never
  ) as
    | SignalRecord[]
    | undefined;
  return data ?? [];
}

export function addSignalConvex(kind: SignalKind, value: string, workspaceId?: string): void {
  const client = getConvexClient();
  if (!client) return;
  void client.mutation(signalsApi.add as never, { kind, value, workspaceId } as never);
}

export function updateSignalConvex(id: string, kind: SignalKind, value: string): void {
  const client = getConvexClient();
  if (!client) return;
  void client.mutation(signalsApi.update as never, { id, kind, value } as never);
}

export function removeSignalConvex(id: string): void {
  const client = getConvexClient();
  if (!client) return;
  void client.mutation(signalsApi.remove as never, { id } as never);
}

export function muteSignalConvex(id: string, mutedUntil?: number): void {
  const client = getConvexClient();
  if (!client) return;
  void client.mutation(signalsApi.mute as never, { id, mutedUntil } as never);
}

export function unmuteSignalConvex(id: string): void {
  const client = getConvexClient();
  if (!client) return;
  void client.mutation(signalsApi.unmute as never, { id } as never);
}

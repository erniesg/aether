'use client';

import { useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { getConvexClient } from '@/lib/convex/client';
import type { CapabilityRunRecord, RunStatus, RunStep } from './runs.types';

// anyApi lets us reference server functions by path without depending on the
// generated api surface. Replace with `api.runs.*` from `convex/_generated/api`
// once `npx convex dev` has run.
const runsApi = (anyApi as unknown as {
  runs: {
    list: unknown;
    start: unknown;
    step: unknown;
    finish: unknown;
    fail: unknown;
  };
}).runs;

export function useRunsConvex(): CapabilityRunRecord[] {
  const data = useQuery(runsApi.list as never, {} as never) as
    | CapabilityRunRecord[]
    | undefined;
  return data ?? [];
}

export function startRunConvex(
  id: string,
  partial: Omit<CapabilityRunRecord, 'id' | 'status' | 'startedAt'> & { status?: RunStatus }
): void {
  const client = getConvexClient();
  if (!client) return;
  void client.mutation(runsApi.start as never, {
    clientRunId: id,
    tool: partial.tool,
    provider: partial.provider,
    model: partial.model,
    prompt: partial.prompt,
    aspectRatio: partial.aspectRatio,
    inputs: partial.inputs,
    artifactKind: partial.artifactKind,
    scope: partial.scope,
    startedAt: Date.now(),
  } as never);
}

export function stepRunConvex(id: string, step: RunStep): void {
  const client = getConvexClient();
  if (!client) return;
  void client.mutation(runsApi.step as never, { clientRunId: id, step } as never);
}

export function finishRunConvex(id: string, patch: Partial<CapabilityRunRecord>): void {
  const client = getConvexClient();
  if (!client) return;
  void client.mutation(runsApi.finish as never, {
    clientRunId: id,
    status: patch.status,
    provider: patch.provider,
    model: patch.model,
    rewrittenPrompt: patch.rewrittenPrompt,
    rationale: patch.rationale,
    aspectRatio: patch.aspectRatio,
    imageUrl: patch.imageUrl,
    latencyMs: patch.latencyMs,
    error: patch.error,
    httpStatus: patch.httpStatus,
    inputs: patch.inputs,
    artifactKind: patch.artifactKind,
    outputRefs: patch.outputRefs,
    scope: patch.scope,
    finishedAt: Date.now(),
  } as never);
}

export function failRunConvex(id: string, error: string, httpStatus?: number): void {
  const client = getConvexClient();
  if (!client) return;
  void client.mutation(runsApi.fail as never, {
    clientRunId: id,
    error,
    httpStatus,
    finishedAt: Date.now(),
  } as never);
}

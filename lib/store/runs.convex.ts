'use client';

import { useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { getConvexClient } from '@/lib/convex/client';
import { sanitizeImageUrlForConvex } from '@/lib/convex/sanitize';
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
    abortStuck: unknown;
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
    artifactKind: partial.artifactKind,
    outputFormat: partial.outputFormat,
    quality: partial.quality,
    sourceMode: partial.sourceMode,
    sourceImageShapeId: partial.sourceImageShapeId,
    tool: partial.tool,
    provider: partial.provider,
    model: partial.model,
    prompt: partial.prompt,
    aspectRatio: partial.aspectRatio,
    definitionId: partial.definitionId,
    definitionVersion: partial.definitionVersion,
    entryRef: partial.entryRef,
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
    imageUrl: sanitizeImageUrlForConvex(patch.imageUrl),
    latencyMs: patch.latencyMs,
    error: patch.error,
    httpStatus: patch.httpStatus,
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

/**
 * Force-abort every Convex run row whose `startedAt` is older than the
 * supplied threshold (default 60s). UI escape hatch for the
 * `placing on canvas · NNNNs` indicator that gets stuck when `runs:finish`
 * throws server-side. Returns the server-reported count of aborted rows.
 */
export async function abortStuckRunsConvex(
  olderThanMs = 60_000
): Promise<{ aborted: number }> {
  const client = getConvexClient();
  if (!client) return { aborted: 0 };
  const result = (await client.mutation(runsApi.abortStuck as never, {
    olderThanMs,
  } as never)) as { aborted: number } | null | undefined;
  return result ?? { aborted: 0 };
}

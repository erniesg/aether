'use client';

import { useQuery } from 'convex/react';
import { makeFunctionReference } from 'convex/server';
import { getConvexClient } from '@/lib/convex/client';
import type { CapabilityRunRecord, RunStatus, RunStep } from './runs.types';
import { toPersistableRef, toPersistableRefs } from './persistableRefs';

const runsApi = {
  list: makeFunctionReference('runs.js:list'),
  start: makeFunctionReference('runs.js:start'),
  step: makeFunctionReference('runs.js:step'),
  finish: makeFunctionReference('runs.js:finish'),
  fail: makeFunctionReference('runs.js:fail'),
};

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
  } as never).catch((error) => {
    console.error('[runs/convex] start failed', error);
  });
}

export function stepRunConvex(id: string, step: RunStep): void {
  const client = getConvexClient();
  if (!client) return;
  void client
    .mutation(runsApi.step as never, { clientRunId: id, step } as never)
    .catch((error) => {
      console.error('[runs/convex] step failed', error);
    });
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
    imageUrl: toPersistableRef(patch.imageUrl),
    latencyMs: patch.latencyMs,
    error: patch.error,
    httpStatus: patch.httpStatus,
    inputs: patch.inputs,
    artifactKind: patch.artifactKind,
    outputRefs: toPersistableRefs(patch.outputRefs),
    scope: patch.scope,
    finishedAt: Date.now(),
  } as never).catch((error) => {
    console.error('[runs/convex] finish failed', error);
  });
}

export function failRunConvex(id: string, error: string, httpStatus?: number): void {
  const client = getConvexClient();
  if (!client) return;
  void client.mutation(runsApi.fail as never, {
    clientRunId: id,
    error,
    httpStatus,
    finishedAt: Date.now(),
  } as never).catch((mutationError) => {
    console.error('[runs/convex] fail failed', mutationError);
  });
}

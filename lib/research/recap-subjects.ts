'use client';

import { useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { isConvexEnabled } from '@/lib/convex/client';

/**
 * Recap subjects visible to the workspace rail. Mirrors the references-store
 * pattern: Convex when provisioned, an empty list otherwise (dev/Playwright
 * render the one-line empty hint instead of erroring).
 */

export interface RecapSubjectSummary {
  eventId: string;
  name: string;
  status: string;
  workspaceId?: string;
}

const eventRecapsApi = (anyApi as unknown as {
  eventRecaps: { list: unknown };
}).eventRecaps;

function isRecapSubject(value: unknown): value is RecapSubjectSummary {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.eventId === 'string' && typeof v.name === 'string';
}

export function useRecapSubjects(workspaceId?: string): RecapSubjectSummary[] {
  /* eslint-disable react-hooks/rules-of-hooks */
  if (isConvexEnabled()) {
    // Recaps are not always provisioned against a workspace (the vibes
    // workbench creates them standalone), so list broadly and prefer rows
    // that match — or never claimed — this workspace.
    const data = useQuery(eventRecapsApi.list as never, {} as never) as
      | unknown[]
      | undefined;
    return (data ?? [])
      .filter(isRecapSubject)
      .filter((row) => !row.workspaceId || !workspaceId || row.workspaceId === workspaceId)
      .map((row) => ({
        eventId: row.eventId,
        name: row.name,
        status: typeof row.status === 'string' ? row.status : 'ready',
        workspaceId: row.workspaceId,
      }));
  }
  return [];
  /* eslint-enable react-hooks/rules-of-hooks */
}

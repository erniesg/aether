'use client';

import type {
  PublisherProviderId,
  ScheduledPost,
  ScheduleResult,
} from '@/lib/providers/publisher/types';

export interface ServerScheduleRequest {
  workspaceId: string;
  providerId?: PublisherProviderId;
  post: ScheduledPost;
}

export interface ServerScheduleResponse {
  ok: true;
  provider: { id: PublisherProviderId };
  post: ScheduledPost;
  result: ScheduleResult;
}

export function isServerPublisherEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PUBLISHER_MODE === 'server';
}

export async function scheduleViaServer(
  input: ServerScheduleRequest
): Promise<ServerScheduleResponse> {
  const res = await fetch('/api/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, allowPreviewFallback: false }),
  });
  const body = (await res.json().catch(() => null)) as
    | ServerScheduleResponse
    | { ok?: false; error?: string }
    | null;
  if (!res.ok || !body || body.ok !== true) {
    const message =
      body && 'error' in body && body.error
        ? body.error
        : `publish failed with ${res.status}`;
    throw new Error(message);
  }
  return body;
}

export async function cancelViaServer(input: {
  workspaceId: string;
  id: string;
  externalId?: string;
  providerId?: PublisherProviderId;
}): Promise<void> {
  const res = await fetch('/api/publish', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(body?.error || `cancel failed with ${res.status}`);
  }
}

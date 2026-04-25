import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';
import type { CapabilityEntryRef } from '@/lib/capability/entry';
import { sanitizeImageUrlForConvex } from './sanitize';

/**
 * Convex HTTP client for server-side runtimes (Next.js route handlers).
 * Activates only when both NEXT_PUBLIC_CONVEX_URL and CONVEX_DEPLOY_KEY are
 * set; otherwise every recorder call is a no-op so staging keeps working
 * before the deployment is provisioned.
 */

let httpClient: ConvexHttpClient | null = null;

function getHttpClient(): ConvexHttpClient | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  const key = process.env.CONVEX_DEPLOY_KEY;
  if (!url || !key) return null;
  if (!httpClient) {
    httpClient = new ConvexHttpClient(url);
    const client = httpClient as unknown as { setAdminAuth?: (k: string) => void };
    if (typeof client.setAdminAuth === 'function') client.setAdminAuth(key);
  }
  return httpClient;
}

const runsApi = (anyApi as unknown as {
  runs: { start: unknown; step: unknown; finish: unknown; fail: unknown };
}).runs;

export interface ServerRunStart {
  clientRunId: string;
  artifactKind?: 'image' | 'spatial';
  outputFormat?: 'particle-field' | 'gaussian-splat';
  quality?: 'draft' | 'standard' | 'high';
  sourceMode?: 'selected-image';
  sourceImageShapeId?: string;
  tool: string;
  provider: string;
  model: string;
  prompt: string;
  aspectRatio?: string;
  definitionId?: string;
  definitionVersion?: number;
  entryRef?: CapabilityEntryRef;
}

export async function recordRunStart(input: ServerRunStart): Promise<void> {
  const client = getHttpClient();
  if (!client) return;
  try {
    await client.mutation(runsApi.start as never, {
      ...input,
      startedAt: Date.now(),
    } as never);
  } catch (err) {
    console.error('[convex/http] recordRunStart failed', err);
  }
}

export async function recordRunFinish(
  clientRunId: string,
  patch: Partial<{
    status: 'running' | 'ok' | 'error';
    provider: string;
    model: string;
    rewrittenPrompt: string;
    rationale: string;
    aspectRatio: string;
    imageUrl: string;
    latencyMs: number;
    error: string;
    httpStatus: number;
  }>
): Promise<void> {
  const client = getHttpClient();
  if (!client) return;
  try {
    await client.mutation(runsApi.finish as never, {
      clientRunId,
      ...patch,
      imageUrl: sanitizeImageUrlForConvex(patch.imageUrl),
      finishedAt: Date.now(),
    } as never);
  } catch (err) {
    console.error('[convex/http] recordRunFinish failed', err);
  }
}

export async function recordRunFail(
  clientRunId: string,
  error: string,
  httpStatus?: number
): Promise<void> {
  const client = getHttpClient();
  if (!client) return;
  try {
    await client.mutation(runsApi.fail as never, {
      clientRunId,
      error,
      httpStatus,
      finishedAt: Date.now(),
    } as never);
  } catch (err) {
    console.error('[convex/http] recordRunFail failed', err);
  }
}

export function isConvexHttpEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CONVEX_URL && process.env.CONVEX_DEPLOY_KEY);
}

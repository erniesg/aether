import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { toPersistableRef, toPersistableRefs } from '@/lib/store/persistableRefs';

/**
 * Convex HTTP client for server-side runtimes (Next.js route handlers).
 * Activates only when both NEXT_PUBLIC_CONVEX_URL and CONVEX_DEPLOY_KEY are
 * set; otherwise every recorder call is a no-op so staging keeps working
 * before the deployment is provisioned.
 */

let httpClient: ConvexHttpClient | null = null;
let publicHttpClient: ConvexHttpClient | null = null;

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

function getPublicHttpClient(): ConvexHttpClient | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return null;
  if (!publicHttpClient) publicHttpClient = new ConvexHttpClient(url);
  return publicHttpClient;
}

const runsApi = {
  start: makeFunctionReference('runs.js:start'),
  step: makeFunctionReference('runs.js:step'),
  finish: makeFunctionReference('runs.js:finish'),
  fail: makeFunctionReference('runs.js:fail'),
};
const assetsApi = {
  generateUploadUrl: makeFunctionReference('assets.js:generateUploadUrl'),
  getUrl: makeFunctionReference('assets.js:getUrl'),
  recordGenerated: makeFunctionReference('assets.js:recordGenerated'),
};

export interface ServerRunStart {
  clientRunId: string;
  tool: string;
  provider: string;
  model: string;
  prompt: string;
  aspectRatio?: string;
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
    outputRefs: string[];
  }>
): Promise<void> {
  const client = getHttpClient();
  if (!client) return;
  try {
    await client.mutation(runsApi.finish as never, {
      clientRunId,
      ...patch,
      imageUrl: toPersistableRef(patch.imageUrl),
      outputRefs: toPersistableRefs(patch.outputRefs),
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

export async function uploadGeneratedAssetToConvexStorage(input: {
  bytes: Uint8Array;
  mimeType: string;
  kind?: 'generated-image' | 'background-plate' | 'export-pack';
  clientRunId?: string;
  frameId?: string;
  frameLabel?: string;
  provider?: string;
  model?: string;
  prompt?: string;
  width?: number;
  height?: number;
}): Promise<{ assetId?: string; storageId: string; url: string } | null> {
  const client = getPublicHttpClient();
  if (!client) return null;

  try {
    const uploadUrl = (await client.mutation(
      assetsApi.generateUploadUrl as never,
      {} as never
    )) as string;
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': input.mimeType,
      },
      body: new Blob([input.bytes as unknown as BlobPart], { type: input.mimeType }),
    });
    if (!uploadResponse.ok) {
      const text = await uploadResponse.text().catch(() => uploadResponse.statusText);
      throw new Error(`${uploadResponse.status} ${text}`);
    }

    const json = (await uploadResponse.json()) as { storageId?: string };
    if (!json.storageId) throw new Error('upload response missing storageId');
    try {
      const registered = (await client.mutation(assetsApi.recordGenerated as never, {
        storageId: json.storageId,
        kind: input.kind ?? 'generated-image',
        clientRunId: input.clientRunId,
        frameId: input.frameId,
        frameLabel: input.frameLabel,
        provider: input.provider,
        model: input.model,
        prompt: input.prompt,
        width: input.width,
        height: input.height,
        mimeType: input.mimeType,
        createdAt: Date.now(),
      } as never)) as { assetId?: string; storageId?: string; url?: string };
      if (registered.url) {
        return {
          assetId: registered.assetId,
          storageId: registered.storageId ?? json.storageId,
          url: registered.url,
        };
      }
    } catch (error) {
      console.error('[convex/http] generated asset record failed', error);
    }

    const url = (await client.query(assetsApi.getUrl as never, {
      storageId: json.storageId,
    } as never)) as string | null;
    if (!url) throw new Error('storage URL not available');
    return {
      storageId: json.storageId,
      url,
    };
  } catch (error) {
    console.error('[convex/http] uploadGeneratedAssetToConvexStorage failed', error);
    return null;
  }
}

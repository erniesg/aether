import { NextResponse } from 'next/server';
import { resolveClusteringProvider } from '@/lib/providers/clustering/registry';
import {
  ClusteringError,
  ClusteringUnavailableError,
  type ClusterImage,
} from '@/lib/providers/clustering/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RunRequestBody {
  images?: unknown;
  minClusterSize?: unknown;
  minSamples?: unknown;
}

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function parseImages(raw: unknown): ClusterImage[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ClusterImage[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') return null;
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== 'string' || typeof e.url !== 'string') return null;
    out.push({ id: e.id, url: e.url });
  }
  return out;
}

/**
 * POST /api/clusters/run
 *
 * Body: `{ images: Array<{ id, url }>, minClusterSize?, minSamples? }`.
 * Calls the configured clustering provider (clip-modal in MVP) and returns
 * `{ ok, items, nClusters, nNoise, provider, latencyMs }`. The caller is
 * expected to persist the result via the clusters store.
 *
 * When the provider is unavailable (e.g. CLIP_MODAL_URL unset), the route
 * falls back to a single-cluster stub so the UI still renders — the kanban
 * is the point of the demo; tuning quality is a follow-up.
 */
export async function POST(request: Request) {
  let body: RunRequestBody;
  try {
    body = (await request.json()) as RunRequestBody;
  } catch {
    return jsonError(400, 'invalid JSON body');
  }
  const images = parseImages(body.images);
  if (!images) {
    return jsonError(400, 'images must be an array of { id, url }');
  }
  if (images.length === 0) {
    return NextResponse.json({
      ok: true,
      items: [],
      nClusters: 0,
      nNoise: 0,
      provider: 'none',
    });
  }

  try {
    const provider = resolveClusteringProvider();
    const result = await provider.cluster(images, {
      minClusterSize:
        typeof body.minClusterSize === 'number' ? body.minClusterSize : undefined,
      minSamples:
        typeof body.minSamples === 'number' ? body.minSamples : undefined,
    });
    return NextResponse.json({
      ok: true,
      provider: result.provider,
      items: result.items.map((item) => ({
        id: item.id,
        clusterId: item.clusterId,
        embedding: item.embedding,
      })),
      nClusters: result.nClusters,
      nNoise: result.nNoise,
      latencyMs: result.latencyMs,
    });
  } catch (err) {
    if (err instanceof ClusteringUnavailableError) {
      // Fallback: every image lands in cluster 0 so the kanban still has
      // material to group. Noted in `provider: 'fallback'` so callers can
      // surface a toast.
      return NextResponse.json({
        ok: true,
        provider: 'fallback',
        items: images.map((image) => ({
          id: image.id,
          clusterId: 0,
        })),
        nClusters: 1,
        nNoise: 0,
        fallbackReason: err.message,
      });
    }
    if (err instanceof ClusteringError) {
      return jsonError(502, err.message);
    }
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(500, message);
  }
}

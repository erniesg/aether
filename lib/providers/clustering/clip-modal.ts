import { fetchWithTimeout, mark } from '@/lib/providers/image/util';
import {
  ClusteringError,
  ClusteringUnavailableError,
  type ClusterImage,
  type ClusterItem,
  type ClusterOpts,
  type ClusterResult,
  type ClusteringProvider,
} from './types';

/**
 * Modal-hosted CLIP + HDBSCAN + UMAP clustering adapter.
 *
 * The endpoint does embed + cluster + project in one RPC so we never have
 * to move 512-d vectors across the wire between Next and Convex. Inputs
 * are keyed by `id` so the caller can match cluster results back to their
 * workspace rows without relying on URL equality.
 *
 * Env (server-side only):
 *   CLIP_MODAL_URL   — deployed endpoint, e.g. https://<ws>--aether-clip-cluster.modal.run
 *   CLIP_MODAL_TOKEN — bearer token; required (endpoint fails closed without it)
 */

const MODAL_CLUSTER_TIMEOUT_MS = 300_000;

type ModalResponseItem = {
  image_url?: string;
  imageUrl?: string;
  embedding?: number[];
  cluster_id?: number;
  clusterId?: number;
  umap?: number[];
};

type ModalResponse = {
  items?: ModalResponseItem[];
  n_clusters?: number;
  nClusters?: number;
  n_noise?: number;
  nNoise?: number;
};

export function createClipModalProvider(
  endpoint: string | undefined = process.env.CLIP_MODAL_URL,
  token: string | undefined = process.env.CLIP_MODAL_TOKEN
): ClusteringProvider {
  return {
    id: 'clip-modal',
    displayName: 'CLIP + HDBSCAN via Modal',
    isAvailable: () => Boolean(endpoint && token),
    getAvailabilityIssue: () => {
      if (!endpoint) return 'CLIP_MODAL_URL not set';
      if (!token) return 'CLIP_MODAL_TOKEN not set';
      return undefined;
    },

    async cluster(
      images: ClusterImage[],
      opts: ClusterOpts = {}
    ): Promise<ClusterResult> {
      if (!endpoint) {
        throw new ClusteringUnavailableError('clip-modal', 'CLIP_MODAL_URL not set');
      }
      if (!token) {
        throw new ClusteringUnavailableError(
          'clip-modal',
          'CLIP_MODAL_TOKEN not set'
        );
      }

      if (images.length === 0) {
        return {
          provider: 'clip-modal',
          items: [],
          nClusters: 0,
          nNoise: 0,
          latencyMs: 0,
        };
      }

      const elapsed = mark();
      const res = await fetchWithTimeout(
        endpoint,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            image_urls: images.map((image) => image.url),
            min_cluster_size: opts.minClusterSize ?? 3,
            min_samples: opts.minSamples ?? 1,
          }),
        },
        MODAL_CLUSTER_TIMEOUT_MS
      );

      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new ClusteringError(`${res.status} ${text}`, 'clip-modal');
      }

      const data = (await res.json()) as ModalResponse;
      const rawItems = data.items ?? [];

      if (rawItems.length !== images.length) {
        throw new ClusteringError(
          `expected ${images.length} items, got ${rawItems.length}`,
          'clip-modal'
        );
      }

      const items: ClusterItem[] = rawItems.map((raw, index) => {
        const url = raw.imageUrl ?? raw.image_url ?? images[index].url;
        const clusterId = raw.clusterId ?? raw.cluster_id ?? -1;
        const embedding = raw.embedding ?? [];
        const umap = raw.umap ?? [0, 0];
        return {
          id: images[index].id,
          url,
          embedding,
          clusterId,
          umap: [umap[0] ?? 0, umap[1] ?? 0],
        };
      });

      return {
        provider: 'clip-modal',
        items,
        nClusters: data.nClusters ?? data.n_clusters ?? 0,
        nNoise: data.nNoise ?? data.n_noise ?? 0,
        latencyMs: elapsed(),
      };
    },
  };
}

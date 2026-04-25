export const KNOWN_CLUSTERING_PROVIDER_IDS = ['clip-modal'] as const;
export type ClusteringProviderId =
  (typeof KNOWN_CLUSTERING_PROVIDER_IDS)[number];

/** Input item for clustering — the `id` is echoed back on the response so
 *  the caller can join cluster results to workspace rows without matching
 *  on URL strings (data URLs are unwieldy, CDN URLs rewrite). */
export interface ClusterImage {
  id: string;
  url: string;
}

export interface ClusterOpts {
  /** HDBSCAN `min_cluster_size`. Defaults to 3 on the endpoint. */
  minClusterSize?: number;
  /** HDBSCAN `min_samples`. Defaults to 1 on the endpoint. */
  minSamples?: number;
}

export interface ClusterItem {
  id: string;
  url: string;
  /** 512-d CLIP ViT-B/32 embedding, L2-normalized. */
  embedding: number[];
  /** HDBSCAN cluster id. `-1` means noise (not assigned to any cluster). */
  clusterId: number;
  /** 2D UMAP projection `[x, y]` for layout previews. */
  umap: [number, number];
}

export interface ClusterResult {
  provider: ClusteringProviderId;
  items: ClusterItem[];
  nClusters: number;
  nNoise: number;
  latencyMs?: number;
}

export interface ClusteringProvider {
  id: ClusteringProviderId;
  displayName: string;
  isAvailable(): boolean;
  getAvailabilityIssue(): string | undefined;
  cluster(images: ClusterImage[], opts?: ClusterOpts): Promise<ClusterResult>;
}

export class ClusteringUnavailableError extends Error {
  constructor(providerId: string, hint?: string) {
    super(
      hint
        ? `clustering provider '${providerId}' is unavailable: ${hint}`
        : `clustering provider '${providerId}' is unavailable`
    );
    this.name = 'ClusteringUnavailableError';
  }
}

export class ClusteringError extends Error {
  constructor(
    message: string,
    public readonly providerId: string,
    public readonly cause?: unknown
  ) {
    super(`${providerId}: ${message}`);
    this.name = 'ClusteringError';
  }
}

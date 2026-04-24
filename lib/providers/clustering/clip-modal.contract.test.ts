import { afterEach, describe, expect, it, test, vi } from 'vitest';
import { createClipModalProvider } from './clip-modal';
import { ClusteringUnavailableError } from './types';

const FIXTURES = [
  { id: 'ref-01', url: 'data:image/png;base64,red-sunset' },
  { id: 'ref-02', url: 'data:image/png;base64,orange-dusk' },
  { id: 'ref-03', url: 'data:image/png;base64,green-moss' },
  { id: 'ref-04', url: 'data:image/png;base64,teal-leaf' },
  { id: 'ref-05', url: 'data:image/png;base64,blue-ocean' },
  { id: 'ref-06', url: 'data:image/png;base64,indigo-sky' },
];

describe('clip-modal adapter · contract', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes a Modal response with embeddings, cluster ids, and UMAP coords', async () => {
    const modalItems = FIXTURES.map((fixture, index) => ({
      image_url: fixture.url,
      embedding: Array.from({ length: 512 }, (_, i) => (i + index) / 1000),
      // Two warm + two cool + two odd-one-outs = HDBSCAN finds 2 clusters, 2 noise.
      cluster_id: index < 2 ? 0 : index < 4 ? 1 : -1,
      umap: [index * 0.1, 1 - index * 0.1],
    }));

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: modalItems,
          n_clusters: 2,
          n_noise: 2,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const provider = createClipModalProvider(
      'https://clip.example.com/cluster',
      'clip-token'
    );

    const result = await provider.cluster(FIXTURES);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://clip.example.com/cluster');
    const initTyped = init as RequestInit;
    expect(initTyped.method).toBe('POST');
    expect(
      (initTyped.headers as Record<string, string>).Authorization
    ).toBe('Bearer clip-token');
    expect(JSON.parse(initTyped.body as string)).toEqual({
      image_urls: FIXTURES.map((f) => f.url),
      min_cluster_size: 3,
      min_samples: 1,
    });

    expect(result.provider).toBe('clip-modal');
    expect(result.items).toHaveLength(6);
    expect(result.items[0].id).toBe('ref-01');
    expect(result.items[0].embedding).toHaveLength(512);
    expect(result.items[0].clusterId).toBe(0);
    expect(result.items[0].umap).toEqual([0, 1]);
    expect(result.items[4].clusterId).toBe(-1);
    expect(result.nClusters).toBe(2);
    expect(result.nNoise).toBe(2);
  });

  it('forwards HDBSCAN overrides when passed via ClusterOpts', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ items: [], n_clusters: 0, n_noise: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const provider = createClipModalProvider(
      'https://clip.example.com/cluster',
      'clip-token'
    );
    await provider
      .cluster([{ id: 'a', url: 'https://cdn.example.com/a.png' }], {
        minClusterSize: 5,
        minSamples: 2,
      })
      .catch(() => {
        // count mismatch error is fine here — we only care about the request body
      });

    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body.min_cluster_size).toBe(5);
    expect(body.min_samples).toBe(2);
  });

  it('throws ClusteringUnavailableError when the bearer token is missing', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const provider = createClipModalProvider(
      'https://clip.example.com/cluster',
      undefined
    );
    await expect(provider.cluster(FIXTURES)).rejects.toBeInstanceOf(
      ClusteringUnavailableError
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns an empty response for empty input without calling Modal', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const provider = createClipModalProvider(
      'https://clip.example.com/cluster',
      'clip-token'
    );

    const result = await provider.cluster([]);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      provider: 'clip-modal',
      items: [],
      nClusters: 0,
      nNoise: 0,
    });
  });

  it('marks every item as noise (cluster_id: -1) when input is smaller than min_cluster_size', async () => {
    // Simulates HDBSCAN behavior: fewer points than min_cluster_size → all noise.
    const tinyInput = FIXTURES.slice(0, 2);
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: tinyInput.map((fixture) => ({
            image_url: fixture.url,
            embedding: Array(512).fill(0),
            cluster_id: -1,
            umap: [0, 0],
          })),
          n_clusters: 0,
          n_noise: 2,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const provider = createClipModalProvider(
      'https://clip.example.com/cluster',
      'clip-token'
    );
    const result = await provider.cluster(tinyInput);

    expect(result.items.every((item) => item.clusterId === -1)).toBe(true);
    expect(result.nClusters).toBe(0);
    expect(result.nNoise).toBe(2);
  });
});

// Real integration test — runs only when CLIP_MODAL_URL is set in the env.
// Skipped in CI (secrets aren't available) mirroring the SAM3 pattern.
const CLIP_URL = process.env.CLIP_MODAL_URL;
const CLIP_TOKEN = process.env.CLIP_MODAL_TOKEN;

test.skipIf(!CLIP_URL || !CLIP_TOKEN)(
  'clip-modal adapter · real endpoint (skipped unless CLIP_MODAL_URL is set)',
  async () => {
    const provider = createClipModalProvider(CLIP_URL, CLIP_TOKEN);
    const result = await provider.cluster(FIXTURES);
    expect(result.items).toHaveLength(FIXTURES.length);
    for (const item of result.items) {
      expect(item.embedding).toHaveLength(512);
      expect(item.umap).toHaveLength(2);
    }
  },
  120_000
);

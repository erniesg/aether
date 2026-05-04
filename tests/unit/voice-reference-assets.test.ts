import { describe, expect, it, vi } from 'vitest';
import { cacheVoiceReferenceAssets } from '@/lib/voice/reference-assets';
import type { ReferenceRecord } from '@/lib/providers/reference/types';

function record(overrides: Partial<ReferenceRecord> = {}): ReferenceRecord {
  return {
    id: 'ref_voice_1',
    kind: 'image',
    previewUrl: 'https://images.example/pod.png',
    attribution: {
      source: 'image-search',
      url: 'https://images.example/pod.png',
    },
    capturedAt: '2026-05-04T00:00:00.000Z',
    title: 'Eight Sleep Pod',
    origin: 'search',
    ...overrides,
  };
}

describe('cacheVoiceReferenceAssets', () => {
  it('downloads searched image references and rewrites them to durable asset URLs', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      })
    ) as unknown as typeof fetch;
    const upload = vi.fn(async () => ({
      id: 'asset_doc_1',
      publicUrl: 'https://convex.cdn/assets/pod.png',
      storageId: 'sid_1',
      bytes: 3,
      mime: 'image/png',
    }));

    const result = await cacheVoiceReferenceAssets({
      query: 'Eight Sleep Pod',
      references: [{ url: 'https://images.example/pod.png', score: 0.9 }],
      records: [record()],
      workspaceId: 'local-test',
      fetchImpl,
      upload,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://images.example/pod.png',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'reference',
        mime: 'image/png',
        workspaceId: 'local-test',
        sourceUrl: 'https://images.example/pod.png',
      })
    );
    expect(result.references).toEqual([
      { url: 'https://convex.cdn/assets/pod.png', score: 0.9 },
    ]);
    expect(result.records[0]).toMatchObject({
      previewUrl: 'https://convex.cdn/assets/pod.png',
      fullUrl: 'https://convex.cdn/assets/pod.png',
      assetId: 'asset_doc_1',
      attribution: { url: 'https://images.example/pod.png' },
      tags: ['downloaded'],
    });
  });

  it('keeps the original reference when download or upload fails', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response('not found', { status: 404 })
    ) as unknown as typeof fetch;
    const upload = vi.fn();

    const result = await cacheVoiceReferenceAssets({
      query: 'missing',
      references: [{ url: 'https://images.example/missing.png' }],
      records: [record({ previewUrl: 'https://images.example/missing.png' })],
      fetchImpl,
      upload,
    });

    expect(upload).not.toHaveBeenCalled();
    expect(result.references).toEqual([{ url: 'https://images.example/missing.png' }]);
    expect(result.records[0]?.previewUrl).toBe('https://images.example/missing.png');
    expect(result.warnings[0]).toContain('reference download skipped');
  });

  it('does not re-download references that are already cached assets', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const upload = vi.fn();
    const cached = record({
      previewUrl: 'https://convex.cdn/assets/ref.png',
      assetId: 'asset_doc_existing',
    });

    const result = await cacheVoiceReferenceAssets({
      query: 'cached',
      references: [{ url: 'https://convex.cdn/assets/ref.png' }],
      records: [cached],
      fetchImpl,
      upload,
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(result.records).toEqual([cached]);
  });

  it('preserves product-scoped candidate metadata while caching', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      })
    ) as unknown as typeof fetch;
    const upload = vi.fn(async () => ({
      id: 'asset_doc_1',
      publicUrl: 'https://convex.cdn/assets/pod.png',
      storageId: 'sid_1',
      bytes: 3,
      mime: 'image/png',
    }));

    const result = await cacheVoiceReferenceAssets({
      query: 'Eight Sleep Pod',
      references: [
        {
          url: 'https://images.example/pod.png',
          score: 0.88,
          productId: 'eight-sleep-pod',
          productCanonicalName: 'Eight Sleep Pod',
          query: 'Eight Sleep Pod',
          status: 'candidate',
        },
      ],
      records: [record()],
      fetchImpl,
      upload,
    });

    expect(result.records[0]).toMatchObject({
      productId: 'eight-sleep-pod',
      productCanonicalName: 'Eight Sleep Pod',
      referenceQuery: 'Eight Sleep Pod',
      relevanceScore: 0.88,
      referenceStatus: 'candidate',
    });
  });

  it('keeps generation references on the original remote URL when local Convex is not cloud-reachable', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      })
    ) as unknown as typeof fetch;
    const upload = vi.fn(async () => ({
      id: 'asset_doc_local',
      publicUrl: 'http://127.0.0.1:3210/api/storage/local-ref',
      storageId: 'sid_local',
      bytes: 3,
      mime: 'image/png',
    }));

    const result = await cacheVoiceReferenceAssets({
      query: 'Eight Sleep Pod',
      references: [{ url: 'https://images.example/pod.png', score: 0.9 }],
      records: [record()],
      workspaceId: 'local-test',
      fetchImpl,
      upload,
    });

    expect(result.records[0]).toMatchObject({
      previewUrl: 'http://127.0.0.1:3210/api/storage/local-ref',
      assetId: 'asset_doc_local',
    });
    expect(result.references).toEqual([
      { url: 'https://images.example/pod.png', score: 0.9 },
    ]);
  });
});

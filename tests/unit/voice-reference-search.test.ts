import { describe, expect, it, vi } from 'vitest';
import { searchVoiceReferences } from '@/lib/voice/reference-search';

describe('voice reference search', () => {
  it('uses external image search first and keeps matching library assets as backup', async () => {
    const searchImages = vi.fn(async () => ['https://cdn.example/external.png']);
    const result = await searchVoiceReferences({
      query: 'Pod cooling',
      limit: 2,
      libraryReferences: [
        {
          id: 'ref_saved',
          kind: 'image',
          previewUrl: 'https://cdn.example/saved.png',
          attribution: { source: 'generated', url: 'https://cdn.example/saved.png' },
          capturedAt: '2026-05-04T00:00:00.000Z',
          title: 'Pod cooling hero',
          tags: ['generated'],
          origin: 'generated',
        },
      ],
      searchImages,
    });

    expect(searchImages).toHaveBeenCalled();
    expect(result.references.map((ref) => ref.url)).toEqual([
      'https://cdn.example/external.png',
      'https://cdn.example/saved.png',
    ]);
    expect(result.records[1]?.id).toBe('ref_saved');
  });

  it('still searches the web when the local library already has enough matches', async () => {
    const searchImages = vi.fn(async () => ['https://cdn.example/web-pod.png']);
    const result = await searchVoiceReferences({
      query: 'Eight Sleep Pod',
      limit: 1,
      libraryReferences: [
        {
          id: 'ref_saved',
          kind: 'image',
          previewUrl: 'https://cdn.example/saved.png',
          attribution: { source: 'generated', url: 'https://cdn.example/saved.png' },
          capturedAt: '2026-05-04T00:00:00.000Z',
          title: 'Eight Sleep Pod saved creative',
          tags: ['generated'],
          origin: 'generated',
        },
      ],
      searchImages,
    });

    expect(searchImages).toHaveBeenCalledWith('Eight Sleep Pod', 1);
    expect(result.references.map((ref) => ref.url)).toEqual([
      'https://cdn.example/web-pod.png',
    ]);
  });

  it('uses image search and optional local embedding rerank before returning reference records', async () => {
    const searchImages = vi.fn(async () => [
      'https://cdn.example/b.png',
      'https://cdn.example/a.png',
    ]);
    const rerank = vi.fn(async () => [
      { url: 'https://cdn.example/a.png', score: 0.92 },
      { url: 'https://cdn.example/b.png', score: 0.61 },
    ]);

    const result = await searchVoiceReferences({
      query: 'Eight Sleep Pod 4',
      limit: 2,
      searchImages,
      rerank,
    });

    expect(searchImages).toHaveBeenCalledWith('Eight Sleep Pod 4', 2);
    expect(rerank).toHaveBeenCalledWith({
      query: 'Eight Sleep Pod 4',
      imageUrls: ['https://cdn.example/b.png', 'https://cdn.example/a.png'],
      limit: 2,
    });
    expect(result.references.map((ref) => ref.url)).toEqual([
      'https://cdn.example/a.png',
      'https://cdn.example/b.png',
    ]);
    expect(result.records[0]).toMatchObject({
      kind: 'image',
      previewUrl: 'https://cdn.example/a.png',
      attribution: { source: 'image-search' },
      usageIntent: 'voice reference',
      referenceStatus: 'candidate',
      relevanceScore: 0.92,
    });
  });

  it('scopes library candidates to the resolved product', async () => {
    const searchImages = vi.fn(async () => []);
    const result = await searchVoiceReferences({
      query: 'Eight Sleep Pod',
      limit: 4,
      product: {
        id: 'eight-sleep-pod',
        canonicalName: 'Eight Sleep Pod',
        confidence: 0.96,
      },
      libraryReferences: [
        {
          id: 'ref_pod',
          kind: 'image',
          previewUrl: 'https://cdn.example/pod.png',
          attribution: { source: 'generated', url: 'https://cdn.example/pod.png' },
          capturedAt: '2026-05-04T00:00:00.000Z',
          title: 'Eight Sleep Pod hero',
          productId: 'eight-sleep-pod',
          productCanonicalName: 'Eight Sleep Pod',
          referenceStatus: 'selected',
        },
        {
          id: 'ref_pot',
          kind: 'image',
          previewUrl: 'https://cdn.example/potion.png',
          attribution: { source: 'image-search', url: 'https://cdn.example/potion.png' },
          capturedAt: '2026-05-04T00:00:00.000Z',
          title: 'glowing sleeping pot',
          productId: 'sleeping-pot',
          productCanonicalName: 'Sleeping Pot',
          referenceStatus: 'selected',
        },
      ],
      searchImages,
    });

    expect(result.references.map((ref) => ref.url)).toEqual([
      'https://cdn.example/pod.png',
    ]);
    expect(result.records[0]).toMatchObject({
      id: 'ref_pod',
      productId: 'eight-sleep-pod',
      referenceStatus: 'selected',
    });
  });

  it('tags searched references as product-scoped candidates with scores', async () => {
    const result = await searchVoiceReferences({
      query: 'Eight Sleep Pod',
      limit: 1,
      product: {
        id: 'eight-sleep-pod',
        canonicalName: 'Eight Sleep Pod',
        confidence: 0.96,
      },
      searchImages: async () => ['https://cdn.example/pod-search.png'],
    });

    expect(result.references[0]).toMatchObject({
      url: 'https://cdn.example/pod-search.png',
      productId: 'eight-sleep-pod',
      productCanonicalName: 'Eight Sleep Pod',
      query: 'Eight Sleep Pod',
      status: 'candidate',
      score: expect.any(Number),
    });
    expect(result.records[0]).toMatchObject({
      productId: 'eight-sleep-pod',
      productCanonicalName: 'Eight Sleep Pod',
      referenceQuery: 'Eight Sleep Pod',
      referenceStatus: 'candidate',
      relevanceScore: expect.any(Number),
    });
  });

  it('fails soft when no search adapter returns images', async () => {
    const result = await searchVoiceReferences({
      query: 'missing',
      searchImages: async () => [],
    });

    expect(result.references).toEqual([]);
    expect(result.status).toBe('empty');
  });
});

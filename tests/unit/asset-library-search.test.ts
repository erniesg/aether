import { describe, expect, it } from 'vitest';
import {
  isGeneratedReference,
  rankLibraryReferences,
  referenceOrigin,
} from '@/lib/asset-library/search';
import type { ReferenceRecord } from '@/lib/providers/reference/types';

function ref(overrides: Partial<ReferenceRecord>): ReferenceRecord {
  return {
    id: 'ref',
    kind: 'image',
    previewUrl: 'https://cdn.example/ref.png',
    attribution: { source: 'generic', url: 'https://source.example/ref' },
    capturedAt: '2026-05-04T00:00:00.000Z',
    ...overrides,
  };
}

describe('asset library search', () => {
  it('ranks saved visual assets by title, tags, notes, and intent', () => {
    const records = [
      ref({
        id: 'weak',
        title: 'Generic mattress product',
        tags: ['sleep'],
      }),
      ref({
        id: 'strong',
        title: 'Eight Sleep Pod 4 hero',
        tags: ['temperature', 'pod'],
        notes: 'cooling product detail',
        usageIntent: 'product truth',
      }),
    ];

    const ranked = rankLibraryReferences('pod cooling', records);

    expect(ranked.map((entry) => entry.record.id)).toEqual(['strong']);
    expect(ranked[0]?.score).toBeGreaterThan(0);
  });

  it('recognizes generated assets from explicit origin or attribution', () => {
    expect(isGeneratedReference(ref({ origin: 'generated' }))).toBe(true);
    expect(referenceOrigin(ref({ attribution: { source: 'upload', url: 'x' } }))).toBe(
      'upload'
    );
    expect(
      referenceOrigin(ref({ attribution: { source: 'generated', url: 'x' } }))
    ).toBe('generated');
  });
});


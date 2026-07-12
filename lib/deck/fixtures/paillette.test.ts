import { describe, expect, it } from 'vitest';
import { PAILLETTE_SHARE_DECK } from './paillette';

describe('Paillette share deck fixture', () => {
  it('covers intro, live demos, deep dives, and closing sections', () => {
    const ids = PAILLETTE_SHARE_DECK.slides.map((slide) => slide.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'problem',
        'solution',
        'architecture',
        'product-search',
        'product-search-editorial',
        'text-search-api',
        'image-search-api',
        'api-access',
        'hybrid-retrieval',
        'color-image-search',
        'public-provenance',
        'auth-model',
        'performance',
        'ready-next',
        'closing',
      ])
    );
    expect(PAILLETTE_SHARE_DECK.drawerTabs).toEqual(['Product', 'API', 'Code']);
    expect(PAILLETTE_SHARE_DECK.slides.find((slide) => slide.id === 'product-search-editorial')).toEqual(
      expect.objectContaining({
        layout: 'live-demo',
        visualVariant: 'editorial-evidence',
        presenterLabel: 'Variant · editorial evidence',
      })
    );
    expect(PAILLETTE_SHARE_DECK.slides.find((slide) => slide.id === 'image-search-api')).toEqual(
      expect.objectContaining({
        layout: 'live-demo',
        blocks: expect.arrayContaining([
          expect.objectContaining({ id: 'api-image-search', requestMode: 'image' }),
        ]),
      })
    );
  });

  it('uses allowlisted mocks, auth metadata, code references, and presenter semantics', () => {
    expect(PAILLETTE_SHARE_DECK.liveDemo.endpoints.map((endpoint) => endpoint.id)).toEqual(
      expect.arrayContaining(['product-search', 'text-search', 'image-search', 'list-sources', 'api-keys', 'api-usage'])
    );
    expect(PAILLETTE_SHARE_DECK.liveDemo.endpoints.map((endpoint) => endpoint.authModes).flat()).toEqual(
      expect.arrayContaining(['public', 'signed-in', 'presenter-provided'])
    );
    expect(PAILLETTE_SHARE_DECK.codeReferences.length).toBeGreaterThanOrEqual(4);
    expect(PAILLETTE_SHARE_DECK.codeReferences[0]).toEqual(
      expect.objectContaining({ filePath: expect.any(String), label: expect.any(String), whyItMatters: expect.any(String) })
    );
    expect(PAILLETTE_SHARE_DECK.slides.some((slide) => slide.fragments?.length)).toBe(true);
    expect(PAILLETTE_SHARE_DECK.slides.some((slide) => slide.hotspots?.length)).toBe(true);
    expect(PAILLETTE_SHARE_DECK.slides.every((slide) => slide.speakerNotes)).toBe(true);
    expect(PAILLETTE_SHARE_DECK.slides.find((slide) => slide.id === 'api-access')).toEqual(
      expect.objectContaining({
        layout: 'live-demo',
        blocks: expect.arrayContaining([
          expect.objectContaining({
            id: 'api-usage-call',
            endpointId: 'list-sources',
            endpointIds: ['list-sources', 'api-keys', 'api-usage'],
          }),
        ]),
      })
    );
    expect(JSON.stringify(PAILLETTE_SHARE_DECK)).not.toMatch(/sk-[a-z0-9]|bearer\s+[a-z0-9._-]+/i);
  });
});

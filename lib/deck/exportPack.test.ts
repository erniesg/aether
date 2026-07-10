import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildDeckExportPack } from './exportPack';
import { PAILLETTE_SHARE_DECK } from './fixtures/paillette';

describe('deck export pack', () => {
  it('packages the graph-backed deck, manifests, source notes, and static proof', async () => {
    const result = await buildDeckExportPack({
      deck: PAILLETTE_SHARE_DECK,
      screenshots: [{ slideId: 'problem', filename: 'problem.png', bytes: new Uint8Array([1, 2, 3]) }],
      contactSheet: new Uint8Array([4, 5, 6]),
      now: new Date('2026-07-10T10:00:00Z'),
    });
    expect(result.manifest).toMatchObject({
      artifactKind: 'deck',
      deckId: 'paillette-share-deck',
      slideOrder: expect.arrayContaining(['problem', 'product-search', 'closing']),
      styleTokens: PAILLETTE_SHARE_DECK.styleTokens,
      presenter: expect.objectContaining({ speakerNotes: expect.any(Object) }),
      provenance: expect.any(Array),
    });
    expect(result.manifest.liveDemoAllowlist.every((entry) => !('credential' in entry))).toBe(true);
    expect(result.manifest.staticFallbacks).toEqual(
      expect.arrayContaining([expect.objectContaining({ blockId: 'api-product-search', kind: 'mock-response' })])
    );
    const archive = await JSZip.loadAsync(result.zip);
    expect(Object.keys(archive.files)).toEqual(
      expect.arrayContaining([
        'deck.json',
        'manifest.json',
        'source/outline.json',
        'source/storyboard-notes.txt',
        'source/handoff-notes.txt',
        'source/validation-commands.txt',
        'proof/contact-sheet.png',
        'proof/problem.png',
      ])
    );
  });
});

import { describe, expect, it } from 'vitest';
import {
  DEMO_CREATOR_CONTEXT,
  buildCreatorGenerationPrompt,
  countCreatorInputs,
  describeWorkspaceMode,
  mergeReferenceUrls,
  summarizeInputSet,
  visualReferenceUrls,
} from '@/lib/context/model';
import type { ReferenceRecord } from '@/lib/providers/reference/types';

const REFS: ReferenceRecord[] = [
  {
    id: 'ref_1',
    kind: 'image',
    previewUrl: 'data:image/png;base64,one',
    attribution: { source: 'pinterest', author: 'Solstice Studio', url: 'https://pin.test/1' },
    capturedAt: '2026-04-24T12:00:00.000Z',
  },
  {
    id: 'ref_2',
    kind: 'embed',
    previewUrl: 'https://plain.example.com/note',
    attribution: { source: 'generic', url: 'https://plain.example.com/note' },
    capturedAt: '2026-04-24T12:00:00.000Z',
  },
];

describe('creator context model', () => {
  it('separates stable context, campaign context, and run-time input assembly', () => {
    expect(DEMO_CREATOR_CONTEXT.brand.knowledgeSources).toHaveLength(4);
    expect(DEMO_CREATOR_CONTEXT.offer.claims).toHaveLength(3);
    expect(DEMO_CREATOR_CONTEXT.campaign.channels).toHaveLength(3);
    expect(DEMO_CREATOR_CONTEXT.inputSet.referenceCount).toBe(2);
    expect(DEMO_CREATOR_CONTEXT.inputSet.signalIds).toHaveLength(2);
    expect(summarizeInputSet(DEMO_CREATOR_CONTEXT)).toContain('brand');
    expect(summarizeInputSet(DEMO_CREATOR_CONTEXT)).toContain('campaign');
    expect(summarizeInputSet(DEMO_CREATOR_CONTEXT)).toContain('2 refs');
  });

  it('supports both creator-owned ventures and multi-brand studios', () => {
    expect(describeWorkspaceMode('venture')).toBe('creator-owned venture');
    expect(describeWorkspaceMode('studio')).toBe('multi-brand studio');
  });

  it('counts the active input set from stable context plus pinned references', () => {
    expect(countCreatorInputs(DEMO_CREATOR_CONTEXT, REFS)).toBe(7);
  });

  it('keeps only visual references for image generation', () => {
    expect(visualReferenceUrls(REFS)).toEqual(['data:image/png;base64,one']);
    expect(
      mergeReferenceUrls(
        ['data:image/png;base64,one'],
        ['data:image/png;base64,one', 'data:image/png;base64,two']
      )
    ).toEqual(['data:image/png;base64,one', 'data:image/png;base64,two']);
  });

  it('builds a generation prompt with creator context and reference attribution', () => {
    const prompt = buildCreatorGenerationPrompt(
      DEMO_CREATOR_CONTEXT,
      'make the key visual',
      REFS
    );

    expect(prompt).toContain('Creator request: make the key visual');
    expect(prompt).toContain('Brand: Solstice Skin');
    expect(prompt).toContain('Offer: Spring Reset Duo');
    expect(prompt).toContain('Campaign: Slow Morning Drop');
    expect(prompt).toContain('Pinned references: 2 sources; pinterest by Solstice Studio');
  });
});

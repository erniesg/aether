import { describe, expect, it, vi } from 'vitest';
import {
  normalizeKnownProductText,
  productCatalogEntryFromResolution,
  resolveProductMention,
} from '@/lib/product/catalog';

describe('product catalog resolution', () => {
  it('matches known product aliases from noisy voice transcripts', async () => {
    const result = await resolveProductMention({
      text: 'Generate a campaign for the 8 sleeping pop in various languages.',
      allowResearch: false,
    });

    expect(result).toMatchObject({
      canonicalName: 'Eight Sleep Pod',
      source: 'catalog',
      matchKind: 'alias',
    });
  });

  it('matches likely voice slips against the saved product catalog before research', async () => {
    for (const text of [
      'generally, a campaign for the sleeping pot in different languages and platforms',
      'Generally a campaign for the aid sleeping part in different languages and formats.',
      'Create socials for the eight sleeping part.',
      'Make a key visual for sleeping part.',
    ]) {
      const result = await resolveProductMention({
        text,
        allowResearch: false,
      });

      expect(result).toMatchObject({
        canonicalName: 'Eight Sleep Pod',
        source: 'catalog',
        matchKind: 'alias',
      });
    }
  });

  it('normalizes local Whisper product slips before creative generation', () => {
    expect(
      normalizeKnownProductText(
        'Generate a campaign for AITS League pod in various languages.'
      )
    ).toBe('Generate a campaign for Eight Sleep Pod in various languages.');
    expect(
      normalizeKnownProductText(
        'Generate a campaign for the egg sleeping pop in different dimensions and languages.'
      )
    ).toBe(
      'Generate a campaign for Eight Sleep Pod in different dimensions and languages.'
    );
    expect(
      normalizeKnownProductText(
        'Generally a campaign for the aid sleeping part in different languages and formats.'
      )
    ).toBe(
      'Generally a campaign for Eight Sleep Pod in different languages and formats.'
    );
  });

  it('uses product research when no catalog alias matches', async () => {
    const research = vi.fn(async () => ({
      brand: 'Terra',
      product: 'Coffee Sensor',
      description: 'A connected coffee freshness sensor.',
      imageUrls: ['https://cdn.example/terra.png'],
      officialUrl: 'https://terra.example/sensor',
      source: 'knowledge-graph' as const,
    }));

    const result = await resolveProductMention({
      text: 'generate socials for terra coffee sensor',
      researchQuery: 'terra coffee sensor',
      research,
    });

    expect(research).toHaveBeenCalledWith('terra coffee sensor');
    expect(result).toMatchObject({
      canonicalName: 'Terra Coffee Sensor',
      source: 'research',
      confidence: 0.88,
      imageUrls: ['https://cdn.example/terra.png'],
    });
  });

  it('rejects low-confidence organic research that does not match the query', async () => {
    const research = vi.fn(async () => ({
      brand: 'the egg',
      product: 'How to Speak Egg Language: Learn Gibberish and Backslang',
      description: 'A tutorial page, not a product.',
      imageUrls: [],
      source: 'organic' as const,
    }));

    const result = await resolveProductMention({
      text: 'egg sleeping pop',
      catalog: [],
      research,
    });

    expect(result).toBeNull();
  });

  it('can convert a product resolution into a reusable catalog entry', async () => {
    const result = await resolveProductMention({
      text: '8 sleeping pop',
      allowResearch: false,
    });

    expect(result).not.toBeNull();
    const entry = productCatalogEntryFromResolution(result!, [
      'Generate a campaign for the 8 sleeping pop',
    ]);
    expect(entry).toMatchObject({
      id: 'eight-sleep-pod',
      canonicalName: 'Eight Sleep Pod',
      imageSearchQuery: 'Eight Sleep Pod',
      source: 'catalog',
    });
    expect(entry.aliases).toEqual(
      expect.arrayContaining([
        '8 sleeping pop',
        'Generate a campaign for the 8 sleeping pop',
      ])
    );
  });
});

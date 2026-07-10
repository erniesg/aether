import { describe, expect, it } from 'vitest';
import { PAILLETTE_SHARE_DECK } from '@/lib/deck/fixtures/paillette';

describe('Paillette deck fixture content', () => {
  it('contains only verified public product, API, repository, and artwork references', () => {
    const fixture = JSON.stringify(PAILLETTE_SHARE_DECK);

    expect(fixture).not.toMatch(/\.example|placeholder|linen chair|linen-chair|brass-lamp|blue-vase/i);
    expect(PAILLETTE_SHARE_DECK.liveDemo.baseUrl).toBe('https://paillette-stg.berlayar.ai');
    expect(fixture).toContain('https://github.com/erniesg/paillette');
    expect(fixture).toContain('/api/public-search/ngs/text');
    expect(fixture).toContain('Zhong Zheng Ren (中正人)');
    expect(fixture).toContain('2019-00754');
  });

  it('uses Paillette colors inside the selected Neo-Grid structure', () => {
    expect(PAILLETTE_SHARE_DECK.styleTokens).toEqual({
      background: '#0B0B0E',
      foreground: '#FFFFFF',
      accent: '#D946EF',
      muted: '#8B8D96',
      headingFont: 'Space Grotesk, Helvetica Neue, Helvetica, Arial, sans-serif',
      bodyFont: 'Space Grotesk, Helvetica Neue, Helvetica, Arial, sans-serif',
    });
  });
});

import { describe, expect, it } from 'vitest';
import { parseBrandProduct } from './brand-parser';
import type { UrlIngestion } from './url';

function fixture(overrides: Partial<UrlIngestion> = {}): UrlIngestion {
  return {
    url: 'https://example.com/',
    finalUrl: 'https://example.com/',
    title: '',
    description: '',
    images: [],
    products: [],
    bodyExcerpt: '',
    fetchedAt: '2026-04-27T00:00:00Z',
    rawHtmlBytes: 0,
    ...overrides,
  };
}

describe('parseBrandProduct', () => {
  it('parses pipe-separated og:title (high confidence)', () => {
    const got = parseBrandProduct(
      fixture({
        url: 'https://www.eightsleep.com/',
        finalUrl: 'https://www.eightsleep.com/',
        title: 'Eight Sleep | Pod 4 Ultra',
      })
    );
    expect(got.brand).toBe('Eight Sleep');
    expect(got.product).toBe('Pod 4 Ultra');
    expect(got.confidence).toBe('high');
    expect(got.source).toBe('og-title-separator');
  });

  it('parses dash-separated og:title', () => {
    const got = parseBrandProduct(
      fixture({ title: 'Apple - MacBook Pro 14-inch' })
    );
    expect(got.brand).toBe('Apple');
    expect(got.product).toBe('MacBook Pro 14-inch');
    expect(got.confidence).toBe('high');
  });

  it('parses em-dash separator', () => {
    const got = parseBrandProduct(
      fixture({ title: 'IKEA — KALLAX shelf unit' })
    );
    expect(got.brand).toBe('IKEA');
    expect(got.product).toBe('KALLAX shelf unit');
    expect(got.confidence).toBe('high');
  });

  it('parses colon separator', () => {
    const got = parseBrandProduct(
      fixture({ title: 'Tesla: Model Y Performance' })
    );
    expect(got.brand).toBe('Tesla');
    expect(got.product).toBe('Model Y Performance');
    expect(got.confidence).toBe('high');
  });

  it('falls back to hostname + description when no separator', () => {
    const got = parseBrandProduct(
      fixture({
        url: 'https://www.eightsleep.com/',
        finalUrl: 'https://www.eightsleep.com/',
        title: 'Sleep is personal',
        description: 'The Pod 4 Ultra brings cooling to your bed.',
      })
    );
    // URL hostnames are lowercased by the parser; we capitalise the first
    // letter and let the LLM disambiguate ("Eightsleep" → "Eight Sleep").
    expect(got.brand).toBe('Eightsleep');
    expect(got.product).toBe('The Pod 4 Ultra brings cooling to your bed.');
    expect(got.confidence).toBe('medium');
    expect(got.source).toBe('hostname-and-description');
  });

  it('strips www. and TLD from hostname', () => {
    const got = parseBrandProduct(
      fixture({
        url: 'https://www.example.com/',
        finalUrl: 'https://www.example.com/',
        title: 'Hello',
        description: 'World',
      })
    );
    expect(got.brand).toBe('Example');
  });

  it('reports low confidence when only fallback values are present', () => {
    const got = parseBrandProduct(
      fixture({ url: 'https://x', finalUrl: 'https://x', title: '', description: '' })
    );
    expect(got.confidence).toBe('low');
    expect(got.source).toBe('defaults');
  });
});

import { describe, expect, it } from 'vitest';
import { localFallback, parseShapeToolInput } from './shape';
import type { OfferRawExtract } from './types';

const baseExtract: OfferRawExtract = {
  name: 'Spring Reset Duo',
  tagline: 'Barrier repair plus golden-hour glow.',
  claims: [
    'Ceramide cleanse',
    'Niacinamide glow',
    'Fragrance-free',
    'Ceramide cleanse',
    'Made in small batches',
  ],
  priceCandidates: [
    { label: 'Solo', price: '$29', period: 'mo' },
    { label: 'Team', price: '$99', period: 'month' },
  ],
  launchWindow: { startAt: '2026-04-30', endAt: '2026-05-31' },
  proofCandidates: [
    'Changed my morning routine.',
    '4.8★ across 3,214 reviews',
    'Changed my morning routine.',
  ],
  heroImageCandidates: [
    { url: 'https://cdn.example.com/duo.jpg', alt: 'amber duo' },
    { url: 'https://cdn.example.com/packshot.jpg' },
  ],
  contextLines: ['title: Spring Reset Duo'],
};

describe('offer · shape localFallback', () => {
  it('dedupes claims, keeps up to six', () => {
    const snap = localFallback(baseExtract, { kind: 'url', url: 'https://solsticeskin.com' });
    expect(snap.claims).toEqual([
      'Ceramide cleanse',
      'Niacinamide glow',
      'Fragrance-free',
      'Made in small batches',
    ]);
  });

  it('carries name, tagline, priceTiers, launchWindow, proof, and heroImages through', () => {
    const snap = localFallback(baseExtract, { kind: 'url' });
    expect(snap.name).toBe('Spring Reset Duo');
    expect(snap.tagline).toMatch(/golden-hour/);
    expect(snap.priceTiers).toEqual([
      { label: 'Solo', price: '$29', period: 'mo' },
      { label: 'Team', price: '$99', period: 'month' },
    ]);
    expect(snap.launchWindow).toEqual({ startAt: '2026-04-30', endAt: '2026-05-31' });
    expect(snap.proof).toEqual([
      'Changed my morning routine.',
      '4.8★ across 3,214 reviews',
    ]);
    expect(snap.heroImages.map((h) => h.url)).toEqual([
      'https://cdn.example.com/duo.jpg',
      'https://cdn.example.com/packshot.jpg',
    ]);
  });

  it('produces a high-confidence snapshot when name + claims + hero all landed', () => {
    const snap = localFallback(baseExtract, { kind: 'url' });
    expect(snap.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('produces a review-worthy snapshot when the scrape is thin', () => {
    const thin: OfferRawExtract = {
      claims: [],
      priceCandidates: [],
      proofCandidates: [],
      heroImageCandidates: [],
      contextLines: [],
    };
    const snap = localFallback(thin, { kind: 'files' });
    expect(snap.confidence).toBeLessThan(0.5);
    expect(snap.name).toBe('Untitled offer');
  });
});

describe('offer · parseShapeToolInput', () => {
  it('accepts a well-formed tool call payload', () => {
    const snap = parseShapeToolInput(
      {
        name: 'Spring Reset Duo',
        tagline: 'Barrier repair plus golden-hour glow.',
        claims: ['Ceramide cleanse', 'Niacinamide glow'],
        priceTiers: [{ label: 'Solo', price: '$29', period: 'mo' }],
        launchWindow: { startAt: '2026-04-30' },
        proof: ['Changed my morning routine.'],
        heroImages: [{ url: 'https://cdn.example.com/duo.jpg', alt: 'amber duo' }],
        confidence: 0.72,
      },
      { kind: 'url', url: 'https://solsticeskin.com' }
    );
    expect(snap.name).toBe('Spring Reset Duo');
    expect(snap.tagline).toMatch(/golden-hour/);
    expect(snap.claims).toEqual(['Ceramide cleanse', 'Niacinamide glow']);
    expect(snap.priceTiers).toEqual([{ label: 'Solo', price: '$29', period: 'mo' }]);
    expect(snap.launchWindow).toEqual({ startAt: '2026-04-30' });
    expect(snap.proof).toEqual(['Changed my morning routine.']);
    expect(snap.heroImages).toEqual([{ url: 'https://cdn.example.com/duo.jpg', alt: 'amber duo' }]);
    expect(snap.confidence).toBe(0.72);
    expect(snap.source).toEqual({ kind: 'url', url: 'https://solsticeskin.com' });
  });

  it('clamps confidence into 0..1', () => {
    const snap = parseShapeToolInput(
      { name: 'Offer', claims: [], heroImages: [], confidence: 1.7 },
      { kind: 'files' }
    );
    expect(snap.confidence).toBe(1);
  });

  it('drops malformed priceTiers / heroImages entries', () => {
    const snap = parseShapeToolInput(
      {
        name: 'Offer',
        claims: [],
        priceTiers: [{ label: '', price: '$29' }, { label: 'Solo', price: '$29' }, null],
        heroImages: [{ url: '' }, { url: 'https://cdn.example.com/x.jpg' }, 42],
        confidence: 0.4,
      },
      { kind: 'files' }
    );
    expect(snap.priceTiers).toEqual([{ label: 'Solo', price: '$29' }]);
    expect(snap.heroImages).toEqual([{ url: 'https://cdn.example.com/x.jpg' }]);
  });
});

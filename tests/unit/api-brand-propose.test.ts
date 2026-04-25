/**
 * Contract tests for the `/api/brand/propose` route handler.
 *
 * Mocks `proposeBrandFollowups` at the module boundary so the route's
 * request-parsing + error-handling logic is tested in isolation.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BrandSnapshot } from '@/lib/brand/types';
import type { BrandFollowups } from '@/lib/brand/propose';

const SNAPSHOT: BrandSnapshot = {
  palette: [
    { hex: '#0F1013', role: 'primary' },
    { hex: '#E8E4D6', role: 'bg' },
    { hex: '#C48B5E', role: 'accent' },
  ],
  typography: [
    { family: 'Canela Deck', role: 'display' },
    { family: 'Mono 400', role: 'mono' },
  ],
  voice: {
    samples: ['Slow, certain skincare.', 'Golden hour in a bottle.'],
    tone: ['editorial', 'quiet luxury'],
  },
  logos: [{ url: 'https://solsticeskin.com/logo.svg', background: 'light' }],
  productImages: [{ url: 'https://solsticeskin.com/spring-duo.jpg', alt: 'Spring Reset Duo' }],
  confidence: 0.82,
  source: { kind: 'url', url: 'https://solsticeskin.com' },
};

// ---------------------------------------------------------------------------
// Mock proposeBrandFollowups at the module boundary
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  proposeBrandFollowups: vi.fn(),
}));

vi.mock('@/lib/brand/propose', () => ({
  proposeBrandFollowups: mocks.proposeBrandFollowups,
}));

// ---------------------------------------------------------------------------
// Test suite: /api/brand/propose route
// ---------------------------------------------------------------------------

describe('/api/brand/propose', () => {
  afterEach(() => {
    mocks.proposeBrandFollowups.mockReset();
  });

  const FOLLOWUPS: BrandFollowups = {
    offers: [
      {
        id: 'offer-1',
        name: 'Spring Reset Duo',
        summary: 'barrier repair + glow',
        claims: ['ceramide', 'niacinamide'],
        heroAsset: 'amber bottle pair',
      },
    ],
    campaigns: [
      {
        id: 'campaign-1',
        name: 'Slow Morning Drop',
        goal: 'Launch spring line',
        audience: 'skincare shoppers',
        channels: ['IG post', 'story'],
        cta: 'shop now',
      },
    ],
    coverage: { ok: true, notes: [] },
  };

  it('returns 200 with assembled BrandFollowups for a valid snapshot', async () => {
    mocks.proposeBrandFollowups.mockResolvedValueOnce(FOLLOWUPS);

    const { POST } = await import('@/app/api/brand/propose/route');
    const res = await POST(
      new Request('http://localhost/api/brand/propose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshot: SNAPSHOT }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.offers).toBeInstanceOf(Array);
    expect(json.campaigns).toBeInstanceOf(Array);
    expect(typeof json.coverage.ok).toBe('boolean');
    expect(mocks.proposeBrandFollowups).toHaveBeenCalledWith({ snapshot: SNAPSHOT });
  });

  it('returns 400 when snapshot is missing', async () => {
    const { POST } = await import('@/app/api/brand/propose/route');
    const res = await POST(
      new Request('http://localhost/api/brand/propose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toMatch(/snapshot/i);
  });

  it('returns 400 when proposer throws', async () => {
    mocks.proposeBrandFollowups.mockRejectedValueOnce(new Error('Anthropic API error'));

    const { POST } = await import('@/app/api/brand/propose/route');
    const res = await POST(
      new Request('http://localhost/api/brand/propose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshot: SNAPSHOT }),
      })
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.code).toBe('propose_failed');
  });
});

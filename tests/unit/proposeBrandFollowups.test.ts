/**
 * Contract tests for the `proposeBrandFollowups` orchestrator.
 *
 * Red/green TDD: these tests drive the shape of the orchestrator and three workers.
 *
 * Strategy: inject a fake Anthropic client via the `client` option — no SDK
 * module mock needed. This keeps the real implementation under test while
 * fully controlling the model responses.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrandSnapshot } from '@/lib/brand/types';
import type { BrandFollowups } from '@/lib/brand/propose';

// ---------------------------------------------------------------------------
// Shared snapshot fixture
// ---------------------------------------------------------------------------

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
// Helpers: build minimal tool-use responses the proposer workers expect
// ---------------------------------------------------------------------------

function makeOfferResponse(offer: object) {
  return {
    content: [{ type: 'tool_use', name: 'propose_offers', input: { offers: [offer] } }],
    stop_reason: 'tool_use',
  };
}

function makeCampaignResponse(campaign: object) {
  return {
    content: [{ type: 'tool_use', name: 'propose_campaigns', input: { campaigns: [campaign] } }],
    stop_reason: 'tool_use',
  };
}

function makeCoverageResponse(ok: boolean, notes: string[]) {
  return {
    content: [{ type: 'tool_use', name: 'coverage_review', input: { ok, notes } }],
    stop_reason: 'tool_use',
  };
}

const MOCK_OFFER = {
  id: 'offer-spring-reset-01',
  name: 'Spring Reset Duo',
  summary: 'Barrier repair and golden-hour glow.',
  claims: ['ceramide cleanse', 'niacinamide glow', 'fragrance-free'],
  heroAsset: 'amber bottle pair on marble surface',
};

const MOCK_CAMPAIGN = {
  id: 'campaign-slow-morning-01',
  name: 'Slow Morning Drop',
  goal: 'Launch spring skincare line with golden-hour mood.',
  audience: 'skin-care-first shoppers on Instagram and TikTok',
  channels: ['IG post', 'story', 'reel cover'],
  cta: 'shop the drop',
};

// ---------------------------------------------------------------------------
// Test suite: proposeBrandFollowups orchestrator
// ---------------------------------------------------------------------------

describe('proposeBrandFollowups', () => {
  let mockCreate: ReturnType<typeof vi.fn>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fakeClient: any;

  beforeEach(() => {
    mockCreate = vi.fn();
    fakeClient = { messages: { create: mockCreate } };
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  afterEach(() => {
    mockCreate.mockReset();
  });

  it('issues exactly 3 model calls', async () => {
    mockCreate
      .mockResolvedValueOnce(makeOfferResponse(MOCK_OFFER))
      .mockResolvedValueOnce(makeCampaignResponse(MOCK_CAMPAIGN))
      .mockResolvedValueOnce(makeCoverageResponse(true, []));

    const { proposeBrandFollowups } = await import('@/lib/brand/propose');
    await proposeBrandFollowups({ snapshot: SNAPSHOT, client: fakeClient });

    expect(mockCreate).toHaveBeenCalledTimes(3);
  });

  it('uses distinct system prompts for each of the three workers', async () => {
    mockCreate
      .mockResolvedValueOnce(makeOfferResponse(MOCK_OFFER))
      .mockResolvedValueOnce(makeCampaignResponse(MOCK_CAMPAIGN))
      .mockResolvedValueOnce(makeCoverageResponse(true, []));

    const { proposeBrandFollowups } = await import('@/lib/brand/propose');
    await proposeBrandFollowups({ snapshot: SNAPSHOT, client: fakeClient });

    const calls = mockCreate.mock.calls as Array<[{ system: Array<{ text: string }> | string }]>;
    const systemTexts = calls.map(([args]) => {
      const sys = args.system;
      if (Array.isArray(sys)) return sys.map((b) => b.text).join(' ');
      return sys ?? '';
    });

    // All three must be non-empty strings
    for (const text of systemTexts) {
      expect(typeof text).toBe('string');
      expect(text.length).toBeGreaterThan(20);
    }

    // All three must be distinct
    const unique = new Set(systemTexts);
    expect(unique.size).toBe(3);
  });

  it('returns the assembled BrandFollowups shape', async () => {
    mockCreate
      .mockResolvedValueOnce(makeOfferResponse(MOCK_OFFER))
      .mockResolvedValueOnce(makeCampaignResponse(MOCK_CAMPAIGN))
      .mockResolvedValueOnce(makeCoverageResponse(true, ['snapshot is rich']));

    const { proposeBrandFollowups } = await import('@/lib/brand/propose');
    const result: BrandFollowups = await proposeBrandFollowups({ snapshot: SNAPSHOT, client: fakeClient });

    // offers
    expect(result.offers).toBeInstanceOf(Array);
    expect(result.offers.length).toBeGreaterThan(0);
    expect(result.offers[0]).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      summary: expect.any(String),
      claims: expect.any(Array),
      heroAsset: expect.any(String),
    });

    // campaigns
    expect(result.campaigns).toBeInstanceOf(Array);
    expect(result.campaigns.length).toBeGreaterThan(0);
    expect(result.campaigns[0]).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      goal: expect.any(String),
      audience: expect.any(String),
      channels: expect.any(Array),
      cta: expect.any(String),
    });

    // coverage
    expect(typeof result.coverage.ok).toBe('boolean');
    expect(result.coverage.notes).toBeInstanceOf(Array);
  });

  it('all three calls happen concurrently (Promise.all fan-out)', async () => {
    let offerResolved = false;
    let campaignResolved = false;
    let coverageResolved = false;
    let allStartedBeforeAnyResolved = false;

    let callCount = 0;
    mockCreate.mockImplementation(() => {
      callCount++;
      const thisCall = callCount;
      if (
        thisCall === 3 &&
        !offerResolved &&
        !campaignResolved &&
        !coverageResolved
      ) {
        allStartedBeforeAnyResolved = true;
      }
      return new Promise((resolve) => {
        setTimeout(() => {
          if (thisCall === 1) {
            offerResolved = true;
            resolve(makeOfferResponse(MOCK_OFFER));
          } else if (thisCall === 2) {
            campaignResolved = true;
            resolve(makeCampaignResponse(MOCK_CAMPAIGN));
          } else {
            coverageResolved = true;
            resolve(makeCoverageResponse(true, []));
          }
        }, 10);
      });
    });

    const { proposeBrandFollowups } = await import('@/lib/brand/propose');
    await proposeBrandFollowups({ snapshot: SNAPSHOT, client: fakeClient });

    expect(mockCreate).toHaveBeenCalledTimes(3);
    expect(allStartedBeforeAnyResolved).toBe(true);
  });

  it('fails soft: if offerProposer errors, campaigns + coverage still come back', async () => {
    mockCreate
      .mockRejectedValueOnce(new Error('offerProposer network error'))
      .mockResolvedValueOnce(makeCampaignResponse(MOCK_CAMPAIGN))
      .mockResolvedValueOnce(makeCoverageResponse(false, ['offer proposer failed']));

    const { proposeBrandFollowups } = await import('@/lib/brand/propose');
    const result = await proposeBrandFollowups({ snapshot: SNAPSHOT, client: fakeClient });

    expect(result.offers).toBeInstanceOf(Array);
    expect(result.offers.length).toBe(0);
    expect(result.campaigns.length).toBeGreaterThan(0);
    expect(typeof result.coverage.ok).toBe('boolean');
  });

  it('fails soft: if coverageReviewer errors, offers + campaigns still come back', async () => {
    mockCreate
      .mockResolvedValueOnce(makeOfferResponse(MOCK_OFFER))
      .mockResolvedValueOnce(makeCampaignResponse(MOCK_CAMPAIGN))
      .mockRejectedValueOnce(new Error('coverageReviewer timeout'));

    const { proposeBrandFollowups } = await import('@/lib/brand/propose');
    const result = await proposeBrandFollowups({ snapshot: SNAPSHOT, client: fakeClient });

    expect(result.offers.length).toBeGreaterThan(0);
    expect(result.campaigns.length).toBeGreaterThan(0);
    expect(result.coverage.ok).toBe(false);
    expect(result.coverage.notes.length).toBeGreaterThan(0);
  });

  it('uses the claude-opus-4-7 model for all three calls', async () => {
    mockCreate
      .mockResolvedValueOnce(makeOfferResponse(MOCK_OFFER))
      .mockResolvedValueOnce(makeCampaignResponse(MOCK_CAMPAIGN))
      .mockResolvedValueOnce(makeCoverageResponse(true, []));

    const { proposeBrandFollowups } = await import('@/lib/brand/propose');
    await proposeBrandFollowups({ snapshot: SNAPSHOT, client: fakeClient });

    const calls = mockCreate.mock.calls as Array<[{ model: string }]>;
    for (const [args] of calls) {
      expect(args.model).toBe('claude-opus-4-7');
    }
  });

  it('applies cache_control on system prompts', async () => {
    mockCreate
      .mockResolvedValueOnce(makeOfferResponse(MOCK_OFFER))
      .mockResolvedValueOnce(makeCampaignResponse(MOCK_CAMPAIGN))
      .mockResolvedValueOnce(makeCoverageResponse(true, []));

    const { proposeBrandFollowups } = await import('@/lib/brand/propose');
    await proposeBrandFollowups({ snapshot: SNAPSHOT, client: fakeClient });

    const calls = mockCreate.mock.calls as Array<[{ system: Array<{ cache_control?: { type: string } }> }]>;
    for (const [args] of calls) {
      const sys = args.system;
      expect(Array.isArray(sys)).toBe(true);
      const lastBlock = sys[sys.length - 1];
      expect(lastBlock.cache_control).toEqual({ type: 'ephemeral' });
    }
  });
});

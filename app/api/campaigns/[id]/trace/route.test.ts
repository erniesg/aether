/**
 * Tests for GET /api/campaigns/[id]/trace
 *
 * Mocks the Convex HTTP client so all cases run without a live Convex
 * deployment. Covers:
 *  - happy path: full populated trace
 *  - 404: campaign not found
 *  - missing heroAsset: heroAssetId not resolvable
 *  - missing ledger rows: clientRunId not in capabilityRun
 *  - invalid id format (empty, whitespace)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const CAMPAIGN_ID = 'ns702yzw1w92bqf7an8a0xaj9s85k0bp';
const VARIATION_ID = 'var1abc';
const ASSET_ID = 'asset123';
const CLIENT_RUN_ID_1 = 'run-uuid-001';
const CLIENT_RUN_ID_2 = 'run-uuid-002';
const WS_ID = 'ws_test_123';

const MOCK_CAMPAIGN = {
  id: CAMPAIGN_ID,
  workspaceId: WS_ID,
  triggerKind: 'url',
  triggerPayload: 'https://eightsleep.com',
  variationCount: 2,
  notifyMode: 'notify',
  status: 'completed',
  startedAt: 1714000000000,
  finishedAt: 1714000120000,
};

// Stub for masksOneShot.prompted (static list would be too long)
const ONE_SHOT_PROMPTS_STUB = ['face', 'product', 'brand logo'];

const MOCK_VARIATION = {
  id: VARIATION_ID,
  campaignId: CAMPAIGN_ID,
  workspaceId: WS_ID,
  index: 1,
  status: 'ready',
  heroImageUrl: 'https://cdn.convex.cloud/hero.png',
  heroAssetId: ASSET_ID,
  caption: 'Unlock your best sleep',
  captionsByLocale: {
    'en-SG': 'Unlock your best sleep',
    'zh-Hans-SG': '解锁最佳睡眠',
  },
  hashtags: ['#sleep', '#eightsleep'],
  moodNote: 'warm dawn — soft golden palette',
  schedulePlatform: 'instagram',
  scheduleWhenLocal: '2026-04-27T20:00:00+08:00',
  agentRunIds: [CLIENT_RUN_ID_1, CLIENT_RUN_ID_2],
  formatCrops: [
    {
      formatId: '1x1',
      aspectRatio: '1:1',
      w: 1024,
      h: 1024,
      crop: { topLeft: { x: 0, y: 0 }, bottomRight: { x: 1, y: 1 } },
      fit: 'fitted',
    },
  ],
  masksOneShot: {
    matched: ['face', 'product'],
    prompted: ONE_SHOT_PROMPTS_STUB,
    masks: [
      { label: 'face', bbox: [0.1, 0.1, 0.4, 0.4], score: 0.95 },
      { label: 'product', bbox: [0.5, 0.5, 0.9, 0.9], score: 0.88 },
    ],
  },
  masksVisionGuided: {
    matched: ['product'],
    prompted: ['Eight Sleep Pod 4 Ultra mattress cover'],
    masks: [{ label: 'product', bbox: [0.5, 0.5, 0.9, 0.9], score: 0.92 }],
  },
  startedAt: 1714000000000,
  finishedAt: 1714000060000,
};

const MOCK_ASSET = {
  id: ASSET_ID,
  storageId: 'store_xyz',
  publicUrl: 'https://cdn.convex.cloud/hero.png',
  kind: 'hero',
  mime: 'image/png',
  sourceUrl: 'auto-mode hero render',
  width: 1024,
  height: 1024,
  createdAt: 1714000005000,
};

const MOCK_RUN_1 = {
  id: CLIENT_RUN_ID_1,
  tool: 'search_signals',
  provider: 'exa',
  model: 'exa-search',
  prompt: 'eightsleep Pod sleep quality Singapore',
  latencyMs: 320,
  status: 'ok',
  startedAt: 1714000001000,
  finishedAt: 1714000001320,
};

const MOCK_RUN_2 = {
  id: CLIENT_RUN_ID_2,
  tool: 'generate_image',
  provider: 'openai',
  model: 'gpt-image-1',
  prompt: 'cinematic hero render...',
  latencyMs: 8500,
  status: 'ok',
  startedAt: 1714000002000,
  finishedAt: 1714000010500,
};

const MOCK_SCHEDULED_POST = {
  id: 'post_abc',
  platform: 'instagram',
  scheduledAt: '2026-04-27T20:00:00+08:00',
  mediaUrls: ['https://cdn.convex.cloud/hero.png'],
  caption: 'Unlock your best sleep',
  hashtags: ['#sleep', '#eightsleep'],
  status: 'scheduled',
  provider: 'preview',
  externalId: undefined,
};

// ─── Mock setup ───────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  getCampaignWithVariations: vi.fn(),
  getCapabilityRunByClientId: vi.fn(),
  getAsset: vi.fn(),
  listScheduledPosts: vi.fn(),
}));

vi.mock('@/lib/convex/trace-helpers', () => ({
  getCampaignWithVariations: mocks.getCampaignWithVariations,
  getCapabilityRunByClientId: mocks.getCapabilityRunByClientId,
  getAsset: mocks.getAsset,
  listScheduledPosts: mocks.listScheduledPosts,
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeGetRequest(campaignId: string) {
  return new Request(
    `http://localhost/api/campaigns/${campaignId}/trace`,
    { method: 'GET' }
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/campaigns/[id]/trace', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  // ── Happy path ──────────────────────────────────────────────────────────

  it('returns 200 with a fully populated trace for a valid campaign', async () => {
    mocks.getCampaignWithVariations.mockResolvedValueOnce({
      campaign: MOCK_CAMPAIGN,
      variations: [MOCK_VARIATION],
    });
    mocks.getAsset.mockResolvedValueOnce(MOCK_ASSET);
    mocks.getCapabilityRunByClientId
      .mockResolvedValueOnce(MOCK_RUN_1)
      .mockResolvedValueOnce(MOCK_RUN_2);
    mocks.listScheduledPosts.mockResolvedValueOnce([MOCK_SCHEDULED_POST]);

    const { GET } = await import(
      '@/app/api/campaigns/[id]/trace/route'
    );
    const res = await GET(makeGetRequest(CAMPAIGN_ID), {
      params: Promise.resolve({ id: CAMPAIGN_ID }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.ok).toBe(true);

    // Campaign shape
    expect(body.campaign.id).toBe(CAMPAIGN_ID);
    expect(body.campaign.triggerKind).toBe('url');
    expect(body.campaign.status).toBe('completed');
    expect(typeof body.campaign.startedAt).toBe('number');

    // Variations shape
    expect(body.variations).toHaveLength(1);
    const v = body.variations[0];
    expect(v.id).toBe(VARIATION_ID);
    expect(v.status).toBe('ready');
    expect(v.heroImageUrl).toBe('https://cdn.convex.cloud/hero.png');

    // heroAsset should be enriched from getAsset
    expect(v.heroAsset).toBeDefined();
    expect(v.heroAsset.publicUrl).toBe('https://cdn.convex.cloud/hero.png');
    expect(v.heroAsset.storageId).toBe('store_xyz');

    // captions and locales
    expect(v.caption).toBe('Unlock your best sleep');
    expect(v.captionsByLocale['en-SG']).toBe('Unlock your best sleep');

    // formatCrops preserved
    expect(Array.isArray(v.formatCrops)).toBe(true);
    expect(v.formatCrops[0].formatId).toBe('1x1');

    // Mask summaries — no full bbox arrays, just counts
    expect(v.masksOneShot).toBeDefined();
    expect(v.masksOneShot.maskCount).toBe(2);
    expect(v.masksOneShot.matched).toEqual(['face', 'product']);
    expect((v.masksOneShot as Record<string, unknown>).masks).toBeUndefined();

    expect(v.masksVisionGuided).toBeDefined();
    expect(v.masksVisionGuided.maskCount).toBe(1);
    expect((v.masksVisionGuided as Record<string, unknown>).masks).toBeUndefined();

    // agentSteps with ledger cross-linked
    expect(Array.isArray(v.agentSteps)).toBe(true);
    expect(v.agentSteps).toHaveLength(2);
    const step1 = v.agentSteps.find(
      (s: { clientRunId: string }) => s.clientRunId === CLIENT_RUN_ID_1
    );
    expect(step1).toBeDefined();
    expect(step1.ledger).toBeDefined();
    expect(step1.ledger.provider).toBe('exa');
    expect(step1.ledger.latencyMs).toBe(320);

    // scheduledPosts
    expect(Array.isArray(body.scheduledPosts)).toBe(true);
    expect(body.scheduledPosts[0].platform).toBe('instagram');
    expect(body.scheduledPosts[0].status).toBe('scheduled');

    // lapDataUnavailable is always true — urlIngestion/pdfIngestion/referenceDescriptions
    // are not persisted to Convex, so their absence is expected and flagged.
    expect(body.lapDataUnavailable).toBe(true);
  });

  // ── 404 — campaign not found ─────────────────────────────────────────────

  it('returns 404 when the campaign does not exist', async () => {
    mocks.getCampaignWithVariations.mockResolvedValueOnce(null);
    mocks.listScheduledPosts.mockResolvedValueOnce([]);

    const { GET } = await import(
      '@/app/api/campaigns/[id]/trace/route'
    );
    const res = await GET(makeGetRequest('nonexistent_id_xyz'), {
      params: Promise.resolve({ id: 'nonexistent_id_xyz' }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/not found/i);
  });

  // ── Missing heroAsset ────────────────────────────────────────────────────

  it('omits heroAsset gracefully when heroAssetId is not resolvable', async () => {
    const variationWithMissingAsset = {
      ...MOCK_VARIATION,
      heroAssetId: 'missing_asset_id',
    };
    mocks.getCampaignWithVariations.mockResolvedValueOnce({
      campaign: MOCK_CAMPAIGN,
      variations: [variationWithMissingAsset],
    });
    mocks.getAsset.mockResolvedValueOnce(null); // asset lookup returns null
    mocks.getCapabilityRunByClientId
      .mockResolvedValueOnce(MOCK_RUN_1)
      .mockResolvedValueOnce(MOCK_RUN_2);
    mocks.listScheduledPosts.mockResolvedValueOnce([]);

    const { GET } = await import(
      '@/app/api/campaigns/[id]/trace/route'
    );
    const res = await GET(makeGetRequest(CAMPAIGN_ID), {
      params: Promise.resolve({ id: CAMPAIGN_ID }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    // heroAsset should be undefined/absent when lookup returns null
    expect(body.variations[0].heroAsset).toBeUndefined();
    // rest of variation still present
    expect(body.variations[0].heroImageUrl).toBe('https://cdn.convex.cloud/hero.png');
  });

  // ── Missing ledger rows ──────────────────────────────────────────────────

  it('populates agentSteps with null ledger when clientRunId is not in capabilityRun', async () => {
    mocks.getCampaignWithVariations.mockResolvedValueOnce({
      campaign: MOCK_CAMPAIGN,
      variations: [MOCK_VARIATION],
    });
    mocks.getAsset.mockResolvedValueOnce(MOCK_ASSET);
    // Both run lookups return null
    mocks.getCapabilityRunByClientId.mockResolvedValue(null);
    mocks.listScheduledPosts.mockResolvedValueOnce([]);

    const { GET } = await import(
      '@/app/api/campaigns/[id]/trace/route'
    );
    const res = await GET(makeGetRequest(CAMPAIGN_ID), {
      params: Promise.resolve({ id: CAMPAIGN_ID }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    // agentSteps present but ledger is null when row missing
    expect(body.variations[0].agentSteps).toHaveLength(2);
    for (const step of body.variations[0].agentSteps) {
      expect(step.ledger).toBeNull();
    }
  });

  // ── Invalid id ───────────────────────────────────────────────────────────

  it('returns 400 for an empty id', async () => {
    const { GET } = await import(
      '@/app/api/campaigns/[id]/trace/route'
    );
    const res = await GET(makeGetRequest(''), {
      params: Promise.resolve({ id: '' }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/invalid/i);
  });

  it('returns 400 for a whitespace-only id', async () => {
    const { GET } = await import(
      '@/app/api/campaigns/[id]/trace/route'
    );
    const res = await GET(makeGetRequest('   '), {
      params: Promise.resolve({ id: '   ' }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/invalid/i);
  });

  // ── Convex unreachable ───────────────────────────────────────────────────

  it('returns 500 when getCampaignWithVariations throws', async () => {
    mocks.getCampaignWithVariations.mockRejectedValueOnce(
      new Error('Convex connection refused')
    );
    mocks.listScheduledPosts.mockResolvedValueOnce([]);

    const { GET } = await import(
      '@/app/api/campaigns/[id]/trace/route'
    );
    const res = await GET(makeGetRequest(CAMPAIGN_ID), {
      params: Promise.resolve({ id: CAMPAIGN_ID }),
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/Convex connection refused/i);
  });

  // ── lapDataUnavailable flag ──────────────────────────────────────────────

  it('sets lapDataUnavailable:true when urlIngestion/pdfIngestion are absent', async () => {
    // Campaign and variation have no urlIngestion/pdfIngestion (as expected
    // since those are NOT persisted to Convex today)
    mocks.getCampaignWithVariations.mockResolvedValueOnce({
      campaign: MOCK_CAMPAIGN,
      variations: [MOCK_VARIATION],
    });
    mocks.getAsset.mockResolvedValueOnce(MOCK_ASSET);
    mocks.getCapabilityRunByClientId
      .mockResolvedValueOnce(MOCK_RUN_1)
      .mockResolvedValueOnce(MOCK_RUN_2);
    mocks.listScheduledPosts.mockResolvedValueOnce([]);

    const { GET } = await import(
      '@/app/api/campaigns/[id]/trace/route'
    );
    const res = await GET(makeGetRequest(CAMPAIGN_ID), {
      params: Promise.resolve({ id: CAMPAIGN_ID }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    // urlIngestion / pdfIngestion are not persisted yet
    expect(body.lapDataUnavailable).toBe(true);
  });
});

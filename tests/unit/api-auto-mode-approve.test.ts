/**
 * Unit tests for POST /api/auto-mode/approve
 *
 * The route imports ConvexHttpClient but we mock it so there is no actual
 * network call. Tests verify:
 *   - 400 when campaignId is missing or empty
 *   - 400 when variationIndex is not an integer
 *   - 200 + approved:true when variation is not found in Convex (graceful)
 *   - 422 when the looked-up variation has status "failed"
 *   - 200 + approved:true for review mode when variation is found + ready
 *   - variation data is echoed back in review mode response
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ──────────────────────────────────────────────────────────────────────────────
// Mock dependencies before importing the route handler.
// ──────────────────────────────────────────────────────────────────────────────

// Shared mutable state: tests set convexResult before calling POST.
let convexResult: unknown = null;

vi.mock('convex/browser', () => {
  return {
    ConvexHttpClient: function MockConvexHttpClient() {
      return {
        query: vi.fn(async () => convexResult),
      };
    },
  };
});

vi.mock('convex/server', () => ({
  anyApi: new Proxy(
    {},
    {
      get: () =>
        new Proxy(
          {},
          { get: (_t: unknown, k: string | symbol) => k }
        ),
    }
  ),
}));

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/auto-mode/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

interface VariationRow {
  id: string;
  index: number;
  status: string;
  heroImageUrl?: string;
  caption?: string;
  hashtags?: string[];
  schedulePlatform?: string;
  scheduleWhenLocal?: string;
}

function makeVariationRow(overrides: Partial<VariationRow> = {}): VariationRow {
  return {
    id: 'var-convex-1',
    index: 0,
    status: 'ready',
    heroImageUrl: 'https://cdn.test/hero.png',
    caption: 'Great product',
    hashtags: ['#sale'],
    schedulePlatform: 'instagram',
    ...overrides,
  };
}

// Import the route handler once — mocks are already wired before the import.
import { POST } from '@/app/api/auto-mode/approve/route';

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe('POST /api/auto-mode/approve', () => {
  beforeEach(() => {
    convexResult = null;
    process.env.NEXT_PUBLIC_CONVEX_URL = 'https://convex.test';
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_CONVEX_URL;
  });

  // ── Validation ──────────────────────────────────────────────────────────────

  it('returns 400 when campaignId is missing', async () => {
    const res = await POST(makeRequest({ variationIndex: 0 }));
    expect(res.status).toBe(400);
    const json = await res.json() as { ok: boolean; error: string };
    expect(json.ok).toBe(false);
    expect(json.error).toMatch(/campaignId/);
  });

  it('returns 400 when campaignId is an empty string', async () => {
    const res = await POST(makeRequest({ campaignId: '  ', variationIndex: 0 }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when variationIndex is missing', async () => {
    const res = await POST(makeRequest({ campaignId: 'c-1' }));
    expect(res.status).toBe(400);
    const json = await res.json() as { ok: boolean; error: string };
    expect(json.error).toMatch(/variationIndex/);
  });

  it('returns 400 when variationIndex is a float', async () => {
    const res = await POST(makeRequest({ campaignId: 'c-1', variationIndex: 1.5 }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when body is not valid JSON', async () => {
    const req = new Request('http://localhost/api/auto-mode/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json{{{',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // ── Convex integration ──────────────────────────────────────────────────────

  it('returns 200 approved:true with a note when variation not found in Convex', async () => {
    convexResult = {
      campaign: { id: 'c-1' },
      variations: [], // empty — variation index 99 not found
    };

    const res = await POST(makeRequest({ campaignId: 'c-1', variationIndex: 99 }));
    expect(res.status).toBe(200);
    const json = await res.json() as { ok: boolean; approved: boolean; note?: string };
    expect(json.ok).toBe(true);
    expect(json.approved).toBe(true);
    expect(json.note).toMatch(/not found/i);
  });

  it('returns 200 approved:true with a note when Convex returns null', async () => {
    convexResult = null;

    const res = await POST(makeRequest({ campaignId: 'c-1', variationIndex: 0 }));
    expect(res.status).toBe(200);
    const json = await res.json() as { ok: boolean; approved: boolean };
    expect(json.ok).toBe(true);
    expect(json.approved).toBe(true);
  });

  it('returns 422 when the variation has status "failed"', async () => {
    convexResult = {
      campaign: { id: 'c-1' },
      variations: [makeVariationRow({ index: 0, status: 'failed', heroImageUrl: undefined })],
    };

    const res = await POST(makeRequest({ campaignId: 'c-1', variationIndex: 0 }));
    expect(res.status).toBe(422);
    const json = await res.json() as { ok: boolean; error: string };
    expect(json.ok).toBe(false);
    expect(json.error).toMatch(/cannot approve a failed/i);
  });

  it('returns variation data in review mode response', async () => {
    convexResult = {
      campaign: { id: 'c-1' },
      variations: [makeVariationRow()],
    };

    const res = await POST(
      makeRequest({ campaignId: 'c-1', variationIndex: 0, notifyMode: 'review' })
    );
    expect(res.status).toBe(200);
    const json = await res.json() as {
      ok: boolean;
      approved: boolean;
      variation: { id: string; heroImageUrl: string; caption: string };
    };
    expect(json.ok).toBe(true);
    expect(json.approved).toBe(true);
    expect(json.variation.id).toBe('var-convex-1');
    expect(json.variation.heroImageUrl).toBe('https://cdn.test/hero.png');
    expect(json.variation.caption).toBe('Great product');
  });

  it('falls back gracefully when Convex URL is not set', async () => {
    delete process.env.NEXT_PUBLIC_CONVEX_URL;

    const res = await POST(makeRequest({ campaignId: 'c-1', variationIndex: 0 }));
    // With no NEXT_PUBLIC_CONVEX_URL, getVariation returns null → approved with note
    expect(res.status).toBe(200);
    const json = await res.json() as { ok: boolean; approved: boolean };
    expect(json.ok).toBe(true);
    expect(json.approved).toBe(true);
  });
});

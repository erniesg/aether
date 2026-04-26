/**
 * Unit tests for POST /api/text-overlay/apply
 * Covers the forbiddenRegions pass-through added in the Q3 segment-aware slice.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const applyFn = vi.fn();
  return { applyFn };
});

vi.mock('@/lib/agent/text-apply', () => ({
  applyTextOverlay: mocks.applyFn,
}));

const STUB_OUTPUT = {
  layers: [],
  plannerMode: 'noop' as const,
  provenance: {
    sourceLocale: 'en-US',
    targetLocales: [],
  },
};

const MINIMAL_BODY = {
  component: {
    hero: { description: 'a still life' },
    mood: { keywords: [] },
    safeZones: [],
    cropPriorities: { primary: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 } },
    formats: [{ id: 'ig-post', w: 1080, h: 1350 }],
  },
  sourceLocale: 'en-US',
};

function postRequest(body: unknown) {
  return new Request('http://localhost/api/text-overlay/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/text-overlay/apply', () => {
  beforeEach(() => {
    mocks.applyFn.mockReset();
    mocks.applyFn.mockResolvedValue(STUB_OUTPUT);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('returns 200 with agent output on a valid minimal body', async () => {
    const { POST } = await import('@/app/api/text-overlay/apply/route');
    const res = await POST(postRequest(MINIMAL_BODY));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.plannerMode).toBe('noop');
  });

  it('returns 400 when component is missing', async () => {
    const { POST } = await import('@/app/api/text-overlay/apply/route');
    const res = await POST(postRequest({ sourceLocale: 'en-US' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  it('returns 400 when sourceLocale is missing', async () => {
    const { POST } = await import('@/app/api/text-overlay/apply/route');
    const res = await POST(postRequest({ component: MINIMAL_BODY.component }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  // AC: forbiddenRegions accepted in body and passed through to the planner
  it('passes forbiddenRegions from the request body to applyTextOverlay (AC)', async () => {
    const { POST } = await import('@/app/api/text-overlay/apply/route');
    const forbiddenRegions = [
      { kind: 'face', bbox: { x: 0.3, y: 0.3, w: 0.4, h: 0.3 }, confidence: 0.95 },
      { kind: 'product', bbox: { x: 0.1, y: 0.5, w: 0.2, h: 0.2 }, confidence: 0.8 },
    ];

    await POST(postRequest({ ...MINIMAL_BODY, forbiddenRegions }));

    expect(mocks.applyFn).toHaveBeenCalledOnce();
    const calledInput = mocks.applyFn.mock.calls[0]?.[0];
    expect(calledInput.forbiddenRegions).toEqual(forbiddenRegions);
  });

  it('passes empty forbiddenRegions array when field is absent', async () => {
    const { POST } = await import('@/app/api/text-overlay/apply/route');
    await POST(postRequest(MINIMAL_BODY));
    const calledInput = mocks.applyFn.mock.calls[0]?.[0];
    expect(calledInput.forbiddenRegions).toEqual([]);
  });

  it('passes empty forbiddenRegions when the field is invalid (non-array)', async () => {
    const { POST } = await import('@/app/api/text-overlay/apply/route');
    await POST(postRequest({ ...MINIMAL_BODY, forbiddenRegions: 'not-an-array' }));
    const calledInput = mocks.applyFn.mock.calls[0]?.[0];
    expect(calledInput.forbiddenRegions).toEqual([]);
  });

  it('strips malformed items from forbiddenRegions (missing confidence)', async () => {
    const { POST } = await import('@/app/api/text-overlay/apply/route');
    const forbiddenRegions = [
      { kind: 'face', bbox: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } }, // no confidence
    ];
    await POST(postRequest({ ...MINIMAL_BODY, forbiddenRegions }));
    const calledInput = mocks.applyFn.mock.calls[0]?.[0];
    // A region without confidence must be dropped or normalized
    expect(
      calledInput.forbiddenRegions.every(
        (r: { confidence: unknown }) => typeof r.confidence === 'number'
      )
    ).toBe(true);
  });

  it('returns 500 when the planner throws an unexpected error', async () => {
    mocks.applyFn.mockRejectedValueOnce(new Error('boom'));
    const { POST } = await import('@/app/api/text-overlay/apply/route');
    const res = await POST(postRequest(MINIMAL_BODY));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toMatch(/boom/);
  });
});

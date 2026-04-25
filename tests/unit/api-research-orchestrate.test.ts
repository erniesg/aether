/**
 * Contract tests for the POST /api/research/orchestrate route handler.
 *
 * Mocks orchestrateResearch at the module boundary so request-parsing
 * and error-handling logic is tested in isolation.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClusterLensSnapshot } from '@/lib/research/orchestrator';

const mocks = vi.hoisted(() => ({
  orchestrateResearch: vi.fn(),
}));

vi.mock('@/lib/research/orchestrator', () => ({
  orchestrateResearch: mocks.orchestrateResearch,
}));

const SNAPSHOT: ClusterLensSnapshot = {
  seedText: 'barrier glow shelf',
  cards: [
    {
      referenceId: 'ref_1',
      clusterId: 'c0',
      clusterLabel: 'warm-shelf editorial',
      thumbnailUrl: 'https://i.pinimg.com/1.jpg',
      attribution: { source: 'pinterest', url: 'https://pinterest.com/pin/1' },
      column: 'Found',
      movedAt: 1714000000000,
    },
  ],
  directions: [{ clusterId: 'c0', label: 'warm-shelf editorial', memberCount: 1 }],
  moodboardPrompts: ['golden hour ceramics on linen shelf'],
  assembledAt: new Date().toISOString(),
};

describe('/api/research/orchestrate', () => {
  afterEach(() => {
    vi.resetModules();
    mocks.orchestrateResearch.mockReset();
  });

  it('returns 200 with assembled snapshot for a valid request', async () => {
    mocks.orchestrateResearch.mockResolvedValueOnce(SNAPSHOT);

    const { POST } = await import('@/app/api/research/orchestrate/route');
    const res = await POST(
      new Request('http://localhost/api/research/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seedText: 'barrier glow shelf' }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.snapshot.seedText).toBe('barrier glow shelf');
    expect(Array.isArray(json.snapshot.cards)).toBe(true);
    expect(Array.isArray(json.snapshot.directions)).toBe(true);
    expect(mocks.orchestrateResearch).toHaveBeenCalledWith(
      expect.objectContaining({ seedText: 'barrier glow shelf' })
    );
  });

  it('returns 400 when seedText is missing', async () => {
    const { POST } = await import('@/app/api/research/orchestrate/route');
    const res = await POST(
      new Request('http://localhost/api/research/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toMatch(/seedText/i);
  });

  it('returns 400 when body is invalid JSON', async () => {
    const { POST } = await import('@/app/api/research/orchestrate/route');
    const res = await POST(
      new Request('http://localhost/api/research/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      })
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  it('returns 400 with error code when orchestrateResearch throws', async () => {
    mocks.orchestrateResearch.mockRejectedValueOnce(new Error('Anthropic API error'));

    const { POST } = await import('@/app/api/research/orchestrate/route');
    const res = await POST(
      new Request('http://localhost/api/research/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seedText: 'glow shelf' }),
      })
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.code).toBe('orchestrate_failed');
  });

  it('passes creatorContext and refs to the orchestrator when provided', async () => {
    mocks.orchestrateResearch.mockResolvedValueOnce(SNAPSHOT);

    const creatorContext = { brand: { id: 'b1', name: 'Solstice', palette: [], type: [], voice: '', knowledgeSources: [] } };
    const refs = [{ id: 'ref_1', kind: 'image', previewUrl: '', fullUrl: '', attribution: { source: 'pinterest', url: '' }, capturedAt: '' }];

    const { POST } = await import('@/app/api/research/orchestrate/route');
    await POST(
      new Request('http://localhost/api/research/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seedText: 'glow shelf', creatorContext, refs }),
      })
    );

    expect(mocks.orchestrateResearch).toHaveBeenCalledWith(
      expect.objectContaining({
        seedText: 'glow shelf',
        creatorContext,
        refs,
      })
    );
  });

  it('returns a snapshot with fallback:true when orchestrator falls back to single-pass', async () => {
    const fallbackSnapshot = { ...SNAPSHOT, fallback: true };
    mocks.orchestrateResearch.mockResolvedValueOnce(fallbackSnapshot);

    const { POST } = await import('@/app/api/research/orchestrate/route');
    const res = await POST(
      new Request('http://localhost/api/research/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seedText: 'glow' }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.snapshot.fallback).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Blocker 8 — _workerErrors moved to debug only
  // -----------------------------------------------------------------------

  it('strips snapshot.debug from public response by default', async () => {
    const snapshotWithDebug: ClusterLensSnapshot = {
      ...SNAPSHOT,
      debug: {
        workerErrors: { researcher: 'network timeout' },
      },
    };
    mocks.orchestrateResearch.mockResolvedValueOnce(snapshotWithDebug);

    const { POST } = await import('@/app/api/research/orchestrate/route');
    const res = await POST(
      new Request('http://localhost/api/research/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seedText: 'barrier glow shelf' }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    // debug sub-object must NOT appear in the public response
    expect(json.snapshot.debug).toBeUndefined();
    // Core snapshot data is still present
    expect(Array.isArray(json.snapshot.cards)).toBe(true);
  });

  it('includes snapshot.debug when ?debug=1 query param is set', async () => {
    const snapshotWithDebug: ClusterLensSnapshot = {
      ...SNAPSHOT,
      debug: {
        workerErrors: { researcher: 'network timeout' },
      },
    };
    mocks.orchestrateResearch.mockResolvedValueOnce(snapshotWithDebug);

    const { POST } = await import('@/app/api/research/orchestrate/route');
    const res = await POST(
      new Request('http://localhost/api/research/orchestrate?debug=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seedText: 'barrier glow shelf' }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    // debug sub-object IS present when ?debug=1
    expect(json.snapshot.debug).toBeDefined();
    expect(json.snapshot.debug.workerErrors.researcher).toBe('network timeout');
  });
});

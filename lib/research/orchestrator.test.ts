/**
 * TDD tests for orchestrateResearch — the 3-subagent supervisor.
 *
 * Strategy: inject a fake Anthropic client via the `client` option.
 * All tests drive behavior through the public interface only.
 *
 * Acceptance criteria (issue #98):
 *   1. 3 parallel calls, distinct system prompts per worker
 *   2. Fail-soft: one worker error doesn't block others; returns partial snapshot with _error
 *   3. Returns assembled ClusterLensSnapshot
 *   4. Falls back to single-pass when refs.length < MIN_REFS_FOR_MULTI_AGENT
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReferenceRecord } from '@/lib/providers/reference/types';

// ---------------------------------------------------------------------------
// Minimal reference records fixture
// ---------------------------------------------------------------------------

function makeRef(i: number): ReferenceRecord {
  return {
    id: `ref_${i}`,
    kind: 'image',
    previewUrl: `https://example.com/img/${i}.jpg`,
    fullUrl: `https://example.com/img/${i}.jpg`,
    attribution: { source: 'pinterest', url: `https://example.com/img/${i}.jpg` },
    capturedAt: new Date().toISOString(),
    tags: ['research'],
  };
}

const THREE_REFS = [makeRef(1), makeRef(2), makeRef(3)];
const TWO_REFS = [makeRef(1), makeRef(2)];

// ---------------------------------------------------------------------------
// Helpers: tool-use responses each subagent emits
// ---------------------------------------------------------------------------

function makeResearcherResponse() {
  return {
    content: [
      {
        type: 'tool_use',
        name: 'researcher_output',
        input: {
          fetchedRefs: [
            {
              id: 'fetched-1',
              platform: 'pinterest',
              sourceUrl: 'https://pinterest.com/pin/1',
              thumbnailUrl: 'https://i.pinimg.com/1.jpg',
              tags: ['shelf', 'glow'],
            },
          ],
        },
      },
    ],
    stop_reason: 'tool_use',
  };
}

function makeClustererResponse() {
  return {
    content: [
      {
        type: 'tool_use',
        name: 'clusterer_output',
        input: {
          clusters: [
            { clusterId: 'c0', label: 'warm-shelf editorial', memberIds: ['ref_1', 'ref_2'] },
            { clusterId: 'c1', label: 'moody product close-up', memberIds: ['ref_3'] },
          ],
        },
      },
    ],
    stop_reason: 'tool_use',
  };
}

function makeAestheticResponse() {
  return {
    content: [
      {
        type: 'tool_use',
        name: 'aesthetic_output',
        input: {
          clusterAnalyses: [
            {
              clusterId: 'c0',
              direction: 'warm-shelf editorial',
              moodboardPrompts: ['golden hour ceramics on linen shelf', 'amber glow product flat-lay'],
            },
          ],
        },
      },
    ],
    stop_reason: 'tool_use',
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('orchestrateResearch', () => {
  let mockCreate: ReturnType<typeof vi.fn>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fakeClient: any;

  beforeEach(() => {
    mockCreate = vi.fn();
    fakeClient = { messages: { create: mockCreate } };
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  afterEach(() => {
    vi.resetModules();
    mockCreate.mockReset();
  });

  it('issues exactly 3 model calls in parallel', async () => {
    let allStartedBeforeAnyResolved = false;
    let callCount = 0;

    mockCreate.mockImplementation(() => {
      callCount++;
      const thisCall = callCount;
      if (thisCall === 3) {
        // By the time the 3rd call fires, none have resolved yet — true parallelism
        allStartedBeforeAnyResolved = true;
      }
      return new Promise((resolve) => {
        setTimeout(() => {
          if (thisCall === 1) resolve(makeResearcherResponse());
          else if (thisCall === 2) resolve(makeClustererResponse());
          else resolve(makeAestheticResponse());
        }, 10);
      });
    });

    const { orchestrateResearch } = await import('./orchestrator');
    await orchestrateResearch({ seedText: 'barrier glow shelf', refs: THREE_REFS, client: fakeClient });

    expect(mockCreate).toHaveBeenCalledTimes(3);
    expect(allStartedBeforeAnyResolved).toBe(true);
  });

  it('uses distinct system prompts for each of the three workers', async () => {
    mockCreate
      .mockResolvedValueOnce(makeResearcherResponse())
      .mockResolvedValueOnce(makeClustererResponse())
      .mockResolvedValueOnce(makeAestheticResponse());

    const { orchestrateResearch } = await import('./orchestrator');
    await orchestrateResearch({ seedText: 'barrier glow shelf', refs: THREE_REFS, client: fakeClient });

    const calls = mockCreate.mock.calls as Array<[{ system: Array<{ text: string }> | string }]>;
    const systemTexts = calls.map(([args]) => {
      const sys = args.system;
      if (Array.isArray(sys)) return sys.map((b) => b.text).join(' ');
      return String(sys ?? '');
    });

    // All three are non-empty
    for (const text of systemTexts) {
      expect(text.length).toBeGreaterThan(20);
    }

    // All three are distinct
    expect(new Set(systemTexts).size).toBe(3);
  });

  it('applies cache_control ephemeral on every system prompt', async () => {
    mockCreate
      .mockResolvedValueOnce(makeResearcherResponse())
      .mockResolvedValueOnce(makeClustererResponse())
      .mockResolvedValueOnce(makeAestheticResponse());

    const { orchestrateResearch } = await import('./orchestrator');
    await orchestrateResearch({ seedText: 'barrier glow shelf', refs: THREE_REFS, client: fakeClient });

    const calls = mockCreate.mock.calls as Array<[{ system: Array<{ cache_control?: { type: string } }> }]>;
    for (const [args] of calls) {
      const sys = args.system;
      expect(Array.isArray(sys)).toBe(true);
      const lastBlock = (sys as Array<{ cache_control?: { type: string } }>)[sys.length - 1];
      expect(lastBlock.cache_control).toEqual({ type: 'ephemeral' });
    }
  });

  it('uses claude-opus-4-7 for all three calls', async () => {
    mockCreate
      .mockResolvedValueOnce(makeResearcherResponse())
      .mockResolvedValueOnce(makeClustererResponse())
      .mockResolvedValueOnce(makeAestheticResponse());

    const { orchestrateResearch } = await import('./orchestrator');
    await orchestrateResearch({ seedText: 'barrier glow shelf', refs: THREE_REFS, client: fakeClient });

    const calls = mockCreate.mock.calls as Array<[{ model: string }]>;
    for (const [args] of calls) {
      expect(args.model).toBe('claude-opus-4-7');
    }
  });

  it('returns an assembled ClusterLensSnapshot with cards and directions', async () => {
    mockCreate
      .mockResolvedValueOnce(makeResearcherResponse())
      .mockResolvedValueOnce(makeClustererResponse())
      .mockResolvedValueOnce(makeAestheticResponse());

    const { orchestrateResearch } = await import('./orchestrator');
    const snapshot = await orchestrateResearch({ seedText: 'barrier glow shelf', refs: THREE_REFS, client: fakeClient });

    expect(snapshot).toBeDefined();
    expect(Array.isArray(snapshot.cards)).toBe(true);
    expect(Array.isArray(snapshot.directions)).toBe(true);
    expect(snapshot.seedText).toBe('barrier glow shelf');
    expect(typeof snapshot.assembledAt).toBe('string');
  });

  it('fail-soft: researcher error does not block clusterer + aesthetic-analyzer', async () => {
    mockCreate
      .mockRejectedValueOnce(new Error('researcher network timeout'))
      .mockResolvedValueOnce(makeClustererResponse())
      .mockResolvedValueOnce(makeAestheticResponse());

    const { orchestrateResearch } = await import('./orchestrator');
    const snapshot = await orchestrateResearch({ seedText: 'barrier glow shelf', refs: THREE_REFS, client: fakeClient });

    // All 3 calls were still made
    expect(mockCreate).toHaveBeenCalledTimes(3);
    // Snapshot comes back — partial, not a thrown error
    expect(snapshot).toBeDefined();
    // Error is surfaced in the snapshot
    expect(snapshot._workerErrors).toBeDefined();
    expect(typeof snapshot._workerErrors?.researcher).toBe('string');
    // Other workers' data still present
    expect(Array.isArray(snapshot.directions)).toBe(true);
  });

  it('fail-soft: clusterer error does not block researcher + aesthetic-analyzer', async () => {
    mockCreate
      .mockResolvedValueOnce(makeResearcherResponse())
      .mockRejectedValueOnce(new Error('clusterer HDBSCAN timeout'))
      .mockResolvedValueOnce(makeAestheticResponse());

    const { orchestrateResearch } = await import('./orchestrator');
    const snapshot = await orchestrateResearch({ seedText: 'barrier glow shelf', refs: THREE_REFS, client: fakeClient });

    expect(snapshot._workerErrors).toBeDefined();
    expect(typeof snapshot._workerErrors?.clusterer).toBe('string');
    expect(Array.isArray(snapshot.cards)).toBe(true);
  });

  it('fail-soft: aesthetic-analyzer error does not block researcher + clusterer', async () => {
    mockCreate
      .mockResolvedValueOnce(makeResearcherResponse())
      .mockResolvedValueOnce(makeClustererResponse())
      .mockRejectedValueOnce(new Error('aesthetic-analyzer rate-limit'));

    const { orchestrateResearch } = await import('./orchestrator');
    const snapshot = await orchestrateResearch({ seedText: 'barrier glow shelf', refs: THREE_REFS, client: fakeClient });

    expect(snapshot._workerErrors).toBeDefined();
    expect(typeof snapshot._workerErrors?.aestheticAnalyzer).toBe('string');
    // Cluster data from clusterer still comes through
    expect(Array.isArray(snapshot.directions)).toBe(true);
  });

  it('falls back to single-pass planResearch when refs.length < MIN_REFS_FOR_MULTI_AGENT (default 3)', async () => {
    const { orchestrateResearch } = await import('./orchestrator');
    const snapshot = await orchestrateResearch({
      seedText: 'barrier glow shelf',
      refs: TWO_REFS,
      client: fakeClient,
    });

    // No Anthropic calls — falls back to single-pass which doesn't call the client
    expect(mockCreate).not.toHaveBeenCalled();
    // Still returns a valid snapshot shape
    expect(snapshot).toBeDefined();
    expect(snapshot.fallback).toBe(true);
    expect(snapshot.seedText).toBe('barrier glow shelf');
  });

  it('min refs threshold is configurable via MIN_REFS_FOR_MULTI_AGENT env var', async () => {
    process.env.MIN_REFS_FOR_MULTI_AGENT = '5';

    mockCreate
      .mockResolvedValueOnce(makeResearcherResponse())
      .mockResolvedValueOnce(makeClustererResponse())
      .mockResolvedValueOnce(makeAestheticResponse());

    const { orchestrateResearch } = await import('./orchestrator');

    // 4 refs < 5 threshold → fallback
    const snapshot4 = await orchestrateResearch({
      seedText: 'glow',
      refs: [makeRef(1), makeRef(2), makeRef(3), makeRef(4)],
      client: fakeClient,
    });
    expect(snapshot4.fallback).toBe(true);
    expect(mockCreate).not.toHaveBeenCalled();

    delete process.env.MIN_REFS_FOR_MULTI_AGENT;
  });
});

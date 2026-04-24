import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const ORIGINAL_CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

afterEach(() => {
  if (ORIGINAL_CONVEX_URL === undefined) {
    delete process.env.NEXT_PUBLIC_CONVEX_URL;
  } else {
    process.env.NEXT_PUBLIC_CONVEX_URL = ORIGINAL_CONVEX_URL;
  }
  vi.resetModules();
  vi.doUnmock('convex/react');
});

describe('runs store — in-memory fallback (NEXT_PUBLIC_CONVEX_URL unset)', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_CONVEX_URL;
    vi.resetModules();
  });

  it('useRuns starts empty, startRun returns an id and appends a running record', async () => {
    const runs = await import('@/lib/store/runs');
    const { result } = renderHook(() => runs.useRuns());
    expect(result.current).toEqual([]);

    let id = '';
    act(() => {
      id = runs.startRun({ tool: 'image-gen', provider: 'gemini', model: 'nano-banana', prompt: 'a cat' });
    });

    expect(id).toMatch(/^run_/);
    expect(result.current).toHaveLength(1);
    const [only] = result.current;
    expect(only).toMatchObject({
      id,
      tool: 'image-gen',
      provider: 'gemini',
      model: 'nano-banana',
      prompt: 'a cat',
      status: 'running',
    });
    expect(typeof only.startedAt).toBe('number');
  });

  it('stepRun transitions the sub-state', async () => {
    const runs = await import('@/lib/store/runs');
    const { result } = renderHook(() => runs.useRuns());
    let id = '';
    act(() => {
      id = runs.startRun({ tool: 'image-gen', provider: 'gemini', model: 'nano-banana', prompt: 'a fox' });
    });
    act(() => {
      runs.stepRun(id, 'sending');
    });
    expect(result.current[0].step).toBe('sending');
    act(() => {
      runs.stepRun(id, 'placing');
    });
    expect(result.current[0].step).toBe('placing');
  });

  it('finishRun sets status ok, step done, finishedAt and merges the patch', async () => {
    const runs = await import('@/lib/store/runs');
    const { result } = renderHook(() => runs.useRuns());
    let id = '';
    act(() => {
      id = runs.startRun({ tool: 'image-gen', provider: 'gemini', model: 'nano-banana', prompt: 'a car' });
    });
    act(() => {
      runs.finishRun(id, {
        provider: 'gemini',
        model: 'nano-banana',
        imageUrl: 'https://x/y.png',
        latencyMs: 1234,
        aspectRatio: '1:1',
      });
    });
    const [only] = result.current;
    expect(only.status).toBe('ok');
    expect(only.step).toBe('done');
    expect(only.imageUrl).toBe('https://x/y.png');
    expect(only.latencyMs).toBe(1234);
    expect(only.aspectRatio).toBe('1:1');
    expect(typeof only.finishedAt).toBe('number');
  });

  it('records motion input refs and output refs on the run record', async () => {
    const runs = await import('@/lib/store/runs');
    const { result } = renderHook(() => runs.useRuns());
    let id = '';
    act(() => {
      id = runs.startRun({
        tool: 'video-gen',
        provider: 'auto',
        model: '',
        prompt: 'make an intro motion',
        inputs: {
          prompt: 'make an intro motion',
          refs: ['data:image/png;base64,aaa'],
          sceneKind: 'text-mask',
        },
        artifactKind: 'video',
        scope: 'workspace',
      });
    });
    act(() => {
      runs.finishRun(id, {
        provider: 'hyperframes',
        model: 'hyperframes-html-v1',
        artifactKind: 'video',
        outputRefs: ['data:text/html,fixture'],
      });
    });

    expect(result.current[0]).toMatchObject({
      tool: 'video-gen',
      provider: 'hyperframes',
      model: 'hyperframes-html-v1',
      artifactKind: 'video',
      inputs: {
        refs: ['data:image/png;base64,aaa'],
        sceneKind: 'text-mask',
      },
      outputRefs: ['data:text/html,fixture'],
    });
  });

  it('failRun sets status error with message and httpStatus', async () => {
    const runs = await import('@/lib/store/runs');
    const { result } = renderHook(() => runs.useRuns());
    let id = '';
    act(() => {
      id = runs.startRun({ tool: 'image-gen', provider: 'gemini', model: '', prompt: 'x' });
    });
    act(() => {
      runs.failRun(id, 'boom', 500);
    });
    expect(result.current[0].status).toBe('error');
    expect(result.current[0].error).toBe('boom');
    expect(result.current[0].httpStatus).toBe(500);
    expect(result.current[0].step).toBe('done');
  });

  it('keeps newest run first and caps at 50', async () => {
    const runs = await import('@/lib/store/runs');
    act(() => {
      for (let i = 0; i < 55; i++) {
        runs.startRun({ tool: 'image-gen', provider: 'gemini', model: '', prompt: `p${i}` });
      }
    });
    const { result } = renderHook(() => runs.useRuns());
    expect(result.current).toHaveLength(50);
    // newest first — the last-added prompt is p54
    expect(result.current[0].prompt).toBe('p54');
  });

  it('resetRunsForTests empties the store', async () => {
    const runs = await import('@/lib/store/runs');
    act(() => {
      runs.startRun({ tool: 'image-gen', provider: 'gemini', model: '', prompt: 'x' });
    });
    act(() => {
      runs.resetRunsForTests();
    });
    const { result } = renderHook(() => runs.useRuns());
    expect(result.current).toEqual([]);
  });
});

describe('runs store — shape contract (consumers: ComposerStatus, ActionLog)', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_CONVEX_URL;
    vi.resetModules();
  });

  it('CapabilityRunRecord exposes every field the status + log components read', async () => {
    const runs = await import('@/lib/store/runs');
    let id = '';
    act(() => {
      id = runs.startRun({ tool: 'image-gen', provider: 'gemini', model: 'nano-banana', prompt: 'cat on a mat' });
    });
    act(() => {
      runs.stepRun(id, 'placing');
    });
    act(() => {
      runs.finishRun(id, {
        rewrittenPrompt: 'a tabby cat on a colorful mat, soft daylight',
        rationale: 'creator asked for a cat scene',
        aspectRatio: '1:1',
        imageUrl: 'https://example.com/cat.png',
        latencyMs: 8234,
      });
    });
    const { result } = renderHook(() => runs.useRuns());
    const top = result.current[0];
    // ComposerStatus reads: status, step, startedAt, provider, model, latencyMs, error
    expect(top).toEqual(
      expect.objectContaining({
        status: expect.stringMatching(/running|ok|error/),
        startedAt: expect.any(Number),
        provider: expect.any(String),
        model: expect.any(String),
        latencyMs: expect.any(Number),
      })
    );
    // ActionLog reads: id, imageUrl, prompt, rewrittenPrompt, provider, model, aspectRatio, latencyMs
    expect(top).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        imageUrl: expect.any(String),
        prompt: expect.any(String),
        rewrittenPrompt: expect.any(String),
        aspectRatio: expect.any(String),
      })
    );
  });
});

describe('runs store — Convex backend (NEXT_PUBLIC_CONVEX_URL set, useQuery mocked)', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_CONVEX_URL = 'https://example.convex.cloud';
    vi.resetModules();
  });

  it('useRuns returns the CapabilityRunRecord[] emitted by useQuery', async () => {
    const now = Date.now();
    const sample = [
      {
        id: 'run_abc',
        tool: 'image-gen',
        provider: 'gemini',
        model: 'nano-banana',
        prompt: 'a cat',
        rewrittenPrompt: 'a tabby cat',
        rationale: 'user asked',
        aspectRatio: '1:1',
        imageUrl: 'https://x/y.png',
        latencyMs: 1000,
        status: 'ok' as const,
        step: 'done' as const,
        startedAt: now - 1000,
        finishedAt: now,
      },
      {
        id: 'run_def',
        tool: 'image-gen',
        provider: 'gemini',
        model: 'nano-banana',
        prompt: 'a dog',
        status: 'running' as const,
        step: 'sending' as const,
        startedAt: now - 500,
      },
    ];

    const mutationFn = vi.fn(async () => undefined);
    vi.doMock('convex/react', () => ({
      useQuery: vi.fn(() => sample),
      useMutation: vi.fn(() => mutationFn),
      ConvexReactClient: class {
        constructor(_url: string) {}
        mutation() {
          return Promise.resolve();
        }
      },
      ConvexProvider: ({ children }: { children: React.ReactNode }) => children,
    }));

    const runs = await import('@/lib/store/runs');
    const { result } = renderHook(() => runs.useRuns());
    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toMatchObject({
      id: 'run_abc',
      status: 'ok',
      provider: 'gemini',
      model: 'nano-banana',
      prompt: 'a cat',
    });
    expect(result.current[1]).toMatchObject({
      id: 'run_def',
      status: 'running',
      step: 'sending',
    });
  });

  it('useRuns returns [] while the Convex query is loading (undefined)', async () => {
    vi.doMock('convex/react', () => ({
      useQuery: vi.fn(() => undefined),
      useMutation: vi.fn(() => vi.fn()),
      ConvexReactClient: class {
        constructor(_url: string) {}
        mutation() {
          return Promise.resolve();
        }
      },
      ConvexProvider: ({ children }: { children: React.ReactNode }) => children,
    }));

    const runs = await import('@/lib/store/runs');
    const { result } = renderHook(() => runs.useRuns());
    expect(result.current).toEqual([]);
  });
});

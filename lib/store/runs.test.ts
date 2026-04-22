import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  resetRunsForTests,
  failRun,
  finishRun,
  startRun,
  stepRun,
  subscribe,
  useRuns,
} from './runs';

describe('runs store', () => {
  beforeEach(() => {
    resetRunsForTests();
  });

  afterEach(() => {
    resetRunsForTests();
  });

  it('useRuns starts empty', () => {
    const { result } = renderHook(() => useRuns());
    expect(result.current).toEqual([]);
  });

  it('startRun inserts a new record at the head with running status', () => {
    const { result } = renderHook(() => useRuns());
    let id = '';
    act(() => {
      id = startRun({
        tool: 'image-gen',
        provider: 'openai',
        model: 'gpt-image-1',
        prompt: 'hello',
      });
    });
    expect(id).toMatch(/^run_/);
    expect(result.current).toHaveLength(1);
    expect(result.current[0]).toMatchObject({
      id,
      status: 'running',
      prompt: 'hello',
      provider: 'openai',
      model: 'gpt-image-1',
    });
    expect(typeof result.current[0]!.startedAt).toBe('number');
  });

  it('newer runs appear at the head', () => {
    const { result } = renderHook(() => useRuns());
    act(() => {
      startRun({ tool: 't', provider: 'p', model: 'm', prompt: 'a' });
    });
    act(() => {
      startRun({ tool: 't', provider: 'p', model: 'm', prompt: 'b' });
    });
    expect(result.current.map((r) => r.prompt)).toEqual(['b', 'a']);
  });

  it('stepRun updates only the targeted record', () => {
    const { result } = renderHook(() => useRuns());
    let a = '';
    let b = '';
    act(() => {
      a = startRun({ tool: 't', provider: 'p', model: 'm', prompt: 'a' });
      b = startRun({ tool: 't', provider: 'p', model: 'm', prompt: 'b' });
    });
    act(() => {
      stepRun(a, 'sending');
    });
    const ra = result.current.find((r) => r.id === a)!;
    const rb = result.current.find((r) => r.id === b)!;
    expect(ra.step).toBe('sending');
    expect(rb.step).toBeUndefined();
  });

  it('finishRun marks ok, records latency and moves to step=done', () => {
    const { result } = renderHook(() => useRuns());
    let id = '';
    act(() => {
      id = startRun({ tool: 't', provider: 'p', model: 'm', prompt: 'x' });
    });
    act(() => {
      finishRun(id, { provider: 'p', latencyMs: 123, imageUrl: 'u' });
    });
    const r = result.current[0]!;
    expect(r.status).toBe('ok');
    expect(r.latencyMs).toBe(123);
    expect(r.imageUrl).toBe('u');
    expect(r.step).toBe('done');
    expect(typeof r.finishedAt).toBe('number');
  });

  it('failRun surfaces an error message + http status', () => {
    const { result } = renderHook(() => useRuns());
    let id = '';
    act(() => {
      id = startRun({ tool: 't', provider: 'p', model: 'm', prompt: 'x' });
    });
    act(() => {
      failRun(id, 'upstream 502', 502);
    });
    const r = result.current[0]!;
    expect(r.status).toBe('error');
    expect(r.error).toBe('upstream 502');
    expect(r.httpStatus).toBe(502);
  });

  it('startRun caps the log at 50 entries', () => {
    const { result } = renderHook(() => useRuns());
    act(() => {
      for (let i = 0; i < 60; i++) {
        startRun({ tool: 't', provider: 'p', model: 'm', prompt: `p-${i}` });
      }
    });
    expect(result.current).toHaveLength(50);
    // Newest first: head should be the last one we pushed.
    expect(result.current[0]!.prompt).toBe('p-59');
  });

  it('subscribe returns an unsubscribe that stops notifications', () => {
    let tick = 0;
    const unsubscribe = subscribe(() => {
      tick++;
    });
    startRun({ tool: 't', provider: 'p', model: 'm', prompt: 'x' });
    expect(tick).toBeGreaterThan(0);
    const before = tick;
    unsubscribe();
    resetRunsForTests();
    expect(tick).toBe(before);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  recordLapEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/convex/http', () => ({
  recordLapEvent: mocks.recordLapEvent,
}));

import { logLapEvent } from './lap-logger';

describe('logLapEvent', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.recordLapEvent.mockClear();
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('echoes info-level to console.log with tag + message', () => {
    logLapEvent({
      campaignId: 'cmp_1',
      tag: 'ingest.url.ok',
      message: 'fetched eight sleep page',
    });
    expect(logSpy).toHaveBeenCalledOnce();
    expect(logSpy.mock.calls[0]![0] as string).toContain('ingest.url.ok');
    expect(logSpy.mock.calls[0]![0] as string).toContain('fetched eight sleep page');
  });

  it('routes warn level to console.warn', () => {
    logLapEvent({
      campaignId: 'cmp_1',
      tag: 'sam3.one-shot.empty',
      message: 'no masks matched',
      level: 'warn',
    });
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('routes error level to console.error', () => {
    logLapEvent({
      campaignId: 'cmp_1',
      tag: 'atlas.failed',
      message: 'compose threw',
      level: 'error',
    });
    expect(errorSpy).toHaveBeenCalledOnce();
  });

  it('appends variation index suffix to console line when supplied', () => {
    logLapEvent({
      campaignId: 'cmp_1',
      variationIndex: 2,
      tag: 'variation.ready',
      message: 'hero generated',
    });
    expect(logSpy.mock.calls[0]![0] as string).toContain('@v2');
  });

  it('serialises data as a JSON suffix on the console line', () => {
    logLapEvent({
      campaignId: 'cmp_1',
      tag: 'serp.enriched',
      message: 'knowledge graph',
      data: { competitors: 3, latencyMs: 800 },
    });
    expect(logSpy.mock.calls[0]![0] as string).toContain('"competitors":3');
    expect(logSpy.mock.calls[0]![0] as string).toContain('"latencyMs":800');
  });

  it('persists to Convex when campaignId is supplied', () => {
    logLapEvent({
      campaignId: 'cmp_1',
      tag: 'lap.start',
      message: 'kickoff',
    });
    expect(mocks.recordLapEvent).toHaveBeenCalledOnce();
    const call = mocks.recordLapEvent.mock.calls[0]![0];
    expect(call.campaignId).toBe('cmp_1');
    expect(call.tag).toBe('lap.start');
    expect(call.level).toBe('info');
    expect(typeof call.ts).toBe('number');
  });

  it('skips Convex persistence when campaignId is null', () => {
    logLapEvent({
      campaignId: null,
      tag: 'lap.start',
      message: 'local-only',
    });
    expect(mocks.recordLapEvent).not.toHaveBeenCalled();
  });

  it('does not throw when Convex recordLapEvent rejects (fail-soft)', async () => {
    mocks.recordLapEvent.mockRejectedValueOnce(new Error('convex down'));
    expect(() =>
      logLapEvent({ campaignId: 'cmp_1', tag: 'x', message: 'y' })
    ).not.toThrow();
    // wait microtask for the rejected promise to settle without crashing
    await Promise.resolve();
  });
});

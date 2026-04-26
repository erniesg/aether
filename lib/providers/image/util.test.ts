import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dimsFromAspect, fetchWithTimeout, mark } from './util';

describe('dimsFromAspect', () => {
  const cases: Array<[string, { w: number; h: number }]> = [
    ['1:1', { w: 1024, h: 1024 }],
    ['9:16', { w: 1152, h: 2048 }],
    ['16:9', { w: 2048, h: 1152 }],
    ['4:3', { w: 1152, h: 864 }],
    ['3:4', { w: 864, h: 1152 }],
    ['4:5', { w: 1024, h: 1280 }],
    ['2:3', { w: 1024, h: 1536 }],
    ['3:2', { w: 1536, h: 1024 }],
  ];

  for (const [ratio, dims] of cases) {
    it(`maps ${ratio} to the canonical dimensions`, () => {
      expect(dimsFromAspect(ratio as never)).toEqual(dims);
    });
  }

  it('returns the fallback for undefined / unknown ratios', () => {
    expect(dimsFromAspect(undefined)).toEqual({ w: 1024, h: 1024 });
    expect(dimsFromAspect('custom')).toEqual({ w: 1024, h: 1024 });
    expect(dimsFromAspect(undefined, { w: 512, h: 512 })).toEqual({ w: 512, h: 512 });
  });
});

describe('mark', () => {
  it('returns elapsed milliseconds since mark()', async () => {
    const elapsed = mark();
    await new Promise((r) => setTimeout(r, 5));
    const ms = elapsed();
    expect(ms).toBeGreaterThanOrEqual(0);
    expect(ms).toBeLessThan(1000);
  });
});

describe('fetchWithTimeout', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('forwards init + signal to fetch and returns the response', async () => {
    fetchMock.mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const res = await fetchWithTimeout('https://api.example.com/x', {
      method: 'POST',
      headers: { 'X-Test': '1' },
      body: '{}',
    });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['X-Test']).toBe('1');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});

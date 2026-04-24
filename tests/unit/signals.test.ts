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
  window.localStorage.clear();
});

describe('signals store — in-memory fallback (NEXT_PUBLIC_CONVEX_URL unset)', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_CONVEX_URL;
    window.localStorage.clear();
    vi.resetModules();
  });

  it('useSignals starts empty; addSignal appends records by kind', async () => {
    const store = await import('@/lib/signals/store');
    store.resetSignalsForTests();

    const { result } = renderHook(() => store.useSignals());
    expect(result.current).toEqual([]);

    act(() => {
      store.addSignal('keyword', 'clean girl aesthetic');
      store.addSignal('hashtag', '#goldenhour');
      store.addSignal('account', '@solsticeskin');
    });

    expect(result.current).toHaveLength(3);
    expect(result.current.map((r) => r.kind)).toEqual(['keyword', 'hashtag', 'account']);
  });

  it('addSignal strips the leading marker on hashtags and accounts', async () => {
    const store = await import('@/lib/signals/store');
    store.resetSignalsForTests();

    const { result } = renderHook(() => store.useSignals());
    act(() => {
      store.addSignal('hashtag', '#cleangirl');
      store.addSignal('account', '@drunkelephant');
    });

    const tags = result.current.filter((r) => r.kind === 'hashtag');
    const handles = result.current.filter((r) => r.kind === 'account');
    expect(tags[0].value).toBe('cleangirl');
    expect(handles[0].value).toBe('drunkelephant');
  });

  it('addSignal is a noop for blank input and dedupes duplicates within a kind', async () => {
    const store = await import('@/lib/signals/store');
    store.resetSignalsForTests();

    const { result } = renderHook(() => store.useSignals());
    act(() => {
      store.addSignal('keyword', '   ');
      store.addSignal('keyword', 'ceramide');
      store.addSignal('keyword', 'ceramide');
    });
    expect(result.current).toHaveLength(1);
  });

  it('removeSignal drops the record', async () => {
    const store = await import('@/lib/signals/store');
    store.resetSignalsForTests();
    let id = '';
    act(() => {
      id = store.addSignal('hashtag', 'cleanbeauty') ?? '';
    });
    const { result } = renderHook(() => store.useSignals());
    expect(result.current).toHaveLength(1);
    act(() => {
      store.removeSignal(id);
    });
    expect(result.current).toHaveLength(0);
  });

  it('muteSignal sets mutedUntil in the future; unmuteSignal clears it', async () => {
    const store = await import('@/lib/signals/store');
    store.resetSignalsForTests();
    let id = '';
    act(() => {
      id = store.addSignal('account', 'competitor') ?? '';
    });
    const { result } = renderHook(() => store.useSignals());
    act(() => {
      store.muteSignal(id);
    });
    const muted = result.current[0];
    expect(muted.mutedUntil).toBeDefined();
    expect(muted.mutedUntil! > Date.now()).toBe(true);
    expect(store.isMuted(muted)).toBe(true);

    act(() => {
      store.unmuteSignal(id);
    });
    expect(result.current[0].mutedUntil).toBeUndefined();
    expect(store.isMuted(result.current[0])).toBe(false);
  });

  it('persists across a module reload via localStorage', async () => {
    const first = await import('@/lib/signals/store');
    first.resetSignalsForTests();
    act(() => {
      first.addSignal('keyword', 'slow morning');
    });
    vi.resetModules();
    const second = await import('@/lib/signals/store');
    const { result } = renderHook(() => second.useSignals());
    expect(result.current).toHaveLength(1);
    expect(result.current[0].value).toBe('slow morning');
  });

  it('displaySignalValue prefixes hashtags and accounts', async () => {
    const { displaySignalValue } = await import('@/lib/signals/store');
    expect(
      displaySignalValue({ kind: 'hashtag', value: 'goldenhour' })
    ).toBe('#goldenhour');
    expect(
      displaySignalValue({ kind: 'account', value: 'solsticeskin' })
    ).toBe('@solsticeskin');
    expect(
      displaySignalValue({ kind: 'keyword', value: 'clean girl' })
    ).toBe('clean girl');
  });

  it('summarizeSignals counts live and muted records against a reference clock', async () => {
    const store = await import('@/lib/signals/store');
    const now = 1_700_000_000_000;
    const records = [
      { id: '1', kind: 'keyword' as const, value: 'a', addedAt: 0 },
      { id: '2', kind: 'keyword' as const, value: 'b', addedAt: 0, mutedUntil: now + 1000 },
      { id: '3', kind: 'hashtag' as const, value: 'c', addedAt: 0, mutedUntil: now - 1000 },
    ];
    expect(store.summarizeSignals(records, now)).toEqual({ live: 2, muted: 1, total: 3 });
  });
});

describe('signals store — Convex backend (NEXT_PUBLIC_CONVEX_URL set, useQuery mocked)', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_CONVEX_URL = 'https://example.convex.cloud';
    vi.resetModules();
  });

  it('useSignals returns the SignalRecord[] emitted by useQuery', async () => {
    const sample = [
      { id: 'sig_1', kind: 'keyword' as const, value: 'ceramide', addedAt: 1 },
      { id: 'sig_2', kind: 'hashtag' as const, value: 'goldenhour', addedAt: 2 },
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

    const store = await import('@/lib/signals/store');
    const { result } = renderHook(() => store.useSignals());
    expect(result.current).toEqual(sample);
  });

  it('useSignals returns [] while the Convex query is loading (undefined)', async () => {
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

    const store = await import('@/lib/signals/store');
    const { result } = renderHook(() => store.useSignals());
    expect(result.current).toEqual([]);
  });
});

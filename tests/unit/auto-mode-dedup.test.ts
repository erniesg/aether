/**
 * Bug 2 regression — auto-mode lap fires TWICE on a single URL drop.
 *
 * The drop/paste handlers share a `lastFired` closure guard that skips any
 * identical URL fired within 5 seconds of the previous fire. This test
 * verifies the dedup logic in isolation (pure function extracted from the
 * effect closure pattern).
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// ── Pure dedup helper (mirrors the closure in WorkspaceShell) ──────────────

const DEDUP_WINDOW_MS = 5_000;

function makeDeduper() {
  const lastFired = { url: '', firedAt: 0 };
  return function deduped(url: string, now = Date.now()): boolean {
    if (url === lastFired.url && now - lastFired.firedAt < DEDUP_WINDOW_MS) {
      return true; // duplicate — skip
    }
    lastFired.url = url;
    lastFired.firedAt = now;
    return false;
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('auto-mode lap dedup guard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows the first fire for a URL', () => {
    const deduped = makeDeduper();
    expect(deduped('https://eightsleep.com', 1000)).toBe(false);
  });

  it('blocks a second fire of the same URL within 5 s', () => {
    const deduped = makeDeduper();
    deduped('https://eightsleep.com', 1000); // first fire
    // Second fire 10 ms later — same URL, within dedup window → blocked
    expect(deduped('https://eightsleep.com', 1010)).toBe(true);
  });

  it('allows a second fire of the same URL after 5 s', () => {
    const deduped = makeDeduper();
    deduped('https://eightsleep.com', 1000); // first fire
    // 5001 ms later — outside dedup window → allowed
    expect(deduped('https://eightsleep.com', 1000 + DEDUP_WINDOW_MS + 1)).toBe(false);
  });

  it('allows a different URL to fire immediately after the first', () => {
    const deduped = makeDeduper();
    deduped('https://eightsleep.com', 1000);
    // Different URL → always allowed regardless of timing
    expect(deduped('https://eightsleepdifferent.com', 1010)).toBe(false);
  });

  it('simulates drop + synthesised paste within 5 s — only first fires', () => {
    const deduped = makeDeduper();
    const url = 'https://eightsleep.com/products/pod-4-ultra';

    // Drop fires first
    const firstResult = deduped(url, 0);
    // Browser synthesises a paste for the same drag content a few ms later
    const secondResult = deduped(url, 50);

    expect(firstResult).toBe(false); // first → fires lap
    expect(secondResult).toBe(true); // second → skipped
  });

  it('after the dedup window expires a fresh drop on the same URL creates a new lap', () => {
    const deduped = makeDeduper();
    const url = 'https://eightsleep.com/products/pod-4-ultra';

    deduped(url, 0);           // lap 1 fires
    deduped(url, 50);          // deduped
    // User drops the same URL 6 s later — intentional second lap
    const thirdResult = deduped(url, 6_000);
    expect(thirdResult).toBe(false); // lap 2 fires
  });
});

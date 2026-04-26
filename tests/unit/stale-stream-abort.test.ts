/**
 * Bug 3 regression — "stale stream or user cancel" shown as an error for
 * long-running auto-mode laps.
 *
 * The fix: track `staleAborted` so the catch block can distinguish between
 * - stale-timer abort  → neutral tone, "stream disconnected (server continues)"
 * - user cancel        → error tone, "aborted (user cancel)"
 *
 * This file tests the logic pattern in isolation. The WorkspaceShell component
 * is not importable in vitest (depends on tldraw / Next.js), so we replicate
 * the minimal state machine that the catch handler depends on.
 */

import { describe, expect, it } from 'vitest';

// ── Replicated state machine (mirrors WorkspaceShell runImageOnCanvas) ────

type ActivityRecord = { title: string; detail?: string; tone: 'neutral' | 'ok' | 'error' };
type RunOutcome = { failMessage: string; activities: ActivityRecord[] };

function simulateCatch(opts: {
  staleAborted: boolean;
  error: Error;
}): RunOutcome {
  const activities: ActivityRecord[] = [];
  let failMessage = '';

  const { staleAborted, error } = opts;
  const aborted = error instanceof DOMException && error.name === 'AbortError';

  if (aborted && staleAborted) {
    activities.push({
      title: 'stream disconnected',
      detail: 'client timed out waiting for events — server-side work continues',
      tone: 'neutral',
    });
    failMessage = 'stream disconnected (server-side work continues)';
  } else {
    const message = aborted
      ? 'aborted (user cancel)'
      : error.message;
    activities.push({
      title: aborted ? 'generation cancelled' : 'request failed',
      detail: message,
      tone: 'error',
    });
    failMessage = aborted ? message : `fetch failed: ${message}`;
  }

  return { failMessage, activities };
}

function makeAbortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError');
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('stale-stream abort classification', () => {
  it('stale-timer abort → neutral tone, non-error message', () => {
    const outcome = simulateCatch({ staleAborted: true, error: makeAbortError() });
    expect(outcome.activities[0]?.tone).toBe('neutral');
    expect(outcome.activities[0]?.title).toBe('stream disconnected');
    expect(outcome.failMessage).toContain('server-side work continues');
    expect(outcome.failMessage).not.toContain('error');
  });

  it('user cancel (no stale timer) → error tone, "user cancel" message', () => {
    const outcome = simulateCatch({ staleAborted: false, error: makeAbortError() });
    expect(outcome.activities[0]?.tone).toBe('error');
    expect(outcome.activities[0]?.title).toBe('generation cancelled');
    expect(outcome.failMessage).toBe('aborted (user cancel)');
  });

  it('non-abort error → error tone, original error message', () => {
    const outcome = simulateCatch({
      staleAborted: false,
      error: new Error('network failure'),
    });
    expect(outcome.activities[0]?.tone).toBe('error');
    expect(outcome.activities[0]?.title).toBe('request failed');
    expect(outcome.failMessage).toContain('network failure');
  });

  it('old "stale stream or user cancel" message no longer appears', () => {
    const staleOutcome = simulateCatch({ staleAborted: true, error: makeAbortError() });
    const userOutcome = simulateCatch({ staleAborted: false, error: makeAbortError() });
    const oldMessage = 'stale stream or user cancel';
    expect(staleOutcome.failMessage).not.toContain(oldMessage);
    expect(userOutcome.failMessage).not.toContain(oldMessage);
    expect(staleOutcome.activities[0]?.detail).not.toContain(oldMessage);
    expect(userOutcome.activities[0]?.detail).not.toContain(oldMessage);
  });
});

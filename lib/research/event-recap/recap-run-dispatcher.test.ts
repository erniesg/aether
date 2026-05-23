import { describe, expect, it } from 'vitest';
import {
  dispatchRecapRunAction,
  type DispatchResult,
} from './recap-run-dispatcher';
import { createRecapRunState } from './recap-run-state';

describe('recap-run-dispatcher (slice 10 — route logic)', () => {
  it('initializes a fresh state when action is "initialize"', () => {
    const result = dispatchRecapRunAction(null, {
      action: 'initialize',
      eventId: 'aie-2026',
      runId: 'run-xyz',
      mode: 'hitl',
    });
    expect(result.ok).toBe(true);
    expect(result.state?.eventId).toBe('aie-2026');
    expect(result.state?.runId).toBe('run-xyz');
    expect(result.state?.mode).toBe('hitl');
    expect(result.state?.currentJuncture).toBe('A');
  });

  it('rejects "initialize" when a state already exists', () => {
    const existing = createRecapRunState({ eventId: 'aie-2026', runId: 'run-xyz', mode: 'hitl' });
    const result = dispatchRecapRunAction(existing, {
      action: 'initialize',
      eventId: 'aie-2026',
      runId: 'run-xyz',
      mode: 'hitl',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/already initialized/i);
  });

  it('requests juncture approval in HITL mode', () => {
    const existing = createRecapRunState({ eventId: 'aie-2026', runId: 'run-1', mode: 'hitl' });
    const result = dispatchRecapRunAction(existing, {
      action: 'request',
      junctureId: 'A',
      evidence: { theses: ['T1', 'T2'] },
      actor: 'system',
    });
    expect(result.ok).toBe(true);
    expect(result.state?.junctures.A.status).toBe('awaiting_review');
  });

  it('records an approval and advances the cursor', () => {
    let state = createRecapRunState({ eventId: 'aie-2026', runId: 'run-1', mode: 'hitl' });
    const requested = dispatchRecapRunAction(state, {
      action: 'request',
      junctureId: 'A',
      evidence: {},
      actor: 'system',
    });
    expect(requested.ok).toBe(true);

    const approved = dispatchRecapRunAction(requested.state!, {
      action: 'decide',
      junctureId: 'A',
      decision: 'approved',
      rationale: 'theses look balanced',
      actor: 'ernie',
    });
    expect(approved.ok).toBe(true);
    expect(approved.state?.junctures.A.status).toBe('approved');
    expect(approved.state?.currentJuncture).toBe('B');
  });

  it('auto-approves in auto mode', () => {
    const state = createRecapRunState({ eventId: 'aie-2026', runId: 'run-2', mode: 'auto' });
    const result = dispatchRecapRunAction(state, {
      action: 'auto-approve',
      junctureId: 'A',
      evidence: { picked: 'T2', rubric_total: 11 },
    });
    expect(result.ok).toBe(true);
    expect(result.state?.junctures.A.status).toBe('approved');
    expect(result.state?.currentJuncture).toBe('B');
  });

  it('rejects unknown actions', () => {
    const state = createRecapRunState({ eventId: 'aie-2026', runId: 'run-3', mode: 'hitl' });
    const result = dispatchRecapRunAction(state, {
      // @ts-expect-error — intentional unknown action for the test
      action: 'unknown',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unknown action/i);
  });

  it('rejects actions on non-existent run', () => {
    const result = dispatchRecapRunAction(null, {
      action: 'request',
      junctureId: 'A',
      evidence: {},
      actor: 'system',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no state/i);
  });

  it('surfaces state-machine errors via DispatchResult.error', () => {
    // Calling request in auto mode throws inside the state machine.
    const state = createRecapRunState({ eventId: 'aie-2026', runId: 'run-4', mode: 'auto' });
    const result = dispatchRecapRunAction(state, {
      action: 'request',
      junctureId: 'A',
      evidence: {},
      actor: 'system',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/auto mode/i);
  });
});

// Type-level guard: DispatchResult is the documented contract
const _expectedShape: DispatchResult = { ok: true };
void _expectedShape;

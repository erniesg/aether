import { describe, expect, it } from 'vitest';
import {
  createRecapRunState,
  autoApproveJuncture,
  requestJunctureApproval,
  recordJunctureDecision,
  canAdvanceFrom,
  nextJuncture,
  JUNCTURE_SEQUENCE,
  type JunctureId,
  type RecapRunState,
} from './recap-run-state';

const init = (mode: 'auto' | 'hitl' = 'hitl'): RecapRunState =>
  createRecapRunState({ eventId: 'aie-2026', runId: 'run-1', mode });

describe('recap run state machine (slice 6)', () => {
  it('creates a fresh state with all five junctures in pending status', () => {
    const state = init('hitl');
    expect(state.eventId).toBe('aie-2026');
    expect(state.runId).toBe('run-1');
    expect(state.mode).toBe('hitl');
    expect(state.currentJuncture).toBe('A');
    expect(Object.keys(state.junctures)).toEqual(['A', 'B', 'C', 'D', 'E']);
    for (const j of JUNCTURE_SEQUENCE) {
      expect(state.junctures[j].status).toBe('pending');
    }
    expect(state.auditLog).toEqual([]);
  });

  describe('HITL mode', () => {
    it('moves a juncture to awaiting_review when approval is requested', () => {
      let state = init('hitl');
      state = requestJunctureApproval(state, 'A', { theses: ['T1', 'T2', 'T3'] }, 'system');
      expect(state.junctures.A.status).toBe('awaiting_review');
      expect(state.junctures.A.evidence).toEqual({ theses: ['T1', 'T2', 'T3'] });
      expect(canAdvanceFrom(state, 'A')).toBe(false);
      expect(state.auditLog).toHaveLength(1);
      expect(state.auditLog[0]).toMatchObject({ junctureId: 'A', event: 'requested', actor: 'system' });
    });

    it('approves and advances the cursor when the analyst records an approval', () => {
      let state = init('hitl');
      state = requestJunctureApproval(state, 'A', { theses: ['T1'] }, 'system');
      state = recordJunctureDecision(state, 'A', 'approved', 'theses look balanced', 'ernie');

      expect(state.junctures.A.status).toBe('approved');
      expect(state.junctures.A.decision).toBe('approved');
      expect(state.junctures.A.rationale).toBe('theses look balanced');
      expect(state.junctures.A.actor).toBe('ernie');
      expect(canAdvanceFrom(state, 'A')).toBe(true);
      expect(state.currentJuncture).toBe('B');
      expect(state.auditLog).toHaveLength(2);
      expect(state.auditLog[1]).toMatchObject({ junctureId: 'A', event: 'approved', actor: 'ernie' });
    });

    it('rejects a juncture and keeps the cursor on it', () => {
      let state = init('hitl');
      state = requestJunctureApproval(state, 'A', {}, 'system');
      state = recordJunctureDecision(state, 'A', 'rejected', 'T1 is sponsor-PR-shaped', 'ernie');

      expect(state.junctures.A.status).toBe('rejected');
      expect(canAdvanceFrom(state, 'A')).toBe(false);
      expect(state.currentJuncture).toBe('A'); // not advanced
    });

    it('runs through all 5 junctures in order via HITL approvals', () => {
      let state = init('hitl');
      for (const id of JUNCTURE_SEQUENCE) {
        state = requestJunctureApproval(state, id, {}, 'system');
        state = recordJunctureDecision(state, id, 'approved', `ok at ${id}`, 'ernie');
      }
      expect(state.currentJuncture).toBe('done');
      expect(state.auditLog).toHaveLength(10); // 5 requests + 5 approvals
      for (const id of JUNCTURE_SEQUENCE) {
        expect(state.junctures[id].status).toBe('approved');
      }
    });
  });

  describe('full-auto mode', () => {
    it('auto-approves a juncture without analyst input and advances', () => {
      let state = init('auto');
      state = autoApproveJuncture(state, 'A', { theses: ['T1', 'T2', 'T3'], picked: 'T2', rubric_total: 11 });

      expect(state.junctures.A.status).toBe('approved');
      expect(state.junctures.A.actor).toBe('auto');
      expect(state.junctures.A.evidence).toMatchObject({ picked: 'T2' });
      expect(canAdvanceFrom(state, 'A')).toBe(true);
      expect(state.currentJuncture).toBe('B');
      expect(state.auditLog).toHaveLength(1);
      expect(state.auditLog[0]).toMatchObject({ event: 'auto_decided', junctureId: 'A' });
    });

    it('runs straight through 5 junctures with evidence logged for audit', () => {
      let state = init('auto');
      for (const id of JUNCTURE_SEQUENCE) {
        state = autoApproveJuncture(state, id, { junctureId: id, score: 10 });
      }
      expect(state.currentJuncture).toBe('done');
      expect(state.auditLog).toHaveLength(5);
      expect(state.auditLog.every((e) => e.event === 'auto_decided')).toBe(true);
    });
  });

  describe('juncture sequence', () => {
    it('advances A → B → C → D → E → done', () => {
      expect(nextJuncture('A')).toBe('B');
      expect(nextJuncture('B')).toBe('C');
      expect(nextJuncture('C')).toBe('D');
      expect(nextJuncture('D')).toBe('E');
      expect(nextJuncture('E')).toBe('done');
    });
  });

  describe('mode-juncture mismatches are rejected', () => {
    it('refuses requestJunctureApproval in auto mode', () => {
      const state = init('auto');
      expect(() => requestJunctureApproval(state, 'A', {}, 'system')).toThrow(/auto mode/i);
    });

    it('refuses autoApproveJuncture in hitl mode', () => {
      const state = init('hitl');
      expect(() => autoApproveJuncture(state, 'A', {})).toThrow(/hitl mode/i);
    });

    it('refuses out-of-order approvals', () => {
      let state = init('hitl');
      expect(() => recordJunctureDecision(state, 'A', 'approved', 'x', 'ernie')).toThrow(/not awaiting review/i);
    });
  });
});

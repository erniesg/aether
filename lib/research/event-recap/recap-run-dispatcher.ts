/**
 * Pure request → state-transition dispatcher for the recap run API.
 *
 * Sits between the REST/Convex layer and the pure state machine so the
 * route handler stays thin: it loads the current state, calls
 * dispatchRecapRunAction(state, request), persists the result. The
 * dispatch logic itself has no I/O — easy to unit-test.
 */

import {
  createRecapRunState,
  requestJunctureApproval,
  recordJunctureDecision,
  autoApproveJuncture,
  type JunctureId,
  type Decision,
  type RecapMode,
  type RecapRunState,
} from './recap-run-state';

export type DispatchAction =
  | {
      action: 'initialize';
      eventId: string;
      runId: string;
      mode: RecapMode;
    }
  | {
      action: 'request';
      junctureId: JunctureId;
      evidence: unknown;
      actor?: string;
    }
  | {
      action: 'decide';
      junctureId: JunctureId;
      decision: Decision;
      rationale: string;
      actor: string;
    }
  | {
      action: 'auto-approve';
      junctureId: JunctureId;
      evidence: unknown;
      rationale?: string;
    };

export interface DispatchResult {
  ok: boolean;
  state?: RecapRunState;
  error?: string;
}

export function dispatchRecapRunAction(
  current: RecapRunState | null,
  action: DispatchAction
): DispatchResult {
  try {
    if (action.action === 'initialize') {
      if (current) {
        return { ok: false, error: 'run already initialized' };
      }
      const fresh = createRecapRunState({
        eventId: action.eventId,
        runId: action.runId,
        mode: action.mode,
      });
      return { ok: true, state: fresh };
    }

    if (!current) {
      return { ok: false, error: 'no state — initialize first' };
    }

    if (action.action === 'request') {
      const next = requestJunctureApproval(
        current,
        action.junctureId,
        action.evidence,
        action.actor ?? 'system'
      );
      return { ok: true, state: next };
    }

    if (action.action === 'decide') {
      const next = recordJunctureDecision(
        current,
        action.junctureId,
        action.decision,
        action.rationale,
        action.actor
      );
      return { ok: true, state: next };
    }

    if (action.action === 'auto-approve') {
      const next = autoApproveJuncture(
        current,
        action.junctureId,
        action.evidence,
        action.rationale
      );
      return { ok: true, state: next };
    }

    return { ok: false, error: `unknown action: ${(action as { action: string }).action}` };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

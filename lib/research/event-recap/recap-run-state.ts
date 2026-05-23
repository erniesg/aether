/**
 * State machine for the event-recap loop's HITL pauses + audit log.
 *
 * Five critical junctures (A-E) gate progress; see
 * docs/playbooks/event-recap/references/human-loop-junctures.md.
 *
 *  A — hypothesize: review 1-3 candidate theses
 *  B — balance check: pick which under-evidenced angles to top up
 *  C — author stories: review signal regex + weights
 *  D — land thesis: approve landed/synthesized thesis
 *  E — synthesize: review final lede + per-angle copy
 *
 * Full-auto mode runs each juncture through `autoApproveJuncture` and
 * logs the decision + evidence to the audit log without analyst input.
 * HITL mode calls `requestJunctureApproval` to mark the juncture
 * awaiting_review, then `recordJunctureDecision` once the analyst
 * approves or rejects.
 *
 * This module is pure data + pure functions. Convex persistence wraps
 * around it but isn't part of this module.
 */

export type JunctureId = 'A' | 'B' | 'C' | 'D' | 'E';
export type JunctureStatus = 'pending' | 'awaiting_review' | 'approved' | 'rejected' | 'skipped';
export type Decision = 'approved' | 'rejected';
export type RecapMode = 'auto' | 'hitl';

export const JUNCTURE_SEQUENCE: readonly JunctureId[] = ['A', 'B', 'C', 'D', 'E'] as const;

export interface JunctureState {
  id: JunctureId;
  status: JunctureStatus;
  evidence?: unknown;
  decision?: Decision;
  rationale?: string;
  actor?: string;
  decidedAt?: number;
}

export type AuditEvent =
  | 'requested'
  | 'approved'
  | 'rejected'
  | 'auto_decided'
  | 'skipped';

export interface AuditLogEntry {
  junctureId: JunctureId;
  event: AuditEvent;
  evidence?: unknown;
  decision?: Decision;
  rationale?: string;
  actor: string;
  timestamp: number;
}

export interface RecapRunState {
  eventId: string;
  runId: string;
  mode: RecapMode;
  junctures: Record<JunctureId, JunctureState>;
  currentJuncture: JunctureId | 'done';
  auditLog: AuditLogEntry[];
}

export function createRecapRunState(input: {
  eventId: string;
  runId: string;
  mode: RecapMode;
}): RecapRunState {
  return {
    eventId: input.eventId,
    runId: input.runId,
    mode: input.mode,
    currentJuncture: 'A',
    junctures: JUNCTURE_SEQUENCE.reduce(
      (acc, id) => ({
        ...acc,
        [id]: { id, status: 'pending' as const },
      }),
      {} as Record<JunctureId, JunctureState>
    ),
    auditLog: [],
  };
}

export function nextJuncture(id: JunctureId): JunctureId | 'done' {
  const index = JUNCTURE_SEQUENCE.indexOf(id);
  if (index < 0 || index === JUNCTURE_SEQUENCE.length - 1) return 'done';
  return JUNCTURE_SEQUENCE[index + 1];
}

/**
 * HITL: present this juncture's evidence and pause. Moves status to
 * awaiting_review. The analyst then calls recordJunctureDecision.
 */
export function requestJunctureApproval(
  state: RecapRunState,
  junctureId: JunctureId,
  evidence: unknown,
  actor: string = 'system'
): RecapRunState {
  if (state.mode === 'auto') {
    throw new Error(`requestJunctureApproval called in auto mode; use autoApproveJuncture instead`);
  }
  const juncture = state.junctures[junctureId];
  const updated: JunctureState = { ...juncture, status: 'awaiting_review', evidence };
  return {
    ...state,
    junctures: { ...state.junctures, [junctureId]: updated },
    auditLog: [
      ...state.auditLog,
      { junctureId, event: 'requested', evidence, actor, timestamp: Date.now() },
    ],
  };
}

/**
 * HITL: analyst records approval/rejection. Approval advances the cursor;
 * rejection keeps the cursor on this juncture so the analyst can request
 * a fresh round of evidence.
 */
export function recordJunctureDecision(
  state: RecapRunState,
  junctureId: JunctureId,
  decision: Decision,
  rationale: string,
  actor: string
): RecapRunState {
  if (state.mode === 'auto') {
    throw new Error(`recordJunctureDecision called in auto mode`);
  }
  const juncture = state.junctures[junctureId];
  if (juncture.status !== 'awaiting_review') {
    throw new Error(`Juncture ${junctureId} is not awaiting review (status: ${juncture.status})`);
  }
  const now = Date.now();
  const updated: JunctureState = {
    ...juncture,
    status: decision,
    decision,
    rationale,
    actor,
    decidedAt: now,
  };
  const advanced = decision === 'approved' && state.currentJuncture === junctureId;
  return {
    ...state,
    currentJuncture: advanced ? nextJuncture(junctureId) : state.currentJuncture,
    junctures: { ...state.junctures, [junctureId]: updated },
    auditLog: [
      ...state.auditLog,
      {
        junctureId,
        event: decision,
        decision,
        rationale,
        actor,
        timestamp: now,
      },
    ],
  };
}

/**
 * Auto mode: record an auto-approval with the evidence the agent used.
 * Advances the cursor immediately.
 */
export function autoApproveJuncture(
  state: RecapRunState,
  junctureId: JunctureId,
  evidence: unknown,
  rationale?: string
): RecapRunState {
  if (state.mode === 'hitl') {
    throw new Error(`autoApproveJuncture called in hitl mode; use requestJunctureApproval + recordJunctureDecision`);
  }
  const juncture = state.junctures[junctureId];
  const now = Date.now();
  const updated: JunctureState = {
    ...juncture,
    status: 'approved',
    decision: 'approved',
    evidence,
    rationale,
    actor: 'auto',
    decidedAt: now,
  };
  const advanced = state.currentJuncture === junctureId;
  return {
    ...state,
    currentJuncture: advanced ? nextJuncture(junctureId) : state.currentJuncture,
    junctures: { ...state.junctures, [junctureId]: updated },
    auditLog: [
      ...state.auditLog,
      {
        junctureId,
        event: 'auto_decided',
        decision: 'approved',
        evidence,
        rationale,
        actor: 'auto',
        timestamp: now,
      },
    ],
  };
}

/**
 * Pre-flight check: can the pipeline advance past this juncture?
 * True when the juncture is approved (or skipped); false otherwise.
 */
export function canAdvanceFrom(state: RecapRunState, junctureId: JunctureId): boolean {
  const status = state.junctures[junctureId].status;
  return status === 'approved' || status === 'skipped';
}

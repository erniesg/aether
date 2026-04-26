import type { CapabilityEntryRef } from '@/lib/capability/entry';
import type { ArtifactKind } from '@/lib/tool/registry';

/**
 * Canonical error string written by `abortStuckRuns` across memory and Convex
 * paths. UI histories filter this out so stale-abort noise never hides the
 * creator's last useful run status.
 */
export const STALE_ABORT_ERROR = 'aborted: run exceeded inactivity threshold';

export type RunStatus = 'running' | 'ok' | 'error' | 'draft-executor';

export type RunStep =
  | 'prepared'
  | 'sending'
  | 'awaiting'
  | 'received'
  | 'parsing'
  | 'placing'
  | 'done';

export interface CapabilityRunRecord {
  id: string;
  tool: string;
  provider: string;
  model: string;
  prompt: string;
  artifactKind?: ArtifactKind;
  outputFormat?: 'particle-field' | 'gaussian-splat';
  quality?: 'draft' | 'standard' | 'high';
  sourceMode?: 'selected-image';
  sourceImageShapeId?: string;
  rewrittenPrompt?: string;
  rationale?: string;
  aspectRatio?: string;
  imageUrl?: string;
  latencyMs?: number;
  status: RunStatus;
  step?: RunStep;
  startedAt: number;
  finishedAt?: number;
  error?: string;
  httpStatus?: number;
  /** Present when the run was spawned by a pinned capability (Phase 5 re-run). */
  definitionId?: string;
  definitionVersion?: number;
  entryRef?: CapabilityEntryRef;
}

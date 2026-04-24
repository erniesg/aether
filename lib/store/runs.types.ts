import type { CapabilityEntryRef, CapabilityScope } from '@/lib/capability/entry';

export type RunStatus = 'running' | 'ok' | 'error';

export type RunStep =
  | 'prepared'
  | 'sending'
  | 'awaiting'
  | 'received'
  | 'parsing'
  | 'placing'
  | 'done';

export interface CapabilityRunInputs {
  prompt?: string;
  refs?: string[];
  sceneKind?: string;
  [key: string]: unknown;
}

export interface CapabilityRunRecord {
  id: string;
  tool: string;
  provider: string;
  model: string;
  prompt: string;
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
  entryRef?: CapabilityEntryRef;
  inputs?: CapabilityRunInputs;
  artifactKind?: 'image' | 'video' | 'audio' | 'spatial';
  outputRefs?: string[];
  scope?: CapabilityScope;
  publishedVersion?: number;
}

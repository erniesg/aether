import type { CapabilityEntryRef } from '@/lib/capability/entry';

export type RunStatus = 'running' | 'ok' | 'error';

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
  artifactKind?: 'image' | 'spatial' | 'video' | 'audio';
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
  /**
   * Input payload recorded for runs that started with user-picked references
   * (air-brush sketches, clipboard images, layout-guard copy, etc). Widened
   * from 410bb14 so WorkspaceShell can record what went into a run. Kept
   * intentionally loose — each run type owns its own shape.
   */
  inputs?: {
    refs?: string[];
    [key: string]: unknown;
  };
  /** Logical scope the run was spawned against. */
  scope?: 'workspace' | 'team' | string;
  /** Output refs the run produced — URLs, asset ids, etc. */
  outputRefs?: string[];
}

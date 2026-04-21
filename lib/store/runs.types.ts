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
}

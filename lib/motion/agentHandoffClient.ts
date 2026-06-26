import type { WorkspaceProviderPrefs } from '@/lib/providers/prefs';
import type { AgentMotionStartResult } from './start';

export interface MotionAgentHandoffClientStep {
  templateId: string;
  label: string;
  route: string;
  method: 'POST';
  missingPlaceholders: string[];
  status: 'skipped' | 'complete' | 'failed';
  responseStatus: number | null;
  responseJson: Record<string, unknown> | null;
}

export interface MotionAgentHandoffClientResult {
  ok?: boolean;
  error?: string;
  status: 'complete' | 'blocked' | 'failed';
  projectId?: string;
  finalProject?: unknown;
  finalResponse?: Record<string, unknown> | null;
  steps?: MotionAgentHandoffClientStep[];
}

export interface MotionAgentHandoffClientInput {
  imageToVideoProviderId?: string;
  voiceProviderId?: string;
  renderProviderId?: string;
  editedSourceFiles?: unknown;
}

export async function runMotionAgentHandoffFromStart(
  result: AgentMotionStartResult,
  options: {
    templateIds?: string[];
    input?: MotionAgentHandoffClientInput;
  } = {}
): Promise<MotionAgentHandoffClientResult> {
  if (!result.agentHandoff || !result.project) {
    throw new Error('agent handoff requires a ready project');
  }

  const res = await fetch('/api/motion/agent-handoff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      handoff: result.agentHandoff,
      project: result.project,
      templateIds:
        options.templateIds ??
        (result.agentHandoff.nextTemplateId ? [result.agentHandoff.nextTemplateId] : undefined),
      input: options.input ?? {},
    }),
  });
  const json = (await res.json()) as MotionAgentHandoffClientResult;
  if (!res.ok || json.ok === false) {
    throw new Error(json.error ?? `motion handoff failed: ${res.status}`);
  }
  return json;
}

export function motionAgentHandoffInputFromPrefs(
  prefs: WorkspaceProviderPrefs | null | undefined
): MotionAgentHandoffClientInput {
  return {
    ...(prefs?.imageProviderId ? { imageToVideoProviderId: prefs.imageProviderId } : {}),
    ...(prefs?.voiceProviderId ? { voiceProviderId: prefs.voiceProviderId } : {}),
  };
}

export function applyMotionAgentHandoffResult(
  current: AgentMotionStartResult,
  handoffResult: MotionAgentHandoffClientResult
): AgentMotionStartResult {
  const finalResponse = handoffResult.finalResponse ?? {};
  const finalProject = isRecord(handoffResult.finalProject)
    ? (handoffResult.finalProject as unknown as AgentMotionStartResult['project'])
    : recordField(finalResponse, 'project', current.project);

  return {
    ...current,
    project: finalProject ?? current.project,
    reviewPlan: recordField(finalResponse, 'reviewPlan', current.reviewPlan),
    previewPlan: recordField(finalResponse, 'previewPlan', current.previewPlan),
    preparedPreviewSource: recordField(
      finalResponse,
      'preparedPreviewSource',
      current.preparedPreviewSource ?? null
    ),
    capturePlan: recordField(finalResponse, 'capturePlan', current.capturePlan),
    agentHandoff: recordField(finalResponse, 'agentHandoff', current.agentHandoff),
  };
}

export function motionAgentHandoffStatusLabel(
  result: MotionAgentHandoffClientResult
): string {
  if (result.status === 'blocked') {
    const missingPlaceholders = motionAgentHandoffMissingPlaceholders(result);
    return missingPlaceholders.length > 0
      ? `full auto blocked: missing ${missingPlaceholders.join(', ')}`
      : 'full auto blocked';
  }

  if (result.status === 'failed') return 'full auto failed';

  const finalResponse = result.finalResponse ?? {};
  const run = recordField<Record<string, unknown> | null>(finalResponse, 'run', null);
  const status = stringField(finalResponse.status);

  if (status === 'complete' || stringField(run?.status) === 'complete') {
    return 'full auto complete';
  }
  const stepLabel = stringField(run?.stepLabel);
  if (stepLabel) return `full auto paused at ${stepLabel}`;
  const reason = stringField(run?.reason);
  if (reason === 'provider-required') return 'full auto needs provider';
  if (reason === 'blocked') return 'full auto blocked';
  if (reason === 'max-steps') return 'full auto paused at step limit';

  return 'full auto complete';
}

export function motionAgentHandoffMissingPlaceholders(
  result: MotionAgentHandoffClientResult
): string[] {
  return uniqueStrings(result.steps?.flatMap((step) => step.missingPlaceholders) ?? []);
}

function recordField<T>(
  source: Record<string, unknown>,
  key: string,
  fallback: T
): T {
  const value = source[key];
  return isRecord(value) ? (value as T) : fallback;
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

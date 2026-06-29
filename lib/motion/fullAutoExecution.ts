import type { ToolRegistryId } from '@/lib/tool/registry';
import type { WorkflowEngine } from '@/lib/workflow/registry';
import type {
  MotionExecutionHistoryEntry,
  MotionProject,
  MotionSavedArtifactSummary,
} from './project';
import { summarizeExecutionArtifacts } from './executionArtifacts';
import {
  buildMotionProductionPlan,
  type MotionProductionPlan,
  type MotionProductionStep,
  type MotionProductionStepId,
} from './productionPlan';

export type MotionFullAutoPauseReason =
  | 'review-required'
  | 'provider-required'
  | 'blocked'
  | 'handler-required'
  | 'max-steps';

export interface MotionFullAutoRun {
  id: string;
  status: 'complete' | 'paused';
  mode: MotionProject['workflowMode'];
  projectId: string;
  draftId: string;
  stepId: MotionProductionStepId | null;
  stepLabel: string | null;
  reason: MotionFullAutoPauseReason | null;
  advancedStepIds: MotionProductionStepId[];
  providerRequirementLabels: string[];
  blockerLabels: string[];
  actionLabel: string | null;
  toolIds: ToolRegistryId[];
  apiRoutes: string[];
  receiptCount: number;
  reviewPacket: MotionFullAutoReviewPacket;
  requestedAt: number;
}

export interface MotionFullAutoReviewPacket {
  kind: 'motion-full-auto-review-packet';
  status: MotionFullAutoRun['status'];
  mode: MotionProject['workflowMode'];
  advancedStepLabels: string[];
  savedReceiptCount: number;
  savedReceiptLabels: string[];
  savedArtifacts: MotionSavedArtifactSummary[];
  editableSurfaceLabels: string[];
  proofLabels: string[];
  nextReviewLabel: string | null;
  nextActionLabel: string | null;
  nextRouteLabels: string[];
  nextToolLabels: ToolRegistryId[];
  instruction: string;
}

export interface MotionFullAutoStepHandlerInput {
  project: MotionProject;
  productionPlan: MotionProductionPlan;
  step: MotionProductionStep;
  engines?: WorkflowEngine[];
  fps?: number;
  requestedAt: number;
  updatedAt?: number;
  advancedStepIds: MotionProductionStepId[];
}

export type MotionFullAutoStepHandlerResult =
  | MotionProject
  | {
      project: MotionProject;
    };

export type MotionFullAutoStepHandler = (
  input: MotionFullAutoStepHandlerInput
) => MotionFullAutoStepHandlerResult | Promise<MotionFullAutoStepHandlerResult>;

export interface RunSavedMotionFullAutoOptions {
  engines?: WorkflowEngine[];
  fps?: number;
  requestedAt: number;
  updatedAt?: number;
  maxSteps?: number;
  handlers?: Partial<Record<MotionProductionStepId, MotionFullAutoStepHandler>>;
}

export interface RunSavedMotionFullAutoResult {
  status: 'complete' | 'paused';
  project: MotionProject;
  productionPlan: MotionProductionPlan;
  run: MotionFullAutoRun;
}

const DEFAULT_MAX_STEPS = 8;
const PROVIDER_BACKED_STEPS = new Set<MotionProductionStepId>([
  'capture',
  'visual-source',
  'visual-generation',
  'voice',
  'render',
]);

export async function runSavedMotionFullAuto(
  project: MotionProject,
  options: RunSavedMotionFullAutoOptions
): Promise<RunSavedMotionFullAutoResult> {
  let currentProject = project;
  const advancedStepIds: MotionProductionStepId[] = [];
  const maxSteps = Math.max(0, Math.floor(options.maxSteps ?? DEFAULT_MAX_STEPS));

  while (true) {
    const productionPlan = buildMotionProductionPlan(currentProject, {
      engines: options.engines,
      fps: options.fps,
      requestedAt: options.requestedAt,
    });
    const nextStep = nextStepFromPlan(productionPlan);

    if (productionPlan.status === 'complete' || !nextStep) {
      const complete = productionPlan.status === 'complete';
      return buildResult({
        status: complete ? 'complete' : 'paused',
        project: currentProject,
        productionPlan,
        step: nextStep,
        reason: complete ? null : 'blocked',
        advancedStepIds,
        requestedAt: options.requestedAt,
      });
    }

    if (currentProject.workflowMode !== 'full-auto' || nextStep.reviewRequired) {
      return buildResult({
        status: 'paused',
        project: currentProject,
        productionPlan,
        step: nextStep,
        reason: 'review-required',
        advancedStepIds,
        requestedAt: options.requestedAt,
      });
    }

    if (nextStep.status === 'blocked') {
      return buildResult({
        status: 'paused',
        project: currentProject,
        productionPlan,
        step: nextStep,
        reason: 'blocked',
        advancedStepIds,
        requestedAt: options.requestedAt,
      });
    }

    if (!nextStep.autoAdvance) {
      return buildResult({
        status: 'paused',
        project: currentProject,
        productionPlan,
        step: nextStep,
        reason: 'handler-required',
        advancedStepIds,
        requestedAt: options.requestedAt,
      });
    }

    if (advancedStepIds.length >= maxSteps) {
      return buildResult({
        status: 'paused',
        project: currentProject,
        productionPlan,
        step: nextStep,
        reason: 'max-steps',
        advancedStepIds,
        requestedAt: options.requestedAt,
      });
    }

    const handler = options.handlers?.[nextStep.id];
    if (!handler) {
      return buildResult({
        status: 'paused',
        project: currentProject,
        productionPlan,
        step: nextStep,
        reason: providerBacked(nextStep) ? 'provider-required' : 'handler-required',
        advancedStepIds,
        requestedAt: options.requestedAt,
      });
    }

    const handlerResult = await handler({
      project: currentProject,
      productionPlan,
      step: nextStep,
      engines: options.engines,
      fps: options.fps,
      requestedAt: options.requestedAt,
      updatedAt: options.updatedAt,
      advancedStepIds: [...advancedStepIds],
    });
    const nextProject = projectFromHandlerResult(handlerResult);
    if (nextProject === currentProject) {
      return buildResult({
        status: 'paused',
        project: currentProject,
        productionPlan,
        step: nextStep,
        reason: 'handler-required',
        advancedStepIds,
        requestedAt: options.requestedAt,
      });
    }

    currentProject = nextProject;
    advancedStepIds.push(nextStep.id);
  }
}

function nextStepFromPlan(productionPlan: MotionProductionPlan): MotionProductionStep | null {
  if (!productionPlan.nextStepId) return null;
  return productionPlan.steps.find((step) => step.id === productionPlan.nextStepId) ?? null;
}

function projectFromHandlerResult(result: MotionFullAutoStepHandlerResult): MotionProject {
  return 'project' in result ? result.project : result;
}

function providerBacked(step: MotionProductionStep): boolean {
  return PROVIDER_BACKED_STEPS.has(step.id) || step.providerRequirementLabels.length > 0;
}

function buildResult(input: {
  status: 'complete' | 'paused';
  project: MotionProject;
  productionPlan: MotionProductionPlan;
  step: MotionProductionStep | null;
  reason: MotionFullAutoPauseReason | null;
  advancedStepIds: MotionProductionStepId[];
  requestedAt: number;
}): RunSavedMotionFullAutoResult {
  return {
    status: input.status,
    project: input.project,
    productionPlan: input.productionPlan,
    run: {
      id: `full-auto-${input.productionPlan.projectId}-${input.productionPlan.draftId}-${input.requestedAt}`,
      status: input.status,
      mode: input.project.workflowMode,
      projectId: input.productionPlan.projectId,
      draftId: input.productionPlan.draftId,
      stepId: input.step?.id ?? null,
      stepLabel: input.step?.label ?? null,
      reason: input.reason,
      advancedStepIds: [...input.advancedStepIds],
      providerRequirementLabels: input.step?.providerRequirementLabels ?? [],
      blockerLabels: input.step?.blockerLabels ?? input.productionPlan.blockerLabels,
      actionLabel: input.step?.actionLabel ?? null,
      toolIds: input.step?.toolIds ?? [],
      apiRoutes: input.step?.apiRoutes ?? [],
      receiptCount: input.project.executionHistory?.length ?? 0,
      reviewPacket: buildReviewPacket(input),
      requestedAt: input.requestedAt,
    },
  };
}

function buildReviewPacket(input: {
  status: 'complete' | 'paused';
  project: MotionProject;
  productionPlan: MotionProductionPlan;
  step: MotionProductionStep | null;
  advancedStepIds: MotionProductionStepId[];
}): MotionFullAutoReviewPacket {
  const advancedStepSet = new Set(input.advancedStepIds);
  const advancedSteps = input.advancedStepIds
    .map((stepId) => input.productionPlan.steps.find((step) => step.id === stepId))
    .filter((step): step is MotionProductionStep => Boolean(step));
  const savedEntries = entriesForAdvancedSteps(input.project.executionHistory, advancedStepSet);
  const savedReceiptLabels = uniqueStrings(
    savedEntries.flatMap((entry) => entry.receiptLabels)
  );
  const proofLabels = uniqueStrings(advancedSteps.flatMap((step) => step.artifactLabels));
  const editableSurfaceLabels = uniqueStrings(
    input.advancedStepIds.flatMap(editableSurfaceLabelsForStep)
  );

  return {
    kind: 'motion-full-auto-review-packet',
    status: input.status,
    mode: input.project.workflowMode,
    advancedStepLabels: advancedSteps.map((step) => step.label),
    savedReceiptCount: savedEntries.reduce((total, entry) => total + entry.receiptCount, 0),
    savedReceiptLabels,
    savedArtifacts: summarizeExecutionArtifacts(savedEntries),
    editableSurfaceLabels,
    proofLabels,
    nextReviewLabel: input.step?.label ?? null,
    nextActionLabel: input.step?.actionLabel ?? null,
    nextRouteLabels: input.step?.apiRoutes ?? [],
    nextToolLabels: input.step?.toolIds ?? [],
    instruction: reviewPacketInstruction(input.status, input.step),
  };
}

function entriesForAdvancedSteps(
  history: MotionExecutionHistoryEntry[] | undefined,
  advancedStepSet: Set<MotionProductionStepId>
): MotionExecutionHistoryEntry[] {
  if (!history || advancedStepSet.size === 0) return [];
  return history.filter((entry) => advancedStepSet.has(entry.gateId as MotionProductionStepId));
}

function editableSurfaceLabelsForStep(stepId: MotionProductionStepId): string[] {
  switch (stepId) {
    case 'plan':
      return ['script', 'brief', 'proof'];
    case 'drafts':
      return ['script', 'story beats', 'component'];
    case 'capture':
      return ['capture', 'recording', 'crop', 'cursor path'];
    case 'visual-source':
      return ['visual', 'reference', 'asset'];
    case 'visual-generation':
      return ['visual', 'image-to-video', 'component'];
    case 'voice':
      return ['voice', 'caption', 'word timing'];
    case 'sync':
      return ['timing', 'effect', 'transition', 'source edit'];
    case 'render':
      return ['render', 'contact sheet', 'poster'];
    case 'export':
      return ['export', 'pack manifest'];
  }
}

function reviewPacketInstruction(
  status: 'complete' | 'paused',
  step: MotionProductionStep | null
): string {
  if (status === 'complete') {
    return 'Full auto completed; review the export pack, render proof, and provenance receipts before publishing.';
  }

  if (step) {
    return `Full auto paused at ${step.label}; review saved receipts before continuing or switch to review gates.`;
  }

  return 'Full auto paused; review saved receipts before continuing or switch to review gates.';
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

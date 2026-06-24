import type { ToolRegistryId } from '@/lib/tool/registry';
import type { WorkflowEngine } from '@/lib/workflow/registry';
import type { MotionProject } from './project';
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
  requestedAt: number;
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
      requestedAt: input.requestedAt,
    },
  };
}

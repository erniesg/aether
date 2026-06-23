import type {
  WorkflowEngine,
  WorkflowRegistryId,
  WorkflowSourceKind,
} from '@/lib/workflow/registry';
import type { MotionWorkflowMode } from './project';
import {
  buildAgentMotionWorkflowPlan,
  type AgentMotionWorkflowPlan,
  type MotionWorkflowPlanSourceRef,
} from './workflowPlan';

export type MotionWorkflowIntent =
  | 'launch'
  | 'feature'
  | 'demo'
  | 'social'
  | 'pr'
  | 'website'
  | 'caption-overlay'
  | 'motion-graphic'
  | 'port';

export interface RouteAgentMotionWorkflowInput {
  intent?: MotionWorkflowIntent;
  mode: MotionWorkflowMode;
  sourceRefs: MotionWorkflowPlanSourceRef[];
  requestedEngines?: WorkflowEngine[];
  createdAt: number;
}

export interface RoutedAgentMotionWorkflow {
  workflowId: WorkflowRegistryId;
  reason: string;
  plan: AgentMotionWorkflowPlan;
}

export function routeAgentMotionWorkflow(
  input: RouteAgentMotionWorkflowInput
): RoutedAgentMotionWorkflow {
  const { workflowId, reason } = selectWorkflow(input);

  return {
    workflowId,
    reason,
    plan: buildAgentMotionWorkflowPlan({
      workflowId,
      mode: input.mode,
      sourceRefs: input.sourceRefs,
      requestedEngines: input.requestedEngines,
      createdAt: input.createdAt,
    }),
  };
}

function selectWorkflow(input: RouteAgentMotionWorkflowInput): {
  workflowId: WorkflowRegistryId;
  reason: string;
} {
  if (hasSourceKind(input.sourceRefs, 'pr')) {
    return {
      workflowId: 'pr-to-video',
      reason: 'pull request source selected a code-change workflow',
    };
  }

  if (input.intent === 'pr') {
    return {
      workflowId: 'pr-to-video',
      reason: 'PR intent selected a code-change workflow',
    };
  }

  if (hasAnySourceKind(input.sourceRefs, ['remotion', 'hyperframes'])) {
    return {
      workflowId: 'remotion-hyperframes-port',
      reason: 'motion engine source selected a portability workflow',
    };
  }

  if (input.intent === 'port') {
    return {
      workflowId: 'remotion-hyperframes-port',
      reason: 'port intent selected a portability workflow',
    };
  }

  if (input.intent === 'caption-overlay') {
    return {
      workflowId: 'caption-overlay-video',
      reason: 'caption overlay intent selected an overlay workflow',
    };
  }

  if (input.intent === 'motion-graphic') {
    return {
      workflowId: 'motion-graphic-video',
      reason: 'motion graphic intent selected a motion graphics workflow',
    };
  }

  if (input.intent === 'feature' || input.intent === 'social') {
    return {
      workflowId: 'feature-social-video',
      reason: `${input.intent} intent selected a feature/social workflow`,
    };
  }

  if (
    input.intent === 'website' ||
    (input.intent === 'demo' && hasSourceKind(input.sourceRefs, 'site'))
  ) {
    return {
      workflowId: 'website-to-video',
      reason: 'site source selected a website video workflow',
    };
  }

  if (hasSourceKind(input.sourceRefs, 'repo')) {
    return {
      workflowId: 'repo-launch-video',
      reason: 'repo source selected a launch workflow',
    };
  }

  if (input.intent === 'demo') {
    return {
      workflowId: 'website-to-video',
      reason: 'demo intent selected a website video workflow',
    };
  }

  return {
    workflowId: 'repo-launch-video',
    reason: 'launch intent selected a launch workflow',
  };
}

function hasAnySourceKind(
  sourceRefs: MotionWorkflowPlanSourceRef[],
  kinds: WorkflowSourceKind[]
): boolean {
  return kinds.some((kind) => hasSourceKind(sourceRefs, kind));
}

function hasSourceKind(
  sourceRefs: MotionWorkflowPlanSourceRef[],
  kind: WorkflowSourceKind
): boolean {
  return sourceRefs.some((source) => source.kind === kind);
}

import {
  getWorkflowRegistryEntry,
  type WorkflowEngine,
  type WorkflowRegistryEntry,
  type WorkflowReviewGate,
  type WorkflowSkillContract,
  type WorkflowSourceKind,
} from '@/lib/workflow/registry';
import type { ToolRegistryId } from '@/lib/tool/registry';
import type { MotionWorkflowMode } from './project';

export interface MotionWorkflowPlanSourceRef {
  kind: WorkflowSourceKind;
  ref: string;
  label?: string;
}

export type MotionWorkflowSourceStatus = 'ready' | 'missing' | 'unsupported';
export type MotionWorkflowPrimaryAction =
  | 'request-source'
  | 'request-review'
  | 'run-full-auto';

export interface MotionWorkflowPlanGate {
  id: WorkflowReviewGate;
  label: string;
  autoAdvance: boolean;
  toolIds: ToolRegistryId[];
  expectedArtifacts: string[];
}

export interface MotionWorkflowPlanAction {
  id: string;
  label: string;
  gateId: WorkflowReviewGate;
}

export interface AgentMotionWorkflowPlan {
  workflowId: string;
  label: string;
  artifactKind: string;
  mode: MotionWorkflowMode;
  primaryAction: MotionWorkflowPrimaryAction;
  sourceStatus: MotionWorkflowSourceStatus;
  acceptedSources: MotionWorkflowPlanSourceRef[];
  unsupportedSources: MotionWorkflowPlanSourceRef[];
  missingSourceKinds: WorkflowSourceKind[];
  engines: WorkflowEngine[];
  toolIds: ToolRegistryId[];
  skillContract: WorkflowSkillContract | null;
  gates: MotionWorkflowPlanGate[];
  nextActions: MotionWorkflowPlanAction[];
  createdAt: number;
}

export interface BuildAgentMotionWorkflowPlanInput {
  workflowId: string;
  mode: MotionWorkflowMode;
  sourceRefs: MotionWorkflowPlanSourceRef[];
  requestedEngines?: WorkflowEngine[];
  createdAt: number;
}

const GATE_LABELS = {
  plan: 'Video plan',
  drafts: 'Draft variations',
  capture: 'Product capture',
  voice: 'Voice and captions',
  timeline: 'Timeline sync',
  render: 'Render proof',
  export: 'Export pack',
} satisfies Record<WorkflowReviewGate, string>;

const GATE_TOOLS = {
  plan: ['motion-brief'],
  drafts: ['motion-storyboard'],
  capture: ['motion-capture'],
  voice: ['motion-voice'],
  timeline: ['motion-sync', 'motion-revise'],
  render: ['motion-render'],
  export: ['motion-render'],
} satisfies Record<WorkflowReviewGate, ToolRegistryId[]>;

const GATE_ARTIFACTS = {
  plan: ['grounded brief', 'video plan', 'source receipts'],
  drafts: ['draft variations', 'story beats', 'component plan'],
  capture: ['captures', 'cursor targets', 'crop receipts'],
  voice: ['voice clips', 'word timings'],
  timeline: ['timeline tracks', 'caption clips', 'effect markers'],
  render: ['contact sheet', 'poster still', 'mp4 probe'],
  export: ['mp4', 'poster', 'subtitles', 'manifest'],
} satisfies Record<WorkflowReviewGate, string[]>;

const REVIEW_ACTIONS = {
  plan: { id: 'review-video-plan', label: 'Review video plan' },
  drafts: { id: 'review-draft-variations', label: 'Review draft variations' },
  capture: { id: 'collect-captures', label: 'Collect captures' },
  voice: { id: 'generate-voice', label: 'Generate voice' },
  timeline: { id: 'open-timeline', label: 'Open timeline' },
  render: { id: 'render-proof', label: 'Render proof' },
  export: { id: 'export-pack', label: 'Export pack' },
} satisfies Record<WorkflowReviewGate, Omit<MotionWorkflowPlanAction, 'gateId'>>;

export function buildAgentMotionWorkflowPlan(
  input: BuildAgentMotionWorkflowPlanInput
): AgentMotionWorkflowPlan {
  const workflow = getUsableWorkflow(input.workflowId);
  const supportedSourceKinds = workflow.sourceKinds ?? [];
  const acceptedSources = input.sourceRefs.filter((source) =>
    supportedSourceKinds.includes(source.kind)
  );
  const unsupportedSources = input.sourceRefs.filter(
    (source) => !supportedSourceKinds.includes(source.kind)
  );
  const sourceStatus = sourceStatusFor(input.sourceRefs, acceptedSources);
  const missingSourceKinds = acceptedSources.length > 0 ? [] : supportedSourceKinds;
  const engines = selectEngines(workflow, input.requestedEngines);
  const basePlan = {
    workflowId: workflow.id,
    label: workflow.label,
    artifactKind: workflow.artifactKind,
    mode: input.mode,
    sourceStatus,
    acceptedSources,
    unsupportedSources,
    missingSourceKinds,
    engines,
    toolIds: [...workflow.toolIds],
    skillContract: workflow.skillContract ?? null,
    createdAt: input.createdAt,
  };

  if (sourceStatus !== 'ready') {
    return {
      ...basePlan,
      primaryAction: 'request-source',
      gates: [],
      nextActions: [{ id: 'add-source', label: 'Add source', gateId: 'plan' }],
    };
  }

  const gates = buildGates(workflow, input.mode);

  return {
    ...basePlan,
    primaryAction: input.mode === 'full-auto' ? 'run-full-auto' : 'request-review',
    gates,
    nextActions:
      input.mode === 'full-auto'
        ? [{ id: 'run-full-auto', label: 'Run saved gates', gateId: 'plan' }]
        : gates.map((gate) => ({ ...REVIEW_ACTIONS[gate.id], gateId: gate.id })),
  };
}

function getUsableWorkflow(id: string): WorkflowRegistryEntry {
  const workflow = getWorkflowRegistryEntry(id);
  if (!workflow || workflow.status === 'archived') {
    throw new Error(`Motion workflow is not registered: ${id}`);
  }
  if (workflow.artifactKind !== 'video') {
    throw new Error(`Workflow is not a motion video workflow: ${id}`);
  }
  return workflow;
}

function sourceStatusFor(
  sourceRefs: MotionWorkflowPlanSourceRef[],
  acceptedSources: MotionWorkflowPlanSourceRef[]
): MotionWorkflowSourceStatus {
  if (acceptedSources.length > 0) return 'ready';
  return sourceRefs.length > 0 ? 'unsupported' : 'missing';
}

function selectEngines(
  workflow: WorkflowRegistryEntry,
  requestedEngines: WorkflowEngine[] = []
): WorkflowEngine[] {
  const supported = workflow.engines ?? [];
  if (requestedEngines.length === 0) return supported;

  const requestedSupported = requestedEngines.filter((engine) => supported.includes(engine));
  return requestedSupported.length > 0 ? requestedSupported : supported;
}

function buildGates(
  workflow: WorkflowRegistryEntry,
  mode: MotionWorkflowMode
): MotionWorkflowPlanGate[] {
  return (workflow.reviewGates ?? []).map((gate) => ({
    id: gate,
    label: GATE_LABELS[gate],
    autoAdvance: mode === 'full-auto',
    toolIds: GATE_TOOLS[gate].filter((toolId) => workflow.toolIds.includes(toolId)),
    expectedArtifacts: GATE_ARTIFACTS[gate],
  }));
}

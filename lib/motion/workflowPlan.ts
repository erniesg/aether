import {
  getWorkflowRegistryEntry,
  type WorkflowEngine,
  type WorkflowRegistryEntry,
  type WorkflowReviewGate,
  type WorkflowSkillContract,
  type WorkflowSourceKind,
  type WorkflowVerificationArtifact,
} from '@/lib/workflow/registry';
import type { ToolRegistryId } from '@/lib/tool/registry';
import type { MotionWorkflowMode } from './project';
import {
  buildMotionWorkflowSkillDraft,
  type MotionWorkflowSkillDraft,
} from './workflowSkill';
import { listMotionWorkflowExamples } from './workflowExamples';

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

export type MotionWorkflowRunPlanStatus = 'ready' | 'needs-source';
export type MotionWorkflowRunStepGate = WorkflowReviewGate | 'source';

export interface MotionWorkflowRunStep {
  id: string;
  gateId: MotionWorkflowRunStepGate;
  label: string;
  reviewRequired: boolean;
  autoAdvance: boolean;
  toolIds: ToolRegistryId[];
  apiRoutes: string[];
  inputSummary: string[];
  expectedArtifacts: string[];
  outputSummary: string[];
}

export interface AgentMotionWorkflowRunPlan {
  mode: MotionWorkflowMode;
  status: MotionWorkflowRunPlanStatus;
  primaryAction: MotionWorkflowPrimaryAction;
  nextStepId: string | null;
  stepCount: number;
  steps: MotionWorkflowRunStep[];
  verificationArtifacts: WorkflowVerificationArtifact[];
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
  supportedSourceKinds: WorkflowSourceKind[];
  engines: WorkflowEngine[];
  toolIds: ToolRegistryId[];
  skillContract: WorkflowSkillContract | null;
  gates: MotionWorkflowPlanGate[];
  nextActions: MotionWorkflowPlanAction[];
  runPlan: AgentMotionWorkflowRunPlan;
  skillDraft: MotionWorkflowSkillDraft;
  createdAt: number;
}

export interface BuildAgentMotionWorkflowPlanInput {
  workflowId: string;
  mode: MotionWorkflowMode;
  sourceRefs: MotionWorkflowPlanSourceRef[];
  requestedEngines?: WorkflowEngine[];
  createdAt: number;
}

type AgentMotionWorkflowPlanDraft = Omit<AgentMotionWorkflowPlan, 'skillDraft'>;

const GATE_LABELS = {
  plan: 'Video plan',
  drafts: 'Draft variations',
  capture: 'Product capture',
  visuals: 'Visual sources',
  voice: 'Voice and captions',
  timeline: 'Timeline sync',
  render: 'Render proof',
  export: 'Export pack',
} satisfies Record<WorkflowReviewGate, string>;

const GATE_TOOLS = {
  plan: ['motion-brief'],
  drafts: ['motion-storyboard'],
  capture: ['motion-capture'],
  visuals: ['motion-visuals'],
  voice: ['motion-voice'],
  timeline: [
    'motion-sync',
    'motion-revise',
    'motion-preview-source',
    'motion-source-author',
    'motion-source-edit',
  ],
  render: ['motion-render'],
  export: ['motion-export-pack'],
} satisfies Record<WorkflowReviewGate, ToolRegistryId[]>;

const GATE_ARTIFACTS = {
  plan: ['grounded brief', 'video plan', 'source receipts'],
  drafts: ['draft variations', 'story beats', 'component plan'],
  capture: ['captures', 'cursor targets', 'crop receipts'],
  visuals: ['reference requests', 'key still prompts', 'source asset picks'],
  voice: ['voice clips', 'word timings'],
  timeline: ['timeline tracks', 'caption clips', 'effect markers'],
  render: ['contact sheet', 'poster still', 'mp4 probe'],
  export: ['export pack', 'canvas drop candidates', 'pack manifest'],
} satisfies Record<WorkflowReviewGate, string[]>;

const GATE_ROUTES = {
  plan: ['/api/motion/start'],
  drafts: ['/api/motion/regenerate'],
  capture: ['/api/motion/capture'],
  visuals: ['/api/motion/visuals'],
  voice: ['/api/motion/voice'],
  timeline: [
    '/api/motion/sync',
    '/api/motion/revise',
    '/api/motion/preview-source',
    '/api/motion/source-author',
    '/api/motion/source-edit',
  ],
  render: ['/api/motion/render'],
  export: ['/api/motion/export-pack'],
} satisfies Record<WorkflowReviewGate, string[]>;

const REVIEW_ACTIONS = {
  plan: { id: 'review-video-plan', label: 'Review video plan' },
  drafts: { id: 'review-draft-variations', label: 'Review draft variations' },
  capture: { id: 'collect-captures', label: 'Collect captures' },
  visuals: { id: 'review-visual-sources', label: 'Review visual sources' },
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
    supportedSourceKinds,
    engines,
    toolIds: [...workflow.toolIds],
    skillContract: workflow.skillContract ?? null,
    createdAt: input.createdAt,
  };

  if (sourceStatus !== 'ready') {
    const runPlan = buildSourceRunPlan(input.mode, supportedSourceKinds, workflow);
    const plan: AgentMotionWorkflowPlanDraft = {
      ...basePlan,
      primaryAction: 'request-source',
      gates: [],
      nextActions: [{ id: 'add-source', label: 'Add source', gateId: 'plan' }],
      runPlan,
    };
    return {
      ...plan,
      skillDraft: buildMotionWorkflowSkillDraft(
        plan,
        listMotionWorkflowExamples(workflow.id)
      ),
    };
  }

  const gates = buildGates(workflow, input.mode);
  const primaryAction = input.mode === 'full-auto' ? 'run-full-auto' : 'request-review';

  const plan: AgentMotionWorkflowPlanDraft = {
    ...basePlan,
    primaryAction,
    gates,
    nextActions:
      input.mode === 'full-auto'
        ? [{ id: 'run-full-auto', label: 'Run saved gates', gateId: 'plan' }]
        : gates.map((gate) => ({ ...REVIEW_ACTIONS[gate.id], gateId: gate.id })),
    runPlan: buildRunPlan(input.mode, primaryAction, gates, workflow),
  };
  return {
    ...plan,
    skillDraft: buildMotionWorkflowSkillDraft(plan, listMotionWorkflowExamples(workflow.id)),
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

function buildSourceRunPlan(
  mode: MotionWorkflowMode,
  sourceKinds: WorkflowSourceKind[],
  workflow: WorkflowRegistryEntry
): AgentMotionWorkflowRunPlan {
  const expectedArtifacts = sourceKinds.map((kind) => `${kind} source`);
  const steps: MotionWorkflowRunStep[] = [
    {
      id: 'step-source',
      gateId: 'source',
      label: 'Add source',
      reviewRequired: true,
      autoAdvance: false,
      toolIds: [],
      apiRoutes: ['/api/motion/start'],
      inputSummary: ['creator source selection'],
      expectedArtifacts,
      outputSummary: expectedArtifacts,
    },
  ];

  return {
    mode,
    status: 'needs-source',
    primaryAction: 'request-source',
    nextStepId: steps[0].id,
    stepCount: steps.length,
    steps,
    verificationArtifacts: workflow.skillContract?.verificationArtifacts ?? [],
  };
}

function buildRunPlan(
  mode: MotionWorkflowMode,
  primaryAction: MotionWorkflowPrimaryAction,
  gates: MotionWorkflowPlanGate[],
  workflow: WorkflowRegistryEntry
): AgentMotionWorkflowRunPlan {
  const steps = gates.map((gate, index): MotionWorkflowRunStep => {
    const previousGate = gates[index - 1];
    const inputSummary =
      index === 0
        ? ['accepted sources', 'brief constraints', 'output targets']
        : previousGate.expectedArtifacts;

    return {
      id: `step-${gate.id}`,
      gateId: gate.id,
      label: gate.label,
      reviewRequired: mode === 'review',
      autoAdvance: gate.autoAdvance,
      toolIds: gate.toolIds,
      apiRoutes: GATE_ROUTES[gate.id],
      inputSummary,
      expectedArtifacts: gate.expectedArtifacts,
      outputSummary: gate.expectedArtifacts,
    };
  });

  return {
    mode,
    status: 'ready',
    primaryAction,
    nextStepId: steps[0]?.id ?? null,
    stepCount: steps.length,
    steps,
    verificationArtifacts: workflow.skillContract?.verificationArtifacts ?? [],
  };
}

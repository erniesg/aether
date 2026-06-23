import type { ToolRegistryId } from '@/lib/tool/registry';
import type { WorkflowEngine } from '@/lib/workflow/registry';
import type { MotionRenderEngine } from '@/lib/providers/video/types';
import {
  buildAgentMotionCapturePlan,
  type AgentMotionCapturePlan,
} from './capturePlan';
import {
  buildMotionExportPackPlan,
  type MotionExportPackPlan,
} from './exportPackPlan';
import {
  buildMotionImageToVideoPlan,
  type MotionImageToVideoPlan,
} from './imageToVideoPlan';
import {
  buildMotionRenderPlan,
  type MotionRenderPlan,
} from './renderPlan';
import {
  buildMotionSyncPlan,
  type MotionSyncPlan,
} from './syncPlan';
import {
  buildMotionVoicePlan,
  type MotionVoicePlan,
} from './voicePlan';
import {
  DEFAULT_MOTION_FPS,
  type MotionGraphNode,
  type MotionProject,
  type MotionProvenanceRef,
  type TimelineTrack,
} from './project';

export type MotionProductionPlanStatus = 'ready' | 'blocked' | 'complete';
export type MotionProductionStepId =
  | 'plan'
  | 'drafts'
  | 'capture'
  | 'visual-generation'
  | 'voice'
  | 'sync'
  | 'render'
  | 'export';
export type MotionProductionStepStatus =
  | 'complete'
  | 'ready'
  | 'blocked'
  | 'review'
  | 'optional';

export interface MotionProductionStep {
  id: MotionProductionStepId;
  label: string;
  status: MotionProductionStepStatus;
  reviewRequired: boolean;
  autoAdvance: boolean;
  toolIds: ToolRegistryId[];
  apiRoutes: string[];
  actionLabel: string;
  artifactLabels: string[];
  providerRequirementLabels: string[];
  blockerLabels: string[];
}

export interface MotionProductionPlan {
  id: string;
  projectId: string;
  draftId: string;
  mode: MotionProject['workflowMode'];
  status: MotionProductionPlanStatus;
  nextStepId: MotionProductionStepId | null;
  nextActionLabel: string | null;
  readyCount: number;
  completeCount: number;
  blockedCount: number;
  optionalCount: number;
  steps: MotionProductionStep[];
  blockerLabels: string[];
  requestedAt: number;
  provenance: MotionProvenanceRef[];
}

export interface BuildMotionProductionPlanOptions {
  engines?: WorkflowEngine[];
  fps?: number;
  requestedAt: number;
}

const STEP_META = {
  plan: {
    label: 'Video plan',
    toolIds: ['motion-brief'],
    apiRoutes: ['/api/motion/start'],
    actionLabel: 'Review video plan',
    artifactLabels: ['grounded brief', 'story beats', 'source receipts'],
  },
  drafts: {
    label: 'Draft variations',
    toolIds: ['motion-storyboard'],
    apiRoutes: ['/api/motion/regenerate', '/api/motion/revise'],
    actionLabel: 'Review draft variations',
    artifactLabels: ['draft options', 'editable timeline', 'component plan'],
  },
  capture: {
    label: 'Product capture',
    toolIds: ['motion-capture'],
    apiRoutes: ['/api/motion/capture'],
    actionLabel: 'Capture product material',
    artifactLabels: ['screenshots', 'recordings', 'DOM snapshots', 'cursor targets'],
  },
  'visual-generation': {
    label: 'Image-to-video',
    toolIds: ['motion-visuals'],
    apiRoutes: ['/api/motion/image-to-video'],
    actionLabel: 'Generate video clips',
    artifactLabels: ['generated clips', 'source visual receipts'],
  },
  voice: {
    label: 'Voice and captions',
    toolIds: ['motion-voice'],
    apiRoutes: ['/api/motion/voice'],
    actionLabel: 'Generate voice and word timings',
    artifactLabels: ['voice clips', 'word timings', 'transcript'],
  },
  sync: {
    label: 'Timeline sync',
    toolIds: ['motion-sync', 'motion-revise'],
    apiRoutes: ['/api/motion/sync', '/api/motion/revise'],
    actionLabel: 'Review sync markers',
    artifactLabels: ['beat markers', 'caption links', 'sound cues'],
  },
  render: {
    label: 'Render proof',
    toolIds: ['motion-render'],
    apiRoutes: ['/api/motion/render'],
    actionLabel: 'Render proof',
    artifactLabels: ['MP4', 'poster', 'subtitles', 'transcript', 'manifest'],
  },
  export: {
    label: 'Export pack',
    toolIds: ['motion-export-pack'],
    apiRoutes: ['/api/motion/export-pack'],
    actionLabel: 'Approve export pack',
    artifactLabels: ['export pack', 'canvas drop candidates', 'pack manifest'],
  },
} satisfies Record<
  MotionProductionStepId,
  {
    label: string;
    toolIds: ToolRegistryId[];
    apiRoutes: string[];
    actionLabel: string;
    artifactLabels: string[];
  }
>;

export function buildMotionProductionPlan(
  project: MotionProject,
  options: BuildMotionProductionPlanOptions
): MotionProductionPlan {
  const fps = options.fps ?? DEFAULT_MOTION_FPS;
  const capturePlan = buildAgentMotionCapturePlan(project);
  const imageToVideoPlan = buildMotionImageToVideoPlan(project, {
    draftId: project.currentDraftId,
    fps,
    requestedAt: options.requestedAt,
  });
  const voicePlan = buildMotionVoicePlan(project, {
    draftId: project.currentDraftId,
    fps,
    requestedAt: options.requestedAt,
  });
  const syncPlan = buildMotionSyncPlan(project, {
    draftId: project.currentDraftId,
    fps,
    requestedAt: options.requestedAt,
  });
  const renderPlan = buildMotionRenderPlan(project, {
    engine: preferredRenderEngine(options.engines),
    draftId: project.currentDraftId,
    fps,
    requestedAt: options.requestedAt,
  });
  const exportPackPlan = buildMotionExportPackPlan(project, {
    draftId: project.currentDraftId,
    requestedAt: options.requestedAt,
  });
  const steps = buildSteps(project, {
    capturePlan,
    imageToVideoPlan,
    voicePlan,
    syncPlan,
    renderPlan,
    exportPackPlan,
  });
  const nextStep = steps.find((step) => isActionableStep(step)) ?? null;
  const blockerLabels = uniqueStrings(steps.flatMap((step) => step.blockerLabels));
  const completeCount = steps.filter((step) => step.status === 'complete').length;
  const readyCount = steps.filter((step) => step.status === 'ready' || step.status === 'review')
    .length;
  const blockedCount = steps.filter((step) => step.status === 'blocked').length;
  const optionalCount = steps.filter((step) => step.status === 'optional').length;

  return {
    id: `production-plan-${project.id}-${project.currentDraftId}-${options.requestedAt}`,
    projectId: project.id,
    draftId: project.currentDraftId,
    mode: project.workflowMode,
    status:
      exportPackPlan.status === 'ready'
        ? 'complete'
        : nextStep
          ? 'ready'
          : blockedCount > 0
            ? 'blocked'
            : 'ready',
    nextStepId: nextStep?.id ?? null,
    nextActionLabel: nextStep?.actionLabel ?? null,
    readyCount,
    completeCount,
    blockedCount,
    optionalCount,
    steps,
    blockerLabels,
    requestedAt: options.requestedAt,
    provenance: uniqueProvenance([
      ...project.sourceRefs,
      ...project.graphNodes.flatMap((node) => node.provenance),
      ...project.tracks.map((track) => ({ kind: 'timeline' as const, ref: track.id })),
    ]),
  };
}

function buildSteps(
  project: MotionProject,
  plans: {
    capturePlan: AgentMotionCapturePlan;
    imageToVideoPlan: MotionImageToVideoPlan;
    voicePlan: MotionVoicePlan;
    syncPlan: MotionSyncPlan;
    renderPlan: MotionRenderPlan;
    exportPackPlan: MotionExportPackPlan;
  }
): MotionProductionStep[] {
  const timelineReady = currentTracks(project).length > 0;
  const planReady = project.story.length > 0;
  const draftsReady = project.drafts.length > 0 && timelineReady;
  const voiceComplete = isGraphDone(project.graphNodes, 'voice') || plans.syncPlan.status === 'ready';
  const syncReady = plans.syncPlan.status === 'ready';

  return [
    step('plan', project, {
      status: planReady ? 'complete' : 'blocked',
      blockerLabels: planReady ? [] : ['Create a sourced video plan first'],
      providerRequirementLabels: [],
    }),
    step('drafts', project, {
      status: draftsReady
        ? project.workflowMode === 'review'
          ? 'review'
          : 'complete'
        : planReady
          ? 'ready'
          : 'blocked',
      blockerLabels: planReady ? [] : ['Create story beats before draft variations'],
      providerRequirementLabels: [],
    }),
    captureStep(project, plans.capturePlan),
    visualGenerationStep(project, plans.imageToVideoPlan),
    step('voice', project, {
      status: voiceComplete ? 'complete' : plans.voicePlan.status === 'ready' ? 'ready' : 'blocked',
      blockerLabels: plans.voicePlan.blockers.map((blocker) => blocker.label),
      providerRequirementLabels: plans.voicePlan.providerRequirements.map(readableRequirement),
    }),
    step('sync', project, {
      status: syncReady ? 'ready' : 'blocked',
      blockerLabels: plans.syncPlan.blockers.map((blocker) => blocker.label),
      providerRequirementLabels: plans.syncPlan.providerRequirements.map(readableRequirement),
    }),
    step('render', project, {
      status:
        plans.exportPackPlan.status === 'ready'
          ? 'complete'
          : plans.renderPlan.status === 'ready' && syncReady
            ? 'ready'
            : 'blocked',
      blockerLabels: [
        ...plans.renderPlan.blockers.map((blocker) => blocker.label),
        ...(syncReady ? [] : ['Review voice and caption sync before render']),
      ],
      providerRequirementLabels: [],
    }),
    step('export', project, {
      status: plans.exportPackPlan.status === 'ready' ? 'complete' : 'blocked',
      blockerLabels: plans.exportPackPlan.blockers.map((blocker) => blocker.label),
      providerRequirementLabels: [],
    }),
  ];
}

function captureStep(
  project: MotionProject,
  capturePlan: AgentMotionCapturePlan
): MotionProductionStep {
  if (capturePlan.status === 'not-needed') {
    return step('capture', project, {
      status: 'complete',
      blockerLabels: [],
      providerRequirementLabels: [],
    });
  }

  return step('capture', project, {
    status: isGraphDone(project.graphNodes, 'capture')
      ? 'complete'
      : capturePlan.status === 'ready'
        ? 'ready'
        : 'blocked',
    blockerLabels:
      capturePlan.status === 'ready'
        ? []
        : capturePlan.fallbacks.map((fallback) => fallback.reason),
    providerRequirementLabels: capturePlan.providerRequirements.map(readableRequirement),
  });
}

function visualGenerationStep(
  project: MotionProject,
  imageToVideoPlan: MotionImageToVideoPlan
): MotionProductionStep {
  if (isGraphDone(project.graphNodes, 'image-to-video')) {
    return step('visual-generation', project, {
      status: 'complete',
      blockerLabels: [],
      providerRequirementLabels: [],
    });
  }

  if (imageToVideoPlan.status === 'ready') {
    return step('visual-generation', project, {
      status: 'ready',
      blockerLabels: [],
      providerRequirementLabels: imageToVideoPlan.providerRequirements.map(readableRequirement),
    });
  }

  return step('visual-generation', project, {
    status: imageToVideoPlan.status === 'needs-visual-source' ? 'optional' : 'blocked',
    blockerLabels: imageToVideoPlan.blockers.map((blocker) => blocker.label),
    providerRequirementLabels: imageToVideoPlan.providerRequirements.map(readableRequirement),
  });
}

function step(
  id: MotionProductionStepId,
  project: MotionProject,
  input: {
    status: MotionProductionStepStatus;
    blockerLabels: string[];
    providerRequirementLabels: string[];
  }
): MotionProductionStep {
  const meta = STEP_META[id];
  const reviewRequired = project.workflowMode === 'review' && input.status !== 'complete';

  return {
    id,
    label: meta.label,
    status: input.status,
    reviewRequired,
    autoAdvance: project.workflowMode === 'full-auto' && input.status === 'ready',
    toolIds: meta.toolIds,
    apiRoutes: meta.apiRoutes,
    actionLabel: meta.actionLabel,
    artifactLabels: meta.artifactLabels,
    providerRequirementLabels: input.providerRequirementLabels,
    blockerLabels: input.blockerLabels,
  };
}

function isActionableStep(step: MotionProductionStep): boolean {
  return step.status === 'ready' || step.status === 'review';
}

function currentTracks(project: MotionProject): TimelineTrack[] {
  const draft = project.drafts.find((candidate) => candidate.id === project.currentDraftId);
  if (draft?.tracks.length) return draft.tracks;
  return project.tracks;
}

function isGraphDone(
  nodes: MotionGraphNode[],
  kind: MotionGraphNode['kind']
): boolean {
  return nodes.some((node) => node.kind === kind && node.status === 'done');
}

function preferredRenderEngine(engines: WorkflowEngine[] = []): MotionRenderEngine {
  const supported = engines.filter(isMotionRenderEngine);
  return supported[0] ?? 'remotion';
}

function isMotionRenderEngine(engine: WorkflowEngine): engine is MotionRenderEngine {
  return engine === 'remotion' || engine === 'hyperframes';
}

function readableRequirement(requirement: string): string {
  return requirement.replace(/-/g, ' ');
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function uniqueProvenance(refs: MotionProvenanceRef[]): MotionProvenanceRef[] {
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = `${ref.kind}:${ref.ref}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

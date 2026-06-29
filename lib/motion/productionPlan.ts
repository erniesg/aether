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
  buildMotionVisualSourcingPlan,
  type MotionVisualSourcingPlan,
} from './visualSourcingPlan';
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
  | 'visual-source'
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
export type MotionProductionVerificationReceiptKind =
  | 'draft'
  | 'capture'
  | 'render'
  | 'export';

export interface MotionProductionVerificationReceipt {
  id: string;
  kind: MotionProductionVerificationReceiptKind;
  label: string;
  ref: string;
  providerId?: string;
  path?: string;
}

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
  verificationReceipts: MotionProductionVerificationReceipt[];
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
  'visual-source': {
    label: 'Visual sourcing',
    toolIds: ['motion-visuals'],
    apiRoutes: ['/api/motion/visuals'],
    actionLabel: 'Plan source visuals',
    artifactLabels: ['reference prompts', 'key still prompts', 'source asset picks'],
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
    toolIds: ['motion-sync', 'motion-revise', 'motion-source-edit'],
    apiRoutes: ['/api/motion/sync', '/api/motion/revise', '/api/motion/source-edit'],
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
  const visualSourcingPlan = buildMotionVisualSourcingPlan(project, {
    draftId: project.currentDraftId,
    requestedAt: options.requestedAt,
  });
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
    visualSourcingPlan,
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
    status: nextStep ? 'ready' : blockedCount > 0 ? 'blocked' : 'complete',
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
    visualSourcingPlan: MotionVisualSourcingPlan;
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
  const draftApproved = currentDraftApproved(project);
  const productionGateBlocked = project.workflowMode === 'review' && !draftApproved;
  const voiceComplete = isGraphDone(project.graphNodes, 'voice') || plans.syncPlan.status === 'ready';
  const syncComplete = isGraphNodeDone(project.graphNodes, 'node-sync-plan');
  const syncReady = plans.syncPlan.status === 'ready';
  const exportComplete = isGraphDone(project.graphNodes, 'export-pack');

  return [
    step('plan', project, {
      status: planReady ? 'complete' : 'blocked',
      blockerLabels: planReady ? [] : ['Create a sourced video plan first'],
      providerRequirementLabels: [],
    }),
    step('drafts', project, {
      status: draftsReady
        ? project.workflowMode === 'review'
          ? draftApproved
            ? 'complete'
            : 'review'
          : 'complete'
        : planReady
          ? 'ready'
          : 'blocked',
      blockerLabels: planReady ? [] : ['Create story beats before draft variations'],
      providerRequirementLabels: [],
      verificationReceipts: draftApproved ? draftDecisionReceipts(project) : [],
    }),
    productionGateBlocked
      ? gatedProductionStep(
          'capture',
          project,
          'Approve a draft variation before product capture',
          plans.capturePlan.providerRequirements.map(readableRequirement)
        )
      : captureStep(project, plans.capturePlan),
    productionGateBlocked
      ? gatedProductionStep(
          'visual-source',
          project,
          'Approve a draft variation before visual sourcing',
          plans.visualSourcingPlan.providerRequirements.map(readableRequirement)
        )
      : visualSourceStep(project, plans.visualSourcingPlan),
    productionGateBlocked
      ? gatedProductionStep(
          'visual-generation',
          project,
          'Approve a draft variation before image-to-video generation',
          plans.imageToVideoPlan.providerRequirements.map(readableRequirement)
        )
      : visualGenerationStep(project, plans.imageToVideoPlan),
    productionGateBlocked
      ? gatedProductionStep(
          'voice',
          project,
          'Approve a draft variation before voice and caption work',
          plans.voicePlan.providerRequirements.map(readableRequirement)
        )
      : step('voice', project, {
          status: voiceComplete ? 'complete' : plans.voicePlan.status === 'ready' ? 'ready' : 'blocked',
          blockerLabels: plans.voicePlan.blockers.map((blocker) => blocker.label),
          providerRequirementLabels: plans.voicePlan.providerRequirements.map(readableRequirement),
          verificationReceipts: nodeReceipts(project, 'voice', 'render'),
        }),
    productionGateBlocked
      ? gatedProductionStep(
          'sync',
          project,
          'Approve a draft variation before timeline sync',
          plans.syncPlan.providerRequirements.map(readableRequirement)
        )
      : step('sync', project, {
          status: syncComplete ? 'complete' : syncReady ? 'ready' : 'blocked',
          blockerLabels: plans.syncPlan.blockers.map((blocker) => blocker.label),
          providerRequirementLabels: plans.syncPlan.providerRequirements.map(readableRequirement),
        }),
    productionGateBlocked
      ? gatedProductionStep('render', project, 'Approve a draft variation before render proof')
      : step('render', project, {
          status:
            plans.exportPackPlan.status === 'ready'
              ? 'complete'
              : plans.renderPlan.status === 'ready' && syncComplete
                ? 'ready'
                : 'blocked',
          blockerLabels: [
            ...plans.renderPlan.blockers.map((blocker) => blocker.label),
            ...(syncComplete ? [] : ['Review voice and caption sync before render']),
          ],
          providerRequirementLabels: [],
          verificationReceipts: renderReceipts(project),
        }),
    productionGateBlocked
      ? gatedProductionStep('export', project, 'Approve a draft variation before export')
      : step('export', project, {
          status: exportComplete
            ? 'complete'
            : plans.exportPackPlan.status === 'ready'
              ? 'ready'
              : 'blocked',
          blockerLabels: plans.exportPackPlan.blockers.map((blocker) => blocker.label),
          providerRequirementLabels: [],
          verificationReceipts: exportReceipts(plans.exportPackPlan),
        }),
  ];
}

function gatedProductionStep(
  id: MotionProductionStepId,
  project: MotionProject,
  blockerLabel: string,
  providerRequirementLabels: string[] = []
): MotionProductionStep {
  return step(id, project, {
    status: 'blocked',
    blockerLabels: [blockerLabel],
    providerRequirementLabels,
    verificationReceipts: [],
  });
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
      verificationReceipts: [],
    });
  }

  const verificationReceipts = captureReceipts(project);
  return step('capture', project, {
    status: isGraphDone(project.graphNodes, 'capture') || verificationReceipts.length > 0
      ? 'complete'
      : capturePlan.status === 'ready'
        ? 'ready'
        : 'blocked',
    blockerLabels:
      capturePlan.status === 'ready'
        ? []
        : capturePlan.fallbacks.map((fallback) => fallback.reason),
    providerRequirementLabels: capturePlan.providerRequirements.map(readableRequirement),
    verificationReceipts,
  });
}

function visualSourceStep(
  project: MotionProject,
  visualSourcingPlan: MotionVisualSourcingPlan
): MotionProductionStep {
  if (visualSourcingPlan.status === 'complete' || isGraphDone(project.graphNodes, 'visual-search')) {
    return step('visual-source', project, {
      status: 'complete',
      blockerLabels: [],
      providerRequirementLabels: [],
      verificationReceipts: nodeReceipts(project, 'visual-search', 'capture'),
    });
  }

  return step('visual-source', project, {
    status: visualSourcingPlan.status === 'ready' ? 'ready' : 'blocked',
    blockerLabels: visualSourcingPlan.blockers.map((blocker) => blocker.label),
    providerRequirementLabels: visualSourcingPlan.providerRequirements.map(readableRequirement),
    verificationReceipts: [],
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
      verificationReceipts: nodeReceipts(project, 'image-to-video', 'render'),
    });
  }

  if (imageToVideoPlan.status === 'ready') {
    return step('visual-generation', project, {
      status: 'ready',
      blockerLabels: [],
      providerRequirementLabels: imageToVideoPlan.providerRequirements.map(readableRequirement),
      verificationReceipts: [],
    });
  }

  return step('visual-generation', project, {
    status: imageToVideoPlan.status === 'needs-visual-source' ? 'optional' : 'blocked',
    blockerLabels: imageToVideoPlan.blockers.map((blocker) => blocker.label),
    providerRequirementLabels: imageToVideoPlan.providerRequirements.map(readableRequirement),
    verificationReceipts: [],
  });
}

function step(
  id: MotionProductionStepId,
  project: MotionProject,
  input: {
    status: MotionProductionStepStatus;
    blockerLabels: string[];
    providerRequirementLabels: string[];
    verificationReceipts?: MotionProductionVerificationReceipt[];
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
    verificationReceipts: input.verificationReceipts ?? [],
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

function currentDraftApproved(project: MotionProject): boolean {
  if (project.workflowMode !== 'review') return true;
  return (
    project.drafts.find((candidate) => candidate.id === project.currentDraftId)?.status ===
    'approved'
  );
}

function draftDecisionReceipts(project: MotionProject): MotionProductionVerificationReceipt[] {
  const draft = project.drafts.find((candidate) => candidate.id === project.currentDraftId);
  if (!draft) return [];

  if (project.workflowMode === 'review') {
    if (draft.status !== 'approved') return [];

    return [
      {
        id: `receipt-draft-approval-${draft.id}`,
        kind: 'draft',
        label: 'Draft approval',
        ref: draft.id,
      },
    ];
  }

  return [
    {
      id: `receipt-draft-selection-${draft.id}`,
      kind: 'draft',
      label: 'Selected draft',
      ref: draft.id,
    },
  ];
}

function captureReceipts(project: MotionProject): MotionProductionVerificationReceipt[] {
  return project.graphNodes
    .filter((node) => node.kind === 'capture' && node.status === 'done')
    .flatMap((node) =>
      node.outputRefs.map((ref) => ({
        id: `receipt-capture-${ref}`,
        kind: 'capture' as const,
        label: captureReceiptLabel(ref),
        ref,
        ...(node.providerId ? { providerId: node.providerId } : {}),
      }))
    );
}

function renderReceipts(project: MotionProject): MotionProductionVerificationReceipt[] {
  const renderProviderId = [...project.graphNodes]
    .reverse()
    .find((node) => node.kind === 'render' && node.status === 'done')?.providerId;

  return project.exports.flatMap((motionExport) => [
    ...assetReceipt({
      kind: 'render',
      label: 'MP4',
      ref: motionExport.assetId,
      providerId: renderProviderId,
    }),
    ...assetReceipt({
      kind: 'render',
      label: 'Poster',
      ref: motionExport.posterAssetId,
      providerId: renderProviderId,
    }),
    ...assetReceipt({
      kind: 'render',
      label: 'Subtitles',
      ref: motionExport.subtitleAssetId,
      providerId: renderProviderId,
    }),
    ...assetReceipt({
      kind: 'render',
      label: 'Transcript',
      ref: motionExport.transcriptAssetId,
      providerId: renderProviderId,
    }),
    ...assetReceipt({
      kind: 'render',
      label: 'Manifest',
      ref: motionExport.manifestAssetId,
      providerId: renderProviderId,
    }),
  ]);
}

function exportReceipts(
  exportPackPlan: MotionExportPackPlan
): MotionProductionVerificationReceipt[] {
  return exportPackPlan.manifest
    ? [
        {
          id: `receipt-export-${exportPackPlan.manifest.id}`,
          kind: 'export',
          label: 'Export pack manifest',
          ref: exportPackPlan.manifest.id,
          path: exportPackPlan.manifest.path,
        },
      ]
    : [];
}

function nodeReceipts(
  project: MotionProject,
  nodeKind: MotionGraphNode['kind'],
  receiptKind: MotionProductionVerificationReceiptKind
): MotionProductionVerificationReceipt[] {
  return project.graphNodes
    .filter((node) => node.kind === nodeKind && node.status === 'done')
    .flatMap((node) =>
      node.outputRefs.map((ref) => ({
        id: `receipt-${receiptKind}-${ref}`,
        kind: receiptKind,
        label: humanizeRef(ref),
        ref,
        ...(node.providerId ? { providerId: node.providerId } : {}),
      }))
    );
}

function assetReceipt(input: {
  kind: MotionProductionVerificationReceiptKind;
  label: string;
  ref?: string;
  providerId?: string;
}): MotionProductionVerificationReceipt[] {
  if (!input.ref) return [];
  return [
    {
      id: `receipt-${input.kind}-${input.ref}`,
      kind: input.kind,
      label: input.label,
      ref: input.ref,
      ...(input.providerId ? { providerId: input.providerId } : {}),
    },
  ];
}

function captureReceiptLabel(ref: string): string {
  if (/record/i.test(ref)) return 'Recording';
  if (/snapshot|dom/i.test(ref)) return 'DOM snapshot';
  if (/trace/i.test(ref)) return 'Interaction trace';
  return 'Screenshot';
}

function humanizeRef(ref: string): string {
  return ref
    .replace(/^render-/, '')
    .replace(/^capture-/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isGraphDone(
  nodes: MotionGraphNode[],
  kind: MotionGraphNode['kind']
): boolean {
  return nodes.some((node) => node.kind === kind && node.status === 'done');
}

function isGraphNodeDone(nodes: MotionGraphNode[], id: string): boolean {
  return nodes.some((node) => node.id === id && node.status === 'done');
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

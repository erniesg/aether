import type { WorkflowEngine } from '@/lib/workflow/registry';
import type {
  AgentMotionWorkflowRunPlan,
  MotionWorkflowRunStep,
} from './workflowPlan';
import type {
  MotionRenderEngine,
  MotionRenderOutputKind,
  MotionRenderRequest,
  MotionRenderSourceFileKind,
} from '@/lib/providers/video/types';
import {
  buildMotionReviewPlan,
  type MotionReviewPlan,
} from './reviewPlan';
import {
  buildMotionExportPackPlan,
  type MotionExportPackAssetKind,
  type MotionExportPackStatus,
} from './exportPackPlan';
import {
  buildMotionImageToVideoPlan,
  type MotionImageToVideoPlanStatus,
} from './imageToVideoPlan';
import {
  buildMotionVisualSourcingPlan,
  type MotionVisualSourcingPlanStatus,
  type MotionVisualSourcingRequestKind,
} from './visualSourcingPlan';
import {
  buildMotionProductionPlan,
  type MotionProductionPlan,
} from './productionPlan';
import {
  buildMotionRenderPlan,
  type MotionRenderPlanStatus,
} from './renderPlan';
import {
  buildMotionRenderEditContract,
  buildMotionRenderSourceBundle,
  type MotionRenderEditContractComponent,
} from './renderSource';
import {
  buildMotionDesignKitPlan,
  type MotionDesignKitPlan,
} from './designKit';
import {
  buildMotionReferenceGrammarPlan,
  type MotionReferenceGrammarPlan,
} from './referenceGrammar';
import {
  buildMotionCanvasMaterialPlan,
  type MotionCanvasMaterialPlan,
} from './canvasMaterial';
import {
  buildMotionSyncPlan,
  type MotionCaptionTimingSource,
  type MotionSyncPlanStatus,
  type MotionVoiceSyncStatus,
} from './syncPlan';
import { getMotionComponent } from './componentRegistry';
import { getMotionEffectPreset } from './effectPresets';
import {
  DEFAULT_MOTION_FPS,
  motionSeconds,
  type MotionDraft,
  type MotionExecutionHistoryEntry,
  type MotionExecutionReceipt,
  type MotionProject,
  type MotionProvenanceRef,
  type MotionSourceProfile,
  type MotionTrackKind,
  type TimelineClip,
  type TimelineTrack,
} from './project';

export type MotionPreviewEngineStatus = MotionRenderPlanStatus | 'provider-required';

export interface MotionPreviewSourceFile {
  kind: MotionRenderSourceFileKind;
  path: string;
  mimeType: string;
}

export interface MotionPreviewBlocker {
  id: string;
  label: string;
}

export type MotionPreviewRuntimeKind =
  | 'remotion-player'
  | 'hyperframes-iframe'
  | 'provider-preview';

export type MotionPreviewRuntimeStatus =
  | 'needs-source-host'
  | 'needs-render-source'
  | 'provider-required';

export interface MotionPreviewRuntimeTarget {
  kind: MotionPreviewRuntimeKind;
  label: string;
  status: MotionPreviewRuntimeStatus;
  mountLabel: string;
  sourceHostRequirement: string;
  editLinkLabels: string[];
}

export interface MotionPreviewEnginePlan {
  engine: WorkflowEngine;
  status: MotionPreviewEngineStatus;
  compositionId: string | null;
  entryPoint: string | null;
  durationSeconds: number;
  outputKinds: MotionRenderOutputKind[];
  componentIds: string[];
  sourceFiles: MotionPreviewSourceFile[];
  blockers: MotionPreviewBlocker[];
  runtimePreview: MotionPreviewRuntimeTarget | null;
}

export interface MotionPreviewStoryBeat {
  beatId: string;
  role: MotionReviewPlan['storyBeats'][number]['role'];
  narration: string;
  targetSeconds: number;
  componentId?: string;
  sourceRefs: MotionProvenanceRef[];
}

export interface MotionPreviewDraftOption {
  draftId: string;
  label: string;
  angle: string;
  status: MotionDraft['status'];
  isCurrent: boolean;
  durationSeconds: number;
  roles: MotionPreviewStoryBeat['role'][];
}

export interface MotionPreviewTimelineClip {
  clipId: string;
  componentId: string | null;
  componentLabel: string;
  startSeconds: number;
  durationSeconds: number;
  summary: string;
  linkedVariantScope: TimelineClip['linkedVariantScope'];
  editControlIds: string[];
  regenerateScopes: string[];
  effectPreset: string | null;
  effectLabel: string | null;
}

export interface MotionPreviewTimelineRow {
  trackId: string;
  trackKind: MotionTrackKind;
  durationSeconds: number;
  clips: MotionPreviewTimelineClip[];
}

export interface MotionPreviewEditableComponent {
  trackId: string;
  clipId: string;
  componentId: string;
  componentLabel: string;
  editControlIds: string[];
  regenerateScopes: string[];
}

export interface MotionPreviewRegenerationAction {
  id: string;
  clipId: string;
  componentId: string;
  componentLabel: string;
  scope: string;
  label: string;
}

export interface MotionPreviewEditSourceComponent {
  trackId: string;
  trackKind: MotionTrackKind;
  clipId: string;
  componentId: string;
  componentLabel: string;
  editControlIds: string[];
  editControlLabels: string[];
  regenerateScopes: string[];
  sourceFiles: string[];
  sourceFileLabels: string[];
  editSurfaceLabels: string[];
}

export interface MotionPreviewEditSourceFile {
  path: string;
  label: string;
  purpose: string;
  editSurfaceLabels: string[];
}

export interface MotionPreviewEditSource {
  status: 'ready' | 'needs-render-source';
  engine: MotionRenderEngine | null;
  apiRoute: string | null;
  actionLabel: string | null;
  artifactPath: string | null;
  timelinePath: string | null;
  scriptPath: string | null;
  storyboardPath: string | null;
  editableComponentCount: number;
  regenerationScopes: string[];
  sourceFilePaths: string[];
  sourceFiles: MotionPreviewEditSourceFile[];
  components: MotionPreviewEditSourceComponent[];
  blockerLabels: string[];
}

export interface MotionPreviewVideoPlanScene {
  sceneId: string;
  beatId: string;
  role: MotionReviewPlan['storyBeats'][number]['role'];
  startSeconds: number;
  durationSeconds: number;
  narration: string;
  visualLabel: string;
  editSummary: string;
  evidenceLabel: string;
  regenerationActions: MotionPreviewRegenerationAction[];
}

export interface MotionPreviewVideoPlan {
  status: 'needs-review' | 'ready-for-render';
  title: string;
  sceneCount: number;
  totalSeconds: number;
  scenes: MotionPreviewVideoPlanScene[];
}

export interface MotionPreviewSourceProfile {
  label: string;
  sourceKind: MotionSourceProfile['kind'];
  summary: string;
  signalLabels: string[];
  captureCandidateLabels: string[];
  storyboardHintLabels: string[];
  readyCaptureCount: number;
}

export interface MotionPreviewSyncSummary {
  status: MotionSyncPlanStatus;
  beatCount: number;
  captionCount: number;
  transitionCount: number;
  soundCueCount: number;
  requirementLabels: string[];
  blockerLabels: string[];
}

export interface MotionPreviewSyncBeat {
  role: MotionReviewPlan['storyBeats'][number]['role'];
  startSeconds: number;
  durationSeconds: number;
  voiceStatus: MotionVoiceSyncStatus;
  captionTimingSource: MotionCaptionTimingSource;
}

export interface MotionPreviewSyncSoundCue {
  kind: 'transition' | 'emphasis' | 'cta';
  label: string;
  startSeconds: number;
  durationSeconds: number;
}

export interface MotionPreviewExportPackSummary {
  status: MotionExportPackStatus;
  readyCount: number;
  totalCount: number;
  targetLabels: string[];
  canvasDropCount: number;
  missingAssetKinds: MotionExportPackAssetKind[];
  blockerLabels: string[];
}

export type MotionPreviewRenderProofStatus =
  | 'needs-targets'
  | 'needs-render'
  | 'partial'
  | 'ready';

export type MotionPreviewRenderProofArtifactStatus = 'ready' | 'missing';

export interface MotionPreviewRenderProofArtifact {
  kind: MotionExportPackAssetKind;
  label: string;
  status: MotionPreviewRenderProofArtifactStatus;
  targetLabel: string;
  assetUrl: string | null;
  path: string | null;
  mimeType: string | null;
  width: number;
  height: number;
  editSurfaceLabels: string[];
}

export interface MotionPreviewRenderProofCanvasDropTarget {
  artifactLabel: string;
  label: string;
  targetLabel: string;
  url: string;
  width: number;
  height: number;
  mimeType: string;
  motionProjectId: string;
}

export interface MotionPreviewRenderProofSummary {
  status: MotionPreviewRenderProofStatus;
  engineLabel: string | null;
  providerLabel: string | null;
  readyTargetCount: number;
  totalTargetCount: number;
  proofArtifactCount: number;
  targetLabels: string[];
  artifactLabels: string[];
  missingArtifactLabels: string[];
  actionLabels: string[];
  blockerLabels: string[];
  proofArtifacts: MotionPreviewRenderProofArtifact[];
  canvasDropTargets: MotionPreviewRenderProofCanvasDropTarget[];
}

export interface MotionPreviewVisualGenerationRequest {
  requestId: string;
  clipId: string;
  componentLabel: string;
  durationSeconds: number;
  prompt: string;
  outputLabel: string;
}

export type MotionPreviewVisualGenerationNodeStatus =
  | 'complete'
  | 'ready'
  | 'planned'
  | 'blocked';

export interface MotionPreviewVisualGenerationNode {
  id: string;
  label: string;
  status: MotionPreviewVisualGenerationNodeStatus;
  inputLabels: string[];
  outputLabels: string[];
  actionLabel: string | null;
}

export interface MotionPreviewVisualGenerationEdge {
  from: string;
  to: string;
  label: string;
}

export interface MotionPreviewVisualGenerationNodePlan {
  status: MotionImageToVideoPlanStatus;
  nodes: MotionPreviewVisualGenerationNode[];
  edges: MotionPreviewVisualGenerationEdge[];
  nextNodeId: string | null;
}

export interface MotionPreviewVisualGenerationSummary {
  status: MotionImageToVideoPlanStatus;
  requestCount: number;
  providerRequirementLabels: string[];
  requestLabels: string[];
  requests: MotionPreviewVisualGenerationRequest[];
  nodePlan: MotionPreviewVisualGenerationNodePlan;
  blockerLabels: string[];
  nextActionLabels: string[];
}

export interface MotionPreviewVisualSourcingRequest {
  requestId: string;
  kind: MotionVisualSourcingRequestKind;
  label: string;
  prompt: string;
  reason: string;
  targetRoles: string[];
  componentLabels: string[];
  sourceLabels: string[];
  providerRequirementLabels: string[];
  apiRoutes: string[];
  expectedOutputs: string[];
}

export interface MotionPreviewVisualSourcingSummary {
  status: MotionVisualSourcingPlanStatus;
  requestCount: number;
  providerRequirementLabels: string[];
  requestLabels: string[];
  requests: MotionPreviewVisualSourcingRequest[];
  blockerLabels: string[];
  nextActionLabels: string[];
}

export interface MotionPreviewAgentRunbookStep {
  stepId: string;
  gateLabel: string;
  label: string;
  reviewRequired: boolean;
  autoAdvance: boolean;
  inputLabels: string[];
  artifactLabels: string[];
  outputLabels: string[];
  toolLabels: string[];
  routeLabels: string[];
}

export interface MotionPreviewAgentRunbook {
  mode: AgentMotionWorkflowRunPlan['mode'];
  status: AgentMotionWorkflowRunPlan['status'];
  primaryAction: AgentMotionWorkflowRunPlan['primaryAction'];
  nextStepId: string | null;
  nextStepLabel: string | null;
  stepCount: number;
  reviewRequiredCount: number;
  autoAdvanceCount: number;
  verificationLabels: string[];
  steps: MotionPreviewAgentRunbookStep[];
}

export interface MotionPreviewExecutionHistoryEntry {
  id: string;
  gateId: MotionExecutionHistoryEntry['gateId'];
  label: string;
  providerLabel: string | null;
  savedAt: number;
  receiptCount: number;
  receiptLabels: string[];
}

export interface MotionPreviewExecutionHistory {
  status: 'empty' | 'saved';
  savedStepCount: number;
  receiptCount: number;
  latestReceiptLabels: string[];
  entries: MotionPreviewExecutionHistoryEntry[];
}

export type MotionPreviewCapabilitySetupStatus = 'ready' | 'needs-setup' | 'blocked';
export type MotionPreviewCapabilitySetupItemStatus =
  | 'configured'
  | 'needs-provider'
  | 'needs-runner'
  | 'blocked';

export interface MotionPreviewCapabilityProvider {
  id: string;
  displayName: string;
  available: boolean;
  engine?: MotionRenderEngine;
}

export interface MotionPreviewCapabilitySetupInventory {
  capture?: MotionPreviewCapabilityProvider[];
  visualSource?: MotionPreviewCapabilityProvider[];
  imageToVideo?: MotionPreviewCapabilityProvider[];
  voice?: MotionPreviewCapabilityProvider[];
  render?: MotionPreviewCapabilityProvider[];
}

export interface MotionPreviewCapabilitySetupItem {
  id: string;
  label: string;
  status: MotionPreviewCapabilitySetupItemStatus;
  actionLabel: string;
  routeLabels: string[];
  toolLabels: string[];
  requirementLabels: string[];
  providerLabels: string[];
  configuredProviderLabels: string[];
  runnerLabels: string[];
  blockerLabels: string[];
}

export interface MotionPreviewCapabilitySetup {
  status: MotionPreviewCapabilitySetupStatus;
  readyCount: number;
  missingCount: number;
  blockedCount: number;
  nextActionLabel: string | null;
  items: MotionPreviewCapabilitySetupItem[];
}

export interface MotionPreviewPlan {
  id: string;
  projectId: string;
  draftId: string;
  title: string;
  workflowMode: MotionProject['workflowMode'];
  primaryAction: MotionReviewPlan['primaryAction'];
  summary: MotionReviewPlan['summary'];
  sourceProfile: MotionPreviewSourceProfile | null;
  videoPlan: MotionPreviewVideoPlan;
  designKit: MotionDesignKitPlan;
  storyboard: MotionPreviewStoryBeat[];
  draftOptions: MotionPreviewDraftOption[];
  timelineRows: MotionPreviewTimelineRow[];
  editableComponents: MotionPreviewEditableComponent[];
  regenerationActions: MotionPreviewRegenerationAction[];
  enginePreviews: MotionPreviewEnginePlan[];
  editSource: MotionPreviewEditSource;
  syncSummary: MotionPreviewSyncSummary;
  syncBeats: MotionPreviewSyncBeat[];
  syncSoundCues: MotionPreviewSyncSoundCue[];
  exportPackSummary: MotionPreviewExportPackSummary;
  renderProofSummary: MotionPreviewRenderProofSummary;
  canvasMaterialPlan: MotionCanvasMaterialPlan;
  referenceGrammar: MotionReferenceGrammarPlan;
  visualSourcingSummary: MotionPreviewVisualSourcingSummary;
  visualGenerationSummary: MotionPreviewVisualGenerationSummary;
  capabilitySetup: MotionPreviewCapabilitySetup;
  agentRunbook: MotionPreviewAgentRunbook | null;
  productionPlan: MotionProductionPlan;
  executionHistory: MotionPreviewExecutionHistory;
  provenance: MotionProvenanceRef[];
  requestedAt: number;
}

export interface BuildMotionPreviewPlanOptions {
  engines?: WorkflowEngine[];
  workflowRunPlan?: AgentMotionWorkflowRunPlan;
  providerSetup?: MotionPreviewCapabilitySetupInventory;
  fps?: number;
  requestedAt: number;
}

const DEFAULT_PREVIEW_ENGINES: WorkflowEngine[] = ['remotion', 'hyperframes'];

export function buildMotionPreviewPlan(
  project: MotionProject,
  options: BuildMotionPreviewPlanOptions
): MotionPreviewPlan {
  const reviewPlan = buildMotionReviewPlan(project);
  const tracks = selectTracks(project, project.currentDraftId);
  const engines = options.engines?.length ? options.engines : DEFAULT_PREVIEW_ENGINES;
  const fps = options.fps ?? DEFAULT_MOTION_FPS;
  const timelineRows = buildTimelineRows(tracks);
  const editableComponents = buildEditableComponents(tracks);
  const regenerationActions = buildRegenerationActions(editableComponents);
  const videoPlan = buildVideoPlan(reviewPlan, timelineRows, regenerationActions);
  const syncPlan = buildMotionSyncPlan(project, {
    draftId: project.currentDraftId,
    fps,
    requestedAt: options.requestedAt,
  });
  const exportPackPlan = buildMotionExportPackPlan(project, {
    draftId: project.currentDraftId,
    requestedAt: options.requestedAt,
  });
  const referenceGrammar = buildMotionReferenceGrammarPlan(project, {
    draftId: project.currentDraftId,
    requestedAt: options.requestedAt,
  });
  const visualSourcingPlan = buildMotionVisualSourcingPlan(project, {
    draftId: project.currentDraftId,
    requestedAt: options.requestedAt,
  });
  const imageToVideoPlan = buildMotionImageToVideoPlan(project, {
    draftId: project.currentDraftId,
    fps,
    requestedAt: options.requestedAt,
  });
  const enginePreviews = engines.map((engine) =>
    buildEnginePreview(project, engine, {
      fps,
      requestedAt: options.requestedAt,
    })
  );
  const editSource = buildEditSourceSummary(project, engines, {
    fps,
    requestedAt: options.requestedAt,
  });
  const productionPlan = buildMotionProductionPlan(project, {
    engines,
    fps,
    requestedAt: options.requestedAt,
  });
  const exportPackSummary = buildExportPackSummary(exportPackPlan);
  const renderProofSummary = buildRenderProofSummary(
    exportPackPlan,
    project.executionHistory,
    editSource,
    engines
  );
  const visualGenerationSummary = buildVisualGenerationSummary(
    imageToVideoPlan,
    timelineRows
  );
  const canvasMaterialPlan = buildMotionCanvasMaterialPlan({
    projectId: project.id,
    draftId: project.currentDraftId,
    title: project.title,
    workflowMode: project.workflowMode,
    primaryAction: reviewPlan.primaryAction,
    summary: reviewPlan.summary,
    videoPlan,
    visualGenerationSummary,
    renderProofSummary,
    exportPackSummary,
  });

  return {
    id: `preview-${project.id}-${project.currentDraftId}-${options.requestedAt}`,
    projectId: project.id,
    draftId: project.currentDraftId,
    title: project.title,
    workflowMode: project.workflowMode,
    primaryAction: reviewPlan.primaryAction,
    summary: reviewPlan.summary,
    sourceProfile: buildSourceProfileSummary(project.sourceProfile),
    videoPlan,
    designKit: buildMotionDesignKitPlan(project),
    storyboard: reviewPlan.storyBeats.map((beat) => ({
      beatId: beat.beatId,
      role: beat.role,
      narration: beat.narration,
      targetSeconds: beat.targetSeconds,
      componentId: beat.componentId,
      sourceRefs: beat.sourceRefs,
    })),
    draftOptions: reviewPlan.drafts.map((draft) => ({
      draftId: draft.draftId,
      label: draft.label,
      angle: draft.angle,
      status: draft.status,
      isCurrent: draft.isCurrent,
      durationSeconds: draft.durationSeconds,
      roles: draft.roles,
    })),
    timelineRows,
    editableComponents,
    regenerationActions,
    enginePreviews,
    editSource,
    syncSummary: buildSyncSummary(syncPlan),
    syncBeats: buildSyncBeats(syncPlan),
    syncSoundCues: buildSyncSoundCues(syncPlan),
    exportPackSummary,
    renderProofSummary,
    canvasMaterialPlan,
    referenceGrammar,
    visualSourcingSummary: buildVisualSourcingSummary(visualSourcingPlan),
    visualGenerationSummary,
    capabilitySetup: buildCapabilitySetup(project, productionPlan, enginePreviews, {
      engines,
      providers: options.providerSetup,
    }),
    agentRunbook: buildAgentRunbook(options.workflowRunPlan),
    productionPlan,
    executionHistory: buildExecutionHistorySummary(project.executionHistory),
    provenance: uniqueProvenance([
      ...project.sourceRefs,
      ...tracks.map((track) => ({ kind: 'timeline' as const, ref: track.id })),
    ]),
    requestedAt: options.requestedAt,
  };
}

function buildExecutionHistorySummary(
  history: MotionExecutionHistoryEntry[] | undefined
): MotionPreviewExecutionHistory {
  const entries = (history ?? []).map((entry) => ({
    id: entry.id,
    gateId: entry.gateId,
    label: entry.label,
    providerLabel: entry.providerId ? readableLabel(entry.providerId) : null,
    savedAt: entry.savedAt,
    receiptCount: entry.receiptCount,
    receiptLabels: entry.receiptLabels,
  }));
  const latestEntry = entries[entries.length - 1] ?? null;

  return {
    status: entries.length > 0 ? 'saved' : 'empty',
    savedStepCount: entries.length,
    receiptCount: entries.reduce((total, entry) => total + entry.receiptCount, 0),
    latestReceiptLabels: latestEntry?.receiptLabels ?? [],
    entries,
  };
}

function buildAgentRunbook(
  runPlan: AgentMotionWorkflowRunPlan | undefined
): MotionPreviewAgentRunbook | null {
  if (!runPlan) return null;

  const steps = runPlan.steps.map(agentRunbookStep);
  const nextStep = steps.find((step) => step.stepId === runPlan.nextStepId) ?? null;

  return {
    mode: runPlan.mode,
    status: runPlan.status,
    primaryAction: runPlan.primaryAction,
    nextStepId: runPlan.nextStepId,
    nextStepLabel: nextStep?.label ?? null,
    stepCount: runPlan.stepCount,
    reviewRequiredCount: steps.filter((step) => step.reviewRequired).length,
    autoAdvanceCount: steps.filter((step) => step.autoAdvance).length,
    verificationLabels: runPlan.verificationArtifacts.map(readableLabel),
    steps,
  };
}

function agentRunbookStep(step: MotionWorkflowRunStep): MotionPreviewAgentRunbookStep {
  return {
    stepId: step.id,
    gateLabel: readableLabel(step.gateId),
    label: step.label,
    reviewRequired: step.reviewRequired,
    autoAdvance: step.autoAdvance,
    inputLabels: step.inputSummary,
    artifactLabels: step.expectedArtifacts,
    outputLabels: step.outputSummary,
    toolLabels: step.toolIds.map(readableLabel),
    routeLabels: step.apiRoutes,
  };
}

function buildCapabilitySetup(
  project: MotionProject,
  productionPlan: MotionProductionPlan,
  enginePreviews: MotionPreviewEnginePlan[],
  options: {
    engines: WorkflowEngine[];
    providers?: MotionPreviewCapabilitySetupInventory;
  }
): MotionPreviewCapabilitySetup {
  const items = [
    setupItemForStep(productionPlan, 'capture', {
      inventory: options.providers?.capture,
      defaultActionLabel: 'Connect browser capture',
    }),
    ...localAppSetupItems(project),
    setupItemForStep(productionPlan, 'visual-source', {
      inventory: options.providers?.visualSource,
      defaultActionLabel: 'Connect visual sources',
    }),
    setupItemForStep(productionPlan, 'visual-generation', {
      inventory: options.providers?.imageToVideo,
      defaultActionLabel: 'Connect image-to-video',
    }),
    setupItemForStep(productionPlan, 'voice', {
      inventory: options.providers?.voice,
      defaultActionLabel: 'Connect voice synthesis',
    }),
    setupItemForStep(productionPlan, 'sync', {
      defaultActionLabel: 'Review sync markers',
      preferBlocked: true,
    }),
    renderSetupItem(productionPlan, enginePreviews, options),
  ].filter((item): item is MotionPreviewCapabilitySetupItem => Boolean(item));
  const readyCount = items.filter((item) => item.status === 'configured').length;
  const missingCount = items.filter(
    (item) => item.status === 'needs-provider' || item.status === 'needs-runner'
  ).length;
  const blockedCount = items.filter((item) => item.status === 'blocked').length;
  const nextItem =
    items.find((item) => item.status === 'needs-provider' || item.status === 'needs-runner') ??
    items.find((item) => item.status === 'blocked') ??
    null;

  return {
    status: missingCount > 0 ? 'needs-setup' : blockedCount > 0 ? 'blocked' : 'ready',
    readyCount,
    missingCount,
    blockedCount,
    nextActionLabel: nextItem?.actionLabel ?? null,
    items,
  };
}

function setupItemForStep(
  productionPlan: MotionProductionPlan,
  stepId: MotionProductionPlan['steps'][number]['id'],
  options: {
    inventory?: MotionPreviewCapabilityProvider[];
    defaultActionLabel: string;
    preferBlocked?: boolean;
  }
): MotionPreviewCapabilitySetupItem | null {
  const step = productionPlan.steps.find((candidate) => candidate.id === stepId);
  if (!step) return null;

  const providerLabels = availableProviderLabels(options.inventory);
  const needsProvider = step.providerRequirementLabels.length > 0 && providerLabels.length === 0;
  const blocked = step.blockerLabels.length > 0 && (options.preferBlocked || !needsProvider);
  const configured = step.status === 'complete' || providerLabels.length > 0;
  const status: MotionPreviewCapabilitySetupItemStatus = blocked
    ? 'blocked'
    : configured
      ? 'configured'
      : needsProvider
        ? 'needs-provider'
        : step.status === 'blocked'
          ? 'blocked'
          : 'configured';

  return {
    id: step.id,
    label: step.label,
    status,
    actionLabel: status === 'configured' ? step.actionLabel : options.defaultActionLabel,
    routeLabels: step.apiRoutes,
    toolLabels: step.toolIds.map(readableLabel),
    requirementLabels: step.providerRequirementLabels,
    providerLabels,
    configuredProviderLabels: providerLabels,
    runnerLabels: [],
    blockerLabels: step.blockerLabels,
  };
}

function renderSetupItem(
  productionPlan: MotionProductionPlan,
  enginePreviews: MotionPreviewEnginePlan[],
  options: {
    engines: WorkflowEngine[];
    providers?: MotionPreviewCapabilitySetupInventory;
  }
): MotionPreviewCapabilitySetupItem | null {
  const step = productionPlan.steps.find((candidate) => candidate.id === 'render');
  if (!step) return null;

  const requestedRenderEngines = uniqueStrings(
    options.engines.filter(isMotionRenderEngine)
  ) as MotionRenderEngine[];
  const plannedRenderEngines = uniqueStrings(
    enginePreviews
      .filter((preview) => isMotionRenderEngine(preview.engine))
      .map((preview) => preview.engine as MotionRenderEngine)
  ) as MotionRenderEngine[];
  const renderEngines = requestedRenderEngines.length
    ? requestedRenderEngines
    : plannedRenderEngines.length
      ? plannedRenderEngines
      : (['remotion'] satisfies MotionRenderEngine[]);
  const providerLabels = availableProviderLabels(
    options.providers?.render?.filter((provider) =>
      provider.engine ? renderEngines.includes(provider.engine) : true
    )
  );
  const requirementLabels = renderEngines.map((engine) => `${engine} render runner`);
  const status: MotionPreviewCapabilitySetupItemStatus =
    step.status === 'complete' || providerLabels.length > 0
      ? 'configured'
      : 'needs-runner';

  return {
    id: step.id,
    label: step.label,
    status,
    actionLabel:
      status === 'configured'
        ? step.actionLabel
        : renderEngines.length > 1
          ? 'Connect Remotion or HyperFrames runner'
          : `Connect ${readableLabel(renderEngines[0])} runner`,
    routeLabels: step.apiRoutes,
    toolLabels: step.toolIds.map(readableLabel),
    requirementLabels,
    providerLabels,
    configuredProviderLabels: providerLabels,
    runnerLabels: providerLabels,
    blockerLabels: step.blockerLabels,
  };
}

function localAppSetupItems(project: MotionProject): MotionPreviewCapabilitySetupItem[] {
  const labels = uniqueStrings(
    (project.sourceProfile?.captureCandidates ?? []).flatMap((candidate) => {
      if (candidate.targetKind !== 'local-app' || !candidate.setup || !candidate.targetRef) {
        return [];
      }
      return [`${candidate.setup} -> ${candidate.targetRef}`];
    })
  );

  if (labels.length === 0) return [];

  return [
    {
      id: 'local-app',
      label: 'Local app runner',
      status: 'needs-runner',
      actionLabel: 'Trust local app launch',
      routeLabels: ['/api/motion/capture'],
      toolLabels: ['app launch', 'browser capture'],
      requirementLabels: ['trusted local app launch'],
      providerLabels: [],
      configuredProviderLabels: [],
      runnerLabels: labels,
      blockerLabels: [],
    },
  ];
}

function availableProviderLabels(
  inventory: MotionPreviewCapabilityProvider[] | undefined
): string[] {
  return uniqueStrings((inventory ?? []).filter((provider) => provider.available).map(providerLabel));
}

function providerLabel(provider: MotionPreviewCapabilityProvider): string {
  return provider.displayName || readableLabel(provider.id);
}

function buildSourceProfileSummary(
  profile: MotionSourceProfile | undefined
): MotionPreviewSourceProfile | null {
  if (!profile) return null;

  return {
    label: profile.label,
    sourceKind: profile.kind,
    summary: profile.summary,
    signalLabels: profile.signals.map((signal) => `${signal.label}: ${signal.value}`),
    captureCandidateLabels: profile.captureCandidates.map((candidate) => candidate.label),
    storyboardHintLabels: profile.storyboardHints.map((hint) => `${hint.beatRole}: ${hint.label}`),
    readyCaptureCount: profile.captureCandidates.filter((candidate) => candidate.targetRef).length,
  };
}

function buildVideoPlan(
  reviewPlan: MotionReviewPlan,
  timelineRows: MotionPreviewTimelineRow[],
  regenerationActions: MotionPreviewRegenerationAction[]
): MotionPreviewVideoPlan {
  let cursor = 0;
  const scenes = reviewPlan.storyBeats.map((beat, index) => {
    const visualClip = findVisualClipForBeat(timelineRows, beat.beatId);
    const actions = visualClip
      ? regenerationActions.filter((action) => action.clipId === visualClip.clipId)
      : [];
    const startSeconds = cursor;
    cursor += beat.targetSeconds;

    return {
      sceneId: `scene-${index + 1}`,
      beatId: beat.beatId,
      role: beat.role,
      startSeconds: roundSecondValue(startSeconds),
      durationSeconds: beat.targetSeconds,
      narration: beat.narration,
      visualLabel: visualClip?.componentLabel ?? componentLabelFor(beat.componentId),
      editSummary: visualClip?.summary || beat.narration,
      evidenceLabel: formatEvidenceLabel(beat.sourceRefs.length),
      regenerationActions: actions,
    };
  });

  return {
    status: reviewPlan.primaryAction === 'queue-render' ? 'ready-for-render' : 'needs-review',
    title: reviewPlan.title,
    sceneCount: scenes.length,
    totalSeconds: reviewPlan.summary.totalSeconds,
    scenes,
  };
}

function findVisualClipForBeat(
  timelineRows: MotionPreviewTimelineRow[],
  beatId: string
): MotionPreviewTimelineClip | null {
  const expectedTextClipId = `clip-${beatId}-text`;
  for (const row of timelineRows) {
    if (row.trackKind !== 'text' && row.trackKind !== 'screen' && row.trackKind !== 'broll') {
      continue;
    }

    const clip = row.clips.find((candidate) => candidate.clipId === expectedTextClipId);
    if (clip) return clip;
  }

  return null;
}

function componentLabelFor(componentId: string | undefined): string {
  if (!componentId) return 'Scene';
  return getMotionComponent(componentId)?.label ?? componentId.replace(/-/g, ' ');
}

function formatEvidenceLabel(count: number): string {
  if (count === 0) return 'manual scene';
  if (count === 1) return '1 source';
  return `${count} sources`;
}

function buildSyncBeats(
  syncPlan: ReturnType<typeof buildMotionSyncPlan>
): MotionPreviewSyncBeat[] {
  return syncPlan.beatMarkers.map((marker) => ({
    role: marker.role,
    startSeconds: marker.startSeconds,
    durationSeconds: marker.durationSeconds,
    voiceStatus: marker.voiceStatus,
    captionTimingSource: marker.captionTimingSource,
  }));
}

function buildSyncSoundCues(
  syncPlan: ReturnType<typeof buildMotionSyncPlan>
): MotionPreviewSyncSoundCue[] {
  return syncPlan.soundCues.map((cue) => ({
    kind: cue.kind,
    label: cue.label,
    startSeconds: cue.startSeconds,
    durationSeconds: cue.durationSeconds,
  }));
}

function buildSyncSummary(
  syncPlan: ReturnType<typeof buildMotionSyncPlan>
): MotionPreviewSyncSummary {
  return {
    status: syncPlan.status,
    beatCount: syncPlan.beatMarkers.length,
    captionCount: syncPlan.captionLinks.length,
    transitionCount: syncPlan.transitionCues.length,
    soundCueCount: syncPlan.soundCues.length,
    requirementLabels: syncPlan.providerRequirements.map(syncRequirementLabel),
    blockerLabels: syncPlan.blockers.map((blocker) => blocker.label),
  };
}

function buildExportPackSummary(
  exportPackPlan: ReturnType<typeof buildMotionExportPackPlan>
): MotionPreviewExportPackSummary {
  return {
    status: exportPackPlan.status,
    readyCount: exportPackPlan.readyCount,
    totalCount: exportPackPlan.totalCount,
    targetLabels: exportPackPlan.items.map(
      (item) => `${item.platform} ${item.aspectRatio} ${item.status}`
    ),
    canvasDropCount: exportPackPlan.items.filter((item) => item.canvasDrop).length,
    missingAssetKinds: uniqueStrings(
      exportPackPlan.items.flatMap((item) => item.missingAssetKinds)
    ) as MotionExportPackAssetKind[],
    blockerLabels: exportPackPlan.blockers.map((blocker) => blocker.label),
  };
}

function buildRenderProofSummary(
  exportPackPlan: ReturnType<typeof buildMotionExportPackPlan>,
  history: MotionExecutionHistoryEntry[] | undefined,
  editSource: MotionPreviewEditSource,
  engines: WorkflowEngine[]
): MotionPreviewRenderProofSummary {
  const renderEntries = (history ?? []).filter((entry) => entry.gateId === 'render');
  const latestRenderEntry = renderEntries[renderEntries.length - 1] ?? null;
  const renderReceipts = renderEntries.flatMap((entry) =>
    entry.receipts.filter((receipt) => receipt.kind === 'render')
  );
  const receiptsByRef = new Map(renderReceipts.map((receipt) => [receipt.ref, receipt]));
  const proofArtifacts = exportPackPlan.items.flatMap((item) =>
    renderProofArtifactsForItem(item, receiptsByRef, renderReceipts)
  );
  const readyArtifacts = proofArtifacts.filter((artifact) => artifact.status === 'ready');
  const missingArtifacts = proofArtifacts.filter((artifact) => artifact.status === 'missing');
  const status = renderProofStatusFor(exportPackPlan.status, readyArtifacts.length);
  const renderEngine = renderEngineForProof(engines, latestRenderEntry);

  return {
    status,
    engineLabel: renderEngine ? readableLabel(renderEngine) : null,
    providerLabel: latestRenderEntry?.providerId
      ? readableLabel(latestRenderEntry.providerId)
      : null,
    readyTargetCount: exportPackPlan.readyCount,
    totalTargetCount: exportPackPlan.totalCount,
    proofArtifactCount: readyArtifacts.length,
    targetLabels: exportPackPlan.items.map(renderProofTargetLabel),
    artifactLabels: uniqueStrings(readyArtifacts.map((artifact) => artifact.label)),
    missingArtifactLabels: uniqueStrings(missingArtifacts.map((artifact) => artifact.label)),
    actionLabels: renderProofActionLabels(status, editSource.status),
    blockerLabels: exportPackPlan.blockers.map((blocker) => blocker.label),
    proofArtifacts,
    canvasDropTargets: buildRenderProofCanvasDropTargets(
      exportPackPlan.projectId,
      proofArtifacts
    ),
  };
}

function renderProofArtifactsForItem(
  item: ReturnType<typeof buildMotionExportPackPlan>['items'][number],
  receiptsByRef: Map<string, MotionExecutionReceipt>,
  renderReceipts: MotionExecutionReceipt[]
): MotionPreviewRenderProofArtifact[] {
  return (
    ['video', 'poster', 'subtitle', 'transcript', 'manifest'] satisfies MotionExportPackAssetKind[]
  ).map((kind) => {
    const assetRef = exportAssetRefForKind(item, kind);
    const receipt =
      (assetRef ? receiptsByRef.get(assetRef) : undefined) ??
      renderReceipts.find(
        (candidate) =>
          candidate.ref === `render-${item.exportId}-${kind}` ||
          candidate.ref.startsWith(`render-${item.exportId}-${kind}-`)
      ) ??
      null;
    const status: MotionPreviewRenderProofArtifactStatus =
      assetRef || receipt ? 'ready' : 'missing';
    const dimensions = renderProofDimensions(item.aspectRatio);

    return {
      kind,
      label: renderProofArtifactLabel(kind),
      status,
      targetLabel: renderProofTargetLabel(item),
      assetUrl: receipt?.assetUrl ?? null,
      path: receipt?.path ?? null,
      mimeType: receipt?.mimeType ?? null,
      width: dimensions.width,
      height: dimensions.height,
      editSurfaceLabels: renderProofEditSurfaceLabels(kind),
    };
  });
}

function buildRenderProofCanvasDropTargets(
  motionProjectId: string,
  proofArtifacts: MotionPreviewRenderProofArtifact[]
): MotionPreviewRenderProofCanvasDropTarget[] {
  return proofArtifacts
    .filter(
      (
        artifact
      ): artifact is MotionPreviewRenderProofArtifact & {
        kind: 'video';
        assetUrl: string;
      } => artifact.kind === 'video' && artifact.status === 'ready' && Boolean(artifact.assetUrl)
    )
    .map((artifact) => ({
      artifactLabel: artifact.label,
      label: `${artifact.targetLabel} ${artifact.label}`,
      targetLabel: artifact.targetLabel,
      url: artifact.assetUrl,
      width: artifact.width,
      height: artifact.height,
      mimeType: artifact.mimeType ?? 'video/mp4',
      motionProjectId,
    }));
}

function renderProofDimensions(aspectRatio: string): { width: number; height: number } {
  if (aspectRatio === '9:16') return { width: 1080, height: 1920 };
  if (aspectRatio === '1:1') return { width: 1080, height: 1080 };
  if (aspectRatio === '4:5') return { width: 1080, height: 1350 };
  return { width: 1920, height: 1080 };
}

function renderProofStatusFor(
  exportStatus: MotionExportPackStatus,
  readyArtifactCount: number
): MotionPreviewRenderProofStatus {
  if (exportStatus === 'needs-targets') return 'needs-targets';
  if (exportStatus === 'ready') return 'ready';
  if (readyArtifactCount > 0) return 'partial';
  return 'needs-render';
}

function renderEngineForProof(
  engines: WorkflowEngine[],
  latestRenderEntry: MotionExecutionHistoryEntry | null
): MotionRenderEngine | null {
  const renderEngines = engines.filter(isMotionRenderEngine);
  const providerId = latestRenderEntry?.providerId ?? '';
  return (
    renderEngines.find((engine) => providerId.includes(engine)) ??
    renderEngines[0] ??
    null
  );
}

function exportAssetRefForKind(
  item: ReturnType<typeof buildMotionExportPackPlan>['items'][number],
  kind: MotionExportPackAssetKind
): string | undefined {
  if (kind === 'video') return item.videoAssetId;
  if (kind === 'poster') return item.posterAssetId;
  if (kind === 'subtitle') return item.subtitleAssetId;
  if (kind === 'transcript') return item.transcriptAssetId;
  return item.manifestAssetId;
}

function renderProofTargetLabel(
  item: ReturnType<typeof buildMotionExportPackPlan>['items'][number]
): string {
  return `${item.platform} ${item.aspectRatio}`;
}

function renderProofArtifactLabel(kind: MotionExportPackAssetKind): string {
  if (kind === 'video') return 'MP4';
  if (kind === 'poster') return 'Poster';
  if (kind === 'subtitle') return 'Subtitles';
  if (kind === 'transcript') return 'Transcript';
  return 'Manifest';
}

function renderProofEditSurfaceLabels(kind: MotionExportPackAssetKind): string[] {
  if (kind === 'video') return ['timeline', 'component', 'effect'];
  if (kind === 'poster') return ['poster', 'first frame'];
  if (kind === 'subtitle') return ['caption', 'timing'];
  if (kind === 'transcript') return ['script', 'voice'];
  return ['provenance', 'export'];
}

function renderProofActionLabels(
  status: MotionPreviewRenderProofStatus,
  editSourceStatus: MotionPreviewEditSource['status']
): string[] {
  const labels: string[] = [];

  if (status === 'needs-targets') {
    labels.push('Add export target');
  } else if (status === 'ready') {
    labels.push('Review render proof');
  } else if (status === 'partial') {
    labels.push('Review partial proof', 'Render remaining outputs');
  } else {
    labels.push('Render proof');
  }

  if (editSourceStatus === 'ready') {
    labels.push(
      status === 'needs-render' ? 'Tweak source before render' : 'Tweak source and rerender'
    );
  }

  if (status === 'ready') labels.push('Export pack');

  return labels;
}

function buildVisualSourcingSummary(
  visualSourcingPlan: ReturnType<typeof buildMotionVisualSourcingPlan>
): MotionPreviewVisualSourcingSummary {
  const requests = visualSourcingPlan.requests.map((request) => ({
    requestId: request.id,
    kind: request.kind,
    label: request.label,
    prompt: request.prompt,
    reason: request.reason,
    targetRoles: request.targetRoles,
    componentLabels: request.componentIds.map((componentId) => componentLabelFor(componentId)),
    sourceLabels: request.sourceLabels,
    providerRequirementLabels: request.providerRequirements.map((requirement) =>
      requirement.replace(/-/g, ' ')
    ),
    apiRoutes: request.apiRoutes,
    expectedOutputs: request.expectedOutputs,
  }));

  return {
    status: visualSourcingPlan.status,
    requestCount: requests.length,
    providerRequirementLabels: visualSourcingPlan.providerRequirements.map((requirement) =>
      requirement.replace(/-/g, ' ')
    ),
    requestLabels: requests.map((request) => request.label),
    requests,
    blockerLabels: visualSourcingPlan.blockers.map((blocker) => blocker.label),
    nextActionLabels: visualSourcingPlan.nextActions.map((action) => action.label),
  };
}

function buildVisualGenerationSummary(
  imageToVideoPlan: ReturnType<typeof buildMotionImageToVideoPlan>,
  timelineRows: MotionPreviewTimelineRow[]
): MotionPreviewVisualGenerationSummary {
  const requests = imageToVideoPlan.requests.map((request) => {
    const clip = findTimelineClipById(timelineRows, request.clipId);
    const componentLabel = clip?.componentLabel ?? 'Visual clip';
    return {
      requestId: request.id,
      clipId: request.clipId,
      componentLabel,
      durationSeconds: roundSecondValue(motionSeconds(request.durationFrames, request.fps)),
      prompt: request.prompt,
      outputLabel: `${request.aspectRatio} ${request.width}x${request.height}`,
    };
  });

  return {
    status: imageToVideoPlan.status,
    requestCount: imageToVideoPlan.requests.length,
    providerRequirementLabels: imageToVideoPlan.providerRequirements.map((requirement) =>
      requirement.replace(/-/g, ' ')
    ),
    requestLabels: requests.map(
      (request) => `${request.componentLabel} ${request.durationSeconds}s`
    ),
    requests,
    nodePlan: buildVisualGenerationNodePlan(imageToVideoPlan, requests),
    blockerLabels: imageToVideoPlan.blockers.map((blocker) => blocker.label),
    nextActionLabels: imageToVideoPlan.nextActions.map((action) => action.label),
  };
}

function buildVisualGenerationNodePlan(
  imageToVideoPlan: ReturnType<typeof buildMotionImageToVideoPlan>,
  requests: MotionPreviewVisualGenerationRequest[]
): MotionPreviewVisualGenerationNodePlan {
  if (imageToVideoPlan.status === 'needs-timeline') {
    return {
      status: imageToVideoPlan.status,
      nodes: [
        {
          id: 'timeline',
          label: 'Timeline',
          status: 'blocked',
          inputLabels: ['Draft scenes'],
          outputLabels: ['Timed clips'],
          actionLabel: 'Build timeline',
        },
      ],
      edges: [],
      nextNodeId: 'timeline',
    };
  }

  if (imageToVideoPlan.status === 'needs-visual-source') {
    return {
      status: imageToVideoPlan.status,
      nodes: [
        {
          id: 'timeline',
          label: 'Timeline',
          status: 'complete',
          inputLabels: ['Draft scenes'],
          outputLabels: ['Timed clips'],
          actionLabel: null,
        },
        {
          id: 'visual-source',
          label: 'Source visuals',
          status: 'blocked',
          inputLabels: ['Capture', 'Generated key visual'],
          outputLabels: ['Image-to-video source'],
          actionLabel: 'Capture or generate key visual',
        },
      ],
      edges: [
        {
          from: 'timeline',
          to: 'visual-source',
          label: 'selects clip',
        },
      ],
      nextNodeId: 'visual-source',
    };
  }

  const sourceLabels = uniqueStrings(requests.map((request) => `${request.componentLabel} source`));
  const outputLabels = uniqueStrings(requests.map((request) => request.outputLabel));

  return {
    status: imageToVideoPlan.status,
    nodes: [
      {
        id: 'visual-source',
        label: 'Source visuals',
        status: 'complete',
        inputLabels: sourceLabels,
        outputLabels: ['Image-to-video source'],
        actionLabel: null,
      },
      {
        id: 'image-to-video',
        label: 'Image-to-video',
        status: 'ready',
        inputLabels: sourceLabels,
        outputLabels,
        actionLabel:
          imageToVideoPlan.nextActions.find((action) => action.id === 'generate-video-clips')
            ?.label ?? 'Generate video clips',
      },
      {
        id: 'review-generated-clips',
        label: 'Review generated clips',
        status: 'planned',
        inputLabels: outputLabels,
        outputLabels: ['Approved clips'],
        actionLabel:
          imageToVideoPlan.nextActions.find((action) => action.id === 'review-generated-clips')
            ?.label ?? 'Review generated clips',
      },
      {
        id: 'timeline-update',
        label: 'Timeline update',
        status: 'planned',
        inputLabels: ['Approved clips'],
        outputLabels: ['Synced timeline'],
        actionLabel: 'Apply approved clips',
      },
    ],
    edges: [
      {
        from: 'visual-source',
        to: 'image-to-video',
        label: 'animates',
      },
      {
        from: 'image-to-video',
        to: 'review-generated-clips',
        label: 'offers takes',
      },
      {
        from: 'review-generated-clips',
        to: 'timeline-update',
        label: 'updates edit',
      },
    ],
    nextNodeId: 'image-to-video',
  };
}

function findTimelineClipById(
  timelineRows: MotionPreviewTimelineRow[],
  clipId: string
): MotionPreviewTimelineClip | null {
  for (const row of timelineRows) {
    const clip = row.clips.find((candidate) => candidate.clipId === clipId);
    if (clip) return clip;
  }
  return null;
}

function syncRequirementLabel(requirement: string): string {
  if (requirement === 'voice-synthesis') return 'voice';
  if (requirement === 'word-timing-alignment') return 'word timings';
  return readableLabel(requirement);
}

function readableLabel(value: string): string {
  return value.replace(/[-_]/g, ' ');
}

function buildEnginePreview(
  project: MotionProject,
  engine: WorkflowEngine,
  options: { fps: number; requestedAt: number }
): MotionPreviewEnginePlan {
  if (!isMotionRenderEngine(engine)) {
    return {
      engine,
      status: 'provider-required',
      compositionId: null,
      entryPoint: null,
      durationSeconds: 0,
      outputKinds: [],
      componentIds: [],
      sourceFiles: [],
      blockers: [
        {
          id: 'provider-adapter-required',
          label: 'Choose a configured video generation provider before render',
        },
      ],
      runtimePreview: {
        kind: 'provider-preview',
        label: 'Provider preview',
        status: 'provider-required',
        mountLabel: 'Choose provider preview',
        sourceHostRequirement: 'Configure a video provider preview before mounting generated media.',
        editLinkLabels: [],
      },
    };
  }

  const renderPlan = buildMotionRenderPlan(project, {
    engine,
    fps: options.fps,
    requestedAt: options.requestedAt,
  });
  if (renderPlan.status !== 'ready') {
    return {
      engine,
      status: renderPlan.status,
      compositionId: renderPlan.compositionId,
      entryPoint: null,
      durationSeconds: renderPlan.durationSeconds,
      outputKinds: [],
      componentIds: renderPlan.componentIds,
      sourceFiles: [],
      blockers: renderPlan.blockers,
      runtimePreview: {
        kind: engine === 'remotion' ? 'remotion-player' : 'hyperframes-iframe',
        label: engine === 'remotion' ? 'Remotion Player' : 'HyperFrames iframe',
        status: 'needs-render-source',
        mountLabel: engine === 'remotion' ? 'Prepare Remotion Player' : 'Prepare HyperFrames iframe',
        sourceHostRequirement: 'Resolve timeline blockers before source-backed preview can mount.',
        editLinkLabels: [],
      },
    };
  }

  const sourceBundle = buildMotionRenderSourceBundle(
    project,
    renderRequestFromPlan(project, renderPlan, engine)
  );

  return {
    engine,
    status: renderPlan.status,
    compositionId: renderPlan.compositionId,
    entryPoint: sourceBundle.entryPoint,
    durationSeconds: renderPlan.durationSeconds,
    outputKinds: uniqueStrings(renderPlan.outputs.map((output) => output.kind)),
    componentIds: renderPlan.componentIds,
    sourceFiles: sourceBundle.files.map((file) => ({
      kind: file.kind,
      path: file.path,
      mimeType: file.mimeType,
    })),
    blockers: [],
    runtimePreview: buildRuntimePreviewTarget(engine, sourceBundle.files),
  };
}

function buildRuntimePreviewTarget(
  engine: MotionRenderEngine,
  sourceFiles: MotionRenderRequest['sourceFiles']
): MotionPreviewRuntimeTarget {
  const entryPath =
    sourceFiles?.find((file) => file.kind === 'entry')?.path ??
    (engine === 'remotion' ? 'remotion/index.tsx' : 'hyperframes/index.html');
  const timelinePath =
    sourceFiles?.find((file) => file.kind === 'timeline')?.path ?? 'timeline JSON';
  const scriptPath = sourceFiles?.find((file) => file.kind === 'script')?.path;
  const storyboardPath = sourceFiles?.find((file) => file.kind === 'storyboard')?.path;

  if (engine === 'remotion') {
    return {
      kind: 'remotion-player',
      label: 'Remotion Player',
      status: 'needs-source-host',
      mountLabel: 'Mount Remotion Player',
      sourceHostRequirement: `Serve ${entryPath} and ${timelinePath} to the preview runtime.`,
      editLinkLabels: uniqueStrings([
        'component props',
        'timeline JSON',
        scriptPath ?? 'SCRIPT.md',
        storyboardPath ?? 'STORYBOARD.md',
      ]),
    };
  }

  return {
    kind: 'hyperframes-iframe',
    label: 'HyperFrames iframe',
    status: 'needs-source-host',
    mountLabel: 'Mount HyperFrames iframe',
    sourceHostRequirement: `Serve ${entryPath} with ${timelinePath} as a same-shell preview frame.`,
    editLinkLabels: uniqueStrings([
      'data-start',
      'data-duration',
      'component classes',
      scriptPath ?? 'SCRIPT.md',
      storyboardPath ?? 'STORYBOARD.md',
    ]),
  };
}

function buildEditSourceSummary(
  project: MotionProject,
  engines: WorkflowEngine[],
  options: { fps: number; requestedAt: number }
): MotionPreviewEditSource {
  const renderEngines = engines.filter(isMotionRenderEngine);
  const blockerLabels: string[] = [];

  for (const engine of renderEngines) {
    const renderPlan = buildMotionRenderPlan(project, {
      engine,
      fps: options.fps,
      requestedAt: options.requestedAt,
    });

    if (renderPlan.status !== 'ready') {
      blockerLabels.push(...renderPlan.blockers.map((blocker) => blocker.label));
      continue;
    }

    const request = renderRequestFromPlan(project, renderPlan, engine);
    const sourceBundle = buildMotionRenderSourceBundle(project, request);
    const editContract = buildMotionRenderEditContract(request);

    return {
      status: 'ready',
      engine,
      apiRoute: '/api/motion/source-edit',
      actionLabel: 'Apply source edits',
      artifactPath: editContract.artifactPath,
      timelinePath: editContract.timelinePath,
      scriptPath: editContract.scriptPath,
      storyboardPath: editContract.storyboardPath,
      editableComponentCount: editContract.editableComponentCount,
      regenerationScopes: editContract.regenerationScopes,
      sourceFilePaths: sourceBundle.files.map((file) => file.path),
      sourceFiles: editSourceFiles(editContract),
      components: editContract.editableComponents.map(editSourceComponent),
      blockerLabels: [],
    };
  }

  return {
    status: 'needs-render-source',
    engine: renderEngines[0] ?? null,
    apiRoute: null,
    actionLabel: null,
    artifactPath: null,
    timelinePath: null,
    scriptPath: null,
    storyboardPath: null,
    editableComponentCount: 0,
    regenerationScopes: [],
    sourceFilePaths: [],
    sourceFiles: [],
    components: [],
    blockerLabels: uniqueStrings(
      blockerLabels.length
        ? blockerLabels
        : ['Prepare a Remotion or HyperFrames source bundle before editing source artifacts']
    ),
  };
}

function editSourceComponent(
  component: MotionRenderEditContractComponent
): MotionPreviewEditSourceComponent {
  return {
    trackId: component.trackId,
    trackKind: component.trackKind,
    clipId: component.clipId,
    componentId: component.componentId,
    componentLabel: component.componentLabel,
    editControlIds: component.editControlIds,
      editControlLabels: component.editControlLabels,
      regenerateScopes: component.regenerateScopes,
      sourceFiles: component.sourceFiles,
      sourceFileLabels: component.sourceFiles.map(sourceFileLabelFor),
      editSurfaceLabels: uniqueStrings([
        ...component.editControlLabels,
        ...component.regenerateScopes,
      ]),
  };
}

function editSourceFiles(editContract: {
  artifactPath: string;
  scriptPath: string;
  storyboardPath: string;
  timelinePath: string;
}): MotionPreviewEditSourceFile[] {
  return [
    {
      path: editContract.artifactPath,
      label: 'Edit contract',
      purpose: 'Review component controls, source files, and regeneration scopes.',
      editSurfaceLabels: ['component', 'effect', 'regeneration'],
    },
    {
      path: editContract.scriptPath,
      label: 'Script',
      purpose: 'Edit narration copy and voice lines.',
      editSurfaceLabels: ['script', 'voice'],
    },
    {
      path: editContract.storyboardPath,
      label: 'Storyboard',
      purpose: 'Edit scenes, component choices, timing, and motion effects.',
      editSurfaceLabels: ['scene', 'component', 'timing', 'effect'],
    },
    {
      path: editContract.timelinePath,
      label: 'Timeline JSON',
      purpose: 'Edit frame timing, component props, assets, and linked variants.',
      editSurfaceLabels: ['timing', 'props', 'assets', 'variants'],
    },
  ];
}

function sourceFileLabelFor(path: string): string {
  if (path === 'EDIT.md') return 'Edit contract';
  if (path === 'SCRIPT.md') return 'Script';
  if (path === 'STORYBOARD.md') return 'Storyboard';
  if (path.endsWith('.json')) return 'Timeline JSON';
  return readableLabel(path);
}

function renderRequestFromPlan(
  project: MotionProject,
  plan: ReturnType<typeof buildMotionRenderPlan>,
  engine: MotionRenderEngine
): MotionRenderRequest {
  return {
    id: plan.id,
    projectId: plan.projectId,
    draftId: plan.draftId,
    engine,
    compositionId: plan.compositionId,
    fps: plan.fps,
    durationFrames: plan.durationFrames,
    tracks: selectTracks(project, plan.draftId),
    outputs: plan.outputs,
    provenance: plan.provenance,
  };
}

function buildTimelineRows(tracks: TimelineTrack[]): MotionPreviewTimelineRow[] {
  return tracks.map((track) => ({
    trackId: track.id,
    trackKind: track.kind,
    durationSeconds: roundSeconds(trackDurationFrames(track)),
    clips: track.clips.map((clip) => {
      const component = clip.componentId ? getMotionComponent(clip.componentId) : null;
      const effectPreset = getMotionEffectPreset(clip.props.effectPreset);
      return {
        clipId: clip.id,
        componentId: clip.componentId ?? null,
        componentLabel: component?.label ?? clip.componentId ?? 'Clip',
        startSeconds: roundSeconds(clip.startFrame),
        durationSeconds: roundSeconds(clip.durationFrames),
        summary: clipSummary(clip),
        linkedVariantScope: clip.linkedVariantScope,
        editControlIds: component?.editControls.map((control) => control.id) ?? [],
        regenerateScopes: component?.regenerateScopes ?? [],
        effectPreset: effectPreset?.id ?? null,
        effectLabel: effectPreset?.label ?? null,
      };
    }),
  }));
}

function buildEditableComponents(tracks: TimelineTrack[]): MotionPreviewEditableComponent[] {
  return tracks.flatMap((track) =>
    track.clips.flatMap((clip) => {
      if (!clip.componentId) return [];
      const component = getMotionComponent(clip.componentId);
      return [
        {
          trackId: track.id,
          clipId: clip.id,
          componentId: clip.componentId,
          componentLabel: component?.label ?? clip.componentId,
          editControlIds: component?.editControls.map((control) => control.id) ?? [],
          regenerateScopes: component?.regenerateScopes ?? [],
        },
      ];
    })
  );
}

function buildRegenerationActions(
  editableComponents: MotionPreviewEditableComponent[]
): MotionPreviewRegenerationAction[] {
  return editableComponents.flatMap((component) =>
    component.regenerateScopes.map((scope) => ({
      id: `regen-option-${component.clipId}-${scope}`,
      clipId: component.clipId,
      componentId: component.componentId,
      componentLabel: component.componentLabel,
      scope,
      label: `Regenerate ${scope} for ${component.componentLabel}`,
    }))
  );
}

function selectTracks(project: MotionProject, draftId: string): TimelineTrack[] {
  const draft = project.drafts.find((candidate) => candidate.id === draftId);
  if (draft?.tracks.length) return draft.tracks;
  if (draftId === project.currentDraftId) return project.tracks;
  return [];
}

function trackDurationFrames(track: TimelineTrack): number {
  return track.clips.reduce(
    (maxFrames, clip) => Math.max(maxFrames, clip.startFrame + clip.durationFrames),
    0
  );
}

function roundSeconds(frames: number): number {
  return Number(motionSeconds(frames).toFixed(3));
}

function roundSecondValue(seconds: number): number {
  return Number(seconds.toFixed(3));
}

function clipSummary(clip: TimelineClip): string {
  for (const key of [
    'headline',
    'caption',
    'text',
    'narration',
    'claim',
    'action',
    'sourceLabel',
    'status',
    'role',
  ]) {
    const value = clip.props[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }

  return '';
}

function isMotionRenderEngine(engine: WorkflowEngine): engine is MotionRenderEngine {
  return engine === 'remotion' || engine === 'hyperframes';
}

function uniqueStrings<T extends string>(values: T[]): T[] {
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

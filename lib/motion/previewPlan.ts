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
  referenceGrammar: MotionReferenceGrammarPlan;
  visualSourcingSummary: MotionPreviewVisualSourcingSummary;
  visualGenerationSummary: MotionPreviewVisualGenerationSummary;
  agentRunbook: MotionPreviewAgentRunbook | null;
  productionPlan: MotionProductionPlan;
  executionHistory: MotionPreviewExecutionHistory;
  provenance: MotionProvenanceRef[];
  requestedAt: number;
}

export interface BuildMotionPreviewPlanOptions {
  engines?: WorkflowEngine[];
  workflowRunPlan?: AgentMotionWorkflowRunPlan;
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
  const productionPlan = buildMotionProductionPlan(project, {
    engines,
    fps,
    requestedAt: options.requestedAt,
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
    videoPlan: buildVideoPlan(reviewPlan, timelineRows, regenerationActions),
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
    editSource: buildEditSourceSummary(project, engines, {
      fps,
      requestedAt: options.requestedAt,
    }),
    syncSummary: buildSyncSummary(syncPlan),
    syncBeats: buildSyncBeats(syncPlan),
    syncSoundCues: buildSyncSoundCues(syncPlan),
    exportPackSummary: buildExportPackSummary(exportPackPlan),
    referenceGrammar,
    visualSourcingSummary: buildVisualSourcingSummary(visualSourcingPlan),
    visualGenerationSummary: buildVisualGenerationSummary(imageToVideoPlan, timelineRows),
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

import type { WorkflowEngine, WorkflowRegistryId } from '@/lib/workflow/registry';
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
  buildAgentMotionCapturePlan,
  type AgentMotionCaptureFallback,
  type AgentMotionCapturePlan,
} from './capturePlan';
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
  listRankedMotionReferenceCorpusForWorkflow,
  type MotionReferenceCorpusEntry,
} from './referenceCorpus';
import {
  listMotionTasteCorpusForWorkflow,
  type MotionTasteCorpusEntry,
  type MotionTasteShot,
} from './tasteCorpus';
import {
  buildMotionCanvasMaterialPlan,
  type MotionCanvasMaterialPlan,
} from './canvasMaterial';
import {
  buildMotionSyncPlan,
  type MotionCaptionTimingSource,
  type MotionSyncEffectCueKind,
  type MotionSyncPlanStatus,
  type MotionVoiceSyncStatus,
} from './syncPlan';
import {
  getMotionComponent,
  type MotionRegenerateScope,
} from './componentRegistry';
import { getMotionEffectPreset, type MotionEffectPresetId } from './effectPresets';
import type { ToolRegistryId } from '@/lib/tool/registry';
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

export interface MotionPreviewRenderPackageCommand {
  id: string;
  label: string;
  display: string;
  outputId?: string;
  outputPath?: string;
}

export interface MotionPreviewRenderPackageArtifactCheck {
  outputId: string;
  kind: string;
  path: string;
  required: boolean;
}

export interface MotionPreviewRenderPackageProofArtifact {
  outputId: string;
  kind: string;
  label: string;
  path: string;
  mimeType: string;
  width: number;
  height: number;
}

export interface MotionPreviewRenderPackageActionRequestTemplate {
  project: '$motionProject';
  engine: MotionRenderEngine;
  providerId: '$selectedRenderProvider';
  requestedAt: '$now';
}

export interface MotionPreviewRenderPackageAction {
  id: string;
  label: string;
  route: '/api/motion/render';
  method: 'POST';
  toolId: 'motion-render';
  engine: MotionRenderEngine;
  requestTemplate: MotionPreviewRenderPackageActionRequestTemplate;
  expectedReceiptLabels: string[];
}

export interface MotionPreviewRenderPackage {
  manifestPath: string;
  sourceHostRequirement: string;
  previewCommand: MotionPreviewRenderPackageCommand | null;
  renderCommands: MotionPreviewRenderPackageCommand[];
  verificationCommands: MotionPreviewRenderPackageCommand[];
  artifactChecks: MotionPreviewRenderPackageArtifactCheck[];
  proofArtifacts: MotionPreviewRenderPackageProofArtifact[];
  renderCommandLabels: string[];
  verificationLabels: string[];
  proofArtifactLabels: string[];
  proofArtifactPaths: string[];
  action: MotionPreviewRenderPackageAction;
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
  renderPackage?: MotionPreviewRenderPackage | null;
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
  editableProps?: Record<string, string | number | boolean | null>;
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
  regenerateScopes: MotionRegenerateScope[];
}

export interface MotionPreviewRegenerationRequestTemplate {
  project: '$motionProject';
  clipId: string;
  scope: MotionRegenerateScope;
  prompt: string;
  requestedEngines: '$selectedEngines';
  requestedAt: '$now';
}

export interface MotionPreviewRegenerationAction {
  id: string;
  clipId: string;
  componentId: string;
  componentLabel: string;
  scope: MotionRegenerateScope;
  label: string;
  route: '/api/motion/regenerate';
  method: 'POST';
  toolId: ToolRegistryId;
  requestTemplate: MotionPreviewRegenerationRequestTemplate;
  expectedReceiptLabels: string[];
}

export interface MotionPreviewReferenceSignalRequestTemplate {
  project: '$motionProject';
  referenceSignalId: string;
  sourceUrl: string;
  scope: MotionRegenerateScope;
  componentIds: string[];
  prompt: string;
  requestedEngines: '$selectedEngines';
  requestedAt: '$now';
}

export interface MotionPreviewReferenceSignalAction {
  id: string;
  label: string;
  scope: MotionRegenerateScope;
  toolId: ToolRegistryId;
  route: '/api/motion/regenerate';
  method: 'POST';
  componentIds: string[];
  componentLabels: string[];
  requestTemplate: MotionPreviewReferenceSignalRequestTemplate;
  expectedReceiptLabels: string[];
}

export interface MotionPreviewTasteReferenceRequestTemplate {
  project: '$motionProject';
  tasteReferenceId: string;
  sourceEntryId: string;
  sourceUrl: string;
  scope: MotionRegenerateScope;
  componentIds: string[];
  prompt: string;
  requestedEngines: '$selectedEngines';
  requestedAt: '$now';
}

export interface MotionPreviewTasteReferenceAction {
  id: string;
  label: string;
  scope: MotionRegenerateScope;
  toolId: ToolRegistryId;
  route: '/api/motion/regenerate';
  method: 'POST';
  componentIds: string[];
  componentLabels: string[];
  requestTemplate: MotionPreviewTasteReferenceRequestTemplate;
  expectedReceiptLabels: string[];
}

export interface MotionPreviewTasteReferenceShot {
  id: string;
  label: string;
  timeRangeLabel: string;
  visual: string;
  componentLabels: string[];
  effectLabels: string[];
  editTargetLabels: string[];
  captionStyleLabel: string;
  transitionOutLabel: string | null;
}

export interface MotionPreviewTasteReferenceDraftInfluence {
  recommendedDraftId: string;
  recommendedDraftLabel: string;
  reasonLabel: string;
  defaultShotLabels: string[];
  componentMatchLabels: string[];
}

export interface MotionPreviewTasteReference {
  id: string;
  rank: number;
  title: string;
  sourceUrl: string;
  sourceLabel: string;
  proofBoundaryLabel: string;
  reviewStatusLabel: string;
  hookTypeLabel: string;
  targetCropLabels: string[];
  styleLabels: string[];
  componentLabels: string[];
  effectLabels: string[];
  regenerateScopeLabels: string[];
  shotList: MotionPreviewTasteReferenceShot[];
  draftInfluence: MotionPreviewTasteReferenceDraftInfluence;
  aetherUse: string;
  actions: MotionPreviewTasteReferenceAction[];
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

export interface MotionPreviewSourceCaptureActionRequestTemplate {
  project: '$motionProject';
  requestIds: string[];
  requestedAt: '$now';
}

export interface MotionPreviewSourceCaptureAction {
  id: string;
  label: string;
  route: '/api/motion/capture';
  method: 'POST';
  toolId: 'motion-capture';
  requestTemplate: MotionPreviewSourceCaptureActionRequestTemplate;
  expectedReceiptLabels: string[];
}

export interface MotionPreviewSourceCaptureCandidate {
  id: string;
  label: string;
  mode: MotionSourceProfile['captureCandidates'][number]['mode'];
  targetKind: MotionSourceProfile['captureCandidates'][number]['targetKind'];
  targetRef: string | null;
  setupLabel: string | null;
  reason: string;
  action: MotionPreviewSourceCaptureAction | null;
}

export interface MotionPreviewSourceProfile {
  label: string;
  sourceKind: MotionSourceProfile['kind'];
  summary: string;
  signalLabels: string[];
  captureCandidateLabels: string[];
  captureCandidates: MotionPreviewSourceCaptureCandidate[];
  storyboardHintLabels: string[];
  readyCaptureCount: number;
}

export interface MotionPreviewSyncSummary {
  status: MotionSyncPlanStatus;
  beatCount: number;
  captionCount: number;
  transitionCount: number;
  soundCueCount: number;
  effectCueCount: number;
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

export interface MotionPreviewSyncEffectCue {
  kind: MotionSyncEffectCueKind;
  label: string;
  startSeconds: number;
  durationSeconds: number;
  effectPresetId: MotionEffectPresetId;
  effectPresetLabel: string;
  targetLabel: string;
  soundCueLabel: string | null;
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

export interface MotionPreviewRenderPackageVerification {
  status: 'missing' | 'saved';
  receiptCount: number;
  providerLabel: string | null;
  manifestPath: string | null;
  receiptLabels: string[];
  verificationLabels: string[];
  artifactCheckLabels: string[];
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
  packageVerification: MotionPreviewRenderPackageVerification;
}

export interface MotionPreviewVisualGenerationRequest {
  requestId: string;
  clipId: string;
  componentLabel: string;
  durationSeconds: number;
  prompt: string;
  sourceAssetId: string;
  sourceLabel: string;
  sourceAssetUrl: string | null;
  sourceKind: string | null;
  sourceMimeType: string | null;
  outputLabel: string;
  pendingTakeCount?: number;
  pendingTakeLabels?: string[];
  pendingTakes?: MotionPreviewVisualGenerationTake[];
  selectedTakeCount?: number;
  selectedTakeLabels?: string[];
}

export interface MotionPreviewVisualGenerationTake {
  takeId: string;
  assetId: string;
  assetUrl: string;
  providerLabel: string;
  sourceAssetId: string;
  mimeType: string;
  status: string;
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

export type MotionPreviewModeControlOptionStatus = 'active' | 'available';

export interface MotionPreviewModeControlRequestTemplate {
  project: '$motionProject';
  mode: MotionProject['workflowMode'];
  requestedEngines: '$selectedEngines';
  requestedAt: '$now';
}

export interface MotionPreviewModeControlOption {
  mode: MotionProject['workflowMode'];
  label: string;
  status: MotionPreviewModeControlOptionStatus;
  actionLabel: string;
  route: '/api/motion/mode';
  method: 'POST';
  requestTemplate: MotionPreviewModeControlRequestTemplate;
  gateLabels: string[];
  expectedReceiptLabels: string[];
}

export interface MotionPreviewModeControl {
  currentMode: MotionProject['workflowMode'];
  currentLabel: string;
  options: MotionPreviewModeControlOption[];
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
  dryRunLabels?: string[];
  dryRunCompletedLabels?: string[];
  dryRunPendingLabels?: string[];
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

export interface MotionPreviewReferenceSignal {
  id: string;
  title: string;
  sourceUrl: string;
  sourceLabel: string;
  observedFormatLabel: string;
  proofBoundaryLabel: string;
  styleLabels: string[];
  componentLabels: string[];
  shotNotes: string[];
  implication: string;
  actions: MotionPreviewReferenceSignalAction[];
}

export interface MotionPreviewPlan {
  id: string;
  projectId: string;
  draftId: string;
  title: string;
  workflowMode: MotionProject['workflowMode'];
  primaryAction: MotionReviewPlan['primaryAction'];
  modeControl: MotionPreviewModeControl;
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
  syncEffectCues: MotionPreviewSyncEffectCue[];
  exportPackSummary: MotionPreviewExportPackSummary;
  renderProofSummary: MotionPreviewRenderProofSummary;
  canvasMaterialPlan: MotionCanvasMaterialPlan;
  referenceGrammar: MotionReferenceGrammarPlan;
  referenceSignals: MotionPreviewReferenceSignal[];
  tasteReferences: MotionPreviewTasteReference[];
  visualSourcingSummary: MotionPreviewVisualSourcingSummary;
  visualGenerationSummary: MotionPreviewVisualGenerationSummary;
  capabilitySetup: MotionPreviewCapabilitySetup;
  agentRunbook: MotionPreviewAgentRunbook | null;
  productionPlan: MotionProductionPlan;
  executionHistory: MotionPreviewExecutionHistory;
  provenance: MotionProvenanceRef[];
  requestedAt: number;
}

export type MotionPreviewRegenerationRequestAction =
  | MotionPreviewRegenerationAction
  | MotionPreviewReferenceSignalAction
  | MotionPreviewTasteReferenceAction;

export function listMotionPreviewRegenerationRequestActions(
  previewPlan: Pick<
    MotionPreviewPlan,
    'regenerationActions' | 'referenceSignals' | 'tasteReferences'
  >
): MotionPreviewRegenerationRequestAction[] {
  return [
    ...previewPlan.regenerationActions,
    ...previewPlan.referenceSignals.flatMap((signal) => signal.actions),
    ...previewPlan.tasteReferences.flatMap((reference) => reference.actions),
  ];
}

export function findMotionPreviewRegenerationAction(
  previewPlan: Pick<
    MotionPreviewPlan,
    'regenerationActions' | 'referenceSignals' | 'tasteReferences'
  >,
  actionId: string
): MotionPreviewRegenerationRequestAction | null {
  return (
    listMotionPreviewRegenerationRequestActions(previewPlan).find(
      (candidate) => candidate.id === actionId
    ) ?? null
  );
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
  const referenceSignals = buildReferenceSignals(project);
  const tasteReferences = buildTasteReferences(project);
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
  const capturePlan = buildAgentMotionCapturePlan(project);
  const exportPackSummary = buildExportPackSummary(exportPackPlan);
  const renderProofSummary = buildRenderProofSummary(
    exportPackPlan,
    project.executionHistory,
    editSource,
    engines
  );
  const visualGenerationSummary = buildVisualGenerationSummary(
    imageToVideoPlan,
    timelineRows,
    tracks
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
    executionHistory: project.executionHistory,
  });

  return {
    id: `preview-${project.id}-${project.currentDraftId}-${options.requestedAt}`,
    projectId: project.id,
    draftId: project.currentDraftId,
    title: project.title,
    workflowMode: project.workflowMode,
    primaryAction: reviewPlan.primaryAction,
    modeControl: buildModeControl(project, productionPlan),
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
    syncEffectCues: buildSyncEffectCues(syncPlan),
    exportPackSummary,
    renderProofSummary,
    canvasMaterialPlan,
    referenceGrammar,
    referenceSignals,
    tasteReferences,
    visualSourcingSummary: buildVisualSourcingSummary(visualSourcingPlan),
    visualGenerationSummary,
    capabilitySetup: buildCapabilitySetup(project, productionPlan, enginePreviews, capturePlan, {
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

function buildModeControl(
  project: MotionProject,
  productionPlan: MotionProductionPlan
): MotionPreviewModeControl {
  const gateLabels = productionPlan.steps.slice(0, 3).map((step) => step.label);

  return {
    currentMode: project.workflowMode,
    currentLabel: project.workflowMode === 'full-auto' ? 'full auto' : 'review gates',
    options: (['review', 'full-auto'] as const).map((mode) =>
      modeControlOption(project, mode, gateLabels)
    ),
  };
}

function modeControlOption(
  project: MotionProject,
  mode: MotionProject['workflowMode'],
  gateLabels: string[]
): MotionPreviewModeControlOption {
  const active = project.workflowMode === mode;
  const reviewMode = mode === 'review';

  return {
    mode,
    label: reviewMode ? 'Review gates' : 'Full auto',
    status: active ? 'active' : 'available',
    actionLabel: active
      ? reviewMode
        ? 'Keep review gates'
        : 'Keep full auto'
      : reviewMode
        ? 'Switch to review gates'
        : 'Switch to full auto',
    route: '/api/motion/mode',
    method: 'POST',
    requestTemplate: {
      project: '$motionProject',
      mode,
      requestedEngines: '$selectedEngines',
      requestedAt: '$now',
    },
    gateLabels,
    expectedReceiptLabels: reviewMode
      ? ['review gates', 'draft approval', 'updated preview plan']
      : ['full-auto gates', 'execution receipt', 'updated preview plan'],
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

function buildReferenceSignals(project: MotionProject): MotionPreviewReferenceSignal[] {
  const workflowId = inferReferenceWorkflowId(project);
  return listRankedMotionReferenceCorpusForWorkflow(workflowId).map(referenceSignalFromCorpusEntry);
}

function buildTasteReferences(project: MotionProject): MotionPreviewTasteReference[] {
  const workflowId = inferReferenceWorkflowId(project);
  return rankTasteReferencesForProject(
    project,
    listMotionTasteCorpusForWorkflow(workflowId)
  ).map((ranked) =>
    tasteReferenceFromCorpusEntry(
      ranked.entry,
      ranked.rank,
      tasteDraftInfluence(project, ranked.entry)
    )
  );
}

function inferReferenceWorkflowId(project: MotionProject): WorkflowRegistryId {
  if (project.brief.projectKind === 'pr' || project.sourceProfile?.kind === 'pr') {
    return 'pr-to-video';
  }

  if (project.sourceProfile?.kind === 'site' && !project.brief.appProfile.repoUrl) {
    return 'website-to-video';
  }

  if (
    project.brief.projectKind === 'feature' ||
    project.brief.projectKind === 'social' ||
    project.brief.projectKind === 'demo'
  ) {
    return 'feature-social-video';
  }

  return 'repo-launch-video';
}

function referenceSignalFromCorpusEntry(
  entry: MotionReferenceCorpusEntry
): MotionPreviewReferenceSignal {
  const componentLabels = uniqueStrings(entry.componentIds.map(componentLabelFor));

  return {
    id: entry.id,
    title: entry.title,
    sourceUrl: entry.sourceUrl,
    sourceLabel: `${readableLabel(entry.platform)} source`,
    observedFormatLabel: readableLabel(entry.observedFormat),
    proofBoundaryLabel: readableLabel(entry.proofBoundary),
    styleLabels: entry.styleTags.map(readableLabel),
    componentLabels,
    shotNotes: entry.shotNotes.slice(0, 2),
    implication: entry.aetherImplication,
    actions: referenceSignalActions(entry, componentLabels),
  };
}

function referenceSignalActions(
  entry: MotionReferenceCorpusEntry,
  componentLabels: string[]
): MotionPreviewReferenceSignalAction[] {
  const componentIds = entry.componentIds.slice(0, 4);
  const focusedComponentIds = componentIds.slice(0, 2);
  const focusedComponentLabels = componentLabels.slice(0, 2);
  const actions: MotionPreviewReferenceSignalAction[] = [
    referenceSignalAction(entry, {
      scope: 'effect',
      componentIds: focusedComponentIds,
      componentLabels: focusedComponentLabels,
      label: `Apply reference style to ${focusedComponentLabels.join(' / ')}`,
    }),
  ];

  if (
    entry.tags.some((tag) => tag === 'capture' || tag === 'cursor' || tag === 'zoom') &&
    focusedComponentIds.length > 0
  ) {
    actions.push(
      referenceSignalAction(entry, {
        scope: 'capture',
        componentIds: focusedComponentIds,
        componentLabels: focusedComponentLabels,
        label: `Regenerate capture from ${readableLabel(entry.observedFormat)}`,
      })
    );
  }

  return actions;
}

function referenceSignalAction(
  entry: MotionReferenceCorpusEntry,
  options: {
    scope: MotionRegenerateScope;
    componentIds: string[];
    componentLabels: string[];
    label: string;
  }
): MotionPreviewReferenceSignalAction {
  return {
    id: `reference-signal-${entry.id}-${options.scope}`,
    label: options.label,
    scope: options.scope,
    toolId: regenerationToolIdForScope(options.scope),
    route: '/api/motion/regenerate',
    method: 'POST',
    componentIds: [...options.componentIds],
    componentLabels: [...options.componentLabels],
    requestTemplate: {
      project: '$motionProject',
      referenceSignalId: entry.id,
      sourceUrl: entry.sourceUrl,
      scope: options.scope,
      componentIds: [...options.componentIds],
      prompt: `${options.label}. Use ${entry.title} as the source-backed reference signal.`,
      requestedEngines: '$selectedEngines',
      requestedAt: '$now',
    },
    expectedReceiptLabels: referenceSignalReceiptLabels(options.scope),
  };
}

function referenceSignalReceiptLabels(scope: MotionRegenerateScope): string[] {
  if (scope === 'capture') {
    return ['reference signal', 'capture plan', 'updated preview plan'];
  }
  if (scope === 'caption') {
    return ['reference signal', 'voice and caption update', 'updated preview plan'];
  }
  if (scope === 'effect' || scope === 'timing') {
    return ['reference signal', 'component style update', 'updated preview plan'];
  }
  return ['reference signal', 'component plan', 'updated preview plan'];
}

function tasteReferenceFromCorpusEntry(
  entry: MotionTasteCorpusEntry,
  rank: number,
  draftInfluence: MotionPreviewTasteReferenceDraftInfluence
): MotionPreviewTasteReference {
  const componentLabels = uniqueStrings(entry.componentIds.map(componentLabelFor));
  const effectLabels = entry.effectTags.map(readableLabel);
  const regenerateScopeLabels = entry.regenerateScopes.map(readableLabel);

  return {
    id: entry.id,
    rank,
    title: entry.title,
    sourceUrl: entry.sourceUrl,
    sourceLabel: `${readableLabel(entry.platform)} taste`,
    proofBoundaryLabel: readableLabel(entry.proofBoundary),
    reviewStatusLabel: readableLabel(entry.reviewStatus),
    hookTypeLabel: readableLabel(entry.hookType),
    targetCropLabels: [...entry.targetCrops],
    styleLabels: entry.styleTags.map(readableLabel),
    componentLabels,
    effectLabels,
    regenerateScopeLabels,
    shotList: entry.shotList.map(tasteReferenceShotFromCorpusShot),
    draftInfluence,
    aetherUse: entry.aetherUse,
    actions: tasteReferenceActions(entry, componentLabels),
  };
}

function rankTasteReferencesForProject(
  project: MotionProject,
  entries: MotionTasteCorpusEntry[]
): Array<{ entry: MotionTasteCorpusEntry; rank: number }> {
  return entries
    .map((entry, index) => ({
      entry,
      index,
      score: tasteReferenceScore(project, entry),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((ranked, index) => ({ entry: ranked.entry, rank: index + 1 }));
}

function tasteReferenceScore(project: MotionProject, entry: MotionTasteCorpusEntry): number {
  const targetCrops = new Set(project.brief.platformTargets.map((target) => target.aspectRatio));
  const captureCandidates = project.sourceProfile?.captureCandidates ?? [];
  const hasCaptureCandidates = captureCandidates.length > 0;
  const hasRecordingCandidate = captureCandidates.some(
    (candidate) => candidate.mode === 'screen-recording'
  );
  const productComponentCount = entry.componentIds.filter(isProductCaptureComponent).length;
  let score = 0;

  score += entry.targetCrops.filter((crop) => targetCrops.has(crop)).length * 4;

  if (hasCaptureCandidates) {
    score += Math.min(productComponentCount, 3) * 4;
  }

  if (hasRecordingCandidate && entry.effectTags.includes('cursor-zoom')) {
    score += 3;
  }

  if (entry.hookType === 'product-name') score += 3;
  if (entry.hookType === 'before-after') score += 2;
  if (entry.hookType === 'agent-action') score += 1;
  if (entry.styleTags.includes('interactive-hotspots')) score += 2;

  if (
    project.brief.projectKind === 'demo' ||
    project.brief.projectKind === 'feature' ||
    project.brief.projectKind === 'social'
  ) {
    if (entry.hookType === 'product-name' || entry.hookType === 'before-after') score += 4;
    if (entry.componentIds.includes('app-frame') || entry.componentIds.includes('device-frame')) {
      score += 2;
    }
  }

  return score;
}

function isProductCaptureComponent(componentId: string): boolean {
  return (
    componentId === 'app-frame' ||
    componentId === 'device-frame' ||
    componentId === 'ui-reveal-frame' ||
    componentId === 'cursor-callout' ||
    componentId === 'hotspot-marker' ||
    componentId === 'split-screen-compare'
  );
}

function tasteDraftInfluence(
  project: MotionProject,
  entry: MotionTasteCorpusEntry
): MotionPreviewTasteReferenceDraftInfluence {
  const recommendedDraft = recommendedDraftForTasteReference(project, entry);
  const componentMatchLabels = uniqueStrings(entry.componentIds.map(componentLabelFor)).slice(0, 4);
  const defaultShotLabels = entry.shotList.slice(0, 3).map((shot) => shot.label);

  return {
    recommendedDraftId: recommendedDraft.id,
    recommendedDraftLabel: recommendedDraft.label,
    reasonLabel: `${entry.title} best informs ${recommendedDraft.label}: ${componentMatchLabels
      .slice(0, 3)
      .join(', ')}.`,
    defaultShotLabels,
    componentMatchLabels,
  };
}

function recommendedDraftForTasteReference(
  project: MotionProject,
  entry: MotionTasteCorpusEntry
): Pick<MotionDraft, 'id' | 'label'> {
  if (
    entry.hookType === 'agent-action' ||
    entry.componentIds.includes('agent-trace') ||
    entry.componentIds.includes('terminal-card')
  ) {
    return findDraftForTasteReference(project, [
      'draft-proof-first',
      'draft-pr-reviewer-cut',
      'draft-pr-mechanism-first',
      project.currentDraftId,
    ]);
  }

  if (
    entry.hookType === 'product-name' ||
    entry.hookType === 'before-after' ||
    entry.componentIds.some(isProductCaptureComponent)
  ) {
    return findDraftForTasteReference(project, [
      'draft-demo-first',
      project.currentDraftId,
    ]);
  }

  if (entry.hookType === 'proof-first') {
    return findDraftForTasteReference(project, [
      'draft-proof-first',
      'draft-pr-reviewer-cut',
      project.currentDraftId,
    ]);
  }

  return findDraftForTasteReference(project, [project.currentDraftId]);
}

function findDraftForTasteReference(
  project: MotionProject,
  draftIds: string[]
): Pick<MotionDraft, 'id' | 'label'> {
  const draft = draftIds
    .map((draftId) => project.drafts.find((candidate) => candidate.id === draftId))
    .find((candidate): candidate is MotionDraft => Boolean(candidate));

  return {
    id: draft?.id ?? project.currentDraftId,
    label: draft?.label ?? 'Current draft',
  };
}

function tasteReferenceShotFromCorpusShot(shot: MotionTasteShot): MotionPreviewTasteReferenceShot {
  return {
    id: shot.id,
    label: shot.label,
    timeRangeLabel: `${formatSeconds(shot.startSeconds)}-${formatSeconds(shot.endSeconds)}s`,
    visual: shot.visual,
    componentLabels: uniqueStrings(shot.componentIds.map(componentLabelFor)),
    effectLabels: shot.effectTags.map(readableLabel),
    editTargetLabels: shot.editTargets.map(readableLabel),
    captionStyleLabel: readableLabel(shot.captionStyle),
    transitionOutLabel: shot.transitionOut ? readableLabel(shot.transitionOut) : null,
  };
}

function tasteReferenceActions(
  entry: MotionTasteCorpusEntry,
  componentLabels: string[]
): MotionPreviewTasteReferenceAction[] {
  const focusedComponentIds = entry.componentIds.slice(0, 2);
  const focusedComponentLabels = componentLabels.slice(0, 2);
  const actions: MotionPreviewTasteReferenceAction[] = [
    tasteReferenceAction(entry, {
      scope: 'effect',
      componentIds: focusedComponentIds,
      componentLabels: focusedComponentLabels,
      label: `Apply ${readableLabel(entry.hookType)} timing to ${focusedComponentLabels.join(
        ' / '
      )}`,
    }),
  ];

  if (entry.regenerateScopes.includes('capture')) {
    actions.push(
      tasteReferenceAction(entry, {
        scope: 'capture',
        componentIds: focusedComponentIds,
        componentLabels: focusedComponentLabels,
        label: `Regenerate capture from ${entry.title}`,
      })
    );
  }

  if (entry.regenerateScopes.includes('caption')) {
    actions.push(
      tasteReferenceAction(entry, {
        scope: 'caption',
        componentIds: focusedComponentIds,
        componentLabels: focusedComponentLabels,
        label: `Regenerate captions from ${entry.title}`,
      })
    );
  }

  return actions;
}

function tasteReferenceAction(
  entry: MotionTasteCorpusEntry,
  options: {
    scope: MotionRegenerateScope;
    componentIds: string[];
    componentLabels: string[];
    label: string;
  }
): MotionPreviewTasteReferenceAction {
  return {
    id: `taste-reference-${entry.id}-${options.scope}`,
    label: options.label,
    scope: options.scope,
    toolId: regenerationToolIdForScope(options.scope),
    route: '/api/motion/regenerate',
    method: 'POST',
    componentIds: [...options.componentIds],
    componentLabels: [...options.componentLabels],
    requestTemplate: {
      project: '$motionProject',
      tasteReferenceId: entry.id,
      sourceEntryId: entry.sourceEntryId,
      sourceUrl: entry.sourceUrl,
      scope: options.scope,
      componentIds: [...options.componentIds],
      prompt: `${options.label}. Use the timestamped ${entry.title} taste reference as the editable motion guide.`,
      requestedEngines: '$selectedEngines',
      requestedAt: '$now',
    },
    expectedReceiptLabels: [
      'taste reference',
      'timestamped shot plan',
      'updated preview plan',
    ],
  };
}

function formatSeconds(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
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
  capturePlan: AgentMotionCapturePlan,
  options: {
    engines: WorkflowEngine[];
    providers?: MotionPreviewCapabilitySetupInventory;
  }
): MotionPreviewCapabilitySetup {
  const captureProviderLabels = availableProviderLabels(options.providers?.capture);
  const setupProofs = setupDryRunProofs(project.executionHistory);
  const items = [
    setupItemForStep(productionPlan, 'capture', {
      inventory: options.providers?.capture,
      defaultActionLabel: 'Connect browser capture',
      setupProofs,
    }),
    ...computerUseSetupItems(productionPlan, capturePlan, captureProviderLabels, setupProofs),
    ...localAppSetupItems(project, setupProofs),
    setupItemForStep(productionPlan, 'visual-source', {
      inventory: options.providers?.visualSource,
      defaultActionLabel: 'Connect visual sources',
      setupProofs,
    }),
    setupItemForStep(productionPlan, 'visual-generation', {
      inventory: options.providers?.imageToVideo,
      defaultActionLabel: 'Connect image-to-video',
      setupProofs,
    }),
    setupItemForStep(productionPlan, 'voice', {
      inventory: options.providers?.voice,
      defaultActionLabel: 'Connect voice synthesis',
      setupProofs,
    }),
    setupItemForStep(productionPlan, 'sync', {
      defaultActionLabel: 'Review sync markers',
      preferBlocked: true,
      setupProofs,
    }),
    renderSetupItem(productionPlan, enginePreviews, options, setupProofs),
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

function computerUseSetupItems(
  productionPlan: MotionProductionPlan,
  capturePlan: AgentMotionCapturePlan,
  captureProviderLabels: string[],
  setupProofs: MotionSetupDryRunProofMap
): MotionPreviewCapabilitySetupItem[] {
  const captureStep = productionPlan.steps.find((step) => step.id === 'capture');
  const dryRunStatus = dryRunStatusForSetup(
    'computer-use',
    computerUseDryRunLabels(),
    setupProofs
  );
  if (
    !captureStep ||
    captureStep.status === 'complete' ||
    (captureProviderLabels.length > 0 && !dryRunStatus.configured)
  ) {
    return [];
  }

  const fallback = capturePlan.fallbacks.find((item) => item.toolId === 'computer-use');
  if (!fallback) return [];

  return [computerUseSetupItem(fallback, dryRunStatus)];
}

function computerUseSetupItem(
  fallback: AgentMotionCaptureFallback,
  dryRunStatus: MotionSetupDryRunStatus
): MotionPreviewCapabilitySetupItem {
  return {
    id: 'computer-use',
    label: 'Computer-use capture',
    status: dryRunStatus.configured ? 'configured' : 'needs-runner',
    actionLabel: dryRunStatus.configured ? 'Computer-use ready' : 'Approve computer-use capture',
    routeLabels: [fallback.outputContract.applyRoute],
    toolLabels: [readableLabel(fallback.toolId)],
    requirementLabels: uniqueStrings([
      'creator approval',
      'redaction manifest',
      'approved app or browser window',
      fallback.permissionGate.scope,
      ...fallback.safeScope.redactionLabels.map((label) => `redact ${label}`),
    ]),
    providerLabels: [],
    configuredProviderLabels: [],
    runnerLabels: fallback.expectedArtifacts,
    dryRunLabels: computerUseDryRunLabels(),
    dryRunCompletedLabels: dryRunStatus.completedLabels,
    dryRunPendingLabels: dryRunStatus.pendingLabels,
    blockerLabels: fallback.safeScope.stopConditions.map((condition) => `stop on ${condition}`),
  };
}

function setupItemForStep(
  productionPlan: MotionProductionPlan,
  stepId: MotionProductionPlan['steps'][number]['id'],
  options: {
    inventory?: MotionPreviewCapabilityProvider[];
    defaultActionLabel: string;
    preferBlocked?: boolean;
    setupProofs: MotionSetupDryRunProofMap;
  }
): MotionPreviewCapabilitySetupItem | null {
  const step = productionPlan.steps.find((candidate) => candidate.id === stepId);
  if (!step) return null;

  const providerLabels = availableProviderLabels(options.inventory);
  const dryRunLabels = dryRunLabelsForStep(step.id);
  const dryRunStatus = dryRunStatusForStep(step.id, dryRunLabels, options.setupProofs);
  const needsProvider = step.providerRequirementLabels.length > 0 && providerLabels.length === 0;
  const blocked = step.blockerLabels.length > 0 && (options.preferBlocked || !needsProvider);
  const configured = step.status === 'complete' || providerLabels.length > 0 || dryRunStatus.configured;
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
    configuredProviderLabels:
      providerLabels.length > 0
        ? providerLabels
        : dryRunStatus.providerLabel
          ? [dryRunStatus.providerLabel]
          : [],
    runnerLabels: [],
    dryRunLabels,
    dryRunCompletedLabels: dryRunStatus.completedLabels,
    dryRunPendingLabels: dryRunStatus.pendingLabels,
    blockerLabels: step.blockerLabels,
  };
}

function renderSetupItem(
  productionPlan: MotionProductionPlan,
  enginePreviews: MotionPreviewEnginePlan[],
  options: {
    engines: WorkflowEngine[];
    providers?: MotionPreviewCapabilitySetupInventory;
  },
  setupProofs: MotionSetupDryRunProofMap
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
  const dryRunLabels = ['source lint', 'contact sheet', 'mp4 probe'];
  const dryRunStatus = dryRunStatusForSetup(step.id, dryRunLabels, setupProofs);
  const status: MotionPreviewCapabilitySetupItemStatus =
    step.status === 'complete' || providerLabels.length > 0 || dryRunStatus.configured
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
    configuredProviderLabels:
      providerLabels.length > 0
        ? providerLabels
        : dryRunStatus.providerLabel
          ? [dryRunStatus.providerLabel]
          : [],
    runnerLabels: providerLabels,
    dryRunLabels,
    dryRunCompletedLabels: dryRunStatus.completedLabels,
    dryRunPendingLabels: dryRunStatus.pendingLabels,
    blockerLabels: step.blockerLabels,
  };
}

function localAppSetupItems(
  project: MotionProject,
  setupProofs: MotionSetupDryRunProofMap
): MotionPreviewCapabilitySetupItem[] {
  const labels = uniqueStrings(
    (project.sourceProfile?.captureCandidates ?? []).flatMap((candidate) => {
      if (candidate.targetKind !== 'local-app' || !candidate.setup || !candidate.targetRef) {
        return [];
      }
      return [`${candidate.setup} -> ${candidate.targetRef}`];
    })
  );

  if (labels.length === 0) return [];

  const dryRunLabels = ['HTTP readiness receipt', 'process cleanup receipt'];
  const dryRunStatus = dryRunStatusForSetup('local-app', dryRunLabels, setupProofs);

  return [
    {
      id: 'local-app',
      label: 'Local app runner',
      status: dryRunStatus.configured ? 'configured' : 'needs-runner',
      actionLabel: dryRunStatus.configured ? 'Local app runner ready' : 'Trust local app launch',
      routeLabels: ['/api/motion/capture'],
      toolLabels: ['app launch', 'browser capture'],
      requirementLabels: ['trusted local app launch'],
      providerLabels: [],
      configuredProviderLabels: dryRunStatus.providerLabel ? [dryRunStatus.providerLabel] : [],
      runnerLabels: labels,
      dryRunLabels,
      dryRunCompletedLabels: dryRunStatus.completedLabels,
      dryRunPendingLabels: dryRunStatus.pendingLabels,
      blockerLabels: [],
    },
  ];
}

function dryRunLabelsForStep(
  stepId: MotionProductionPlan['steps'][number]['id']
): string[] {
  if (stepId === 'capture') {
    return ['screenshot receipt', 'viewport receipt', 'cursor target receipt'];
  }
  if (stepId === 'visual-source') {
    return ['source asset receipt', 'prompt receipt'];
  }
  if (stepId === 'visual-generation') {
    return ['generated clip receipt', 'timeline update receipt'];
  }
  if (stepId === 'voice') {
    return ['audio receipt', 'word timing receipt', 'transcript receipt'];
  }
  if (stepId === 'sync') {
    return ['beat markers', 'caption links', 'sound cues'];
  }
  return [];
}

type MotionSetupDryRunProofMap = Map<string, Set<string>>;

interface MotionSetupDryRunStatus {
  configured: boolean;
  completedLabels: string[];
  pendingLabels: string[];
  providerLabel?: string;
}

function setupDryRunProofs(
  history: MotionExecutionHistoryEntry[] | undefined
): MotionSetupDryRunProofMap {
  const proofs: MotionSetupDryRunProofMap = new Map();

  for (const receipt of (history ?? []).flatMap((entry) => entry.receipts)) {
    if (receipt.kind !== 'setup') continue;
    const setupId = setupIdFromReceipt(receipt);
    if (!setupId) continue;

    const labels = proofs.get(setupId) ?? new Set<string>();
    labels.add(receipt.label);
    proofs.set(setupId, labels);
  }

  return proofs;
}

function setupIdFromReceipt(receipt: MotionExecutionReceipt): string | null {
  const [setupId] = receipt.ref.split(':');
  return setupId || null;
}

function dryRunStatusForStep(
  stepId: MotionProductionPlan['steps'][number]['id'],
  labels: string[],
  setupProofs: MotionSetupDryRunProofMap
): MotionSetupDryRunStatus {
  if (stepId === 'capture') {
    const computerUseStatus = dryRunStatusForSetup(
      'computer-use',
      computerUseDryRunLabels(),
      setupProofs,
      'computer use dry run'
    );
    if (computerUseStatus.configured) return computerUseStatus;
  }

  return dryRunStatusForSetup(stepId, labels, setupProofs);
}

function dryRunStatusForSetup(
  setupId: string,
  labels: string[],
  setupProofs: MotionSetupDryRunProofMap,
  providerLabel = `${readableLabel(setupId)} dry run`
): MotionSetupDryRunStatus {
  const proofLabels = setupProofs.get(setupId) ?? new Set<string>();
  const completedLabels = labels.filter((label) => proofLabels.has(label));
  const pendingLabels = labels.filter((label) => !proofLabels.has(label));
  const configured = labels.length > 0 && pendingLabels.length === 0;

  return {
    configured,
    completedLabels,
    pendingLabels,
    ...(configured ? { providerLabel } : {}),
  };
}

function computerUseDryRunLabels(): string[] {
  return ['approval receipt', 'redaction receipt', 'safe-scope receipt'];
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
    captureCandidates: profile.captureCandidates.map(sourceCaptureCandidateSummary),
    storyboardHintLabels: profile.storyboardHints.map((hint) => `${hint.beatRole}: ${hint.label}`),
    readyCaptureCount: profile.captureCandidates.filter((candidate) => candidate.targetRef).length,
  };
}

function sourceCaptureCandidateSummary(
  candidate: MotionSourceProfile['captureCandidates'][number]
): MotionPreviewSourceCaptureCandidate {
  return {
    id: candidate.id,
    label: candidate.label,
    mode: candidate.mode,
    targetKind: candidate.targetKind,
    targetRef: candidate.targetRef ?? null,
    setupLabel: candidate.setup
      ? candidate.targetRef
        ? `${candidate.setup} -> ${candidate.targetRef}`
        : candidate.setup
      : null,
    reason: candidate.reason,
    action: candidate.targetRef ? sourceCaptureAction(candidate) : null,
  };
}

function sourceCaptureAction(
  candidate: MotionSourceProfile['captureCandidates'][number]
): MotionPreviewSourceCaptureAction {
  return {
    id: `capture-source-${candidate.id}`,
    label: sourceCaptureActionLabel(candidate.mode),
    route: '/api/motion/capture',
    method: 'POST',
    toolId: 'motion-capture',
    requestTemplate: {
      project: '$motionProject',
      requestIds: [candidate.id],
      requestedAt: '$now',
    },
    expectedReceiptLabels: sourceCaptureExpectedReceiptLabels(candidate.mode),
  };
}

function sourceCaptureActionLabel(
  mode: MotionSourceProfile['captureCandidates'][number]['mode']
): string {
  if (mode === 'screen-recording') return 'record flow';
  if (mode === 'dom-snapshot') return 'read structure';
  if (mode === 'interaction-trace') return 'trace interaction';
  return 'capture route';
}

function sourceCaptureExpectedReceiptLabels(
  mode: MotionSourceProfile['captureCandidates'][number]['mode']
): string[] {
  if (mode === 'screen-recording') return ['recording', 'interaction receipt', 'viewport receipt'];
  if (mode === 'dom-snapshot') return ['snapshot', 'route metadata', 'viewport receipt'];
  if (mode === 'interaction-trace') return ['interaction trace', 'cursor targets', 'viewport receipt'];
  return ['screenshot', 'cursor targets', 'viewport receipt'];
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

function buildSyncEffectCues(
  syncPlan: ReturnType<typeof buildMotionSyncPlan>
): MotionPreviewSyncEffectCue[] {
  const soundCueById = new Map(syncPlan.soundCues.map((cue) => [cue.id, cue]));

  return syncPlan.effectCues.map((cue) => ({
    kind: cue.kind,
    label: cue.label,
    startSeconds: cue.startSeconds,
    durationSeconds: cue.durationSeconds,
    effectPresetId: cue.effectPresetId,
    effectPresetLabel:
      getMotionEffectPreset(cue.effectPresetId)?.label ?? cue.effectPresetId.replace(/-/g, ' '),
    targetLabel: syncTargetLabel(cue.targetBeatId ?? cue.targetClipId),
    soundCueLabel: cue.soundCueId ? soundCueById.get(cue.soundCueId)?.label ?? null : null,
  }));
}

function syncTargetLabel(value: string): string {
  return value.replace(/^beat-/, '').replace(/^clip-/, '').replace(/-/g, ' ');
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
    effectCueCount: syncPlan.effectCues.length,
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
  const packageVerification = buildRenderPackageVerification(renderEntries);
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
    packageVerification,
  };
}

function buildRenderPackageVerification(
  renderEntries: MotionExecutionHistoryEntry[]
): MotionPreviewRenderPackageVerification {
  const packageEntries = renderEntries.filter(isRenderPackageEntry);
  const latestPackageEntry = packageEntries[packageEntries.length - 1] ?? null;
  const receipts = packageEntries.flatMap((entry) => entry.receipts);
  const verificationReceipts = receipts.filter((receipt) =>
    receipt.ref.includes(':verification:')
  );
  const artifactCheckReceipts = receipts.filter((receipt) =>
    receipt.ref.includes(':artifact-check:')
  );
  const manifestReceipt =
    [...receipts].reverse().find((receipt) => receipt.ref.endsWith(':source-manifest')) ?? null;

  return {
    status: receipts.length > 0 ? 'saved' : 'missing',
    receiptCount: receipts.length,
    providerLabel: latestPackageEntry?.providerId
      ? readableLabel(latestPackageEntry.providerId)
      : null,
    manifestPath: manifestReceipt?.path ?? null,
    receiptLabels: uniqueStrings(receipts.map((receipt) => receipt.label)),
    verificationLabels: uniqueStrings(verificationReceipts.map((receipt) => receipt.label)),
    artifactCheckLabels: uniqueStrings(artifactCheckReceipts.map((receipt) => receipt.label)),
  };
}

function isRenderPackageEntry(entry: MotionExecutionHistoryEntry): boolean {
  return entry.label === 'Render package verification' || entry.id.startsWith('execution-render-package-');
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
  timelineRows: MotionPreviewTimelineRow[],
  tracks: TimelineTrack[]
): MotionPreviewVisualGenerationSummary {
  const requests = imageToVideoPlan.requests.map((request) => {
    const clip = findTimelineClipById(timelineRows, request.clipId);
    const componentLabel = clip?.componentLabel ?? 'Visual clip';
    const takeState = generatedVideoTakeStateForClip(tracks, request.clipId);
    return {
      requestId: request.id,
      clipId: request.clipId,
      componentLabel,
      durationSeconds: roundSecondValue(motionSeconds(request.durationFrames, request.fps)),
      prompt: request.prompt,
      sourceAssetId: request.sourceAssetId,
      sourceLabel: sourceLabelForImageToVideoRequest(request),
      sourceAssetUrl: request.source.assetUrl ?? null,
      sourceKind: request.source.kind ?? null,
      sourceMimeType: request.source.mimeType ?? null,
      outputLabel: `${request.aspectRatio} ${request.width}x${request.height}`,
      pendingTakeCount: takeState.pendingTakes.length,
      pendingTakeLabels: takeState.pendingTakes.map((take) => take.providerLabel),
      pendingTakes: takeState.pendingTakes,
      selectedTakeCount: takeState.selectedTakes.length,
      selectedTakeLabels: takeState.selectedTakes.map((take) => take.providerLabel),
    };
  });
  const pendingTakeCount = requests.reduce(
    (count, request) => count + (request.pendingTakeCount ?? 0),
    0
  );
  const selectedTakeCount = requests.reduce(
    (count, request) => count + (request.selectedTakeCount ?? 0),
    0
  );

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
    nodePlan: buildVisualGenerationNodePlan(
      imageToVideoPlan,
      requests,
      pendingTakeCount,
      selectedTakeCount
    ),
    blockerLabels: imageToVideoPlan.blockers.map((blocker) => blocker.label),
    nextActionLabels: imageToVideoPlan.nextActions.map((action) => action.label),
  };
}

function sourceLabelForImageToVideoRequest(
  request: ReturnType<typeof buildMotionImageToVideoPlan>['requests'][number]
): string {
  const kind = request.source.kind ? readableLabel(request.source.kind) : 'source material';
  const provider = request.source.providerId ? readableLabel(request.source.providerId) : null;
  return provider ? `${kind} via ${provider}` : kind;
}

function buildVisualGenerationNodePlan(
  imageToVideoPlan: ReturnType<typeof buildMotionImageToVideoPlan>,
  requests: MotionPreviewVisualGenerationRequest[],
  pendingTakeCount = 0,
  selectedTakeCount = 0
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
  const pendingTakeLabels = uniqueStrings(
    requests.flatMap((request) => request.pendingTakeLabels ?? [])
  );
  const selectedTakeLabels = uniqueStrings(
    requests.flatMap((request) => request.selectedTakeLabels ?? [])
  );
  const hasPendingTakes = pendingTakeCount > 0;
  const hasSelectedTakes = selectedTakeCount > 0;
  const generatedOutputLabels = hasPendingTakes
    ? pendingTakeLabels
    : hasSelectedTakes
      ? selectedTakeLabels
      : outputLabels;

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
        status: hasPendingTakes || hasSelectedTakes ? 'complete' : 'ready',
        inputLabels: sourceLabels,
        outputLabels: generatedOutputLabels,
        actionLabel:
          imageToVideoPlan.nextActions.find((action) => action.id === 'generate-video-clips')
            ?.label ?? 'Generate video clips',
      },
      {
        id: 'review-generated-clips',
        label: 'Review generated clips',
        status: hasPendingTakes ? 'ready' : hasSelectedTakes ? 'complete' : 'planned',
        inputLabels: generatedOutputLabels,
        outputLabels: ['Approved clips'],
        actionLabel:
          imageToVideoPlan.nextActions.find((action) => action.id === 'review-generated-clips')
            ?.label ?? 'Review generated clips',
      },
      {
        id: 'timeline-update',
        label: 'Timeline update',
        status: hasPendingTakes ? 'planned' : hasSelectedTakes ? 'ready' : 'planned',
        inputLabels: hasSelectedTakes ? selectedTakeLabels : ['Approved clips'],
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
    nextNodeId: hasPendingTakes
      ? 'review-generated-clips'
      : hasSelectedTakes
        ? 'timeline-update'
        : 'image-to-video',
  };
}

function generatedVideoTakeStateForClip(
  tracks: TimelineTrack[],
  clipId: string
): {
  pendingTakes: MotionPreviewVisualGenerationTake[];
  selectedTakes: MotionPreviewVisualGenerationTake[];
} {
  const states = tracks
    .flatMap((track) => track.clips)
    .filter((clip) => clip.id === clipId)
    .map((clip) => {
      const selectedTakeId = stringValue(clip.props.selectedGeneratedVideoTakeId);
      const takes = previewGeneratedVideoTakes(clip.props.generatedVideoTakes);
      return {
        pendingTakes: takes.filter((take) => take.takeId !== selectedTakeId),
        selectedTakes: selectedTakeId
          ? takes.filter((take) => take.takeId === selectedTakeId)
          : [],
      };
    });
  return {
    pendingTakes: uniqueGeneratedVideoTakes(states.flatMap((state) => state.pendingTakes)),
    selectedTakes: uniqueGeneratedVideoTakes(states.flatMap((state) => state.selectedTakes)),
  };
}

function uniqueGeneratedVideoTakes(
  takes: MotionPreviewVisualGenerationTake[]
): MotionPreviewVisualGenerationTake[] {
  const seen = new Set<string>();
  return takes.filter((take) => {
    if (seen.has(take.takeId)) return false;
    seen.add(take.takeId);
    return true;
  });
}

function previewGeneratedVideoTakes(value: unknown): MotionPreviewVisualGenerationTake[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return [];
    const take = candidate as Record<string, unknown>;
    const takeId = stringValue(take.id);
    const assetId = stringValue(take.assetId);
    const assetUrl = stringValue(take.assetUrl);
    const providerId = stringValue(take.providerId);
    const sourceAssetId = stringValue(take.sourceAssetId);
    const mimeType = stringValue(take.mimeType);
    const status = stringValue(take.status);
    if (!takeId || !assetId || !assetUrl || !providerId || !sourceAssetId || !mimeType) {
      return [];
    }
    return [
      {
        takeId,
        assetId,
        assetUrl,
        providerLabel: readableLabel(providerId),
        sourceAssetId,
        mimeType,
        status: status ?? 'ready',
      },
    ];
  });
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
      renderPackage: null,
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
      renderPackage: null,
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
    renderPackage: buildRenderPackageSummary(sourceBundle.files, engine),
  };
}

interface RenderPackageManifestCommand {
  id?: unknown;
  label?: unknown;
  display?: unknown;
  outputId?: unknown;
  outputPath?: unknown;
}

interface RenderPackageManifestArtifactCheck {
  outputId?: unknown;
  kind?: unknown;
  path?: unknown;
  required?: unknown;
}

interface RenderPackageManifestProofArtifact {
  outputId?: unknown;
  kind?: unknown;
  label?: unknown;
  path?: unknown;
  mimeType?: unknown;
  width?: unknown;
  height?: unknown;
}

interface RenderPackageManifestExecution {
  sourceHostRequirement?: unknown;
  previewCommand?: unknown;
  renderCommands?: unknown;
  verificationCommands?: unknown;
  artifactChecks?: unknown;
}

interface RenderPackageManifest {
  execution?: RenderPackageManifestExecution;
  proofArtifacts?: unknown;
}

function buildRenderPackageSummary(
  sourceFiles: NonNullable<MotionRenderRequest['sourceFiles']>,
  engine: MotionRenderEngine
): MotionPreviewRenderPackage | null {
  const manifestFile = sourceFiles.find((file) => file.kind === 'manifest');
  if (!manifestFile) return null;

  const manifest = parseRenderPackageManifest(manifestFile.contents);
  if (!manifest?.execution) return null;

  const previewCommand = commandSummary(manifest.execution.previewCommand);
  const renderCommands = commandSummaries(manifest.execution.renderCommands);
  const verificationCommands = commandSummaries(manifest.execution.verificationCommands);
  const artifactChecks = artifactCheckSummaries(manifest.execution.artifactChecks);
  const proofArtifacts = proofArtifactSummaries(manifest.proofArtifacts);

  return {
    manifestPath: manifestFile.path,
    sourceHostRequirement:
      stringValue(manifest.execution.sourceHostRequirement) ?? 'Source host required.',
    previewCommand,
    renderCommands,
    verificationCommands,
    artifactChecks,
    proofArtifacts,
    renderCommandLabels: renderCommands.map((command) => command.label),
    verificationLabels: verificationCommands.map((command) => command.label),
    proofArtifactLabels: uniqueStrings(proofArtifacts.map((artifact) => artifact.label)),
    proofArtifactPaths: proofArtifacts.map((artifact) => artifact.path),
    action: renderPackageAction(engine, verificationCommands, artifactChecks),
  };
}

function renderPackageAction(
  engine: MotionRenderEngine,
  verificationCommands: MotionPreviewRenderPackageCommand[],
  artifactChecks: MotionPreviewRenderPackageArtifactCheck[]
): MotionPreviewRenderPackageAction {
  return {
    id: `verify-render-package-${engine}`,
    label: `Verify ${renderEnginePackageLabel(engine)} package`,
    route: '/api/motion/render',
    method: 'POST',
    toolId: 'motion-render',
    engine,
    requestTemplate: {
      project: '$motionProject',
      engine,
      providerId: '$selectedRenderProvider',
      requestedAt: '$now',
    },
    expectedReceiptLabels: uniqueStrings([
      'render source manifest',
      ...verificationCommands.map((command) => command.label),
      ...artifactChecks.map((check) => `check ${readableLabel(check.kind)}`),
    ]),
  };
}

function renderEnginePackageLabel(engine: MotionRenderEngine): string {
  return engine === 'hyperframes' ? 'HyperFrames' : 'Remotion';
}

function parseRenderPackageManifest(contents: string): RenderPackageManifest | null {
  try {
    return JSON.parse(contents) as RenderPackageManifest;
  } catch {
    return null;
  }
}

function commandSummaries(value: unknown): MotionPreviewRenderPackageCommand[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const summary = commandSummary(item);
    return summary ? [summary] : [];
  });
}

function commandSummary(value: unknown): MotionPreviewRenderPackageCommand | null {
  const command = value as RenderPackageManifestCommand | null;
  const id = stringValue(command?.id);
  const label = stringValue(command?.label);
  const display = stringValue(command?.display);
  if (!id || !label || !display) return null;

  return {
    id,
    label,
    display,
    ...(typeof command?.outputId === 'string' ? { outputId: command.outputId } : {}),
    ...(typeof command?.outputPath === 'string' ? { outputPath: command.outputPath } : {}),
  };
}

function artifactCheckSummaries(
  value: unknown
): MotionPreviewRenderPackageArtifactCheck[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    const check = item as RenderPackageManifestArtifactCheck;
    const outputId = stringValue(check.outputId);
    const kind = stringValue(check.kind);
    const path = stringValue(check.path);
    if (!outputId || !kind || !path) return [];

    return [
      {
        outputId,
        kind,
        path,
        required: check.required === true,
      },
    ];
  });
}

function proofArtifactSummaries(
  value: unknown
): MotionPreviewRenderPackageProofArtifact[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    const artifact = item as RenderPackageManifestProofArtifact;
    const outputId = stringValue(artifact.outputId);
    const kind = stringValue(artifact.kind);
    const label = stringValue(artifact.label);
    const path = stringValue(artifact.path);
    const mimeType = stringValue(artifact.mimeType);
    const width = numberValue(artifact.width);
    const height = numberValue(artifact.height);
    if (!outputId || !kind || !label || !path || !mimeType || width === null || height === null) {
      return [];
    }

    return [
      {
        outputId,
        kind,
        label,
        path,
        mimeType,
        width,
        height,
      },
    ];
  });
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
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
    const editContract = buildMotionRenderEditContract(project, request);

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
        editableProps: editablePropsForClip(
          clip,
          component?.editControls.map((control) => control.id) ?? []
        ),
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
    component.regenerateScopes.map((scope) => {
      const label = `Regenerate ${scope} for ${component.componentLabel}`;
      return {
        id: `regen-option-${component.clipId}-${scope}`,
        clipId: component.clipId,
        componentId: component.componentId,
        componentLabel: component.componentLabel,
        scope,
        label,
        route: '/api/motion/regenerate',
        method: 'POST',
        toolId: regenerationToolIdForScope(scope),
        requestTemplate: {
          project: '$motionProject',
          clipId: component.clipId,
          scope,
          prompt: label,
          requestedEngines: '$selectedEngines',
          requestedAt: '$now',
        },
        expectedReceiptLabels: regenerationReceiptLabelsForScope(scope),
      };
    })
  );
}

function regenerationToolIdForScope(scope: MotionRegenerateScope): ToolRegistryId {
  switch (scope) {
    case 'capture':
      return 'motion-capture';
    case 'asset':
    case 'proof':
    case 'code':
    case 'diagram':
      return 'motion-visuals';
    case 'caption':
      return 'motion-voice';
    case 'timing':
    case 'effect':
      return 'motion-revise';
    case 'copy':
    case 'cta':
      return 'motion-storyboard';
  }
}

function regenerationReceiptLabelsForScope(scope: MotionRegenerateScope): string[] {
  switch (scope) {
    case 'capture':
      return ['regeneration request', 'capture plan', 'updated preview plan'];
    case 'asset':
    case 'proof':
    case 'code':
    case 'diagram':
      return ['regeneration request', 'visual source plan', 'updated preview plan'];
    case 'caption':
      return ['regeneration request', 'voice and caption update', 'updated preview plan'];
    case 'timing':
    case 'effect':
      return ['regeneration request', 'timeline update', 'updated preview plan'];
    case 'copy':
    case 'cta':
      return ['regeneration request', 'script update', 'updated preview plan'];
  }
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

function editablePropsForClip(
  clip: TimelineClip,
  editControlIds: string[]
): Record<string, string | number | boolean | null> {
  const props: Record<string, string | number | boolean | null> = {};
  for (const id of editControlIds) {
    const value = clip.props[id];
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      props[id] = value;
    }
  }
  if (clip.assetId && editControlIds.includes('assetId') && props.assetId === undefined) {
    props.assetId = clip.assetId;
  }
  return props;
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

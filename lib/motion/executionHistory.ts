import type { CaptureArtifact, CaptureResult } from '@/lib/providers/capture/types';
import type {
  VoiceArtifact,
  VoiceSynthesisResult,
} from '@/lib/providers/voice/types';
import type {
  MotionGeneratedVideoClip,
  MotionImageToVideoResult,
  MotionRenderedAsset,
  MotionRenderRequest,
  MotionRenderResult,
} from '@/lib/providers/video/types';
import type {
  MotionExecutionHistoryEntry,
  MotionExecutionReceipt,
  MotionProvenanceRef,
} from './project';
import type { MotionExportPackPlan } from './exportPackPlan';
import type { MotionInteractiveExportPlan } from './interactiveExportPlan';
import type {
  MotionComponentRegenerationRequest,
  MotionDraftVariationRequest,
  MotionReferenceSignalRegenerationRequest,
  MotionTasteReferenceRegenerationRequest,
} from './reviewPlan';
import type { MotionSyncPlan } from './syncPlan';
import { getMotionComponent, type MotionRegenerateScope } from './componentRegistry';

export interface MotionVisualSourceReceiptInput {
  providerId: string;
  selectedAssets: MotionVisualSourceSelectedAsset[];
  provenance: MotionProvenanceRef[];
}

export interface MotionVisualSourceSelectedAsset {
  id: string;
  label?: string;
  assetUrl?: string;
  mimeType?: string;
  provenance: MotionProvenanceRef[];
}

export interface MotionSetupDryRunReceiptInput {
  setupId: string;
  gateId: Exclude<MotionExecutionHistoryEntry['gateId'], 'setup'>;
  label: string;
  receiptLabels: string[];
  providerId?: string;
  provenance: MotionProvenanceRef[];
}

export interface MotionDraftApprovalReceiptInput {
  projectId: string;
  draftId: string;
  draftLabel: string;
  provenance: MotionProvenanceRef[];
}

export interface MotionSourceEditReceiptInput {
  id: string;
  sourcePaths: string[];
  operationCount: number;
  provenance: MotionProvenanceRef[];
}

export function appendCaptureExecutionHistory(
  history: MotionExecutionHistoryEntry[] | undefined,
  result: CaptureResult,
  savedAt: number
): MotionExecutionHistoryEntry[] {
  return appendExecutionEntry(history, {
    id: `execution-capture-${slugifyId(result.providerId)}-${savedAt}`,
    gateId: 'capture',
    label: 'Product capture',
    providerId: result.providerId,
    savedAt,
    receiptCount: result.artifacts.length,
    receiptLabels: result.artifacts.map((artifact) => captureReceiptLabel(artifact)),
    receipts: result.artifacts.map((artifact) => captureReceipt(result.providerId, artifact)),
    provenance: uniqueProvenance([
      ...result.provenance,
      ...result.artifacts.flatMap((artifact) => artifact.provenance),
      ...result.artifacts.map((artifact) => ({ kind: 'capture' as const, ref: artifact.id })),
    ]),
  });
}

export function appendRenderExecutionHistory(
  history: MotionExecutionHistoryEntry[] | undefined,
  result: MotionRenderResult,
  savedAt: number
): MotionExecutionHistoryEntry[] {
  return appendExecutionEntry(history, {
    id: `execution-render-${slugifyId(result.providerId)}-${savedAt}`,
    gateId: 'render',
    label: 'Render proof',
    providerId: result.providerId,
    savedAt,
    receiptCount: result.outputs.length,
    receiptLabels: result.outputs.map((output) => renderReceiptLabel(output.kind)),
    receipts: result.outputs.map((output) => renderReceipt(result.providerId, output)),
    provenance: uniqueProvenance([
      ...result.provenance,
      ...result.outputs.flatMap((output) => output.provenance),
      ...result.outputs.map((output) => ({ kind: 'render' as const, ref: output.id })),
    ]),
  });
}

export function appendRenderPackageExecutionHistory(
  history: MotionExecutionHistoryEntry[] | undefined,
  request: MotionRenderRequest,
  result: MotionRenderResult,
  savedAt: number
): MotionExecutionHistoryEntry[] {
  const receipts = renderPackageReceipts(result.providerId, request);
  if (receipts.length === 0) return history ?? [];

  return appendExecutionEntry(history, {
    id: `execution-render-package-${slugifyId(result.providerId)}-${slugifyId(request.id)}-${savedAt}`,
    gateId: 'render',
    label: 'Render package verification',
    providerId: result.providerId,
    savedAt,
    receiptCount: receipts.length,
    receiptLabels: receipts.map((receipt) => receipt.label),
    receipts,
    provenance: uniqueProvenance([
      ...request.provenance,
      ...result.provenance,
      { kind: 'render', ref: request.id },
      { kind: 'render', ref: `${request.id}:source-package` },
    ]),
  });
}

export function appendImageToVideoExecutionHistory(
  history: MotionExecutionHistoryEntry[] | undefined,
  result: MotionImageToVideoResult,
  savedAt: number
): MotionExecutionHistoryEntry[] {
  return appendExecutionEntry(history, {
    id: `execution-image-to-video-${slugifyId(result.providerId)}-${savedAt}`,
    gateId: 'visual-generation',
    label: 'Image-to-video generation',
    providerId: result.providerId,
    savedAt,
    receiptCount: result.artifacts.length,
    receiptLabels: result.artifacts.map(() => 'Generated clip'),
    receipts: result.artifacts.map((artifact) => imageToVideoReceipt(result.providerId, artifact)),
    provenance: uniqueProvenance([
      ...result.provenance,
      ...result.artifacts.flatMap((artifact) => artifact.provenance),
      ...result.artifacts.map((artifact) => ({ kind: 'image-to-video' as const, ref: artifact.id })),
    ]),
  });
}

export function appendVoiceExecutionHistory(
  history: MotionExecutionHistoryEntry[] | undefined,
  result: VoiceSynthesisResult,
  clipId: string,
  savedAt: number
): MotionExecutionHistoryEntry[] {
  return appendExecutionEntry(history, {
    id: `execution-voice-${slugifyId(result.providerId)}-${slugifyId(clipId)}-${savedAt}`,
    gateId: 'voice',
    label: 'Voice synthesis',
    providerId: result.providerId,
    savedAt,
    receiptCount: result.artifacts.length,
    receiptLabels: result.artifacts.map((artifact) => voiceReceiptLabel(artifact.kind)),
    receipts: result.artifacts.map((artifact) => voiceReceipt(result.providerId, artifact)),
    provenance: uniqueProvenance([
      ...result.provenance,
      ...result.artifacts.flatMap((artifact) => artifact.provenance),
      ...result.artifacts.map((artifact) => ({ kind: 'voice' as const, ref: artifact.id })),
    ]),
  });
}

export function appendSetupDryRunExecutionHistory(
  history: MotionExecutionHistoryEntry[] | undefined,
  input: MotionSetupDryRunReceiptInput,
  savedAt: number
): MotionExecutionHistoryEntry[] {
  const setupId = slugifyId(input.setupId);
  const receipts = uniqueStrings(input.receiptLabels).map((label) =>
    setupDryRunReceipt({
      setupId,
      gateId: input.gateId,
      label,
      providerId: input.providerId,
    })
  );

  return appendExecutionEntry(history, {
    id: `execution-setup-${setupId}-${savedAt}`,
    gateId: 'setup',
    label: input.label,
    ...(input.providerId ? { providerId: input.providerId } : {}),
    savedAt,
    receiptCount: receipts.length,
    receiptLabels: receipts.map((receipt) => receipt.label),
    receipts,
    provenance: uniqueProvenance([
      ...input.provenance,
      { kind: 'manual', ref: `setup:${setupId}` },
      { kind: 'manual', ref: `setup-gate:${input.gateId}` },
    ]),
  });
}

export function appendVisualSourceExecutionHistory(
  history: MotionExecutionHistoryEntry[] | undefined,
  result: MotionVisualSourceReceiptInput,
  savedAt: number
): MotionExecutionHistoryEntry[] {
  return appendExecutionEntry(history, {
    id: `execution-visual-source-${slugifyId(result.providerId)}-${savedAt}`,
    gateId: 'visual-source',
    label: 'Selected visual sources',
    providerId: result.providerId,
    savedAt,
    receiptCount: result.selectedAssets.length,
    receiptLabels: result.selectedAssets.map(() => 'Selected source asset'),
    receipts: result.selectedAssets.map((asset) =>
      visualSourceReceipt(result.providerId, asset)
    ),
    provenance: uniqueProvenance([
      ...result.provenance,
      ...result.selectedAssets.flatMap((asset) => asset.provenance),
      ...result.selectedAssets.map((asset) => visualSourceRef(asset.id)),
    ]),
  });
}

export function appendComponentRegenerationExecutionHistory(
  history: MotionExecutionHistoryEntry[] | undefined,
  request: MotionComponentRegenerationRequest,
  savedAt: number
): MotionExecutionHistoryEntry[] {
  const component = getMotionComponent(request.componentId);
  const componentLabel = component?.label ?? readableLabel(request.componentId);
  const planLabel = regenerationPlanReceiptLabel(request.scope);
  const receipts = [
    regenerationReceipt({
      id: `receipt-regeneration-${request.id}-request`,
      label: 'Regeneration request',
      ref: request.id,
    }),
    regenerationReceipt({
      id: `receipt-regeneration-${request.id}-${slugifyId(planLabel)}`,
      label: planLabel,
      ref: `${request.id}:${slugifyId(planLabel)}`,
    }),
    regenerationReceipt({
      id: `receipt-regeneration-${request.id}-source-patch-plan`,
      label: 'Source patch plan',
      ref: request.sourcePatchPlan.id,
    }),
  ];

  return appendExecutionEntry(history, {
    id: `execution-regeneration-${slugifyId(request.componentId)}-${slugifyId(request.scope)}-${savedAt}`,
    gateId: 'drafts',
    label: `Regenerate ${request.scope} for ${componentLabel}`,
    savedAt,
    receiptCount: receipts.length,
    receiptLabels: receipts.map((receipt) => receipt.label),
    receipts,
    provenance: uniqueProvenance([
      { kind: 'revision', ref: request.id },
      ...request.provenance,
    ]),
  });
}

export function appendReferenceSignalRegenerationExecutionHistory(
  history: MotionExecutionHistoryEntry[] | undefined,
  request: MotionReferenceSignalRegenerationRequest,
  savedAt: number
): MotionExecutionHistoryEntry[] {
  const planLabel = referenceSignalPlanReceiptLabel(request.scope);
  const receipts = [
    regenerationReceipt({
      id: `receipt-reference-signal-${request.id}-reference`,
      label: 'Reference signal',
      ref: request.referenceSignalId,
    }),
    regenerationReceipt({
      id: `receipt-reference-signal-${request.id}-${slugifyId(planLabel)}`,
      label: planLabel,
      ref: `${request.id}:${slugifyId(planLabel)}`,
    }),
    regenerationReceipt({
      id: `receipt-reference-signal-${request.id}-source-patch-plan`,
      label: 'Source patch plan',
      ref: request.sourcePatchPlan.id,
    }),
  ];

  return appendExecutionEntry(history, {
    id: `execution-reference-signal-${slugifyId(request.referenceSignalId)}-${slugifyId(request.scope)}-${savedAt}`,
    gateId: 'drafts',
    label: referenceSignalExecutionLabel(request),
    savedAt,
    receiptCount: receipts.length,
    receiptLabels: receipts.map((receipt) => receipt.label),
    receipts,
    provenance: uniqueProvenance([
      { kind: 'revision', ref: request.id },
      ...request.provenance,
    ]),
  });
}

export function appendTasteReferenceRegenerationExecutionHistory(
  history: MotionExecutionHistoryEntry[] | undefined,
  request: MotionTasteReferenceRegenerationRequest,
  savedAt: number
): MotionExecutionHistoryEntry[] {
  const receipts = [
    regenerationReceipt({
      id: `receipt-taste-reference-${request.id}-reference`,
      label: 'Taste reference',
      ref: request.tasteReferenceId,
    }),
    regenerationReceipt({
      id: `receipt-taste-reference-${request.id}-shot-plan`,
      label: 'Timestamped shot plan',
      ref: `${request.id}:timestamped-shot-plan`,
    }),
    regenerationReceipt({
      id: `receipt-taste-reference-${request.id}-source-patch-plan`,
      label: 'Source patch plan',
      ref: request.sourcePatchPlan.id,
    }),
    regenerationReceipt({
      id: `receipt-taste-reference-${request.id}-preview-plan`,
      label: 'Updated preview plan',
      ref: `${request.id}:preview-plan`,
    }),
  ];

  return appendExecutionEntry(history, {
    id: `execution-taste-reference-${slugifyId(request.tasteReferenceId)}-${slugifyId(request.scope)}-${savedAt}`,
    gateId: 'drafts',
    label: `Apply taste reference to ${request.componentLabels.join(' / ')}`,
    savedAt,
    receiptCount: receipts.length,
    receiptLabels: receipts.map((receipt) => receipt.label),
    receipts,
    provenance: uniqueProvenance([
      { kind: 'revision', ref: request.id },
      ...request.provenance,
      ...request.timestampedShotPlan.map((shot) => ({ kind: 'manual' as const, ref: `taste-shot:${shot.id}` })),
    ]),
  });
}

export function appendDraftVariationExecutionHistory(
  history: MotionExecutionHistoryEntry[] | undefined,
  request: MotionDraftVariationRequest,
  savedAt: number
): MotionExecutionHistoryEntry[] {
  const receipts = [
    regenerationReceipt({
      id: `receipt-draft-variation-${request.id}-draft`,
      label: 'Draft variation',
      ref: request.draftId,
    }),
    regenerationReceipt({
      id: `receipt-draft-variation-${request.id}-preview-plan`,
      label: 'Updated preview plan',
      ref: `${request.id}:preview-plan`,
    }),
  ];

  return appendExecutionEntry(history, {
    id: `execution-draft-variation-${slugifyId(request.draftId)}-${savedAt}`,
    gateId: 'drafts',
    label: `Use draft variation ${request.draftLabel}`,
    savedAt,
    receiptCount: receipts.length,
    receiptLabels: receipts.map((receipt) => receipt.label),
    receipts,
    provenance: uniqueProvenance([
      { kind: 'revision', ref: request.id },
      ...request.provenance,
    ]),
  });
}

export function appendDraftApprovalExecutionHistory(
  history: MotionExecutionHistoryEntry[] | undefined,
  input: MotionDraftApprovalReceiptInput,
  savedAt: number
): MotionExecutionHistoryEntry[] {
  const draftId = slugifyId(input.draftId);
  const receipts: MotionExecutionReceipt[] = [
    {
      id: `receipt-draft-approval-${draftId}`,
      kind: 'draft',
      label: 'Draft approval',
      ref: input.draftId,
    },
    {
      id: `receipt-draft-approval-${draftId}-timeline`,
      kind: 'draft',
      label: 'Approved timeline',
      ref: `${input.draftId}:timeline`,
    },
  ];

  return appendExecutionEntry(history, {
    id: `execution-draft-approval-${draftId}-${savedAt}`,
    gateId: 'drafts',
    label: `Approve draft variation ${input.draftLabel}`,
    savedAt,
    receiptCount: receipts.length,
    receiptLabels: receipts.map((receipt) => receipt.label),
    receipts,
    provenance: uniqueProvenance([
      ...input.provenance,
      { kind: 'manual', ref: `draft-approval:${input.draftId}` },
      { kind: 'timeline', ref: input.draftId },
      { kind: 'revision', ref: `draft-variation:${input.draftId}` },
      { kind: 'manual', ref: `motion-project:${input.projectId}` },
    ]),
  });
}

export function appendSourceEditExecutionHistory(
  history: MotionExecutionHistoryEntry[] | undefined,
  input: MotionSourceEditReceiptInput,
  savedAt: number
): MotionExecutionHistoryEntry[] {
  const receipts = sourceEditReceipts(input);

  return appendExecutionEntry(history, {
    id: `execution-source-edit-${slugifyId(input.id)}-${savedAt}`,
    gateId: 'sync',
    label: 'Source edit',
    providerId: 'motion-source-edit',
    savedAt,
    receiptCount: receipts.length,
    receiptLabels: receipts.map((receipt) => receipt.label),
    receipts,
    provenance: uniqueProvenance([
      ...input.provenance,
      { kind: 'revision', ref: input.id },
      { kind: 'manual', ref: `source-edit:${input.operationCount}:operations` },
    ]),
  });
}

export function appendSyncExecutionHistory(
  history: MotionExecutionHistoryEntry[] | undefined,
  plan: MotionSyncPlan,
  providerId: string,
  savedAt: number
): MotionExecutionHistoryEntry[] {
  const receipts = [
    syncReceipt({
      id: `receipt-sync-${plan.id}-beat-markers`,
      label: 'Beat markers',
      ref: `${plan.id}:beat-markers`,
      count: plan.beatMarkers.length,
      providerId,
    }),
    syncReceipt({
      id: `receipt-sync-${plan.id}-caption-links`,
      label: 'Caption links',
      ref: `${plan.id}:caption-links`,
      count: plan.captionLinks.length,
      providerId,
    }),
    syncReceipt({
      id: `receipt-sync-${plan.id}-transition-cues`,
      label: 'Transition cues',
      ref: `${plan.id}:transition-cues`,
      count: plan.transitionCues.length,
      providerId,
    }),
    syncReceipt({
      id: `receipt-sync-${plan.id}-sound-cues`,
      label: 'Sound cues',
      ref: `${plan.id}:sound-cues`,
      count: plan.soundCues.length,
      providerId,
    }),
  ].filter((receipt): receipt is MotionExecutionReceipt => Boolean(receipt));

  return appendExecutionEntry(history, {
    id: `execution-sync-${slugifyId(providerId)}-${savedAt}`,
    gateId: 'sync',
    label: 'Timeline sync',
    providerId,
    savedAt,
    receiptCount: receipts.length,
    receiptLabels: receipts.map((receipt) => receipt.label),
    receipts,
    provenance: uniqueProvenance([
      ...plan.provenance,
      ...(plan.syncNode?.provenance ?? []),
      ...(plan.syncNode?.outputRefs.map((ref) => ({ kind: 'timeline' as const, ref })) ?? []),
    ]),
  });
}

export function appendExportPackExecutionHistory(
  history: MotionExecutionHistoryEntry[] | undefined,
  plan: MotionExportPackPlan,
  savedAt: number
): MotionExecutionHistoryEntry[] {
  if (plan.status !== 'ready' || !plan.manifest) return history ?? [];

  const receipts = exportPackReceipts(plan);
  return appendExecutionEntry(history, {
    id: `execution-${plan.id}-${savedAt}`,
    gateId: 'export',
    label: 'Export pack',
    savedAt,
    receiptCount: receipts.length,
    receiptLabels: receipts.map((receipt) => receipt.label),
    receipts,
    provenance: uniqueProvenance([
      ...plan.provenance,
      { kind: 'export', ref: plan.manifest.id },
      { kind: 'export', ref: `${plan.id}:canvas-drops` },
      { kind: 'export', ref: `${plan.id}:provenance` },
    ]),
  });
}

export function appendInteractiveExportExecutionHistory(
  history: MotionExecutionHistoryEntry[] | undefined,
  plan: MotionInteractiveExportPlan,
  savedAt: number
): MotionExecutionHistoryEntry[] {
  if (plan.status !== 'ready' || !plan.manifest || !plan.shareTarget) return history ?? [];

  const receipts = interactiveExportReceipts(plan);
  return appendExecutionEntry(history, {
    id: `execution-${plan.id}-${savedAt}`,
    gateId: 'export',
    label: 'Interactive export',
    providerId: 'motion-interactive-export',
    savedAt,
    receiptCount: receipts.length,
    receiptLabels: receipts.map((receipt) => receipt.label),
    receipts,
    provenance: uniqueProvenance([
      ...plan.provenance,
      { kind: 'export', ref: plan.manifest.id },
      { kind: 'export', ref: plan.shareTarget.id },
      { kind: 'export', ref: `${plan.id}:marker-provenance` },
    ]),
  });
}

function appendExecutionEntry(
  history: MotionExecutionHistoryEntry[] | undefined,
  entry: MotionExecutionHistoryEntry
): MotionExecutionHistoryEntry[] {
  const current = history ?? [];
  return [...current.filter((item) => item.id !== entry.id), entry];
}

function captureReceipt(providerId: string, artifact: CaptureArtifact): MotionExecutionReceipt {
  return {
    id: `receipt-capture-${artifact.id}`,
    kind: 'capture',
    label: captureReceiptLabel(artifact),
    ref: artifact.id,
    providerId,
    assetUrl: artifact.assetUrl,
    mimeType: artifact.mimeType,
  };
}

function voiceReceipt(providerId: string, artifact: VoiceArtifact): MotionExecutionReceipt {
  return {
    id: `receipt-voice-${artifact.id}`,
    kind: 'voice',
    label: voiceReceiptLabel(artifact.kind),
    ref: artifact.id,
    providerId,
    assetUrl: artifact.assetUrl,
    path: artifact.path,
    mimeType: artifact.mimeType,
  };
}

function visualSourceReceipt(
  providerId: string,
  asset: MotionVisualSourceSelectedAsset
): MotionExecutionReceipt {
  return {
    id: `receipt-visual-source-${asset.id}`,
    kind: 'visual-source',
    label: asset.label ?? 'Selected source asset',
    ref: asset.id,
    providerId,
    assetUrl: asset.assetUrl,
    mimeType: asset.mimeType,
  };
}

function syncReceipt(input: {
  id: string;
  label: string;
  ref: string;
  count: number;
  providerId: string;
}): MotionExecutionReceipt | null {
  if (input.count === 0) return null;

  return {
    id: input.id,
    kind: 'sync',
    label: input.label,
    ref: input.ref,
    providerId: input.providerId,
  };
}

function imageToVideoReceipt(
  providerId: string,
  artifact: MotionGeneratedVideoClip
): MotionExecutionReceipt {
  return {
    id: `receipt-image-to-video-${artifact.id}`,
    kind: 'image-to-video',
    label: 'Generated clip',
    ref: artifact.id,
    providerId,
    assetUrl: artifact.assetUrl,
    path: artifact.path,
    mimeType: artifact.mimeType,
  };
}

function regenerationReceipt(input: {
  id: string;
  label: string;
  ref: string;
}): MotionExecutionReceipt {
  return {
    id: input.id,
    kind: 'revision',
    label: input.label,
    ref: input.ref,
  };
}

function sourceEditReceipts(input: MotionSourceEditReceiptInput): MotionExecutionReceipt[] {
  const sourcePaths = uniqueStrings(input.sourcePaths);

  return [
    ...sourcePaths.map((path) => ({
      id: `receipt-source-edit-${slugifyId(input.id)}-${slugifyId(path)}`,
      kind: 'revision' as const,
      label: 'Source files',
      ref: `${input.id}:source-file:${path}`,
      path,
    })),
    {
      id: `receipt-source-edit-${slugifyId(input.id)}-timeline-revision`,
      kind: 'revision' as const,
      label: 'Timeline revision',
      ref: input.id,
    },
    {
      id: `receipt-source-edit-${slugifyId(input.id)}-preview-plan`,
      kind: 'revision' as const,
      label: 'Updated preview plan',
      ref: `${input.id}:preview-plan`,
    },
  ];
}

function exportPackReceipts(plan: MotionExportPackPlan): MotionExecutionReceipt[] {
  if (!plan.manifest) return [];

  return [
    {
      id: `receipt-${plan.manifest.id}`,
      kind: 'export',
      label: 'Export pack manifest',
      ref: plan.manifest.id,
      path: plan.manifest.path,
      mimeType: plan.manifest.mimeType,
    },
    {
      id: `receipt-${plan.id}-canvas-drops`,
      kind: 'export',
      label: 'Canvas drop candidates',
      ref: `${plan.id}:canvas-drops`,
    },
    {
      id: `receipt-${plan.id}-provenance`,
      kind: 'export',
      label: 'Pack provenance',
      ref: `${plan.id}:provenance`,
    },
  ];
}

function interactiveExportReceipts(plan: MotionInteractiveExportPlan): MotionExecutionReceipt[] {
  if (!plan.manifest || !plan.shareTarget) return [];

  return [
    {
      id: `receipt-${plan.manifest.id}`,
      kind: 'interactive-export',
      label: 'Interactive manifest',
      ref: plan.manifest.id,
      path: plan.manifest.path,
      mimeType: plan.manifest.mimeType,
    },
    {
      id: `receipt-${plan.shareTarget.id}`,
      kind: 'interactive-export',
      label: 'Interactive share metadata',
      ref: plan.shareTarget.id,
      path: plan.shareTarget.path,
      mimeType: plan.shareTarget.mimeType,
    },
    {
      id: `receipt-${plan.id}-marker-provenance`,
      kind: 'interactive-export',
      label: 'Interactive marker provenance',
      ref: `${plan.id}:marker-provenance`,
    },
  ];
}

function renderReceipt(providerId: string, output: MotionRenderedAsset): MotionExecutionReceipt {
  return {
    id: `receipt-render-${output.id}`,
    kind: 'render',
    label: renderReceiptLabel(output.kind),
    ref: output.id,
    providerId,
    assetUrl: output.assetUrl,
    path: output.path,
    mimeType: output.mimeType,
  };
}

interface RenderPackageManifestCommand {
  id?: unknown;
  label?: unknown;
  outputPath?: unknown;
}

interface RenderPackageManifestArtifactCheck {
  outputId?: unknown;
  kind?: unknown;
  path?: unknown;
  required?: unknown;
}

interface RenderPackageManifestExecution {
  verificationCommands?: unknown;
  artifactChecks?: unknown;
}

interface RenderPackageManifest {
  execution?: RenderPackageManifestExecution;
}

function renderPackageReceipts(
  providerId: string,
  request: MotionRenderRequest
): MotionExecutionReceipt[] {
  const manifestFile = request.sourceFiles?.find((file) => file.kind === 'manifest');
  if (!manifestFile) return [];

  const manifest = parseRenderPackageManifest(manifestFile.contents);
  if (!manifest?.execution) return [];

  return [
    {
      id: `receipt-render-package-${slugifyId(request.id)}-source-manifest`,
      kind: 'render',
      label: 'Render source manifest',
      ref: `${request.id}:source-manifest`,
      providerId,
      path: manifestFile.path,
      mimeType: manifestFile.mimeType,
    },
    ...verificationCommandReceipts(
      providerId,
      request.id,
      manifest.execution.verificationCommands
    ),
    ...artifactCheckReceipts(providerId, request.id, manifest.execution.artifactChecks),
  ];
}

function parseRenderPackageManifest(contents: string): RenderPackageManifest | null {
  try {
    return JSON.parse(contents) as RenderPackageManifest;
  } catch {
    return null;
  }
}

function verificationCommandReceipts(
  providerId: string,
  requestId: string,
  value: unknown
): MotionExecutionReceipt[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    const command = item as RenderPackageManifestCommand;
    const commandId = stringValue(command.id);
    const label = stringValue(command.label);
    if (!commandId || !label) return [];

    return [
      {
        id: `receipt-render-package-${slugifyId(requestId)}-${slugifyId(commandId)}`,
        kind: 'render' as const,
        label,
        ref: `${requestId}:verification:${commandId}`,
        providerId,
        ...(typeof command.outputPath === 'string' ? { path: command.outputPath } : {}),
      },
    ];
  });
}

function artifactCheckReceipts(
  providerId: string,
  requestId: string,
  value: unknown
): MotionExecutionReceipt[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    const check = item as RenderPackageManifestArtifactCheck;
    const outputId = stringValue(check.outputId);
    const kind = stringValue(check.kind);
    const path = stringValue(check.path);
    if (!outputId || !kind || !path || check.required !== true) return [];

    return [
      {
        id: `receipt-render-package-${slugifyId(requestId)}-${slugifyId(outputId)}-artifact-check`,
        kind: 'render' as const,
        label: `${renderArtifactLabel(kind)} artifact check`,
        ref: `${requestId}:artifact-check:${outputId}`,
        providerId,
        path,
      },
    ];
  });
}

function renderArtifactLabel(kind: string): string {
  if (kind === 'video') return 'MP4';
  if (kind === 'poster') return 'Poster';
  if (kind === 'subtitle') return 'Subtitles';
  if (kind === 'transcript') return 'Transcript';
  if (kind === 'manifest') return 'Manifest';
  return readableLabel(kind);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function setupDryRunReceipt(input: {
  setupId: string;
  gateId: Exclude<MotionExecutionHistoryEntry['gateId'], 'setup'>;
  label: string;
  providerId?: string;
}): MotionExecutionReceipt {
  const receiptId = slugifyId(input.label);

  return {
    id: `receipt-setup-${input.setupId}-${receiptId}`,
    kind: 'setup',
    label: input.label,
    ref: `${input.setupId}:${input.gateId}:${receiptId}`,
    ...(input.providerId ? { providerId: input.providerId } : {}),
  };
}

function captureReceiptLabel(artifact: CaptureArtifact): string {
  if (artifact.kind === 'recording') return 'Recording';
  if (artifact.kind === 'snapshot') return 'DOM snapshot';
  if (artifact.kind === 'trace') return 'Interaction trace';
  return 'Screenshot';
}

function voiceReceiptLabel(kind: VoiceArtifact['kind']): string {
  if (kind === 'word-timings') return 'Word timings';
  if (kind === 'transcript') return 'Transcript';
  return 'Audio';
}

function renderReceiptLabel(kind: MotionRenderedAsset['kind']): string {
  if (kind === 'video') return 'MP4';
  if (kind === 'poster') return 'Poster';
  if (kind === 'subtitle') return 'Subtitles';
  if (kind === 'transcript') return 'Transcript';
  return 'Manifest';
}

function regenerationPlanReceiptLabel(scope: MotionRegenerateScope): string {
  switch (scope) {
    case 'capture':
      return 'Capture plan';
    case 'asset':
    case 'proof':
    case 'code':
    case 'diagram':
      return 'Visual source plan';
    case 'caption':
      return 'Voice and caption update';
    case 'timing':
    case 'effect':
      return 'Timeline update';
    case 'copy':
    case 'cta':
      return 'Script update';
  }
}

function referenceSignalPlanReceiptLabel(scope: MotionRegenerateScope): string {
  if (scope === 'capture') return 'Capture plan';
  if (scope === 'caption') return 'Voice and caption update';
  if (scope === 'effect' || scope === 'timing') return 'Component style update';
  return 'Component plan';
}

function referenceSignalExecutionLabel(
  request: MotionReferenceSignalRegenerationRequest
): string {
  if (request.scope === 'effect') {
    return `Apply reference style to ${request.componentLabels.join(' / ')}`;
  }
  if (request.scope === 'capture') {
    return `Regenerate capture from ${readableLabel(request.referenceSignalId)}`;
  }
  return `Apply reference ${request.scope} to ${request.componentLabels.join(' / ')}`;
}

function visualSourceRef(ref: string): MotionProvenanceRef {
  return { kind: 'visual-source', ref };
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

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function slugifyId(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'provider'
  );
}

function readableLabel(value: string): string {
  return value.replace(/-/g, ' ');
}

import type {
  MotionPreviewExportPackSummary,
  MotionPreviewRenderProofSummary,
  MotionPreviewVideoPlan,
  MotionPreviewVisualGenerationSummary,
} from './previewPlan';
import type {
  MotionExecutionHistoryEntry,
  MotionExecutionReceipt,
  MotionProject,
} from './project';
import type { MotionReviewPlan } from './reviewPlan';

export type MotionCanvasMaterialKind =
  | 'motion-project'
  | 'captured-material'
  | 'story-beat'
  | 'generation-node'
  | 'render-proof'
  | 'export-pack';

export interface MotionCanvasMaterialCard {
  id: string;
  kind: MotionCanvasMaterialKind;
  label: string;
  body: string;
  detailLabels: string[];
  statusLabel: string;
  actionLabel: string | null;
  width: number;
  height: number;
  sourceRef?: string;
  assetUrl?: string;
  path?: string;
  mimeType?: string;
}

export interface MotionCanvasMaterialPlan {
  id: string;
  projectId: string;
  draftId: string;
  title: string;
  summaryLabels: string[];
  materialCount: number;
  cards: MotionCanvasMaterialCard[];
}

export interface BuildMotionCanvasMaterialPlanInput {
  projectId: string;
  draftId: string;
  title: string;
  workflowMode: MotionProject['workflowMode'];
  primaryAction: MotionReviewPlan['primaryAction'];
  summary: MotionReviewPlan['summary'];
  videoPlan: MotionPreviewVideoPlan;
  visualGenerationSummary: MotionPreviewVisualGenerationSummary;
  renderProofSummary: MotionPreviewRenderProofSummary;
  exportPackSummary: MotionPreviewExportPackSummary;
  executionHistory?: MotionExecutionHistoryEntry[];
}

const PROJECT_CARD_WIDTH = 380;
const PROJECT_CARD_HEIGHT = 168;
const BEAT_CARD_WIDTH = 340;
const BEAT_CARD_HEIGHT = 156;

export function buildMotionCanvasMaterialPlan(
  input: BuildMotionCanvasMaterialPlanInput
): MotionCanvasMaterialPlan {
  const projectCard: MotionCanvasMaterialCard = {
    id: `${input.projectId}-${input.draftId}-project`,
    kind: 'motion-project',
    label: input.title,
    body: `${input.summary.appName} ${input.summary.projectKind} - ${input.summary.totalSeconds}s`,
    detailLabels: boundedLabels(input.summary.targetPlatforms, 4),
    statusLabel: `${input.workflowMode.replace(/-/g, ' ')} mode`,
    actionLabel:
      input.primaryAction === 'queue-render' ? 'full auto render' : 'review plan',
    width: PROJECT_CARD_WIDTH,
    height: PROJECT_CARD_HEIGHT,
  };

  const captureCards = buildCapturedMaterialCards({
    projectId: input.projectId,
    draftId: input.draftId,
    executionHistory: input.executionHistory,
  });

  const storyCards = input.videoPlan.scenes.slice(0, 6).map((scene) => ({
    id: `${input.projectId}-${input.draftId}-${scene.sceneId}`,
    kind: 'story-beat' as const,
    label: `${readableLabel(scene.role)} - ${scene.visualLabel}`,
    body: scene.narration,
    detailLabels: boundedLabels(
      [
        `${scene.startSeconds}s + ${scene.durationSeconds}s`,
        scene.evidenceLabel,
        scene.editSummary,
      ],
      3
    ),
    statusLabel: input.videoPlan.status.replace(/-/g, ' '),
    actionLabel: scene.regenerationActions[0]?.label ?? 'edit scene',
    width: BEAT_CARD_WIDTH,
    height: BEAT_CARD_HEIGHT,
  }));

  const generationNodeCards = input.visualGenerationSummary.nodePlan.nodes
    .slice(0, 4)
    .map((node) => ({
      id: `${input.projectId}-${input.draftId}-generation-${node.id}`,
      kind: 'generation-node' as const,
      label: node.label,
      body: `${formatNodeSide(node.inputLabels, 'No inputs yet')} -> ${formatNodeSide(
        node.outputLabels,
        'No output yet'
      )}`,
      detailLabels: boundedLabels(
        [
          ...input.visualGenerationSummary.nodePlan.edges.map((edge) => edge.label),
          ...node.inputLabels,
          ...node.outputLabels,
        ],
        4
      ),
      statusLabel: node.status,
      actionLabel: node.actionLabel,
      width: BEAT_CARD_WIDTH,
      height: BEAT_CARD_HEIGHT,
    }));

  const renderProofCard: MotionCanvasMaterialCard = {
    id: `${input.projectId}-${input.draftId}-render-proof`,
    kind: 'render-proof',
    label: 'render proof',
    body:
      input.renderProofSummary.proofArtifactCount > 0
        ? `${input.renderProofSummary.proofArtifactCount} proof artifacts`
        : 'render proof not generated yet',
    detailLabels: boundedLabels(
      input.renderProofSummary.artifactLabels.length > 0
        ? input.renderProofSummary.artifactLabels
        : input.renderProofSummary.missingArtifactLabels,
      5
    ),
    statusLabel: input.renderProofSummary.status.replace(/-/g, ' '),
    actionLabel: input.renderProofSummary.actionLabels[0] ?? null,
    width: PROJECT_CARD_WIDTH,
    height: PROJECT_CARD_HEIGHT,
  };

  const exportPackDropTarget = input.exportPackSummary.canvasDropTargets?.[0] ?? null;
  const exportPackCard: MotionCanvasMaterialCard = {
    id: `${input.projectId}-${input.draftId}-export-pack`,
    kind: 'export-pack',
    label: 'export pack',
    body: `${input.exportPackSummary.readyCount}/${input.exportPackSummary.totalCount} formats ready`,
    detailLabels: boundedLabels(
      exportPackDropTarget
        ? [...input.exportPackSummary.targetLabels, 'canvas ready']
        : input.exportPackSummary.targetLabels,
      5
    ),
    statusLabel: input.exportPackSummary.status.replace(/-/g, ' '),
    actionLabel:
      input.exportPackSummary.status === 'ready' && exportPackDropTarget
        ? 'drop export pack on canvas'
        : input.exportPackSummary.status === 'ready'
        ? 'export pack'
        : input.exportPackSummary.blockerLabels[0] ?? 'review export targets',
    width: PROJECT_CARD_WIDTH,
    height: PROJECT_CARD_HEIGHT,
    ...(exportPackDropTarget
      ? {
          sourceRef: exportPackDropTarget.exportPackManifestId ?? exportPackDropTarget.assetId,
          assetUrl: exportPackDropTarget.url,
          path: exportPackDropTarget.path ?? undefined,
          mimeType: exportPackDropTarget.mimeType,
        }
      : {}),
  };

  const cards = [
    projectCard,
    ...captureCards,
    ...storyCards,
    ...generationNodeCards,
    renderProofCard,
    exportPackCard,
  ];

  return {
    id: `canvas-material-${input.projectId}-${input.draftId}`,
    projectId: input.projectId,
    draftId: input.draftId,
    title: input.title,
    summaryLabels: [
      input.summary.appName,
      input.summary.projectKind,
      `${input.summary.totalSeconds}s`,
      ...input.summary.targetPlatforms,
    ],
    materialCount: cards.length,
    cards,
  };
}

function buildCapturedMaterialCards(input: {
  projectId: string;
  draftId: string;
  executionHistory?: MotionExecutionHistoryEntry[];
}): MotionCanvasMaterialCard[] {
  const captureReceipts = (input.executionHistory ?? []).flatMap((entry) =>
    entry.gateId === 'capture'
      ? entry.receipts
          .filter(isCapturedMaterialReceipt)
          .map((receipt) => ({ entry, receipt }))
      : []
  );

  return captureReceipts.slice(-4).map(({ entry, receipt }) => {
    const providerLabel = readableLabel(receipt.providerId ?? entry.providerId ?? 'capture');

    return {
      id: `${input.projectId}-${input.draftId}-capture-${idPart(receipt.ref)}`,
      kind: 'captured-material',
      label: `${receipt.label} material`,
      body: `Captured via ${providerLabel}`,
      detailLabels: boundedLabels(
        [
          receipt.mimeType ?? '',
          receipt.assetUrl ? 'asset ready' : receipt.path ? 'file ready' : '',
          `${entry.label} receipt`,
        ],
        3
      ),
      statusLabel: 'captured',
      actionLabel: 'use in scene',
      width: BEAT_CARD_WIDTH,
      height: BEAT_CARD_HEIGHT,
      sourceRef: receipt.ref,
      assetUrl: receipt.assetUrl,
      path: receipt.path,
      mimeType: receipt.mimeType,
    };
  });
}

function isCapturedMaterialReceipt(
  receipt: MotionExecutionReceipt
): receipt is MotionExecutionReceipt & { kind: 'capture' } {
  return receipt.kind === 'capture' && Boolean(receipt.assetUrl || receipt.path);
}

function boundedLabels(labels: string[], limit: number): string[] {
  return labels.map((label) => label.trim()).filter(Boolean).slice(0, limit);
}

function readableLabel(value: string): string {
  return value.replace(/[-_]/g, ' ');
}

function idPart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'asset';
}

function formatNodeSide(labels: string[], fallback: string): string {
  return labels.slice(0, 2).join(' + ') || fallback;
}

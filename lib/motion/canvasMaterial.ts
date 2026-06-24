import type {
  MotionPreviewExportPackSummary,
  MotionPreviewRenderProofSummary,
  MotionPreviewVideoPlan,
} from './previewPlan';
import type { MotionProject } from './project';
import type { MotionReviewPlan } from './reviewPlan';

export type MotionCanvasMaterialKind =
  | 'motion-project'
  | 'story-beat'
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
  renderProofSummary: MotionPreviewRenderProofSummary;
  exportPackSummary: MotionPreviewExportPackSummary;
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

  const exportPackCard: MotionCanvasMaterialCard = {
    id: `${input.projectId}-${input.draftId}-export-pack`,
    kind: 'export-pack',
    label: 'export pack',
    body: `${input.exportPackSummary.readyCount}/${input.exportPackSummary.totalCount} formats ready`,
    detailLabels: boundedLabels(input.exportPackSummary.targetLabels, 5),
    statusLabel: input.exportPackSummary.status.replace(/-/g, ' '),
    actionLabel:
      input.exportPackSummary.status === 'ready'
        ? 'export pack'
        : input.exportPackSummary.blockerLabels[0] ?? 'review export targets',
    width: PROJECT_CARD_WIDTH,
    height: PROJECT_CARD_HEIGHT,
  };

  const cards = [projectCard, ...storyCards, renderProofCard, exportPackCard];

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

function boundedLabels(labels: string[], limit: number): string[] {
  return labels.map((label) => label.trim()).filter(Boolean).slice(0, limit);
}

function readableLabel(value: string): string {
  return value.replace(/[-_]/g, ' ');
}

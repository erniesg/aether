import type { Editor, TLGeoShape, TLShapeId } from 'tldraw';
import { createShapeId, toRichText } from 'tldraw';
import type {
  MotionCanvasMaterialCard,
  MotionCanvasMaterialKind,
  MotionCanvasMaterialPlan,
} from '@/lib/motion/canvasMaterial';

export interface DropMotionCanvasMaterialPlanResult {
  shapeIds: TLShapeId[];
}

const CARD_GAP = 24;
const MAX_CARD_WIDTH = 380;
const MIN_CARD_WIDTH = 280;
const ROW_HEIGHT = 192;

const CARD_COLORS: Record<MotionCanvasMaterialKind, TLGeoShape['props']['color']> = {
  'motion-project': 'violet',
  'story-beat': 'blue',
  'render-proof': 'green',
  'export-pack': 'orange',
};

export function dropMotionCanvasMaterialPlanOnCanvas(
  editor: Editor,
  plan: MotionCanvasMaterialPlan
): DropMotionCanvasMaterialPlanResult {
  if (plan.cards.length === 0) return { shapeIds: [] };

  const viewport = editor.getViewportPageBounds();
  const columns = plan.cards.length === 1 ? 1 : 2;
  const cardWidth = Math.min(
    MAX_CARD_WIDTH,
    Math.max(MIN_CARD_WIDTH, (viewport.w * 0.82 - CARD_GAP * (columns - 1)) / columns)
  );
  const rows = Math.ceil(plan.cards.length / columns);
  const gridWidth = columns * cardWidth + (columns - 1) * CARD_GAP;
  const gridHeight = rows * ROW_HEIGHT - (ROW_HEIGHT - cardHeightFor(plan.cards[0]));
  const startX = viewport.midX - gridWidth / 2;
  const startY = viewport.midY - gridHeight / 2;
  const shapeIds: TLShapeId[] = [];

  plan.cards.forEach((card, index) => {
    const shapeId = createShapeId();
    const row = Math.floor(index / columns);
    const column = index % columns;
    const shapeHeight = cardHeightFor(card);

    editor.createShape<TLGeoShape>({
      id: shapeId,
      type: 'geo',
      x: startX + column * (cardWidth + CARD_GAP),
      y: startY + row * ROW_HEIGHT,
      props: {
        geo: 'rectangle',
        dash: 'solid',
        url: '',
        w: cardWidth,
        h: shapeHeight,
        growY: 0,
        scale: 1,
        labelColor: 'black',
        color: CARD_COLORS[card.kind],
        fill: 'semi',
        size: 's',
        font: 'sans',
        align: 'middle',
        verticalAlign: 'middle',
        richText: toRichText(cardText(card)),
      },
      meta: {
        aetherRole: 'motion-plan-card',
        aetherMotionProjectId: plan.projectId,
        aetherMotionDraftId: plan.draftId,
        aetherMotionMaterialKind: card.kind,
        aetherMotionMaterialId: card.id,
        aetherMotionCardText: cardText(card),
      },
    });

    shapeIds.push(shapeId);
  });

  editor.setSelectedShapes(shapeIds);
  editor.zoomToSelection({ animation: { duration: 240 } });

  return { shapeIds };
}

function cardHeightFor(card: MotionCanvasMaterialCard): number {
  return Math.max(144, Math.min(196, card.height));
}

function cardText(card: MotionCanvasMaterialCard): string {
  return [
    card.label,
    card.body,
    card.detailLabels.join(' / '),
    card.statusLabel,
    card.actionLabel ? `Next: ${card.actionLabel}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

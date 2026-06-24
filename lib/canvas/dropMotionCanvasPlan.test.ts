import { describe, expect, it, vi } from 'vitest';
import { dropMotionCanvasMaterialPlanOnCanvas } from './dropMotionCanvasPlan';
import type { MotionCanvasMaterialPlan } from '@/lib/motion/canvasMaterial';

function makeEditor() {
  return {
    getViewportPageBounds: () => ({ w: 1600, h: 1000, midX: 800, midY: 500 }),
    createShape: vi.fn(),
    setSelectedShapes: vi.fn(),
    zoomToSelection: vi.fn(),
  };
}

function plan(): MotionCanvasMaterialPlan {
  return {
    id: 'canvas-material-motion-aether-launch-draft-primary',
    projectId: 'motion-aether-launch',
    draftId: 'draft-primary',
    title: 'aether launch video',
    summaryLabels: ['aether', 'launch', '30s', 'x 9:16 30s'],
    materialCount: 3,
    cards: [
      {
        id: 'motion-aether-launch-draft-primary-project',
        kind: 'motion-project',
        label: 'aether launch video',
        body: 'aether launch - 30s',
        detailLabels: ['x 9:16 30s'],
        statusLabel: 'review mode',
        actionLabel: 'review plan',
        width: 380,
        height: 168,
      },
      {
        id: 'motion-aether-launch-draft-primary-scene-1',
        kind: 'story-beat',
        label: 'hook - Hook card',
        body: 'Turn a repo into a launch video.',
        detailLabels: ['0s + 3s', '1 source'],
        statusLabel: 'needs review',
        actionLabel: 'Regenerate copy for Hook card',
        width: 340,
        height: 156,
      },
      {
        id: 'motion-aether-launch-draft-primary-export-pack',
        kind: 'export-pack',
        label: 'export pack',
        body: '0/1 formats ready',
        detailLabels: ['x 9:16 planned'],
        statusLabel: 'needs render',
        actionLabel: 'Render every export target before packaging',
        width: 380,
        height: 168,
      },
    ],
  };
}

describe('dropMotionCanvasMaterialPlanOnCanvas', () => {
  it('creates editable tldraw geo cards with motion provenance', () => {
    const editor = makeEditor();
    const result = dropMotionCanvasMaterialPlanOnCanvas(editor as never, plan());

    expect(result.shapeIds).toHaveLength(3);
    expect(editor.createShape).toHaveBeenCalledTimes(3);

    const firstShape = editor.createShape.mock.calls[0]![0];
    expect(firstShape.type).toBe('geo');
    expect(firstShape.props.geo).toBe('rectangle');
    expect(firstShape.props.richText).toBeTruthy();
    expect(firstShape.meta).toMatchObject({
      aetherRole: 'motion-plan-card',
      aetherMotionProjectId: 'motion-aether-launch',
      aetherMotionDraftId: 'draft-primary',
      aetherMotionMaterialKind: 'motion-project',
      aetherMotionMaterialId: 'motion-aether-launch-draft-primary-project',
    });
    expect(firstShape.meta.aetherMotionCardText).toContain('aether launch video');
    expect(firstShape.meta.aetherMotionCardText).toContain('Next: review plan');

    const beatShape = editor.createShape.mock.calls[1]![0];
    expect(beatShape.meta.aetherMotionMaterialKind).toBe('story-beat');
    expect(beatShape.meta.aetherMotionCardText).toContain(
      'Regenerate copy for Hook card'
    );
    expect(beatShape.meta.aetherMotionCardText).not.toContain('clip-beat');

    expect(editor.setSelectedShapes).toHaveBeenCalledWith(result.shapeIds);
    expect(editor.zoomToSelection).toHaveBeenCalledWith({
      animation: { duration: 240 },
    });
  });
});

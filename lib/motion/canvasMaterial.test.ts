import { describe, expect, it } from 'vitest';
import { buildMotionCanvasMaterialPlan } from './canvasMaterial';

describe('buildMotionCanvasMaterialPlan', () => {
  it('summarizes the editable motion plan as creator-facing canvas cards', () => {
    const plan = buildMotionCanvasMaterialPlan({
      projectId: 'motion-aether-launch',
      draftId: 'draft-primary',
      title: 'aether launch video',
      workflowMode: 'review',
      primaryAction: 'request-review',
      summary: {
        appName: 'aether',
        projectKind: 'launch',
        totalSeconds: 30,
        targetPlatforms: ['x 9:16 30s'],
      },
      videoPlan: {
        status: 'needs-review',
        title: 'aether launch video',
        sceneCount: 1,
        totalSeconds: 30,
        scenes: [
          {
            sceneId: 'scene-1',
            beatId: 'beat-hook',
            role: 'hook',
            startSeconds: 0,
            durationSeconds: 3,
            narration: 'Turn a repo into a launch video.',
            visualLabel: 'Hook card',
            editSummary: 'Hook copy can be revised.',
            evidenceLabel: '1 source',
            regenerationActions: [
              {
                id: 'regen-option-clip-beat-hook-copy',
                clipId: 'clip-beat-hook-text',
                componentId: 'hook-card',
                componentLabel: 'Hook card',
                scope: 'copy',
                label: 'Regenerate copy for Hook card',
              },
            ],
          },
        ],
      },
      renderProofSummary: {
        status: 'needs-render',
        engineLabel: 'hyperframes',
        providerLabel: null,
        readyTargetCount: 0,
        totalTargetCount: 1,
        proofArtifactCount: 0,
        targetLabels: ['x 9:16'],
        artifactLabels: [],
        missingArtifactLabels: ['MP4', 'Poster', 'Subtitles'],
        actionLabels: ['Render proof'],
        blockerLabels: ['Render every export target before packaging'],
        proofArtifacts: [],
        canvasDropTargets: [],
      },
      exportPackSummary: {
        status: 'needs-render',
        readyCount: 0,
        totalCount: 1,
        targetLabels: ['x 9:16 planned'],
        canvasDropCount: 0,
        missingAssetKinds: ['video', 'poster'],
        blockerLabels: ['Render every export target before packaging'],
      },
    });

    expect(plan).toMatchObject({
      id: 'canvas-material-motion-aether-launch-draft-primary',
      projectId: 'motion-aether-launch',
      draftId: 'draft-primary',
      title: 'aether launch video',
      summaryLabels: ['aether', 'launch', '30s', 'x 9:16 30s'],
      materialCount: 4,
    });
    expect(plan.cards.map((card) => card.kind)).toEqual([
      'motion-project',
      'story-beat',
      'render-proof',
      'export-pack',
    ]);
    expect(plan.cards[0]).toMatchObject({
      label: 'aether launch video',
      body: 'aether launch - 30s',
      statusLabel: 'review mode',
      actionLabel: 'review plan',
    });
    expect(plan.cards[1]).toMatchObject({
      label: 'hook - Hook card',
      body: 'Turn a repo into a launch video.',
      detailLabels: ['0s + 3s', '1 source', 'Hook copy can be revised.'],
      actionLabel: 'Regenerate copy for Hook card',
    });

    const visibleCardText = plan.cards
      .flatMap((card) => [card.label, card.body, ...card.detailLabels, card.actionLabel ?? ''])
      .join('\n');
    expect(visibleCardText).not.toContain('regen-option-clip');
    expect(visibleCardText).not.toContain('clip-beat-hook-text');
  });
});

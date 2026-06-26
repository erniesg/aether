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
                route: '/api/motion/regenerate',
                method: 'POST',
                toolId: 'motion-storyboard',
                requestTemplate: {
                  project: '$motionProject',
                  clipId: 'clip-beat-hook-text',
                  scope: 'copy',
                  prompt: 'Regenerate copy for Hook card',
                  requestedEngines: '$selectedEngines',
                  requestedAt: '$now',
                },
                expectedReceiptLabels: [
                  'regeneration request',
                  'script update',
                  'updated preview plan',
                ],
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
        packageVerification: {
          status: 'missing',
          receiptCount: 0,
          providerLabel: null,
          manifestPath: null,
          receiptLabels: [],
          verificationLabels: [],
          artifactCheckLabels: [],
        },
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
      visualGenerationSummary: {
        status: 'ready',
        requestCount: 1,
        providerRequirementLabels: ['image to video'],
        requestLabels: ['Hook card 3s'],
        requests: [
          {
            requestId: 'image-to-video-clip-beat-hook-text',
            clipId: 'clip-beat-hook-text',
            componentLabel: 'Hook card',
            durationSeconds: 3,
            prompt: 'Animate the hook visual as a short product insert.',
            sourceAssetId: 'hook-card-source',
            sourceLabel: 'Generated still',
            sourceAssetUrl: 'asset://source/hook.png',
            sourceKind: 'generated-still',
            sourceMimeType: 'image/png',
            outputLabel: '9:16 1080x1920',
          },
        ],
        nodePlan: {
          status: 'ready',
          nextNodeId: 'image-to-video',
          nodes: [
            {
              id: 'visual-source',
              label: 'Source visuals',
              status: 'complete',
              inputLabels: ['Hook card source'],
              outputLabels: ['Image-to-video source'],
              actionLabel: null,
            },
            {
              id: 'image-to-video',
              label: 'Image-to-video',
              status: 'ready',
              inputLabels: ['Hook card source'],
              outputLabels: ['9:16 1080x1920'],
              actionLabel: 'Generate video clips',
            },
            {
              id: 'review-generated-clips',
              label: 'Review generated clips',
              status: 'planned',
              inputLabels: ['9:16 1080x1920'],
              outputLabels: ['Approved clips'],
              actionLabel: 'Review generated clips',
            },
          ],
          edges: [
            { from: 'visual-source', to: 'image-to-video', label: 'animates' },
            {
              from: 'image-to-video',
              to: 'review-generated-clips',
              label: 'offers takes',
            },
          ],
        },
        blockerLabels: [],
        nextActionLabels: ['Generate video clips', 'Review generated clips'],
      },
    });

    expect(plan).toMatchObject({
      id: 'canvas-material-motion-aether-launch-draft-primary',
      projectId: 'motion-aether-launch',
      draftId: 'draft-primary',
      title: 'aether launch video',
      summaryLabels: ['aether', 'launch', '30s', 'x 9:16 30s'],
      materialCount: 7,
    });
    expect(plan.cards.map((card) => card.kind)).toEqual([
      'motion-project',
      'story-beat',
      'generation-node',
      'generation-node',
      'generation-node',
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
    expect(plan.cards[3]).toMatchObject({
      kind: 'generation-node',
      label: 'Image-to-video',
      body: 'Hook card source -> 9:16 1080x1920',
      statusLabel: 'ready',
      actionLabel: 'Generate video clips',
    });

    const visibleCardText = plan.cards
      .flatMap((card) => [card.label, card.body, ...card.detailLabels, card.actionLabel ?? ''])
      .join('\n');
    expect(visibleCardText).not.toContain('regen-option-clip');
    expect(visibleCardText).not.toContain('clip-beat-hook-text');
    expect(visibleCardText).not.toContain('image-to-video-clip');
  });
});

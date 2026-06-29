import { describe, expect, it } from 'vitest';
import type { MotionWorkflowMode } from './project';
import {
  buildMotionReviewPlan,
  createMotionComponentRegenerationRequest,
  createMotionReferenceSignalRegenerationRequest,
  createMotionTasteReferenceRegenerationRequest,
  stageMotionReferenceSignalRegeneration,
} from './reviewPlan';
import { buildRepoLaunchMotionProject } from './storyboard';
import { materializeMotionTimeline } from './timeline';

function project(workflowMode: MotionWorkflowMode = 'review') {
  return materializeMotionTimeline(
    buildRepoLaunchMotionProject({
      id: 'motion-aether-launch',
      workspaceId: 'demo-ws',
      projectKind: 'launch',
      workflowMode,
      audience: 'creative app builders',
      tone: 'precise',
      appProfile: {
        name: 'aether',
        repoUrl: 'https://github.com/erniesg/aether',
        summary: 'Canvas-native creative system.',
        stack: ['TypeScript', 'Convex', 'tldraw'],
      },
      claims: [
        {
          text: 'aether uses TypeScript, Convex, and tldraw in the public repo.',
          source: { kind: 'repo', ref: 'https://github.com/erniesg/aether' },
        },
      ],
      platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
      createdAt: 80,
    }),
    { updatedAt: 81 }
  );
}

describe('buildMotionReviewPlan', () => {
  it('turns a motion project into a reviewable video plan with drafts and editable component slots', () => {
    const plan = buildMotionReviewPlan(project());

    expect(plan.projectId).toBe('motion-aether-launch');
    expect(plan.workflowMode).toBe('review');
    expect(plan.primaryAction).toBe('request-review');
    expect(plan.summary).toMatchObject({
      appName: 'aether',
      projectKind: 'launch',
      totalSeconds: 30,
      targetPlatforms: ['x 9:16 30s'],
    });
    expect(plan.storyBeats.map((beat) => beat.role)).toEqual([
      'hook',
      'problem',
      'proof',
      'demo',
      'payoff',
      'cta',
    ]);
    expect(plan.drafts.map((draft) => draft.label)).toEqual([
      'Primary launch cut',
      'Proof-first cut',
      'Demo-first cut',
    ]);
    expect(plan.drafts[0]).toMatchObject({
      draftId: 'draft-primary',
      isCurrent: true,
      durationSeconds: 30,
      status: 'ready',
      hook: 'aether: Canvas-native creative system.',
      componentLabels: ['Hook card', 'Proof card', 'App frame', 'Agent trace', 'CTA card'],
      sourceRefs: [{ kind: 'repo', ref: 'https://github.com/erniesg/aether' }],
      regenerationAction: {
        id: 'regen-draft-option-draft-primary',
        label: 'Regenerate Primary launch cut',
        route: '/api/motion/regenerate',
        method: 'POST',
        toolId: 'motion-storyboard',
        requestTemplate: {
          project: '$motionProject',
          draftId: 'draft-primary',
          prompt:
            'Regenerate Primary launch cut as an editable draft variation while preserving source-backed claims.',
          requestedEngines: '$selectedEngines',
          requestedAt: '$now',
        },
        expectedReceiptLabels: ['draft variation', 'timeline revision', 'updated preview plan'],
      },
    });
    expect(plan.drafts[1]).toMatchObject({
      draftId: 'draft-proof-first',
      hook: 'aether: Canvas-native creative system.',
      componentLabels: ['Hook card', 'Proof card', 'App frame', 'Agent trace', 'CTA card'],
      sourceRefs: [{ kind: 'repo', ref: 'https://github.com/erniesg/aether' }],
    });

    const demoSlot = plan.componentSlots.find(
      (slot) => slot.clipId === 'clip-beat-demo-text'
    );
    expect(demoSlot).toMatchObject({
      componentId: 'app-frame',
      componentLabel: 'App frame',
      trackKind: 'text',
      regenerateScopes: ['capture', 'timing', 'caption'],
    });
    expect(demoSlot?.editControls.map((control) => control.id)).toEqual([
      'assetId',
      'assetUrl',
      'caption',
      'crop',
      'zoom',
      'cursorPath',
      'sourceKeyframes',
    ]);
    expect(plan.componentSlots.some((slot) => slot.componentId === 'voice-line')).toBe(true);
    expect(plan.nextActions.map((action) => action.id)).toEqual([
      'review-story',
      'review-drafts',
      'regenerate-component',
      'approve-render',
    ]);
  });

  it('surfaces a full-auto action path without removing reviewable draft detail', () => {
    const plan = buildMotionReviewPlan(project('full-auto'));

    expect(plan.workflowMode).toBe('full-auto');
    expect(plan.primaryAction).toBe('queue-render');
    expect(plan.drafts).toHaveLength(3);
    expect(plan.componentSlots.length).toBeGreaterThan(0);
    expect(plan.nextActions.map((action) => action.id)).toEqual([
      'generate-visuals',
      'generate-voice',
      'sync-effects',
      'queue-render',
    ]);
  });
});

describe('createMotionComponentRegenerationRequest', () => {
  it('creates a scoped regeneration request for one editable component', () => {
    const request = createMotionComponentRegenerationRequest(project(), {
      clipId: 'clip-beat-demo-text',
      scope: 'capture',
      prompt: 'Refresh the product-flow capture with the current canvas.',
      requestedAt: 90,
    });

    expect(request).toMatchObject({
      id: 'regen-clip-beat-demo-text-capture-90',
      projectId: 'motion-aether-launch',
      draftId: 'draft-primary',
      clipId: 'clip-beat-demo-text',
      componentId: 'app-frame',
      scope: 'capture',
      status: 'planned',
    });
    expect(request.inputRefs).toContain('clip-beat-demo-text');
    expect(request.inputRefs).toContain('beat-demo');
    expect(request.provenance).toContainEqual({
      kind: 'timeline',
      ref: 'clip-beat-demo-text',
    });
    expect(request.sourcePatchPlan).toMatchObject({
      id: 'source-patch-regen-clip-beat-demo-text-capture-90',
      route: '/api/motion/source-edit',
      method: 'POST',
      toolId: 'motion-source-edit',
      sourceEditId: 'source-edit-regen-clip-beat-demo-text-capture-90',
      status: 'planned',
      targetFiles: [
        {
          path: 'timeline/draft-primary.json',
          kind: 'timeline-json',
          label: 'Timeline JSON',
        },
        {
          path: 'STORYBOARD.md',
          kind: 'storyboard',
          label: 'Storyboard',
        },
        {
          path: 'EDIT.md',
          kind: 'edit-contract',
          label: 'Edit contract',
        },
      ],
      instructions: [
        {
          id: 'source-patch-regen-clip-beat-demo-text-capture-90-capture',
          label: 'Regenerate capture for App frame',
          componentIds: ['app-frame'],
          componentLabels: ['App frame'],
          targetPaths: ['timeline/draft-primary.json', 'STORYBOARD.md', 'EDIT.md'],
          operationKinds: [
            'attach-capture-or-asset',
            'update-component-props',
            'update-storyboard-scene',
          ],
          guidanceRefs: ['clip-beat-demo-text', 'beat-demo'],
        },
      ],
      expectedReceiptLabels: ['Source files', 'Timeline revision', 'Updated preview plan'],
    });
  });

  it('rejects regeneration scopes that the component does not declare', () => {
    expect(() =>
      createMotionComponentRegenerationRequest(project(), {
        clipId: 'clip-beat-demo-text',
        scope: 'proof',
        prompt: 'Generate narration here.',
        requestedAt: 91,
      })
    ).toThrow(/does not support proof regeneration/);
  });
});

describe('createMotionReferenceSignalRegenerationRequest', () => {
  it('creates a reference-backed regeneration request for selected motion components', () => {
    const request = createMotionReferenceSignalRegenerationRequest(project(), {
      referenceSignalId: 'hyperframes-launch-video-gallery',
      sourceUrl: 'https://hyperframes.heygen.com/launch-videos',
      scope: 'effect',
      componentIds: ['hook-card', 'app-frame'],
      prompt: 'Apply source-backed launch-video style to the hook and app frame.',
      requestedAt: 92,
    });

    expect(request).toMatchObject({
      id: 'regen-reference-hyperframes-launch-video-gallery-effect-92',
      projectId: 'motion-aether-launch',
      draftId: 'draft-primary',
      referenceSignalId: 'hyperframes-launch-video-gallery',
      referenceTitle: 'HyperFrames launch video source gallery',
      sourceUrl: 'https://hyperframes.heygen.com/launch-videos',
      scope: 'effect',
      componentIds: ['hook-card', 'app-frame'],
      componentLabels: ['Hook card', 'App frame'],
      status: 'planned',
    });
    expect(request.inputRefs).toEqual([
      'hyperframes-launch-video-gallery',
      'https://hyperframes.heygen.com/launch-videos',
      'hook-card',
      'app-frame',
    ]);
    expect(request.provenance).toContainEqual({
      kind: 'reference',
      ref: 'https://hyperframes.heygen.com/launch-videos',
      label: 'HyperFrames launch video source gallery',
    });
    expect(request.sourcePatchPlan).toMatchObject({
      id: 'source-patch-regen-reference-hyperframes-launch-video-gallery-effect-92',
      route: '/api/motion/source-edit',
      sourceEditId: 'source-edit-regen-reference-hyperframes-launch-video-gallery-effect-92',
      targetFiles: [
        { path: 'timeline/draft-primary.json', kind: 'timeline-json' },
        { path: 'STORYBOARD.md', kind: 'storyboard' },
        { path: 'EDIT.md', kind: 'edit-contract' },
      ],
      instructions: [
        {
          label: 'Apply effect guidance to Hook card / App frame',
          componentIds: ['hook-card', 'app-frame'],
          operationKinds: [
            'sync-effect-cues',
            'update-component-props',
            'update-storyboard-scene',
          ],
          guidanceRefs: [
            'hyperframes-launch-video-gallery',
            'https://hyperframes.heygen.com/launch-videos',
          ],
        },
      ],
    });

    const staged = stageMotionReferenceSignalRegeneration(project(), request);
    expect(staged.graphNodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'node-regen-reference-hyperframes-launch-video-gallery-effect-92',
          kind: 'revision',
          inputRefs: [
            'hyperframes-launch-video-gallery',
            'https://hyperframes.heygen.com/launch-videos',
            'hook-card',
            'app-frame',
          ],
          outputRefs: ['regen-reference-hyperframes-launch-video-gallery-effect-92'],
          status: 'planned',
          provenance: expect.arrayContaining([
            { kind: 'revision', ref: 'regen-reference-hyperframes-launch-video-gallery-effect-92' },
            {
              kind: 'reference',
              ref: 'https://hyperframes.heygen.com/launch-videos',
              label: 'HyperFrames launch video source gallery',
            },
          ]),
        }),
      ])
    );
  });

  it('rejects unknown corpus references and unknown component ids', () => {
    expect(() =>
      createMotionReferenceSignalRegenerationRequest(project(), {
        referenceSignalId: 'missing-reference',
        sourceUrl: 'https://example.com/missing',
        scope: 'effect',
        componentIds: ['hook-card'],
        prompt: 'Use this reference.',
        requestedAt: 93,
      })
    ).toThrow(/Motion reference signal not found/);

    expect(() =>
      createMotionReferenceSignalRegenerationRequest(project(), {
        referenceSignalId: 'hyperframes-launch-video-gallery',
        sourceUrl: 'https://hyperframes.heygen.com/launch-videos',
        scope: 'effect',
        componentIds: ['missing-component'],
        prompt: 'Use this reference.',
        requestedAt: 94,
      })
    ).toThrow(/Motion component is not registered/);
  });
});

describe('createMotionTasteReferenceRegenerationRequest', () => {
  it('creates a source-edit patch plan from timestamped taste guidance', () => {
    const request = createMotionTasteReferenceRegenerationRequest(project(), {
      tasteReferenceId: 'claude-agent-demo-playback-review',
      sourceEntryId: 'public-claude-launch-demo-corpus',
      sourceUrl: 'https://www.youtube.com/@AnthropicAI/search?query=Claude%20Code',
      scope: 'effect',
      componentIds: ['hook-card', 'agent-trace'],
      prompt: 'Use the timestamped agent-demo reference as the effect guide.',
      requestedAt: 95,
    });

    expect(request).toMatchObject({
      id: 'regen-taste-claude-agent-demo-playback-review-effect-95',
      sourcePatchPlan: {
        id: 'source-patch-regen-taste-claude-agent-demo-playback-review-effect-95',
        route: '/api/motion/source-edit',
        method: 'POST',
        toolId: 'motion-source-edit',
        sourceEditId: 'source-edit-regen-taste-claude-agent-demo-playback-review-effect-95',
        status: 'planned',
        targetFiles: [
          { path: 'timeline/draft-primary.json', kind: 'timeline-json' },
          { path: 'STORYBOARD.md', kind: 'storyboard' },
          { path: 'EDIT.md', kind: 'edit-contract' },
        ],
        instructions: [
          {
            id: 'source-patch-regen-taste-claude-agent-demo-playback-review-effect-95-effect',
            label: 'Apply effect guidance to Hook card / Agent trace',
            componentIds: ['hook-card', 'agent-trace'],
            componentLabels: ['Hook card', 'Agent trace'],
            operationKinds: [
              'sync-effect-cues',
              'update-component-props',
              'update-storyboard-scene',
            ],
            guidanceRefs: [
              'claude-agent-demo-playback-review',
              'public-claude-launch-demo-corpus',
              'agent-demo-prompt',
              'agent-demo-files',
              'agent-demo-terminal',
              'agent-demo-preview',
              'agent-demo-cta',
            ],
          },
        ],
        expectedReceiptLabels: ['Source files', 'Timeline revision', 'Updated preview plan'],
      },
    });
  });
});

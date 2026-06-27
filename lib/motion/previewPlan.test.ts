import { describe, expect, it } from 'vitest';
import type { CaptureResult } from '@/lib/providers/capture/types';
import { applyCaptureResultToMotionProject } from './captureApply';
import { appendSetupDryRunExecutionHistory } from './executionHistory';
import {
  buildMotionPreviewPlan,
  findMotionPreviewRegenerationAction,
  type MotionPreviewReferenceSignal,
  type MotionPreviewTasteReference,
} from './previewPlan';
import { buildRepoLaunchMotionProject } from './storyboard';
import { materializeMotionTimeline } from './timeline';
import type { AgentMotionWorkflowRunPlan } from './workflowPlan';

function project() {
  return materializeMotionTimeline(
    buildRepoLaunchMotionProject({
      id: 'motion-aether-launch',
      workspaceId: 'demo-ws',
      projectKind: 'launch',
      workflowMode: 'review',
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
      sourceProfile: {
        kind: 'github-repo',
        label: 'aether source material',
        sourceRef: 'https://github.com/erniesg/aether',
        summary: 'GitHub repo with 2 capture candidates',
        signals: [
          {
            id: 'signal-stack',
            label: 'Stack',
            value: 'TypeScript, Convex, tldraw',
            provenance: [{ kind: 'repo', ref: 'https://github.com/erniesg/aether' }],
          },
        ],
        captureCandidates: [
          {
            id: 'capture-hosted-still',
            label: 'Capture aether homepage',
            mode: 'screenshot',
            targetKind: 'url',
            targetRef: 'https://aether.example',
            reason: 'Hosted site is available as product evidence.',
            provenance: [{ kind: 'site', ref: 'https://aether.example' }],
          },
          {
            id: 'record-hosted-flow',
            label: 'Record aether product flow',
            mode: 'screen-recording',
            targetKind: 'url',
            targetRef: 'https://aether.example',
            reason: 'Demo scenes need a product flow.',
            provenance: [{ kind: 'site', ref: 'https://aether.example' }],
          },
        ],
        storyboardHints: [
          {
            id: 'hint-demo-from-capture',
            beatRole: 'demo',
            label: 'Capture aether homepage',
            reason: 'Use a real capture target for the demo scene.',
            provenance: [{ kind: 'site', ref: 'https://aether.example' }],
          },
        ],
        provenance: [{ kind: 'repo', ref: 'https://github.com/erniesg/aether' }],
      },
      platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
      createdAt: 120,
    }),
    { updatedAt: 121 }
  );
}

function reviewRunPlan(): AgentMotionWorkflowRunPlan {
  return {
    mode: 'review',
    status: 'ready',
    primaryAction: 'request-review',
    nextStepId: 'step-plan',
    stepCount: 4,
    verificationArtifacts: ['contact-sheet', 'mp4-probe', 'provenance-manifest'],
    steps: [
      {
        id: 'step-plan',
        gateId: 'plan',
        label: 'Video plan',
        reviewRequired: true,
        autoAdvance: false,
        toolIds: ['motion-brief'],
        apiRoutes: ['/api/motion/start'],
        inputSummary: ['accepted sources', 'brief constraints', 'output targets'],
        expectedArtifacts: ['grounded brief', 'video plan', 'source receipts'],
        outputSummary: ['grounded brief', 'video plan', 'source receipts'],
      },
      {
        id: 'step-drafts',
        gateId: 'drafts',
        label: 'Draft variations',
        reviewRequired: true,
        autoAdvance: false,
        toolIds: ['motion-storyboard'],
        apiRoutes: ['/api/motion/regenerate'],
        inputSummary: ['grounded brief', 'video plan', 'source receipts'],
        expectedArtifacts: ['draft variations', 'story beats', 'component plan'],
        outputSummary: ['draft variations', 'story beats', 'component plan'],
      },
      {
        id: 'step-capture',
        gateId: 'capture',
        label: 'Product capture',
        reviewRequired: true,
        autoAdvance: false,
        toolIds: ['motion-capture'],
        apiRoutes: ['/api/motion/capture'],
        inputSummary: ['draft variations', 'story beats', 'component plan'],
        expectedArtifacts: ['captures', 'cursor targets', 'crop receipts'],
        outputSummary: ['captures', 'cursor targets', 'crop receipts'],
      },
      {
        id: 'step-render',
        gateId: 'render',
        label: 'Render proof',
        reviewRequired: true,
        autoAdvance: false,
        toolIds: ['motion-render'],
        apiRoutes: ['/api/motion/render'],
        inputSummary: ['timeline tracks', 'caption clips', 'effect markers'],
        expectedArtifacts: ['contact sheet', 'poster still', 'mp4 probe'],
        outputSummary: ['contact sheet', 'poster still', 'mp4 probe'],
      },
    ],
  };
}

const screenshotCaptureResult: CaptureResult = {
  providerId: 'browser-capture',
  artifacts: [
    {
      id: 'capture-aether-homepage',
      kind: 'screenshot',
      assetUrl: 'asset://capture/home.png',
      width: 1080,
      height: 1920,
      mimeType: 'image/png',
      viewport: { width: 1080, height: 1920, deviceScaleFactor: 2 },
      cursorTargets: [],
      provenance: [
        { kind: 'provider', ref: 'browser-capture' },
        { kind: 'site', ref: 'https://aether.example' },
      ],
    },
  ],
  provenance: [
    { kind: 'provider', ref: 'browser-capture' },
    { kind: 'site', ref: 'https://aether.example' },
  ],
};

describe('buildMotionPreviewPlan', () => {
  it('shows storyboard, draft variations, editable timeline rows, and regenerate actions', () => {
    const preview = buildMotionPreviewPlan(project(), {
      engines: ['remotion', 'hyperframes', 'provider'],
      workflowRunPlan: reviewRunPlan(),
      requestedAt: 130,
    });

    expect(preview).toMatchObject({
      id: 'preview-motion-aether-launch-draft-primary-130',
      projectId: 'motion-aether-launch',
      title: 'aether launch video',
      primaryAction: 'request-review',
      requestedAt: 130,
      summary: {
        appName: 'aether',
        projectKind: 'launch',
        totalSeconds: 30,
        targetPlatforms: ['x 9:16 30s'],
      },
      sourceProfile: {
        label: 'aether source material',
        sourceKind: 'github-repo',
        summary: 'GitHub repo with 2 capture candidates',
        readyCaptureCount: 2,
        signalLabels: ['Stack: TypeScript, Convex, tldraw'],
        captureCandidateLabels: ['Capture aether homepage', 'Record aether product flow'],
        captureCandidates: [
          {
            id: 'capture-hosted-still',
            label: 'Capture aether homepage',
            mode: 'screenshot',
            targetKind: 'url',
            targetRef: 'https://aether.example',
            setupLabel: null,
            reason: 'Hosted site is available as product evidence.',
            action: {
              id: 'capture-source-capture-hosted-still',
              label: 'capture route',
              route: '/api/motion/capture',
              method: 'POST',
              toolId: 'motion-capture',
              requestTemplate: {
                project: '$motionProject',
                requestIds: ['capture-hosted-still'],
                requestedAt: '$now',
              },
              expectedReceiptLabels: ['screenshot', 'cursor targets', 'viewport receipt'],
            },
          },
          {
            id: 'record-hosted-flow',
            label: 'Record aether product flow',
            mode: 'screen-recording',
            targetKind: 'url',
            targetRef: 'https://aether.example',
            setupLabel: null,
            reason: 'Demo scenes need a product flow.',
            action: {
              id: 'capture-source-record-hosted-flow',
              label: 'record flow',
              requestTemplate: {
                project: '$motionProject',
                requestIds: ['record-hosted-flow'],
                requestedAt: '$now',
              },
              expectedReceiptLabels: ['recording', 'interaction receipt', 'viewport receipt'],
            },
          },
        ],
        storyboardHintLabels: ['demo: Capture aether homepage'],
      },
    });
    expect(preview.storyboard.map((beat) => beat.role)).toEqual([
      'hook',
      'problem',
      'proof',
      'demo',
      'payoff',
      'cta',
    ]);
    expect(preview.videoPlan).toMatchObject({
      status: 'needs-review',
      title: 'aether launch video',
      sceneCount: 6,
      totalSeconds: 30,
    });
    expect(preview.videoPlan.scenes[0]).toMatchObject({
      sceneId: 'scene-1',
      role: 'hook',
      startSeconds: 0,
      durationSeconds: 3,
      visualLabel: 'Hook card',
      evidenceLabel: '1 source',
    });
    expect(preview.videoPlan.scenes[3]).toMatchObject({
      role: 'demo',
      visualLabel: 'App frame',
      regenerationActions: expect.arrayContaining([
        expect.objectContaining({
          id: 'regen-option-clip-beat-demo-text-capture',
          label: 'Regenerate capture for App frame',
        }),
      ]),
    });
    expect(preview.designKit).toMatchObject({
      id: 'repo-launch-kit',
      label: 'Repo launch kit',
      components: expect.arrayContaining([
        expect.objectContaining({ label: 'Hook card', role: 'hook' }),
        expect.objectContaining({ label: 'Proof card', role: 'claim proof' }),
        expect.objectContaining({ label: 'App frame', role: 'product visual' }),
      ]),
      effects: expect.arrayContaining([
        expect.objectContaining({ label: 'product glide' }),
        expect.objectContaining({ label: 'proof pulse' }),
        expect.objectContaining({ label: 'caption pop' }),
      ]),
      editableSurfaceLabels: ['script', 'component', 'capture', 'voice', 'timing', 'effect'],
    });
    expect(preview.referenceGrammar).toMatchObject({
      status: 'ready',
      sourceFamilyLabels: ['repo launch', 'product demo', 'agent-native workflow'],
      cueLabels: [
        'Launch hook title',
        'Real product capture',
        'Screen zoom callout',
        'Proof receipt card',
        'Agent process trace',
        'Computer-use capture loop',
        'Image-to-video insert',
        'Prompt-to-artifact demo',
        'Voice and caption sync',
        'Multi-format export pack',
        'Branded template system',
        'Localized voice caption variants',
        'Reviewable draft board',
        'Reusable motion system',
      ],
      componentLabels: expect.arrayContaining([
        'Hook card',
        'App frame',
        'Agent trace',
        'Caption line',
        'Soft wipe',
      ]),
      editSurfaceLabels: expect.arrayContaining(['capture', 'component', 'effect']),
      verificationLabels: expect.arrayContaining([
        'first-frame readable',
        'capture receipt',
        'captions align to voice',
      ]),
    });
    const referenceSignals: MotionPreviewReferenceSignal[] = preview.referenceSignals;
    expect(referenceSignals?.map((signal) => signal.title).slice(0, 3)).toEqual([
      'HyperFrames launch video source gallery',
      'Testreel programmatic product videos',
      'Claude Code agent-trace product story',
    ]);
    expect(referenceSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'HyperFrames launch video source gallery',
          observedFormatLabel: 'launch video source',
          proofBoundaryLabel: 'accessible page',
          styleLabels: expect.arrayContaining(['source backed', 'kinetic type']),
          componentLabels: expect.arrayContaining(['Hook card', 'App frame']),
          actions: expect.arrayContaining([
            expect.objectContaining({
              id: 'reference-signal-hyperframes-launch-video-gallery-effect',
              label: 'Apply reference style to Hook card / App frame',
              scope: 'effect',
              toolId: 'motion-revise',
              route: '/api/motion/regenerate',
              method: 'POST',
              componentLabels: expect.arrayContaining(['Hook card', 'App frame']),
              requestTemplate: expect.objectContaining({
                project: '$motionProject',
                referenceSignalId: 'hyperframes-launch-video-gallery',
                sourceUrl: 'https://hyperframes.heygen.com/launch-videos',
                scope: 'effect',
                componentIds: expect.arrayContaining(['hook-card', 'app-frame']),
                requestedEngines: '$selectedEngines',
                requestedAt: '$now',
              }),
              expectedReceiptLabels: [
                'reference signal',
                'component style update',
                'updated preview plan',
              ],
            }),
          ]),
        }),
        expect.objectContaining({
          title: 'Testreel programmatic product videos',
          observedFormatLabel: 'screen recording product demo',
          proofBoundaryLabel: 'public repo',
          styleLabels: expect.arrayContaining(['agent native', 'screen polish']),
          componentLabels: expect.arrayContaining(['App frame', 'Cursor callout']),
          actions: expect.arrayContaining([
            expect.objectContaining({
              id: 'reference-signal-testreel-programmatic-product-video-capture',
              label: 'Regenerate capture from screen recording product demo',
              scope: 'capture',
              toolId: 'motion-capture',
              componentLabels: expect.arrayContaining(['App frame', 'Cursor callout']),
            }),
          ]),
        }),
      ])
    );
    expect(preview.draftOptions.map((draft) => draft.label)).toEqual([
      'Primary launch cut',
      'Proof-first cut',
      'Demo-first cut',
    ]);
    expect(preview.timelineRows.map((row) => row.trackKind)).toEqual([
      'text',
      'caption',
      'voice',
      'transition',
    ]);
    expect(preview.timelineRows[0].clips[0]).toMatchObject({
      clipId: 'clip-beat-hook-text',
      componentId: 'hook-card',
      componentLabel: 'Hook card',
      startSeconds: 0,
      durationSeconds: 3,
      linkedVariantScope: 'global',
    });

    const appFrame = preview.editableComponents.find(
      (component) => component.clipId === 'clip-beat-demo-text'
    );
    expect(appFrame).toMatchObject({
      componentId: 'app-frame',
      componentLabel: 'App frame',
      editControlIds: ['assetId', 'caption', 'zoom'],
      regenerateScopes: ['capture', 'timing', 'caption'],
    });
    expect(preview.regenerationActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'regen-option-clip-beat-demo-text-capture',
          clipId: 'clip-beat-demo-text',
          componentId: 'app-frame',
          componentLabel: 'App frame',
          scope: 'capture',
          label: 'Regenerate capture for App frame',
          route: '/api/motion/regenerate',
          method: 'POST',
          toolId: 'motion-capture',
          requestTemplate: {
            project: '$motionProject',
            clipId: 'clip-beat-demo-text',
            scope: 'capture',
            prompt: 'Regenerate capture for App frame',
            requestedEngines: '$selectedEngines',
            requestedAt: '$now',
          },
          expectedReceiptLabels: [
            'regeneration request',
            'capture plan',
            'updated preview plan',
          ],
        }),
      ])
    );
    expect(
      preview.regenerationActions.find(
        (action) => action.clipId === 'clip-beat-hook-text' && action.scope === 'effect'
      )
    ).toMatchObject({
      toolId: 'motion-revise',
      expectedReceiptLabels: [
        'regeneration request',
        'timeline update',
        'updated preview plan',
      ],
    });
    expect(preview.syncSummary).toMatchObject({
      status: 'needs-voice',
      beatCount: 6,
      captionCount: 6,
      transitionCount: 5,
      effectCueCount: 9,
      requirementLabels: ['voice', 'word timings'],
      blockerLabels: ['Generate voice and word timings before final sync'],
    });
    expect(preview.syncBeats[0]).toMatchObject({
      role: 'hook',
      startSeconds: 0,
      durationSeconds: 3,
      voiceStatus: 'planned',
      captionTimingSource: 'timeline',
    });
    expect(preview.syncSoundCues[0]).toMatchObject({
      kind: 'transition',
      label: 'Soft transition accent',
      startSeconds: 2.633,
    });
    expect(preview.syncEffectCues[0]).toMatchObject({
      kind: 'transition',
      label: 'Soft transition wipe',
      startSeconds: 2.633,
      effectPresetId: 'product-glide',
      effectPresetLabel: 'product glide',
      targetLabel: 'problem',
      soundCueLabel: 'Soft transition accent',
    });
    expect(preview.syncEffectCues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'caption-emphasis',
          label: 'Hook caption pop',
          effectPresetId: 'caption-pop',
          targetLabel: 'hook',
        }),
      ])
    );
    expect(preview.exportPackSummary).toMatchObject({
      status: 'needs-render',
      readyCount: 0,
      totalCount: 1,
      targetLabels: ['x 9:16 planned'],
      canvasDropCount: 0,
      missingAssetKinds: ['video', 'poster', 'subtitle', 'transcript', 'manifest'],
      blockerLabels: ['Render every export target before packaging'],
    });
    expect(preview.renderProofSummary).toMatchObject({
      status: 'needs-render',
      engineLabel: 'remotion',
      providerLabel: null,
      readyTargetCount: 0,
      totalTargetCount: 1,
      proofArtifactCount: 0,
      targetLabels: ['x 9:16'],
      artifactLabels: [],
      missingArtifactLabels: ['MP4', 'Poster', 'Subtitles', 'Transcript', 'Manifest'],
      actionLabels: ['Render proof', 'Tweak source before render'],
      blockerLabels: ['Render every export target before packaging'],
    });
    expect(preview.canvasMaterialPlan).toMatchObject({
      id: 'canvas-material-motion-aether-launch-draft-primary',
      projectId: 'motion-aether-launch',
      draftId: 'draft-primary',
      title: 'aether launch video',
      summaryLabels: ['aether', 'launch', '30s', 'x 9:16 30s'],
      materialCount: 11,
    });
    expect(preview.canvasMaterialPlan.cards.map((card) => card.kind)).toEqual([
      'motion-project',
      'story-beat',
      'story-beat',
      'story-beat',
      'story-beat',
      'story-beat',
      'story-beat',
      'generation-node',
      'generation-node',
      'render-proof',
      'export-pack',
    ]);
    expect(preview.canvasMaterialPlan.cards[0]).toMatchObject({
      label: 'aether launch video',
      body: 'aether launch - 30s',
      statusLabel: 'review mode',
      actionLabel: 'review plan',
    });
    expect(preview.canvasMaterialPlan.cards[4]).toMatchObject({
      label: 'demo - App frame',
      actionLabel: 'Regenerate capture for App frame',
    });
    expect(preview.canvasMaterialPlan.cards[8]).toMatchObject({
      kind: 'generation-node',
      label: 'Source visuals',
      statusLabel: 'blocked',
      actionLabel: 'Capture or generate key visual',
    });
    expect(
      preview.canvasMaterialPlan.cards
        .flatMap((card) => [card.label, card.body, ...card.detailLabels, card.actionLabel ?? ''])
        .join('\n')
    ).not.toContain('clip-beat-demo-text');
    expect(preview.visualSourcingSummary).toMatchObject({
      status: 'ready',
      requestCount: 3,
      providerRequirementLabels: ['asset library', 'reference search', 'image generation'],
      requestLabels: [
        'Select product source assets',
        'Find motion references',
        'Generate key stills',
      ],
      nextActionLabels: [
        'Find references',
        'Generate key stills',
        'Select source assets',
        'Review visual sources',
      ],
    });
    expect(preview.visualSourcingSummary.requests[0]).toMatchObject({
      requestId: 'visual-source-capture-assets',
      kind: 'asset-selection',
      componentLabels: ['App frame', 'Proof card', 'Agent trace'],
      apiRoutes: ['/api/motion/capture', '/api/motion/visuals'],
    });
    expect(preview.visualGenerationSummary).toMatchObject({
      status: 'needs-visual-source',
      requestCount: 0,
      providerRequirementLabels: ['image to video'],
      nodePlan: {
        status: 'needs-visual-source',
        nextNodeId: 'visual-source',
        nodes: [
          {
            id: 'timeline',
            label: 'Timeline',
            status: 'complete',
          },
          {
            id: 'visual-source',
            label: 'Source visuals',
            status: 'blocked',
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
      },
      blockerLabels: ['Capture or generate a key visual before image-to-video'],
      nextActionLabels: [],
    });
    expect(preview.productionPlan).toMatchObject({
      status: 'ready',
      mode: 'review',
      nextStepId: 'drafts',
      nextActionLabel: 'Review draft variations',
      completeCount: 1,
      readyCount: 4,
      blockedCount: 3,
      optionalCount: 1,
    });
    expect(preview.productionPlan.steps.map((step) => [step.id, step.status])).toEqual([
      ['plan', 'complete'],
      ['drafts', 'review'],
      ['capture', 'ready'],
      ['visual-source', 'ready'],
      ['visual-generation', 'optional'],
      ['voice', 'ready'],
      ['sync', 'blocked'],
      ['render', 'blocked'],
      ['export', 'blocked'],
    ]);
    expect(preview.capabilitySetup).toMatchObject({
      status: 'needs-setup',
      readyCount: 0,
      missingCount: 6,
      blockedCount: 1,
      nextActionLabel: 'Connect browser capture',
    });
    expect(preview.capabilitySetup.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'capture',
          label: 'Product capture',
          status: 'needs-provider',
          actionLabel: 'Connect browser capture',
          routeLabels: ['/api/motion/capture'],
          requirementLabels: expect.arrayContaining(['browser capture']),
          dryRunLabels: expect.arrayContaining(['screenshot receipt', 'viewport receipt']),
          providerLabels: [],
        }),
        expect.objectContaining({
          id: 'visual-source',
          label: 'Visual sourcing',
          status: 'needs-provider',
          requirementLabels: expect.arrayContaining([
            'asset library',
            'reference search',
            'image generation',
          ]),
        }),
        expect.objectContaining({
          id: 'visual-generation',
          label: 'Image-to-video',
          status: 'needs-provider',
          requirementLabels: expect.arrayContaining(['image to video']),
        }),
        expect.objectContaining({
          id: 'voice',
          label: 'Voice and captions',
          status: 'needs-provider',
          requirementLabels: expect.arrayContaining([
            'voice synthesis',
            'word timing alignment',
          ]),
        }),
        expect.objectContaining({
          id: 'sync',
          label: 'Timeline sync',
          status: 'blocked',
          blockerLabels: ['Generate voice and word timings before final sync'],
        }),
        expect.objectContaining({
          id: 'render',
          label: 'Render proof',
          status: 'needs-runner',
          requirementLabels: expect.arrayContaining([
            'remotion render runner',
            'hyperframes render runner',
          ]),
          dryRunLabels: expect.arrayContaining(['source lint', 'contact sheet', 'mp4 probe']),
        }),
      ])
    );
    expect(preview.agentRunbook).toMatchObject({
      mode: 'review',
      status: 'ready',
      primaryAction: 'request-review',
      nextStepId: 'step-plan',
      nextStepLabel: 'Video plan',
      stepCount: 4,
      reviewRequiredCount: 4,
      autoAdvanceCount: 0,
      verificationLabels: ['contact sheet', 'mp4 probe', 'provenance manifest'],
    });
    expect(preview.agentRunbook?.steps.map((step) => step.label)).toEqual([
      'Video plan',
      'Draft variations',
      'Product capture',
      'Render proof',
    ]);
    expect(preview.agentRunbook?.steps[2]).toMatchObject({
      stepId: 'step-capture',
      gateLabel: 'capture',
      reviewRequired: true,
      autoAdvance: false,
      routeLabels: ['/api/motion/capture'],
      toolLabels: ['motion capture'],
      artifactLabels: ['captures', 'cursor targets', 'crop receipts'],
    });
  });

  it('adds computer-use capture setup requirements when desktop fallback is available', () => {
    const preview = buildMotionPreviewPlan(project(), {
      engines: ['remotion', 'hyperframes'],
      requestedAt: 131,
    });

    expect(preview.capabilitySetup).toMatchObject({
      status: 'needs-setup',
      missingCount: 6,
      nextActionLabel: 'Connect browser capture',
    });
    expect(preview.capabilitySetup.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'computer-use',
          label: 'Computer-use capture',
          status: 'needs-runner',
          actionLabel: 'Approve computer-use capture',
          routeLabels: ['/api/motion/capture'],
          toolLabels: ['computer use'],
          requirementLabels: expect.arrayContaining([
            'creator approval',
            'redaction manifest',
            'approved app or browser window',
          ]),
          runnerLabels: expect.arrayContaining([
            'screenshot',
            'recording',
            'trace',
            'redaction receipt',
          ]),
          dryRunLabels: expect.arrayContaining([
            'approval receipt',
            'redaction receipt',
            'safe-scope receipt',
          ]),
          blockerLabels: expect.arrayContaining([
            'stop on login, payment, personal data, or secret fields appear',
          ]),
        }),
      ])
    );

    const tasteReferences: MotionPreviewTasteReference[] = preview.tasteReferences;
    expect(tasteReferences.map((reference) => reference.title).slice(0, 2)).toEqual([
      'HyperFrames PR-to-video skill drop',
      'Claude-style agent product demo',
    ]);
    expect(tasteReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Claude-style agent product demo',
          reviewStatusLabel: 'needs public playback',
          hookTypeLabel: 'agent action',
          targetCropLabels: ['16:9', '9:16'],
          componentLabels: expect.arrayContaining(['Agent trace', 'Terminal proof']),
          shotList: expect.arrayContaining([
            expect.objectContaining({
              label: 'Command proof',
              timeRangeLabel: '6.5-10.5s',
              componentLabels: expect.arrayContaining(['Agent trace', 'Terminal proof']),
              editTargetLabels: expect.arrayContaining(['proof', 'timing']),
            }),
          ]),
          actions: expect.arrayContaining([
            expect.objectContaining({
              id: 'taste-reference-claude-agent-demo-playback-review-effect',
              label: 'Apply agent action timing to Hook card / Agent trace',
              scope: 'effect',
              toolId: 'motion-revise',
              route: '/api/motion/regenerate',
              requestTemplate: expect.objectContaining({
                project: '$motionProject',
                tasteReferenceId: 'claude-agent-demo-playback-review',
                sourceEntryId: 'public-claude-launch-demo-corpus',
                scope: 'effect',
                componentIds: expect.arrayContaining(['hook-card', 'agent-trace']),
                requestedEngines: '$selectedEngines',
                requestedAt: '$now',
              }),
              expectedReceiptLabels: [
                'taste reference',
                'timestamped shot plan',
                'updated preview plan',
              ],
            }),
          ]),
        }),
      ])
    );
  });

  it('resolves component, reference-signal, and taste-reference regeneration actions', () => {
    const preview = buildMotionPreviewPlan(project(), {
      engines: ['remotion', 'hyperframes'],
      requestedAt: 900,
    });

    expect(
      findMotionPreviewRegenerationAction(
        preview,
        'regen-option-clip-beat-demo-text-capture'
      )
    ).toMatchObject({
      id: 'regen-option-clip-beat-demo-text-capture',
      requestTemplate: {
        clipId: 'clip-beat-demo-text',
        scope: 'capture',
      },
    });

    expect(
      findMotionPreviewRegenerationAction(
        preview,
        'reference-signal-hyperframes-launch-video-gallery-effect'
      )
    ).toMatchObject({
      id: 'reference-signal-hyperframes-launch-video-gallery-effect',
      requestTemplate: {
        referenceSignalId: 'hyperframes-launch-video-gallery',
        scope: 'effect',
        componentIds: ['hook-card', 'app-frame'],
      },
    });

    expect(
      findMotionPreviewRegenerationAction(
        preview,
        'taste-reference-claude-agent-demo-playback-review-effect'
      )
    ).toMatchObject({
      id: 'taste-reference-claude-agent-demo-playback-review-effect',
      requestTemplate: {
        tasteReferenceId: 'claude-agent-demo-playback-review',
        sourceEntryId: 'public-claude-launch-demo-corpus',
        sourceUrl: 'https://www.youtube.com/@AnthropicAI/search?query=Claude%20Code',
        scope: 'effect',
        componentIds: ['hook-card', 'agent-trace'],
      },
    });

    expect(findMotionPreviewRegenerationAction(preview, 'missing-action')).toBeNull();
  });

  it('uses saved setup dry-run receipts to advance capability setup without completing production gates', () => {
    const baseProject = { ...project(), workflowMode: 'full-auto' as const };
    const preview = buildMotionPreviewPlan(
      {
        ...baseProject,
        executionHistory: appendSetupDryRunExecutionHistory(
          baseProject.executionHistory,
          {
            setupId: 'computer-use',
            gateId: 'capture',
            label: 'Computer-use capture',
            receiptLabels: ['approval receipt', 'redaction receipt', 'safe-scope receipt'],
            provenance: [{ kind: 'manual', ref: 'setup:computer-use' }],
          },
          132
        ),
      },
      {
        engines: ['remotion', 'hyperframes'],
        requestedAt: 133,
      }
    );

    expect(preview.executionHistory).toMatchObject({
      status: 'saved',
      savedStepCount: 1,
      receiptCount: 3,
      latestReceiptLabels: ['approval receipt', 'redaction receipt', 'safe-scope receipt'],
    });
    expect(preview.capabilitySetup.nextActionLabel).toBe('Connect visual sources');
    expect(preview.capabilitySetup.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'capture',
          status: 'configured',
          configuredProviderLabels: ['computer use dry run'],
          dryRunCompletedLabels: expect.arrayContaining([
            'approval receipt',
            'redaction receipt',
            'safe-scope receipt',
          ]),
        }),
        expect.objectContaining({
          id: 'computer-use',
          status: 'configured',
          dryRunPendingLabels: [],
          dryRunCompletedLabels: expect.arrayContaining([
            'approval receipt',
            'redaction receipt',
            'safe-scope receipt',
          ]),
        }),
      ])
    );
    expect(preview.productionPlan.steps.find((step) => step.id === 'capture')).toMatchObject({
      status: 'ready',
      verificationReceipts: [],
    });
  });

  it('carries saved full-auto receipt history into the preview plan', () => {
    const preview = buildMotionPreviewPlan(
      {
        ...project(),
        workflowMode: 'full-auto',
        executionHistory: [
          {
            id: 'execution-capture-browser-capture-452',
            gateId: 'capture',
            label: 'Product capture',
            providerId: 'browser-capture',
            savedAt: 452,
            receiptCount: 1,
            receiptLabels: ['Screenshot'],
            receipts: [
              {
                id: 'receipt-capture-homepage',
                kind: 'capture',
                label: 'Screenshot',
                ref: 'capture-aether-homepage',
                providerId: 'browser-capture',
                assetUrl: 'asset://capture/home.png',
                mimeType: 'image/png',
              },
            ],
            provenance: [{ kind: 'provider', ref: 'browser-capture' }],
          },
          {
            id: 'execution-render-hyperframes-local-480',
            gateId: 'render',
            label: 'Render proof',
            providerId: 'hyperframes-local',
            savedAt: 480,
            receiptCount: 2,
            receiptLabels: ['MP4', 'Manifest'],
            receipts: [
              {
                id: 'receipt-render-video',
                kind: 'render',
                label: 'MP4',
                ref: 'render-export-x-9x16-video',
                providerId: 'hyperframes-local',
                assetUrl: 'asset://renders/x/video.mp4',
                path: 'renders/x/video.mp4',
                mimeType: 'video/mp4',
              },
              {
                id: 'receipt-render-manifest',
                kind: 'render',
                label: 'Manifest',
                ref: 'render-export-x-9x16-manifest',
                providerId: 'hyperframes-local',
                path: 'renders/x/manifest.json',
              },
            ],
            provenance: [{ kind: 'provider', ref: 'hyperframes-local' }],
          },
          {
            id: 'execution-render-package-hyperframes-local-render-plan-motion-aether-launch-draft-primary-hyperframes-481',
            gateId: 'render',
            label: 'Render package verification',
            providerId: 'hyperframes-local',
            savedAt: 481,
            receiptCount: 4,
            receiptLabels: [
              'Render source manifest',
              'Lint HyperFrames composition',
              'Validate HyperFrames frames',
              'MP4 artifact check',
            ],
            receipts: [
              {
                id: 'receipt-render-package-source-manifest',
                kind: 'render',
                label: 'Render source manifest',
                ref: 'render-plan-motion-aether-launch-draft-primary-hyperframes:source-manifest',
                providerId: 'hyperframes-local',
                path: 'renders/motion-aether-launch/render-plan-motion-aether-launch-draft-primary-hyperframes.source-manifest.json',
                mimeType: 'application/json',
              },
              {
                id: 'receipt-render-package-lint',
                kind: 'render',
                label: 'Lint HyperFrames composition',
                ref: 'render-plan-motion-aether-launch-draft-primary-hyperframes:verification:verify-hyperframes-lint',
                providerId: 'hyperframes-local',
              },
              {
                id: 'receipt-render-package-validate',
                kind: 'render',
                label: 'Validate HyperFrames frames',
                ref: 'render-plan-motion-aether-launch-draft-primary-hyperframes:verification:verify-hyperframes-validate',
                providerId: 'hyperframes-local',
              },
              {
                id: 'receipt-render-package-mp4-check',
                kind: 'render',
                label: 'MP4 artifact check',
                ref: 'render-plan-motion-aether-launch-draft-primary-hyperframes:artifact-check:render-export-x-9x16-video',
                providerId: 'hyperframes-local',
                path: 'renders/x/video.mp4',
              },
            ],
            provenance: [{ kind: 'provider', ref: 'hyperframes-local' }],
          },
        ],
      },
      {
        engines: ['hyperframes'],
        requestedAt: 500,
      }
    );

    expect(preview.executionHistory).toMatchObject({
      status: 'saved',
      savedStepCount: 3,
      receiptCount: 7,
      latestReceiptLabels: [
        'Render source manifest',
        'Lint HyperFrames composition',
        'Validate HyperFrames frames',
        'MP4 artifact check',
      ],
      entries: [
        {
          gateId: 'capture',
          label: 'Product capture',
          providerLabel: 'browser capture',
          savedAt: 452,
          receiptLabels: ['Screenshot'],
        },
        {
          gateId: 'render',
          label: 'Render proof',
          providerLabel: 'hyperframes local',
          savedAt: 480,
          receiptLabels: ['MP4', 'Manifest'],
        },
        {
          gateId: 'render',
          label: 'Render package verification',
          providerLabel: 'hyperframes local',
          savedAt: 481,
          receiptLabels: [
            'Render source manifest',
            'Lint HyperFrames composition',
            'Validate HyperFrames frames',
            'MP4 artifact check',
          ],
        },
      ],
    });
    expect(preview.renderProofSummary).toMatchObject({
      status: 'partial',
      engineLabel: 'hyperframes',
      providerLabel: 'hyperframes local',
      readyTargetCount: 0,
      totalTargetCount: 1,
      proofArtifactCount: 2,
      targetLabels: ['x 9:16'],
      artifactLabels: ['MP4', 'Manifest'],
      missingArtifactLabels: ['Poster', 'Subtitles', 'Transcript'],
      actionLabels: [
        'Review partial proof',
        'Render remaining outputs',
        'Tweak source and rerender',
      ],
      blockerLabels: ['Render every export target before packaging'],
      packageVerification: {
        status: 'saved',
        receiptCount: 4,
        providerLabel: 'hyperframes local',
        manifestPath:
          'renders/motion-aether-launch/render-plan-motion-aether-launch-draft-primary-hyperframes.source-manifest.json',
        receiptLabels: [
          'Render source manifest',
          'Lint HyperFrames composition',
          'Validate HyperFrames frames',
          'MP4 artifact check',
        ],
        verificationLabels: ['Lint HyperFrames composition', 'Validate HyperFrames frames'],
        artifactCheckLabels: ['MP4 artifact check'],
      },
    });
    expect(preview.renderProofSummary.proofArtifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'video',
          label: 'MP4',
          status: 'ready',
          targetLabel: 'x 9:16',
          assetUrl: 'asset://renders/x/video.mp4',
          path: 'renders/x/video.mp4',
          mimeType: 'video/mp4',
          width: 1080,
          height: 1920,
        }),
        expect.objectContaining({
          kind: 'manifest',
          label: 'Manifest',
          status: 'ready',
          targetLabel: 'x 9:16',
          path: 'renders/x/manifest.json',
        }),
      ])
    );
    expect(preview.renderProofSummary.canvasDropTargets).toEqual([
      {
        artifactLabel: 'MP4',
        label: 'x 9:16 MP4',
        targetLabel: 'x 9:16',
        url: 'asset://renders/x/video.mp4',
        width: 1080,
        height: 1920,
        mimeType: 'video/mp4',
        motionProjectId: 'motion-aether-launch',
      },
    ]);
    expect(preview.canvasMaterialPlan.cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'motion-aether-launch-draft-primary-capture-capture-aether-homepage',
          kind: 'captured-material',
          label: 'Screenshot material',
          body: 'Captured via browser capture',
          detailLabels: ['image/png', 'asset ready', 'Product capture receipt'],
          statusLabel: 'captured',
          actionLabel: 'use in scene',
          assetUrl: 'asset://capture/home.png',
          mimeType: 'image/png',
          sourceRef: 'capture-aether-homepage',
        }),
      ])
    );
  });

  it('surfaces captured material as the source for image-to-video review', () => {
    const capturedProject = applyCaptureResultToMotionProject(project(), screenshotCaptureResult, {
      updatedAt: 140,
    });

    const preview = buildMotionPreviewPlan(capturedProject, {
      engines: ['remotion', 'hyperframes'],
      requestedAt: 141,
    });

    expect(preview.visualGenerationSummary).toMatchObject({
      status: 'ready',
      requestCount: 1,
      requests: [
        {
          requestId: 'image-to-video-clip-beat-demo-text',
          clipId: 'clip-beat-demo-text',
          componentLabel: 'App frame',
          sourceAssetId: 'capture-aether-homepage',
          sourceLabel: 'screenshot via browser capture',
          sourceAssetUrl: 'asset://capture/home.png',
          sourceKind: 'screenshot',
          sourceMimeType: 'image/png',
          outputLabel: '9:16 1080x1920',
        },
      ],
    });
  });

  it('summarizes Remotion and HyperFrames source readiness without exposing source code', () => {
    const preview = buildMotionPreviewPlan(project(), {
      engines: ['remotion', 'hyperframes', 'provider'],
      requestedAt: 131,
    });

    expect(preview.enginePreviews).toHaveLength(3);
    expect(preview.enginePreviews[0]).toMatchObject({
      engine: 'remotion',
      status: 'ready',
      compositionId: 'motion-aether-launch-draft-primary',
      entryPoint: 'remotion/index.tsx',
      durationSeconds: 30,
      outputKinds: ['video', 'poster', 'subtitle', 'transcript', 'manifest'],
      componentIds: [
        'hook-card',
        'proof-card',
        'app-frame',
        'agent-trace',
        'cta-card',
        'caption-line',
        'voice-line',
        'soft-wipe',
      ],
      runtimePreview: {
        kind: 'remotion-player',
        label: 'Remotion Player',
        status: 'needs-source-host',
        mountLabel: 'Mount Remotion Player',
        sourceHostRequirement: 'Serve remotion/index.tsx and timeline/draft-primary.json to the preview runtime.',
        editLinkLabels: ['component props', 'timeline JSON', 'SCRIPT.md', 'STORYBOARD.md'],
      },
    });
    expect(preview.enginePreviews[1]).toMatchObject({
      engine: 'hyperframes',
      runtimePreview: {
        kind: 'hyperframes-iframe',
        label: 'HyperFrames iframe',
        status: 'needs-source-host',
        mountLabel: 'Mount HyperFrames iframe',
      },
    });
    expect(preview.enginePreviews[0].sourceFiles).toEqual([
      {
        kind: 'entry',
        path: 'remotion/index.tsx',
        mimeType: 'text/typescript',
      },
      {
        kind: 'design',
        path: 'DESIGN.md',
        mimeType: 'text/markdown',
      },
      {
        kind: 'script',
        path: 'SCRIPT.md',
        mimeType: 'text/markdown',
      },
      {
        kind: 'storyboard',
        path: 'STORYBOARD.md',
        mimeType: 'text/markdown',
      },
      {
        kind: 'timeline',
        path: 'timeline/draft-primary.json',
        mimeType: 'application/json',
      },
      {
        kind: 'edit',
        path: 'EDIT.md',
        mimeType: 'text/markdown',
      },
      {
        kind: 'manifest',
        path: 'renders/motion-aether-launch/render-plan-motion-aether-launch-draft-primary-remotion.source-manifest.json',
        mimeType: 'application/json',
      },
    ]);
    expect(preview.enginePreviews[0].sourceFiles[0]).not.toHaveProperty('contents');
    expect(preview.enginePreviews[0].renderPackage).toMatchObject({
      manifestPath:
        'renders/motion-aether-launch/render-plan-motion-aether-launch-draft-primary-remotion.source-manifest.json',
      sourceHostRequirement:
        'Serve remotion/index.tsx and the timeline JSON to Remotion Studio or a Remotion Player mount.',
      previewCommand: {
        id: 'preview-remotion-studio',
        label: 'Open Remotion Studio',
        display: 'npx remotion studio',
      },
      renderCommandLabels: [
        'Render x 9:16 video',
        'Render x 9:16 poster',
      ],
      verificationLabels: ['Render one-frame layout check'],
      proofArtifactLabels: ['MP4', 'Poster', 'Subtitles', 'Transcript', 'Manifest'],
      proofArtifactPaths: expect.arrayContaining([
        'renders/motion-aether-launch/export-x-9x16/video.mp4',
        'renders/motion-aether-launch/export-x-9x16/manifest.json',
      ]),
      action: {
        id: 'verify-render-package-remotion',
        label: 'Verify Remotion package',
        route: '/api/motion/render',
        method: 'POST',
        toolId: 'motion-render',
        engine: 'remotion',
        requestTemplate: {
          project: '$motionProject',
          engine: 'remotion',
          providerId: '$selectedRenderProvider',
          requestedAt: '$now',
        },
        expectedReceiptLabels: expect.arrayContaining([
          'render source manifest',
          'Render one-frame layout check',
          'check video',
          'check poster',
        ]),
      },
    });
    expect(preview.enginePreviews[0].renderPackage?.renderCommands[0]).toMatchObject({
      outputId: 'render-export-x-9x16-video',
      outputPath: 'renders/motion-aether-launch/export-x-9x16/video.mp4',
    });
    expect(preview.enginePreviews[0].renderPackage?.artifactChecks).toEqual(
      expect.arrayContaining([
        {
          outputId: 'render-export-x-9x16-video',
          kind: 'video',
          path: 'renders/motion-aether-launch/export-x-9x16/video.mp4',
          required: true,
        },
      ])
    );
    expect(preview.editSource).toMatchObject({
      status: 'ready',
      engine: 'remotion',
      apiRoute: '/api/motion/source-edit',
      actionLabel: 'Apply source edits',
      artifactPath: 'EDIT.md',
      timelinePath: 'timeline/draft-primary.json',
      scriptPath: 'SCRIPT.md',
      storyboardPath: 'STORYBOARD.md',
      editableComponentCount: 8,
      regenerationScopes: expect.arrayContaining(['capture', 'timing', 'caption', 'effect']),
      sourceFilePaths: expect.arrayContaining([
        'EDIT.md',
        'SCRIPT.md',
        'STORYBOARD.md',
        'timeline/draft-primary.json',
      ]),
    });
    expect(preview.editSource.sourceFiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'EDIT.md',
          label: 'Edit contract',
          purpose: 'Review component controls, source files, and regeneration scopes.',
          editSurfaceLabels: ['component', 'effect', 'regeneration'],
        }),
        expect.objectContaining({
          path: 'SCRIPT.md',
          label: 'Script',
          purpose: 'Edit narration copy and voice lines.',
          editSurfaceLabels: ['script', 'voice'],
        }),
        expect.objectContaining({
          path: 'STORYBOARD.md',
          label: 'Storyboard',
          purpose: 'Edit scenes, component choices, timing, and motion effects.',
          editSurfaceLabels: ['scene', 'component', 'timing', 'effect'],
        }),
        expect.objectContaining({
          path: 'timeline/draft-primary.json',
          label: 'Timeline JSON',
          purpose: 'Edit frame timing, component props, assets, and linked variants.',
          editSurfaceLabels: ['timing', 'props', 'assets', 'variants'],
        }),
      ])
    );
    expect(preview.editSource.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          clipId: 'clip-beat-demo-text',
          componentId: 'app-frame',
          componentLabel: 'App frame',
          editControlIds: ['assetId', 'caption', 'zoom'],
          regenerateScopes: ['capture', 'timing', 'caption'],
          sourceFiles: ['timeline/draft-primary.json', 'STORYBOARD.md'],
          sourceFileLabels: ['Timeline JSON', 'Storyboard'],
          editSurfaceLabels: ['Capture', 'Caption', 'Zoom', 'capture', 'timing', 'caption'],
        }),
      ])
    );
    expect(preview.enginePreviews[1]).toMatchObject({
      engine: 'hyperframes',
      status: 'ready',
      entryPoint: 'index.html',
      renderPackage: {
        previewCommand: {
          id: 'preview-hyperframes',
          label: 'Open HyperFrames preview',
        },
        action: {
          id: 'verify-render-package-hyperframes',
          label: 'Verify HyperFrames package',
          engine: 'hyperframes',
        },
        verificationLabels: [
          'Lint HyperFrames composition',
          'Validate HyperFrames frames',
          'Capture one-frame layout check',
        ],
      },
    });
    expect(preview.enginePreviews[2]).toMatchObject({
      engine: 'provider',
      status: 'provider-required',
      renderPackage: null,
      blockers: [
        {
          id: 'provider-adapter-required',
          label: 'Choose a configured video generation provider before render',
        },
      ],
    });
  });
});

import { describe, expect, it } from 'vitest';
import { buildMotionPreviewPlan } from './previewPlan';
import { buildRepoLaunchMotionProject } from './storyboard';
import { materializeMotionTimeline } from './timeline';

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

describe('buildMotionPreviewPlan', () => {
  it('shows storyboard, draft variations, editable timeline rows, and regenerate actions', () => {
    const preview = buildMotionPreviewPlan(project(), {
      engines: ['remotion', 'hyperframes', 'provider'],
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
        'Image-to-video insert',
        'Voice and caption sync',
        'Multi-format export pack',
        'Branded template system',
        'Localized voice caption variants',
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
    expect(preview.regenerationActions).toContainEqual({
      id: 'regen-option-clip-beat-demo-text-capture',
      clipId: 'clip-beat-demo-text',
      componentId: 'app-frame',
      componentLabel: 'App frame',
      scope: 'capture',
      label: 'Regenerate capture for App frame',
    });
    expect(preview.syncSummary).toMatchObject({
      status: 'needs-voice',
      beatCount: 6,
      captionCount: 6,
      transitionCount: 5,
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
    expect(preview.exportPackSummary).toMatchObject({
      status: 'needs-render',
      readyCount: 0,
      totalCount: 1,
      targetLabels: ['x 9:16 planned'],
      canvasDropCount: 0,
      missingAssetKinds: ['video', 'poster', 'subtitle', 'transcript', 'manifest'],
      blockerLabels: ['Render every export target before packaging'],
    });
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
        kind: 'manifest',
        path: 'renders/motion-aether-launch/render-plan-motion-aether-launch-draft-primary-remotion.source-manifest.json',
        mimeType: 'application/json',
      },
    ]);
    expect(preview.enginePreviews[0].sourceFiles[0]).not.toHaveProperty('contents');
    expect(preview.enginePreviews[1]).toMatchObject({
      engine: 'hyperframes',
      status: 'ready',
      entryPoint: 'index.html',
    });
    expect(preview.enginePreviews[2]).toMatchObject({
      engine: 'provider',
      status: 'provider-required',
      blockers: [
        {
          id: 'provider-adapter-required',
          label: 'Choose a configured video generation provider before render',
        },
      ],
    });
  });
});

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
    expect(preview.visualGenerationSummary).toMatchObject({
      status: 'needs-visual-source',
      requestCount: 0,
      providerRequirementLabels: ['image to video'],
      blockerLabels: ['Capture or generate a key visual before image-to-video'],
      nextActionLabels: [],
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
    });
    expect(preview.enginePreviews[0].sourceFiles).toEqual([
      {
        kind: 'entry',
        path: 'remotion/index.tsx',
        mimeType: 'text/typescript',
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

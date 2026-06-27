import { describe, expect, it } from 'vitest';
import { applyMotionSourceBundleEdits } from './sourceBundleApply';
import { buildMotionSourcePatchDraft } from './sourcePatchDraft';
import { createMotionTasteReferenceRegenerationRequest } from './reviewPlan';
import { buildRepoLaunchMotionProject } from './storyboard';
import { materializeMotionTimeline } from './timeline';
import type { MotionProject } from './project';

function project(): MotionProject {
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
      createdAt: 80,
    }),
    { updatedAt: 81 }
  );
}

describe('buildMotionSourcePatchDraft', () => {
  it('creates editable source files that can be applied through source-edit', () => {
    const original = project();
    const regenerationRequest = createMotionTasteReferenceRegenerationRequest(original, {
      tasteReferenceId: 'claude-agent-demo-playback-review',
      sourceEntryId: 'public-claude-launch-demo-corpus',
      sourceUrl: 'https://www.youtube.com/@AnthropicAI/search?query=Claude%20Code',
      scope: 'effect',
      componentIds: ['hook-card', 'agent-trace'],
      prompt: 'Use the timestamped agent-demo reference as the effect guide.',
      requestedAt: 95,
    });

    const draft = buildMotionSourcePatchDraft(original, regenerationRequest.sourcePatchPlan, {
      engine: 'remotion',
      requestedAt: 96,
    });

    expect(draft).toMatchObject({
      id: 'source-patch-draft-source-patch-regen-taste-claude-agent-demo-playback-review-effect-95',
      status: 'ready',
      route: '/api/motion/source-edit',
      method: 'POST',
      sourceEditId: 'source-edit-regen-taste-claude-agent-demo-playback-review-effect-95',
      targetClipIds: ['clip-beat-hook-text', 'clip-beat-payoff-text'],
      requestTemplate: {
        project: '$motionProject',
        id: 'source-edit-regen-taste-claude-agent-demo-playback-review-effect-95',
        files: '$draftSourceFiles',
        requestedEngines: '$selectedEngines',
        requestedAt: '$now',
      },
    });
    expect(draft.files.map((file) => file.path)).toEqual([
      'timeline/draft-primary.json',
      'STORYBOARD.md',
      'EDIT.md',
    ]);

    const timelineFile = draft.files.find((file) => file.path === 'timeline/draft-primary.json');
    if (!timelineFile) throw new Error('missing timeline draft');
    const timeline = JSON.parse(timelineFile.contents);
    const textTrack = timeline.tracks.find((track: { id: string }) => track.id === 'track-text');
    const hookClip = textTrack.clips.find(
      (clip: { id: string }) => clip.id === 'clip-beat-hook-text'
    );
    const payoffClip = textTrack.clips.find(
      (clip: { id: string }) => clip.id === 'clip-beat-payoff-text'
    );
    expect(hookClip.props.sourcePatchDraft).toMatchObject({
      planId: 'source-patch-regen-taste-claude-agent-demo-playback-review-effect-95',
      instructionId: 'source-patch-regen-taste-claude-agent-demo-playback-review-effect-95-effect',
      scope: 'effect',
      label: 'Apply effect guidance to Hook card / Agent trace',
      guidanceRefs: expect.arrayContaining([
        'claude-agent-demo-playback-review',
        'agent-demo-terminal',
      ]),
    });
    expect(payoffClip.props.sourcePatchDraft).toMatchObject({
      componentIds: ['hook-card', 'agent-trace'],
      sourceEditId: 'source-edit-regen-taste-claude-agent-demo-playback-review-effect-95',
    });

    expect(draft.files.find((file) => file.path === 'STORYBOARD.md')?.contents).toContain(
      'Source patch: Apply effect guidance to Hook card / Agent trace'
    );
    expect(draft.files.find((file) => file.path === 'EDIT.md')?.contents).toContain(
      'Source patch: Apply effect guidance to Hook card / Agent trace'
    );

    const applied = applyMotionSourceBundleEdits(original, {
      id: draft.sourceEditId,
      requestedAt: 97,
      files: draft.files,
    });

    expect(applied.status).toBe('applied');
    expect(applied.blockers).toEqual([]);
    expect(applied.appliedEdits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'timeline/draft-primary.json',
          clipId: 'clip-beat-hook-text',
          changedFields: ['props.sourcePatchDraft'],
        }),
        expect.objectContaining({
          path: 'timeline/draft-primary.json',
          clipId: 'clip-beat-payoff-text',
          changedFields: ['props.sourcePatchDraft'],
        }),
      ])
    );
  });
});

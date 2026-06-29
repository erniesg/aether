import { describe, expect, it } from 'vitest';
import { applyMotionTimelineRevision } from './revise';
import { buildRepoLaunchMotionProject } from './storyboard';
import { materializeMotionTimeline } from './timeline';

function project() {
  return materializeMotionTimeline(
    buildRepoLaunchMotionProject({
      id: 'motion-aether-launch',
      workspaceId: 'demo-ws',
      projectKind: 'launch',
      audience: 'creative app builders',
      tone: 'precise',
      appProfile: {
        name: 'aether',
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

describe('applyMotionTimelineRevision', () => {
  it('applies scoped copy, timing, and component edits to the editable project', () => {
    const revised = applyMotionTimelineRevision(project(), {
      id: 'revision-demo-tighten',
      requestedAt: 100,
      updatedAt: 101,
      operations: [
        {
          kind: 'update-story-beat',
          beatId: 'beat-demo',
          narration: 'Show the aether canvas turning repo evidence into a launch cut.',
        },
        {
          kind: 'update-clip-props',
          clipId: 'clip-beat-demo-text',
          props: {
            caption: 'Canvas capture updated',
            zoom: 1.15,
          },
        },
        {
          kind: 'retime-clip',
          clipId: 'clip-beat-demo-text',
          startFrame: 390,
          durationFrames: 210,
        },
        {
          kind: 'replace-component',
          clipId: 'clip-beat-payoff-text',
          componentId: 'proof-card',
          props: {
            sourceLabel: 'render manifest',
          },
        },
      ],
    });

    expect(revised.updatedAt).toBe(101);
    expect(revised.story.find((beat) => beat.id === 'beat-demo')?.narration).toBe(
      'Show the aether canvas turning repo evidence into a launch cut.'
    );
    expect(
      revised.drafts
        .find((draft) => draft.id === revised.currentDraftId)
        ?.story.find((beat) => beat.id === 'beat-demo')?.narration
    ).toBe('Show the aether canvas turning repo evidence into a launch cut.');

    const demoClip = revised.tracks
      .flatMap((track) => track.clips)
      .find((clip) => clip.id === 'clip-beat-demo-text');
    expect(demoClip).toMatchObject({
      startFrame: 390,
      durationFrames: 210,
      props: {
        caption: 'Canvas capture updated',
        zoom: 1.15,
      },
    });
    expect(demoClip?.provenance).toContainEqual({
      kind: 'manual',
      ref: 'revision-demo-tighten',
    });

    const draftDemoClip = revised.drafts
      .find((draft) => draft.id === revised.currentDraftId)
      ?.tracks.flatMap((track) => track.clips)
      .find((clip) => clip.id === 'clip-beat-demo-text');
    expect(draftDemoClip?.startFrame).toBe(390);
    expect(draftDemoClip?.props.caption).toBe('Canvas capture updated');

    const payoffClip = revised.tracks
      .flatMap((track) => track.clips)
      .find((clip) => clip.id === 'clip-beat-payoff-text');
    expect(payoffClip).toMatchObject({
      componentId: 'proof-card',
      props: {
        sourceLabel: 'render manifest',
      },
    });

    const revisionNode = revised.graphNodes.find(
      (node) => node.id === 'node-revision-revision-demo-tighten'
    );
    expect(revisionNode).toMatchObject({
      kind: 'revision',
      inputRefs: [
        'beat-demo',
        'clip-beat-demo-text',
        'clip-beat-demo-text',
        'clip-beat-payoff-text',
      ],
      outputRefs: [
        'beat-demo',
        'clip-beat-demo-text',
        'clip-beat-demo-text',
        'clip-beat-payoff-text',
      ],
      status: 'done',
    });
    expect(revisionNode?.provenance).toContainEqual({
      kind: 'manual',
      ref: 'revision-demo-tighten',
    });
  });

  it('replaces captured app-frame source assets with crop and cursor edit metadata', () => {
    const revised = applyMotionTimelineRevision(project(), {
      id: 'revision-demo-source-replace',
      requestedAt: 104,
      updatedAt: 105,
      operations: [
        {
          kind: 'replace-clip-asset',
          clipId: 'clip-beat-demo-text',
          assetId: 'capture-recording-aether-flow',
          assetUrl: 'asset://capture/aether-flow.webm',
          captureArtifactKind: 'recording',
          mimeType: 'video/webm',
          crop: 'center-safe',
          zoom: 1.35,
          cursorPath: '120,420 540,960',
          sourceAssetId: 'capture-screenshot-aether-before',
        },
      ],
    });

    const demoClip = revised.tracks
      .flatMap((track) => track.clips)
      .find((clip) => clip.id === 'clip-beat-demo-text');
    expect(demoClip).toMatchObject({
      assetId: 'capture-recording-aether-flow',
      props: {
        assetId: 'capture-recording-aether-flow',
        assetUrl: 'asset://capture/aether-flow.webm',
        captureArtifactKind: 'recording',
        mimeType: 'video/webm',
        crop: 'center-safe',
        zoom: 1.35,
        cursorPath: '120,420 540,960',
        sourceAssetId: 'capture-screenshot-aether-before',
      },
    });
    expect(demoClip?.provenance).toContainEqual({
      kind: 'revision',
      ref: 'revision-demo-source-replace',
    });

    const draftDemoClip = revised.drafts
      .find((draft) => draft.id === revised.currentDraftId)
      ?.tracks.flatMap((track) => track.clips)
      .find((clip) => clip.id === 'clip-beat-demo-text');
    expect(draftDemoClip?.assetId).toBe('capture-recording-aether-flow');
    expect(draftDemoClip?.props.cursorPath).toBe('120,420 540,960');
  });

  it('rejects unsafe edits before mutating the project', () => {
    expect(() =>
      applyMotionTimelineRevision(project(), {
        id: 'revision-overlap',
        requestedAt: 102,
        operations: [
          {
            kind: 'retime-clip',
            clipId: 'clip-beat-proof-text',
            startFrame: 100,
            durationFrames: 160,
          },
        ],
      })
    ).toThrow(/would overlap/);

    expect(() =>
      applyMotionTimelineRevision(project(), {
        id: 'revision-unknown-component',
        requestedAt: 103,
        operations: [
          {
            kind: 'replace-component',
            clipId: 'clip-beat-payoff-text',
            componentId: 'unknown-card',
          },
        ],
      })
    ).toThrow(/not registered/);
  });
});

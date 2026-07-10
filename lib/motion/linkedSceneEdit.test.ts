import { describe, expect, it } from 'vitest';
import type { MotionProject, MotionTrackKind, TimelineTrack } from './project';
import {
  buildLinkedSceneCopyOperations,
  buildLinkedSceneTimingOperations,
} from './linkedSceneEdit';

describe('linked scene edits', () => {
  it('updates story, visual, caption, and voice copy for one scene', () => {
    const operations = buildLinkedSceneCopyOperations(project(), 'visual-1', 'Edited scene copy');

    expect(operations).toEqual([
      { kind: 'update-story-beat', beatId: 'beat-1', narration: 'Edited scene copy' },
      {
        kind: 'update-clip-props',
        clipId: 'visual-1',
        props: {
          text: 'Edited scene copy',
          headline: 'Edited scene copy',
          caption: 'Edited scene copy',
          narration: 'Edited scene copy',
        },
      },
      {
        kind: 'update-clip-props',
        clipId: 'caption-1',
        props: { caption: 'Edited scene copy', text: 'Edited scene copy' },
      },
      {
        kind: 'update-clip-props',
        clipId: 'voice-1',
        props: { narration: 'Edited scene copy', text: 'Edited scene copy' },
      },
    ]);
    expect(operations.some((operation) => 'clipId' in operation && operation.clipId === 'visual-2')).toBe(false);
  });

  it('retimes every linked scene layer and updates story duration', () => {
    const operations = buildLinkedSceneTimingOperations(project(), 'caption-1', 15, 105);

    expect(operations).toEqual([
      { kind: 'update-story-beat', beatId: 'beat-1', targetSeconds: 3.5 },
      { kind: 'retime-clip', clipId: 'visual-1', startFrame: 15, durationFrames: 105 },
      { kind: 'retime-clip', clipId: 'caption-1', startFrame: 15, durationFrames: 105 },
      { kind: 'retime-clip', clipId: 'voice-1', startFrame: 15, durationFrames: 105 },
      { kind: 'retime-clip', clipId: 'visual-2', startFrame: 120, durationFrames: 150 },
      { kind: 'retime-clip', clipId: 'caption-2', startFrame: 120, durationFrames: 150 },
      { kind: 'retime-clip', clipId: 'voice-2', startFrame: 120, durationFrames: 150 },
      { kind: 'retime-clip', clipId: 'transition-1', startFrame: 105, durationFrames: 15 },
    ]);
  });

  it('clamps scene movement against the previous visual scene', () => {
    const operations = buildLinkedSceneTimingOperations(project(), 'visual-2', 80, 150);

    expect(operations).toEqual(
      expect.arrayContaining([
        { kind: 'retime-clip', clipId: 'visual-2', startFrame: 90, durationFrames: 150 },
        { kind: 'retime-clip', clipId: 'caption-2', startFrame: 90, durationFrames: 150 },
        { kind: 'retime-clip', clipId: 'voice-2', startFrame: 90, durationFrames: 150 },
      ])
    );
  });

  it('keeps non-scene tracks independently editable', () => {
    expect(buildLinkedSceneTimingOperations(project(), 'transition-1', 80, 15)).toEqual([
      { kind: 'retime-clip', clipId: 'transition-1', startFrame: 80, durationFrames: 15 },
    ]);
  });
});

function project(): MotionProject {
  return {
    id: 'motion-linked-edit',
    workspaceId: 'ws-linked-edit',
    title: 'Linked edit',
    sourceRefs: [{ kind: 'repo', ref: 'repo' }],
    brief: {
      projectKind: 'pr',
      appProfile: { name: 'aether', summary: 'summary', stack: ['TypeScript'] },
      audience: 'developers',
      platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 8 }],
      claims: [],
      tone: 'clear',
      brandMotion: { palette: ['#000'], fontFamilies: ['Inter'], motionStyle: 'direct' },
    },
    story: [
      {
        id: 'beat-1',
        role: 'hook',
        narration: 'Original one',
        targetSeconds: 3,
        selectedAssetIds: [],
        provenance: [{ kind: 'repo', ref: 'repo' }],
      },
      {
        id: 'beat-2',
        role: 'proof',
        narration: 'Original two',
        targetSeconds: 5,
        selectedAssetIds: [],
        provenance: [{ kind: 'repo', ref: 'repo' }],
      },
    ],
    workflowMode: 'review',
    currentDraftId: 'draft-primary',
    drafts: [],
    tracks: [
      track('text', [clip('visual-1', 0, 90), clip('visual-2', 90, 150)]),
      track('caption', [clip('caption-1', 0, 90), clip('caption-2', 90, 150)]),
      track('voice', [clip('voice-1', 0, 90), clip('voice-2', 90, 150)]),
      track('transition', [clip('transition-1', 75, 15)]),
    ],
    graphNodes: [],
    exports: [],
    createdAt: 1,
    updatedAt: 1,
  };
}

function track(kind: MotionTrackKind, clips: TimelineTrack['clips']): TimelineTrack {
  return { id: `track-${kind}`, kind, clips };
}

function clip(id: string, startFrame: number, durationFrames: number) {
  return {
    id,
    startFrame,
    durationFrames,
    props: {},
    provenance: [{ kind: 'timeline' as const, ref: id }],
  };
}

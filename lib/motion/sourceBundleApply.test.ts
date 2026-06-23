import { describe, expect, it } from 'vitest';
import type {
  MotionRenderEngine,
  MotionRenderRequest,
} from '@/lib/providers/video/types';
import { buildMotionRenderPlan } from './renderPlan';
import { buildMotionRenderSourceBundle } from './renderSource';
import { applyMotionSourceBundleEdits } from './sourceBundleApply';
import { buildRepoLaunchMotionProject } from './storyboard';
import { materializeMotionTimeline } from './timeline';
import type { MotionProject } from './project';

function project(): MotionProject {
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

function renderRequest(
  project: MotionProject,
  engine: MotionRenderEngine = 'remotion'
): MotionRenderRequest {
  const plan = buildMotionRenderPlan(project, { engine, requestedAt: 50 });
  if (plan.status !== 'ready') throw new Error('expected render-ready project');

  return {
    id: plan.id,
    projectId: plan.projectId,
    draftId: plan.draftId,
    engine: plan.engine,
    compositionId: plan.compositionId,
    fps: plan.fps,
    durationFrames: plan.durationFrames,
    tracks: project.tracks,
    outputs: plan.outputs,
    provenance: plan.provenance,
  };
}

function editableTimelineFile(project: MotionProject) {
  const bundle = buildMotionRenderSourceBundle(project, renderRequest(project));
  const file = bundle.files.find((candidate) => candidate.path === 'timeline/draft-primary.json');
  if (!file) throw new Error('missing timeline source file');

  return file;
}

describe('applyMotionSourceBundleEdits', () => {
  it('round-trips edited timeline JSON back into the active motion project', () => {
    const original = project();
    const timelineFile = editableTimelineFile(original);
    const timeline = JSON.parse(timelineFile.contents);
    const textTrack = timeline.tracks.find((track: { id: string }) => track.id === 'track-text');
    const demoClip = textTrack.clips.find(
      (clip: { id: string }) => clip.id === 'clip-beat-demo-text'
    );
    demoClip.startFrame = 370;
    demoClip.durationFrames = 190;
    demoClip.props = {
      ...demoClip.props,
      caption: 'Canvas capture edited from source',
      zoom: 1.2,
    };
    delete demoClip.props.narration;

    const result = applyMotionSourceBundleEdits(original, {
      id: 'source-edit-demo-tighten',
      requestedAt: 200,
      updatedAt: 201,
      files: [
        {
          path: timelineFile.path,
          contents: JSON.stringify(timeline, null, 2),
        },
      ],
    });

    expect(result.status).toBe('applied');
    expect(result.blockers).toEqual([]);
    expect(result.appliedEdits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'timeline-clip',
          path: 'timeline/draft-primary.json',
          trackId: 'track-text',
          clipId: 'clip-beat-demo-text',
          changedFields: expect.arrayContaining([
            'startFrame',
            'durationFrames',
            'props.caption',
            'props.narration',
            'props.zoom',
          ]),
        }),
      ])
    );
    expect(result.project.updatedAt).toBe(201);

    const revisedDemoClip = result.project.tracks
      .flatMap((track) => track.clips)
      .find((clip) => clip.id === 'clip-beat-demo-text');
    expect(revisedDemoClip).toMatchObject({
      startFrame: 370,
      durationFrames: 190,
      props: {
        caption: 'Canvas capture edited from source',
        zoom: 1.2,
      },
    });
    expect(revisedDemoClip?.props.narration).toBeUndefined();
    expect(revisedDemoClip?.provenance).toContainEqual({
      kind: 'revision',
      ref: 'source-edit-demo-tighten',
    });

    const draftDemoClip = result.project.drafts
      .find((draft) => draft.id === result.project.currentDraftId)
      ?.tracks.flatMap((track) => track.clips)
      .find((clip) => clip.id === 'clip-beat-demo-text');
    expect(draftDemoClip?.startFrame).toBe(370);
    expect(draftDemoClip?.props.caption).toBe('Canvas capture edited from source');

    const originalDemoClip = original.tracks
      .flatMap((track) => track.clips)
      .find((clip) => clip.id === 'clip-beat-demo-text');
    expect(originalDemoClip?.startFrame).toBe(360);
    expect(originalDemoClip?.props.caption).toBeUndefined();
  });

  it('blocks unsafe timeline source edits before mutating the project', () => {
    const original = project();
    const timelineFile = editableTimelineFile(original);
    const timeline = JSON.parse(timelineFile.contents);
    const textTrack = timeline.tracks.find((track: { id: string }) => track.id === 'track-text');
    const proofClip = textTrack.clips.find(
      (clip: { id: string }) => clip.id === 'clip-beat-proof-text'
    );
    proofClip.startFrame = 100;
    proofClip.durationFrames = 160;

    const result = applyMotionSourceBundleEdits(original, {
      id: 'source-edit-overlap',
      requestedAt: 202,
      files: [
        {
          path: timelineFile.path,
          contents: JSON.stringify(timeline),
        },
      ],
    });

    expect(result.status).toBe('blocked');
    expect(result.project).toBe(original);
    expect(result.appliedEdits).toEqual([]);
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'timeline/draft-primary.json',
          message: expect.stringMatching(/would overlap/),
        }),
      ])
    );
  });
});

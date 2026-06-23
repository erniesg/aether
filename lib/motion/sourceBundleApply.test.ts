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

function editableSourceFile(project: MotionProject, path: string) {
  const bundle = buildMotionRenderSourceBundle(project, renderRequest(project));
  const file = bundle.files.find((candidate) => candidate.path === path);
  if (!file) throw new Error(`missing ${path} source file`);

  return file;
}

function editMarkdownSection(
  contents: string,
  heading: string,
  edit: (section: string) => string
): string {
  const start = contents.indexOf(`## ${heading}\n`);
  if (start === -1) throw new Error(`missing section ${heading}`);
  const next = contents.indexOf('\n## ', start + 1);
  const end = next === -1 ? contents.length : next + 1;
  return contents.slice(0, start) + edit(contents.slice(start, end)) + contents.slice(end);
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

  it('round-trips SCRIPT.md narration edits into story, text, caption, and voice clips', () => {
    const original = project();
    const scriptFile = editableSourceFile(original, 'SCRIPT.md');
    const editedNarration = 'Show the video plan, draft variations, and reusable components.';
    const editedScript = scriptFile.contents.replace(
      'Show aether in use, with the product flow framed clearly.',
      editedNarration
    );

    const result = applyMotionSourceBundleEdits(original, {
      id: 'source-edit-script-demo-narration',
      requestedAt: 204,
      files: [{ path: scriptFile.path, contents: editedScript }],
    });

    expect(result.status).toBe('applied');
    expect(result.blockers).toEqual([]);
    expect(result.appliedEdits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'story-beat',
          path: 'SCRIPT.md',
          beatId: 'beat-demo',
          changedFields: ['narration'],
        }),
        expect.objectContaining({
          kind: 'timeline-clip',
          path: 'SCRIPT.md',
          clipId: 'clip-beat-demo-text',
          changedFields: ['props.narration'],
        }),
        expect.objectContaining({
          kind: 'timeline-clip',
          path: 'SCRIPT.md',
          clipId: 'clip-beat-demo-caption',
          changedFields: ['props.text'],
        }),
        expect.objectContaining({
          kind: 'timeline-clip',
          path: 'SCRIPT.md',
          clipId: 'clip-beat-demo-voice',
          changedFields: ['props.text'],
        }),
      ])
    );
    expect(result.project.story.find((beat) => beat.id === 'beat-demo')?.narration).toBe(
      editedNarration
    );
    expect(
      result.project.tracks
        .flatMap((track) => track.clips)
        .find((clip) => clip.id === 'clip-beat-demo-text')?.props.narration
    ).toBe(editedNarration);
    expect(
      result.project.tracks
        .flatMap((track) => track.clips)
        .find((clip) => clip.id === 'clip-beat-demo-caption')?.props.text
    ).toBe(editedNarration);
    expect(
      result.project.tracks
        .flatMap((track) => track.clips)
        .find((clip) => clip.id === 'clip-beat-demo-voice')?.props.text
    ).toBe(editedNarration);
  });

  it('round-trips STORYBOARD.md scene edits into component, timing, effect, and narration changes', () => {
    const original = project();
    const storyboardFile = editableSourceFile(original, 'STORYBOARD.md');
    const editedNarration = 'Reveal the timeline plan before the final render.';
    const editedStoryboard = editMarkdownSection(storyboardFile.contents, 'beat-demo', (section) => section
      .replace('Template: app-frame', 'Template: ui-reveal-frame')
      .replace('Motion: product-glide', 'Motion: proof-pulse')
      .replace('Duration: 8s', 'Duration: 7s')
      .replace('Narration: Show aether in use, with the product flow framed clearly.', `Narration: ${editedNarration}`));

    const result = applyMotionSourceBundleEdits(original, {
      id: 'source-edit-storyboard-demo',
      requestedAt: 205,
      files: [{ path: storyboardFile.path, contents: editedStoryboard }],
    });

    expect(result.status).toBe('applied');
    expect(result.blockers).toEqual([]);
    expect(result.appliedEdits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'STORYBOARD.md',
          clipId: 'clip-beat-demo-text',
          changedFields: expect.arrayContaining([
            'componentId',
            'durationFrames',
            'props.effectPreset',
            'props.narration',
          ]),
        }),
        expect.objectContaining({
          kind: 'story-beat',
          path: 'STORYBOARD.md',
          beatId: 'beat-demo',
          changedFields: ['narration', 'targetSeconds'],
        }),
        expect.objectContaining({
          path: 'STORYBOARD.md',
          clipId: 'clip-beat-demo-caption',
          changedFields: expect.arrayContaining(['durationFrames', 'props.text']),
        }),
        expect.objectContaining({
          path: 'STORYBOARD.md',
          clipId: 'clip-beat-demo-voice',
          changedFields: expect.arrayContaining(['durationFrames', 'props.text']),
        }),
      ])
    );
    const clips = result.project.tracks.flatMap((track) => track.clips);
    const demoClip = clips.find((clip) => clip.id === 'clip-beat-demo-text');
    expect(demoClip).toMatchObject({
      componentId: 'ui-reveal-frame',
      durationFrames: 210,
      props: expect.objectContaining({
        effectPreset: 'proof-pulse',
        narration: editedNarration,
      }),
    });
    expect(clips.find((clip) => clip.id === 'clip-beat-demo-caption')).toMatchObject({
      durationFrames: 210,
      props: expect.objectContaining({ text: editedNarration }),
    });
    expect(clips.find((clip) => clip.id === 'clip-beat-demo-voice')).toMatchObject({
      durationFrames: 210,
      props: expect.objectContaining({ text: editedNarration }),
    });
    expect(result.project.story.find((beat) => beat.id === 'beat-demo')).toMatchObject({
      narration: editedNarration,
      targetSeconds: 7,
    });
  });

  it('surfaces EDIT.md control values and applies edited component props from them', () => {
    const original = project();
    const editFile = editableSourceFile(original, 'EDIT.md');
    expect(editFile.contents).toContain('Editable values:');
    expect(editFile.contents).toContain('- caption: null');

    const editedEdit = editFile.contents
      .replace('- assetId: null', '- assetId: "capture-aether-timeline"')
      .replace('- caption: null', '- caption: "Review drafts before full auto"')
      .replace('- zoom: null', '- zoom: 1.15');

    const result = applyMotionSourceBundleEdits(original, {
      id: 'source-edit-editmd-demo-controls',
      requestedAt: 206,
      files: [{ path: editFile.path, contents: editedEdit }],
    });

    expect(result.status).toBe('applied');
    expect(result.blockers).toEqual([]);
    expect(result.appliedEdits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'timeline-clip',
          path: 'EDIT.md',
          clipId: 'clip-beat-demo-text',
          changedFields: expect.arrayContaining([
            'props.assetId',
            'props.caption',
            'props.zoom',
          ]),
        }),
      ])
    );
    expect(
      result.project.tracks
        .flatMap((track) => track.clips)
        .find((clip) => clip.id === 'clip-beat-demo-text')?.props
    ).toMatchObject({
      assetId: 'capture-aether-timeline',
      caption: 'Review drafts before full auto',
      zoom: 1.15,
    });
  });
});

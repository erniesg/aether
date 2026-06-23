import { describe, expect, it } from 'vitest';
import type {
  MotionRenderEngine,
  MotionRenderRequest,
} from '@/lib/providers/video/types';
import { buildMotionRenderPlan } from '@/lib/motion/renderPlan';
import { buildMotionRenderSourceBundle } from '@/lib/motion/renderSource';
import { buildRepoLaunchMotionProject } from '@/lib/motion/storyboard';
import { materializeMotionTimeline } from '@/lib/motion/timeline';
import type { MotionProject } from '@/lib/motion/project';
import { POST } from './route';

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

describe('/api/motion/source-edit', () => {
  it('accepts edited source files and returns refreshed creator review artifacts', async () => {
    const sourceProject = project();
    const bundle = buildMotionRenderSourceBundle(sourceProject, renderRequest(sourceProject));
    const timelineFile = bundle.files.find((file) => file.path === 'timeline/draft-primary.json');
    if (!timelineFile) throw new Error('missing timeline source file');

    const timeline = JSON.parse(timelineFile.contents);
    const textTrack = timeline.tracks.find((track: { id: string }) => track.id === 'track-text');
    const ctaClip = textTrack.clips.find(
      (clip: { id: string }) => clip.id === 'clip-beat-cta-text'
    );
    ctaClip.props = {
      ...ctaClip.props,
      caption: 'Install the pr-to-video skill',
      command: 'npx skills add heygen-com/hyperframes',
    };

    const response = await POST(
      new Request('http://localhost/api/motion/source-edit', {
        method: 'POST',
        body: JSON.stringify({
          project: sourceProject,
          id: 'source-edit-pr-to-video-cta',
          requestedAt: 220,
          files: [
            {
              path: timelineFile.path,
              contents: JSON.stringify(timeline),
            },
          ],
          requestedEngines: ['remotion', 'hyperframes'],
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      status: 'applied',
      project: {
        id: 'motion-aether-launch',
      },
    });
    expect(body.appliedEdits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          clipId: 'clip-beat-cta-text',
          changedFields: expect.arrayContaining(['props.caption', 'props.command']),
        }),
      ])
    );
    expect(body.reviewPlan.projectId).toBe('motion-aether-launch');
    expect(body.reviewPlan.componentSlots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          clipId: 'clip-beat-cta-text',
        }),
      ])
    );
    expect(body.previewPlan.editSource.status).toBe('ready');
    expect(body.project.tracks[0].clips).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'clip-beat-cta-text',
          props: expect.objectContaining({
            caption: 'Install the pr-to-video skill',
            command: 'npx skills add heygen-com/hyperframes',
          }),
        }),
      ])
    );
  });
});

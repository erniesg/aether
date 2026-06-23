import { describe, expect, it } from 'vitest';
import type {
  MotionRenderEngine,
  MotionRenderRequest,
} from '@/lib/providers/video/types';
import { buildMotionRenderPlan } from './renderPlan';
import { buildMotionRenderSourceBundle } from './renderSource';
import { buildRepoLaunchMotionProject } from './storyboard';
import { materializeMotionTimeline } from './timeline';
import type { MotionProject, TimelineTrack } from './project';

function projectWithVisualTimeline(): MotionProject {
  const project = materializeMotionTimeline(
    buildRepoLaunchMotionProject({
      id: 'motion-aether-launch',
      workspaceId: 'demo-ws',
      projectKind: 'launch',
      audience: 'builders',
      tone: 'precise',
      appProfile: {
        name: 'aether',
        summary: 'Canvas-native creative system.',
        stack: ['Next.js', 'Convex', 'tldraw'],
      },
      claims: [
        {
          text: 'Uses Next.js, Convex, and tldraw.',
          source: { kind: 'repo', ref: 'package.json#dependencies' },
        },
      ],
      platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
      createdAt: 10,
    }),
    { updatedAt: 12 }
  );

  const tracks = project.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) =>
      clip.componentId === 'app-frame'
        ? {
            ...clip,
            assetId: 'capture-aether-demo',
            props: {
              ...clip.props,
              assetId: 'capture-aether-demo',
              assetUrl: 'asset://captures/aether-demo.png',
              mimeType: 'image/png',
              caption: 'Captured aether canvas',
            },
          }
        : clip
    ),
  })) satisfies TimelineTrack[];

  return {
    ...project,
    tracks,
    drafts: project.drafts.map((draft) =>
      draft.id === project.currentDraftId ? { ...draft, tracks } : draft
    ),
  };
}

function renderRequest(
  project: MotionProject,
  engine: MotionRenderEngine
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

describe('buildMotionRenderSourceBundle', () => {
  it('compiles an editable motion timeline into a Remotion entry source file', () => {
    const project = projectWithVisualTimeline();
    const request = renderRequest(project, 'remotion');

    const bundle = buildMotionRenderSourceBundle(project, request);

    expect(bundle).toMatchObject({
      id: 'source-bundle-render-plan-motion-aether-launch-draft-primary-remotion',
      engine: 'remotion',
      entryPoint: 'remotion/index.tsx',
    });
    expect(bundle.files.map((file) => [file.kind, file.path])).toEqual([
      ['entry', 'remotion/index.tsx'],
      ['manifest', 'renders/motion-aether-launch/render-plan-motion-aether-launch-draft-primary-remotion.source-manifest.json'],
    ]);

    const entry = bundle.files.find((file) => file.kind === 'entry')?.contents ?? '';
    expect(entry).toContain('registerRoot(RemotionRoot)');
    expect(entry).toContain('import { Audio, Video } from "@remotion/media";');
    expect(entry).toContain('import { AbsoluteFill, Composition, Img, Sequence');
    expect(entry).toContain('id="motion-aether-launch-draft-primary"');
    expect(entry).toContain('durationInFrames={900}');
    expect(entry).toContain('fps={30}');
    expect(entry).toContain('<Sequence');
    expect(entry).toContain('<Img');
    expect(entry).toContain('src={mediaUrl}');
    expect(entry).toContain('Captured aether canvas');
    expect(entry).toContain('const defaultTracks: MotionTrackData[] = ');
    expect(bundle.provenance).toContainEqual({ kind: 'render', ref: request.id });
  });

  it('compiles the same timeline into a HyperFrames index file with timed clips', () => {
    const project = projectWithVisualTimeline();
    const request = renderRequest(project, 'hyperframes');

    const bundle = buildMotionRenderSourceBundle(project, request);

    expect(bundle).toMatchObject({
      engine: 'hyperframes',
      entryPoint: 'index.html',
    });
    expect(bundle.files.map((file) => [file.kind, file.path])).toEqual([
      ['entry', 'index.html'],
      ['manifest', 'renders/motion-aether-launch/render-plan-motion-aether-launch-draft-primary-hyperframes.source-manifest.json'],
    ]);

    const entry = bundle.files.find((file) => file.kind === 'entry')?.contents ?? '';
    expect(entry).toContain('<!doctype html>');
    expect(entry).toContain('data-composition-id="motion-aether-launch-draft-primary"');
    expect(entry).toContain('data-width="1080"');
    expect(entry).toContain('data-height="1920"');
    expect(entry).toContain('data-track-index="0"');
    expect(entry).toContain('data-start="0"');
    expect(entry).toContain('data-duration="3"');
    expect(entry).toContain('src="asset://captures/aether-demo.png"');
    expect(entry).toContain('crossorigin="anonymous"');
    expect(entry).toContain('window.__timelines["motion-aether-launch-draft-primary"] = tl;');
    expect(entry).toContain('tl.from(".motion-clip"');
    expect(entry).toContain('Captured aether canvas');
  });
});

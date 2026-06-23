import { describe, expect, it } from 'vitest';
import { buildRepoLaunchMotionProject } from './storyboard';
import { materializeMotionTimeline } from './timeline';
import { buildMotionRenderPlan } from './renderPlan';

function projectWithTimeline() {
  return materializeMotionTimeline(
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
      platformTargets: [
        { platform: 'x', aspectRatio: '9:16', seconds: 30 },
        { platform: 'youtube', aspectRatio: '16:9', seconds: 45 },
      ],
      createdAt: 10,
    }),
    { updatedAt: 12 }
  );
}

describe('buildMotionRenderPlan', () => {
  it('turns an editable timeline into provider-neutral render requests', () => {
    const plan = buildMotionRenderPlan(projectWithTimeline(), {
      engine: 'remotion',
      requestedAt: 50,
    });

    expect(plan).toMatchObject({
      id: 'render-plan-motion-aether-launch-draft-primary-remotion',
      projectId: 'motion-aether-launch',
      draftId: 'draft-primary',
      engine: 'remotion',
      status: 'ready',
      compositionId: 'motion-aether-launch-draft-primary',
      fps: 30,
      durationFrames: 900,
      durationSeconds: 30,
      requestedAt: 50,
    });
    expect(plan.timelineTrackIds).toEqual([
      'track-text',
      'track-caption',
      'track-voice',
      'track-transition',
    ]);
    expect(plan.componentIds).toEqual([
      'hook-card',
      'proof-card',
      'app-frame',
      'agent-trace',
      'cta-card',
      'caption-line',
      'voice-line',
      'soft-wipe',
    ]);

    expect(plan.outputs.map((output) => [output.exportId, output.kind])).toEqual([
      ['export-x-9x16', 'video'],
      ['export-x-9x16', 'poster'],
      ['export-x-9x16', 'subtitle'],
      ['export-x-9x16', 'transcript'],
      ['export-x-9x16', 'manifest'],
      ['export-youtube-16x9', 'video'],
      ['export-youtube-16x9', 'poster'],
      ['export-youtube-16x9', 'subtitle'],
      ['export-youtube-16x9', 'transcript'],
      ['export-youtube-16x9', 'manifest'],
    ]);
    expect(plan.outputs[0]).toMatchObject({
      id: 'render-export-x-9x16-video',
      platform: 'x',
      aspectRatio: '9:16',
      width: 1080,
      height: 1920,
      mimeType: 'video/mp4',
      path: 'renders/motion-aether-launch/export-x-9x16/video.mp4',
    });
    expect(plan.outputs[5]).toMatchObject({
      platform: 'youtube',
      aspectRatio: '16:9',
      width: 1920,
      height: 1080,
    });
    expect(plan.renderNode).toMatchObject({
      id: 'node-render-plan-remotion',
      kind: 'render',
      status: 'planned',
      inputRefs: [
        'track-text',
        'track-caption',
        'track-voice',
        'track-transition',
        'export-x-9x16',
        'export-youtube-16x9',
      ],
    });
    expect(plan.renderNode).not.toBeNull();
    expect(plan.renderNode!.outputRefs).toContain('render-export-x-9x16-video');
    expect(plan.provenance).toContainEqual({
      kind: 'timeline',
      ref: 'track-text',
    });
  });

  it('reports missing timeline work instead of inventing render inputs', () => {
    const project = buildRepoLaunchMotionProject({
      id: 'motion-aether-launch',
      workspaceId: 'demo-ws',
      projectKind: 'launch',
      audience: 'builders',
      tone: 'precise',
      appProfile: {
        name: 'aether',
        summary: 'Canvas-native creative system.',
        stack: ['Next.js'],
      },
      claims: [],
      platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
      createdAt: 10,
    });

    const plan = buildMotionRenderPlan(project, { engine: 'hyperframes', requestedAt: 51 });

    expect(plan).toMatchObject({
      status: 'needs-timeline',
      engine: 'hyperframes',
      timelineTrackIds: [],
      outputs: [],
      renderNode: null,
    });
    expect(plan.blockers).toEqual([
      {
        id: 'timeline-required',
        label: 'Materialize timeline before render',
      },
    ]);
  });
});

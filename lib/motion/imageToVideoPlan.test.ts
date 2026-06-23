import { describe, expect, it } from 'vitest';
import type { CaptureResult } from '@/lib/providers/capture/types';
import { applyCaptureResultToMotionProject } from './captureApply';
import { buildMotionImageToVideoPlan } from './imageToVideoPlan';
import { buildRepoLaunchMotionProject } from './storyboard';
import { materializeMotionTimeline } from './timeline';

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
      platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
      createdAt: 10,
    }),
    { updatedAt: 12 }
  );
}

const screenshotCaptureResult: CaptureResult = {
  providerId: 'browser-capture',
  artifacts: [
    {
      id: 'capture-screenshot-aether-localhost',
      kind: 'screenshot',
      assetUrl: 'asset://capture/aether-home.png',
      width: 1080,
      height: 1920,
      mimeType: 'image/png',
      viewport: { width: 1080, height: 1920, deviceScaleFactor: 2 },
      cursorTargets: [],
      provenance: [
        { kind: 'provider', ref: 'browser-capture' },
        { kind: 'site', ref: 'http://localhost:3000' },
      ],
    },
  ],
  provenance: [
    { kind: 'provider', ref: 'browser-capture' },
    { kind: 'site', ref: 'http://localhost:3000' },
  ],
};

describe('buildMotionImageToVideoPlan', () => {
  it('turns asset-backed visual timeline clips into provider-neutral image-to-video requests', () => {
    const project = applyCaptureResultToMotionProject(
      projectWithTimeline(),
      screenshotCaptureResult,
      { updatedAt: 20 }
    );

    const plan = buildMotionImageToVideoPlan(project, {
      requestedAt: 30,
    });

    expect(plan).toMatchObject({
      id: 'image-to-video-plan-motion-aether-launch-draft-primary',
      projectId: 'motion-aether-launch',
      draftId: 'draft-primary',
      status: 'ready',
      requestedAt: 30,
      providerRequirements: ['image-to-video'],
      blockers: [],
      nextActions: [
        { id: 'generate-video-clips', label: 'Generate video clips' },
        { id: 'review-generated-clips', label: 'Review generated clips' },
      ],
    });
    expect(plan.requests).toHaveLength(1);
    expect(plan.requests[0]).toMatchObject({
      id: 'image-to-video-clip-beat-demo-text',
      projectId: 'motion-aether-launch',
      draftId: 'draft-primary',
      clipId: 'clip-beat-demo-text',
      sourceAssetId: 'capture-screenshot-aether-localhost',
      aspectRatio: '9:16',
      fps: 30,
      durationFrames: 240,
      width: 1080,
      height: 1920,
      output: {
        id: 'generated-clip-beat-demo-text-image-to-video',
        clipId: 'clip-beat-demo-text',
        sourceAssetId: 'capture-screenshot-aether-localhost',
        mimeType: 'video/mp4',
        path: 'generated/motion-aether-launch/clip-beat-demo-text/image-to-video.mp4',
      },
    });
    expect(plan.requests[0].prompt).toContain('Show aether in use');
    expect(plan.requests[0].prompt).toContain('Keep existing UI text crisp');
    expect(plan.requests[0].provenance).toContainEqual({
      kind: 'capture',
      ref: 'capture-screenshot-aether-localhost',
    });
    expect(plan.imageToVideoNode).toMatchObject({
      id: 'node-image-to-video-plan',
      kind: 'image-to-video',
      status: 'planned',
      inputRefs: ['clip-beat-demo-text', 'capture-screenshot-aether-localhost'],
      outputRefs: ['generated-clip-beat-demo-text-image-to-video'],
    });
  });

  it('returns reviewable blockers when visual source assets are missing', () => {
    const plan = buildMotionImageToVideoPlan(projectWithTimeline(), {
      requestedAt: 31,
    });

    expect(plan).toMatchObject({
      status: 'needs-visual-source',
      requests: [],
      imageToVideoNode: null,
      blockers: [
        {
          id: 'visual-source-required',
          label: 'Capture or generate a key visual before image-to-video',
        },
      ],
    });
  });

  it('returns a timeline blocker instead of inventing clips before timeline materialization', () => {
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

    const plan = buildMotionImageToVideoPlan(project, { requestedAt: 32 });

    expect(plan).toMatchObject({
      status: 'needs-timeline',
      requests: [],
      imageToVideoNode: null,
      blockers: [{ id: 'timeline-required', label: 'Materialize timeline before generation' }],
    });
  });
});

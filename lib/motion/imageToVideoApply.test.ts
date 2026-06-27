import { describe, expect, it } from 'vitest';
import type { CaptureResult } from '@/lib/providers/capture/types';
import type { MotionImageToVideoResult } from '@/lib/providers/video/types';
import { applyCaptureResultToMotionProject } from './captureApply';
import {
  applyMotionImageToVideoResultToMotionProject,
  stageMotionImageToVideoResultForReview,
} from './imageToVideoApply';
import { buildMotionImageToVideoPlan } from './imageToVideoPlan';
import { buildRepoLaunchMotionProject } from './storyboard';
import { materializeMotionTimeline } from './timeline';

function projectWithImageToVideoPlan() {
  const project = applyCaptureResultToMotionProject(
    materializeMotionTimeline(
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
    ),
    screenshotCaptureResult,
    { updatedAt: 20 }
  );
  const plan = buildMotionImageToVideoPlan(project, { requestedAt: 30 });

  return {
    project: {
      ...project,
      graphNodes: plan.imageToVideoNode
        ? [...project.graphNodes, plan.imageToVideoNode]
        : project.graphNodes,
    },
    plan,
  };
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

describe('applyMotionImageToVideoResultToMotionProject', () => {
  it('turns generated video receipts into editable timeline clip assets', () => {
    const { project, plan } = projectWithImageToVideoPlan();
    const request = plan.requests[0];
    const result: MotionImageToVideoResult = {
      providerId: 'runway',
      artifacts: [
        {
          ...request.output,
          requestId: request.id,
          assetUrl: 'asset://generated/aether-demo.mp4',
          durationMs: 8000,
          provenance: [{ kind: 'provider', ref: 'runway' }],
        },
      ],
      provenance: [{ kind: 'provider', ref: 'runway' }],
    };

    const updated = applyMotionImageToVideoResultToMotionProject(project, result, {
      updatedAt: 42,
    });

    expect(updated.updatedAt).toBe(42);

    const generatedClip = updated.tracks
      .flatMap((track) => track.clips)
      .find((clip) => clip.id === 'clip-beat-demo-text');
    expect(generatedClip).toMatchObject({
      assetId: 'generated-clip-beat-demo-text-image-to-video',
      props: {
        assetId: 'generated-clip-beat-demo-text-image-to-video',
        assetUrl: 'asset://generated/aether-demo.mp4',
        generatedVideoAssetId: 'generated-clip-beat-demo-text-image-to-video',
        generatedVideoUrl: 'asset://generated/aether-demo.mp4',
        imageToVideoProviderId: 'runway',
        sourceAssetId: 'capture-screenshot-aether-localhost',
        sourceVisualAssetId: 'capture-screenshot-aether-localhost',
        durationMs: 8000,
        width: 1080,
        height: 1920,
        mimeType: 'video/mp4',
        status: 'ready',
      },
    });
    expect(generatedClip?.provenance).toContainEqual({
      kind: 'image-to-video',
      ref: 'generated-clip-beat-demo-text-image-to-video',
    });

    const currentDraftClip = updated.drafts
      .find((draft) => draft.id === updated.currentDraftId)
      ?.tracks.flatMap((track) => track.clips)
      .find((clip) => clip.id === 'clip-beat-demo-text');
    expect(currentDraftClip?.assetId).toBe('generated-clip-beat-demo-text-image-to-video');

    const untouchedHookClip = updated.tracks
      .flatMap((track) => track.clips)
      .find((clip) => clip.id === 'clip-beat-hook-text');
    expect(untouchedHookClip?.assetId).toBeUndefined();

    const imageToVideoNode = updated.graphNodes.find(
      (node) => node.id === 'node-image-to-video-plan'
    );
    expect(imageToVideoNode).toMatchObject({
      kind: 'image-to-video',
      status: 'done',
      providerId: 'runway',
      inputRefs: ['clip-beat-demo-text', 'capture-screenshot-aether-localhost'],
      outputRefs: ['generated-clip-beat-demo-text-image-to-video'],
    });
    expect(imageToVideoNode?.provenance).toContainEqual({
      kind: 'image-to-video',
      ref: 'generated-clip-beat-demo-text-image-to-video',
    });
  });

  it('creates an image-to-video graph node when applying a receipt without a planned node', () => {
    const { project, plan } = projectWithImageToVideoPlan();
    const projectWithoutPlannedNode = {
      ...project,
      graphNodes: project.graphNodes.filter((node) => node.id !== 'node-image-to-video-plan'),
    };
    const request = plan.requests[0];

    const updated = applyMotionImageToVideoResultToMotionProject(
      projectWithoutPlannedNode,
      {
        providerId: 'pika',
        artifacts: [
          {
            ...request.output,
            requestId: request.id,
            assetUrl: 'asset://generated/pika-demo.mp4',
            provenance: [{ kind: 'provider', ref: 'pika' }],
          },
        ],
        provenance: [{ kind: 'provider', ref: 'pika' }],
      },
      { updatedAt: 43 }
    );

    expect(updated.graphNodes.find((node) => node.id === 'node-image-to-video-plan')).toMatchObject({
      kind: 'image-to-video',
      status: 'done',
      providerId: 'pika',
      inputRefs: ['clip-beat-demo-text', 'capture-screenshot-aether-localhost'],
      outputRefs: ['generated-clip-beat-demo-text-image-to-video'],
    });
  });

  it('stages generated video takes for review without replacing the timeline asset', () => {
    const { project, plan } = projectWithImageToVideoPlan();
    const request = plan.requests[0];

    const updated = stageMotionImageToVideoResultForReview(
      project,
      {
        providerId: 'runway',
        artifacts: [
          {
            ...request.output,
            requestId: request.id,
            assetUrl: 'asset://generated/aether-demo.mp4',
            durationMs: 8000,
            provenance: [{ kind: 'provider', ref: 'runway' }],
          },
        ],
        provenance: [{ kind: 'provider', ref: 'runway' }],
      },
      { updatedAt: 44 }
    );

    expect(updated.updatedAt).toBe(44);

    const stagedClip = updated.tracks
      .flatMap((track) => track.clips)
      .find((clip) => clip.id === 'clip-beat-demo-text');
    expect(stagedClip?.assetId).toBe('capture-screenshot-aether-localhost');
    expect(stagedClip?.props).toMatchObject({
      generatedVideoTakes: [
        {
          id: 'generated-clip-beat-demo-text-image-to-video',
          assetId: 'generated-clip-beat-demo-text-image-to-video',
          assetUrl: 'asset://generated/aether-demo.mp4',
          providerId: 'runway',
          requestId: 'image-to-video-clip-beat-demo-text',
          sourceAssetId: 'capture-screenshot-aether-localhost',
          sourceVisualAssetId: 'capture-screenshot-aether-localhost',
          durationMs: 8000,
          width: 1080,
          height: 1920,
          mimeType: 'video/mp4',
          status: 'ready',
        },
      ],
    });
    expect(stagedClip?.provenance).toContainEqual({
      kind: 'image-to-video',
      ref: 'generated-clip-beat-demo-text-image-to-video',
    });

    const currentDraftClip = updated.drafts
      .find((draft) => draft.id === updated.currentDraftId)
      ?.tracks.flatMap((track) => track.clips)
      .find((clip) => clip.id === 'clip-beat-demo-text');
    expect(currentDraftClip?.assetId).toBe('capture-screenshot-aether-localhost');
    expect(currentDraftClip?.props.generatedVideoTakes).toHaveLength(1);

    expect(updated.graphNodes.find((node) => node.id === 'node-image-to-video-plan')).toMatchObject({
      kind: 'image-to-video',
      status: 'done',
      providerId: 'runway',
      inputRefs: ['clip-beat-demo-text', 'capture-screenshot-aether-localhost'],
      outputRefs: ['generated-clip-beat-demo-text-image-to-video'],
    });
  });
});

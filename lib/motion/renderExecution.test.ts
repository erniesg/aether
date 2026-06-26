import { describe, expect, it, vi } from 'vitest';
import {
  createHyperFramesRenderProvider,
  createRemotionRenderProvider,
  type MotionRenderRunnerResult,
} from '@/lib/providers/video/local-render';
import type { MotionRenderRequest } from '@/lib/providers/video/types';
import { executeMotionRender } from './renderExecution';
import { buildRepoLaunchMotionProject } from './storyboard';
import { materializeMotionTimeline } from './timeline';

function baseProject() {
  return buildRepoLaunchMotionProject({
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
  });
}

describe('executeMotionRender', () => {
  it('builds a render request, calls the provider, and applies render receipts', async () => {
    const render = vi.fn(async (request: MotionRenderRequest): Promise<MotionRenderRunnerResult> => ({
      outputs: request.outputs.map((output) => ({
        outputId: output.id,
        assetUrl: `asset://${output.path}`,
      })),
      provenance: [{ kind: 'provider', ref: 'remotion-cli' }],
    }));
    const provider = createRemotionRenderProvider({
      runner: { available: () => true, render },
    });

    const result = await executeMotionRender(materializeMotionTimeline(baseProject()), {
      engine: 'remotion',
      provider,
      requestedAt: 80,
      updatedAt: 90,
    });

    expect(result.status).toBe('rendered');
    expect(result.blockers).toEqual([]);
    expect(render).toHaveBeenCalledTimes(1);
    const renderedRequest = render.mock.calls[0]?.[0] as MotionRenderRequest;
    expect(renderedRequest).toMatchObject({
      id: 'render-plan-motion-aether-launch-draft-primary-remotion',
      projectId: 'motion-aether-launch',
      draftId: 'draft-primary',
      engine: 'remotion',
      compositionId: 'motion-aether-launch-draft-primary',
      fps: 30,
      durationFrames: 900,
    });
    expect(renderedRequest.tracks.map((track) => track.id)).toEqual([
      'track-text',
      'track-caption',
      'track-voice',
      'track-transition',
    ]);
    expect(renderedRequest.sourceFiles?.map((file) => file.path)).toEqual([
      'remotion/index.tsx',
      'DESIGN.md',
      'SCRIPT.md',
      'STORYBOARD.md',
      'timeline/draft-primary.json',
      'EDIT.md',
      'renders/motion-aether-launch/render-plan-motion-aether-launch-draft-primary-remotion.source-manifest.json',
    ]);
    expect(renderedRequest.sourceFiles?.[0]?.contents).toContain('registerRoot(RemotionRoot)');
    expect(renderedRequest.outputs.map((output) => output.id)).toEqual([
      'render-export-x-9x16-video',
      'render-export-x-9x16-poster',
      'render-export-x-9x16-subtitle',
      'render-export-x-9x16-transcript',
      'render-export-x-9x16-manifest',
    ]);

    const motionExport = result.project.exports.find((candidate) => candidate.id === 'export-x-9x16');
    expect(motionExport).toMatchObject({
      status: 'ready',
      assetId: 'render-export-x-9x16-video',
      posterAssetId: 'render-export-x-9x16-poster',
      subtitleAssetId: 'render-export-x-9x16-subtitle',
      transcriptAssetId: 'render-export-x-9x16-transcript',
      manifestAssetId: 'render-export-x-9x16-manifest',
    });

    const renderNode = result.project.graphNodes.find((node) => node.id === 'node-render-plan-remotion');
    expect(renderNode).toMatchObject({
      kind: 'render',
      status: 'done',
      providerId: 'remotion-local',
      inputRefs: [
        'track-text',
        'track-caption',
        'track-voice',
        'track-transition',
        'export-x-9x16',
      ],
    });
    expect(renderNode?.outputRefs).toContain('render-export-x-9x16-video');
    expect(result.renderResult?.providerId).toBe('remotion-local');
    expect(result.request?.outputs).toHaveLength(5);
    expect(result.project.executionHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'execution-render-remotion-local-90',
          gateId: 'render',
          label: 'Render proof',
          receiptLabels: ['MP4', 'Poster', 'Subtitles', 'Transcript', 'Manifest'],
        }),
        expect.objectContaining({
          id: 'execution-render-package-remotion-local-render-plan-motion-aether-launch-draft-primary-remotion-90',
          gateId: 'render',
          label: 'Render package verification',
          providerId: 'remotion-local',
          receiptLabels: [
            'Render source manifest',
            'Render one-frame layout check',
            'MP4 artifact check',
            'Poster artifact check',
            'Subtitles artifact check',
            'Transcript artifact check',
            'Manifest artifact check',
          ],
          receipts: expect.arrayContaining([
            expect.objectContaining({
              label: 'Render one-frame layout check',
              ref: 'render-plan-motion-aether-launch-draft-primary-remotion:verification:verify-remotion-still',
              path: 'renders/motion-aether-launch/render-plan-motion-aether-launch-draft-primary-remotion.verification.png',
            }),
            expect.objectContaining({
              label: 'MP4 artifact check',
              ref: 'render-plan-motion-aether-launch-draft-primary-remotion:artifact-check:render-export-x-9x16-video',
              path: 'renders/motion-aether-launch/export-x-9x16/video.mp4',
            }),
          ]),
        }),
      ])
    );
  });

  it('returns timeline blockers instead of calling a provider when render inputs are missing', async () => {
    const render = vi.fn(async (): Promise<MotionRenderRunnerResult> => ({
      outputs: [],
      provenance: [],
    }));
    const provider = createRemotionRenderProvider({
      runner: { available: () => true, render },
    });
    const project = baseProject();

    const result = await executeMotionRender(project, {
      engine: 'remotion',
      provider,
      requestedAt: 81,
    });

    expect(result).toMatchObject({
      status: 'blocked',
      project,
      blockers: [{ id: 'timeline-required', label: 'Materialize timeline before render' }],
    });
    expect(result.request).toBeUndefined();
    expect(result.renderResult).toBeUndefined();
    expect(render).not.toHaveBeenCalled();
  });

  it('saves HyperFrames lint, validate, and snapshot package receipts', async () => {
    const render = vi.fn(async (request: MotionRenderRequest): Promise<MotionRenderRunnerResult> => ({
      outputs: request.outputs.map((output) => ({
        outputId: output.id,
        assetUrl: `asset://${output.path}`,
      })),
      provenance: [{ kind: 'provider', ref: 'hyperframes-cli' }],
    }));
    const provider = createHyperFramesRenderProvider({
      runner: { available: () => true, render },
    });

    const result = await executeMotionRender(materializeMotionTimeline(baseProject()), {
      engine: 'hyperframes',
      provider,
      requestedAt: 82,
      updatedAt: 92,
    });

    expect(result.status).toBe('rendered');
    expect(result.project.executionHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'execution-render-package-hyperframes-local-render-plan-motion-aether-launch-draft-primary-hyperframes-92',
          receiptLabels: expect.arrayContaining([
            'Lint HyperFrames composition',
            'Validate HyperFrames frames',
            'Capture one-frame layout check',
          ]),
          receipts: expect.arrayContaining([
            expect.objectContaining({
              label: 'Validate HyperFrames frames',
              ref: 'render-plan-motion-aether-launch-draft-primary-hyperframes:verification:verify-hyperframes-validate',
            }),
            expect.objectContaining({
              label: 'Capture one-frame layout check',
              path: 'renders/motion-aether-launch/render-plan-motion-aether-launch-draft-primary-hyperframes.verification.png',
            }),
          ]),
        }),
      ])
    );
  });
});

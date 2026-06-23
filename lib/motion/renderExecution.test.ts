import { describe, expect, it, vi } from 'vitest';
import { createRemotionRenderProvider, type MotionRenderRunnerResult } from '@/lib/providers/video/local-render';
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
});

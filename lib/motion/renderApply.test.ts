import { describe, expect, it } from 'vitest';
import type { MotionRenderResult } from '@/lib/providers/video/types';
import { buildMotionRenderPlan } from './renderPlan';
import { applyMotionRenderResultToMotionProject } from './renderApply';
import { buildRepoLaunchMotionProject } from './storyboard';
import { materializeMotionTimeline } from './timeline';

function projectWithRenderPlan() {
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
      platformTargets: [
        { platform: 'x', aspectRatio: '9:16', seconds: 30 },
        { platform: 'youtube', aspectRatio: '16:9', seconds: 45 },
      ],
      createdAt: 10,
    }),
    { updatedAt: 12 }
  );
  const renderPlan = buildMotionRenderPlan(project, {
    engine: 'remotion',
    requestedAt: 80,
  });

  return {
    ...project,
    graphNodes: renderPlan.renderNode
      ? [...project.graphNodes, renderPlan.renderNode]
      : project.graphNodes,
  };
}

function renderedAsset(
  exportId: string,
  kind: MotionRenderResult['outputs'][number]['kind'],
  assetUrl: string
): MotionRenderResult['outputs'][number] {
  const isVertical = exportId === 'export-x-9x16';
  const extension =
    kind === 'video'
      ? 'mp4'
      : kind === 'poster'
        ? 'png'
        : kind === 'manifest'
          ? 'json'
          : kind === 'subtitle'
            ? 'vtt'
            : 'txt';

  return {
    id: `render-${exportId}-${kind}`,
    exportId,
    kind,
    platform: isVertical ? 'x' : 'youtube',
    aspectRatio: isVertical ? '9:16' : '16:9',
    width: isVertical ? 1080 : 1920,
    height: isVertical ? 1920 : 1080,
    mimeType: kind === 'video' ? 'video/mp4' : 'application/octet-stream',
    path: `renders/motion-aether-launch/${exportId}/${kind}.${extension}`,
    assetUrl,
    provenance: [{ kind: 'provider', ref: 'remotion-local' }],
  };
}

function renderResultFor(exportId: string, assetBase: string): MotionRenderResult {
  return {
    providerId: 'remotion-local',
    engine: 'remotion',
    outputs: [
      renderedAsset(exportId, 'video', `${assetBase}/video.mp4`),
      renderedAsset(exportId, 'poster', `${assetBase}/poster.png`),
      renderedAsset(exportId, 'subtitle', `${assetBase}/subtitles.vtt`),
      renderedAsset(exportId, 'transcript', `${assetBase}/transcript.txt`),
      renderedAsset(exportId, 'manifest', `${assetBase}/manifest.json`),
    ],
    provenance: [{ kind: 'provider', ref: 'remotion-local' }],
  };
}

describe('applyMotionRenderResultToMotionProject', () => {
  it('turns render receipts into ready export assets without touching other targets', () => {
    const updated = applyMotionRenderResultToMotionProject(
      projectWithRenderPlan(),
      renderResultFor('export-x-9x16', 'asset://renders/x'),
      { updatedAt: 90 }
    );

    expect(updated.updatedAt).toBe(90);

    expect(updated.exports.find((motionExport) => motionExport.id === 'export-x-9x16')).toMatchObject({
      status: 'ready',
      assetId: 'render-export-x-9x16-video',
      posterAssetId: 'render-export-x-9x16-poster',
      subtitleAssetId: 'render-export-x-9x16-subtitle',
      transcriptAssetId: 'render-export-x-9x16-transcript',
      manifestAssetId: 'render-export-x-9x16-manifest',
    });
    expect(
      updated.exports.find((motionExport) => motionExport.id === 'export-x-9x16')?.provenance
    ).toContainEqual({ kind: 'render', ref: 'render-export-x-9x16-video' });
    const untouchedExport = updated.exports.find(
      (motionExport) => motionExport.id === 'export-youtube-16x9'
    );
    expect(untouchedExport?.status).toBe('planned');
    expect(untouchedExport?.assetId).toBeUndefined();

    const renderNode = updated.graphNodes.find((node) => node.id === 'node-render-plan-remotion');
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
        'export-youtube-16x9',
      ],
    });
    expect(renderNode?.outputRefs).toEqual(
      expect.arrayContaining([
        'render-export-x-9x16-video',
        'render-export-x-9x16-poster',
        'render-export-x-9x16-subtitle',
        'render-export-x-9x16-transcript',
        'render-export-x-9x16-manifest',
        'render-export-youtube-16x9-video',
      ])
    );
    expect(renderNode?.provenance).toContainEqual({
      kind: 'render',
      ref: 'render-export-x-9x16-video',
    });
  });

  it('merges render receipts across separately completed export targets', () => {
    const afterVertical = applyMotionRenderResultToMotionProject(
      projectWithRenderPlan(),
      renderResultFor('export-x-9x16', 'asset://renders/x'),
      { updatedAt: 90 }
    );
    const afterWide = applyMotionRenderResultToMotionProject(
      afterVertical,
      renderResultFor('export-youtube-16x9', 'asset://renders/youtube'),
      { updatedAt: 91 }
    );

    expect(afterWide.exports.find((motionExport) => motionExport.id === 'export-youtube-16x9')).toMatchObject({
      status: 'ready',
      assetId: 'render-export-youtube-16x9-video',
      posterAssetId: 'render-export-youtube-16x9-poster',
      subtitleAssetId: 'render-export-youtube-16x9-subtitle',
      transcriptAssetId: 'render-export-youtube-16x9-transcript',
      manifestAssetId: 'render-export-youtube-16x9-manifest',
    });

    const renderNode = afterWide.graphNodes.find((node) => node.id === 'node-render-plan-remotion');
    expect(renderNode).toMatchObject({
      status: 'done',
      providerId: 'remotion-local',
    });
    expect(renderNode?.outputRefs).toEqual(
      expect.arrayContaining([
        'render-export-x-9x16-video',
        'render-export-youtube-16x9-video',
        'render-export-youtube-16x9-manifest',
      ])
    );
  });
});

import { describe, expect, it } from 'vitest';
import type { MotionRenderResult } from '@/lib/providers/video/types';
import { applyMotionRenderResultToMotionProject } from './renderApply';
import { buildRepoLaunchMotionProject } from './storyboard';
import { materializeMotionTimeline } from './timeline';
import { buildMotionExportPackPlan } from './exportPackPlan';

function project() {
  return materializeMotionTimeline(
    buildRepoLaunchMotionProject({
      id: 'motion-aether-launch',
      workspaceId: 'demo-ws',
      projectKind: 'launch',
      workflowMode: 'review',
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
      platformTargets: [
        { platform: 'x', aspectRatio: '9:16', seconds: 30 },
        { platform: 'youtube', aspectRatio: '16:9', seconds: 45 },
      ],
      createdAt: 80,
    }),
    { updatedAt: 81 }
  );
}

function renderedAsset(
  exportId: string,
  kind: MotionRenderResult['outputs'][number]['kind']
): MotionRenderResult['outputs'][number] {
  const isVertical = exportId === 'export-x-9x16';
  const extension =
    kind === 'video'
      ? 'mp4'
      : kind === 'poster'
        ? 'png'
        : kind === 'subtitle'
          ? 'vtt'
          : kind === 'manifest'
            ? 'json'
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
    assetUrl: `asset://renders/${exportId}/${kind}.${extension}`,
    provenance: [{ kind: 'provider', ref: 'remotion-local' }],
  };
}

function renderResultFor(exportId: string): MotionRenderResult {
  return {
    providerId: 'remotion-local',
    engine: 'remotion',
    outputs: [
      renderedAsset(exportId, 'video'),
      renderedAsset(exportId, 'poster'),
      renderedAsset(exportId, 'subtitle'),
      renderedAsset(exportId, 'transcript'),
      renderedAsset(exportId, 'manifest'),
    ],
    provenance: [{ kind: 'provider', ref: 'remotion-local' }],
  };
}

describe('buildMotionExportPackPlan', () => {
  it('returns render blockers and missing artifact kinds before exports are ready', () => {
    const plan = buildMotionExportPackPlan(project(), { requestedAt: 300 });

    expect(plan).toMatchObject({
      id: 'export-pack-motion-aether-launch-draft-primary',
      projectId: 'motion-aether-launch',
      draftId: 'draft-primary',
      status: 'needs-render',
      readyCount: 0,
      totalCount: 2,
      requestedAt: 300,
      manifest: null,
      blockers: [
        {
          id: 'render-required',
          label: 'Render every export target before packaging',
        },
      ],
    });
    expect(plan.items.map((item) => item.exportId)).toEqual([
      'export-x-9x16',
      'export-youtube-16x9',
    ]);
    expect(plan.items[0]).toMatchObject({
      platform: 'x',
      aspectRatio: '9:16',
      status: 'planned',
      missingAssetKinds: ['video', 'poster', 'subtitle', 'transcript', 'manifest'],
      canvasDrop: null,
    });
  });

  it('marks partial packs while preserving the ready canvas drop candidate', () => {
    const rendered = applyMotionRenderResultToMotionProject(
      project(),
      renderResultFor('export-x-9x16'),
      { updatedAt: 310 }
    );

    const plan = buildMotionExportPackPlan(rendered, { requestedAt: 311 });

    expect(plan.status).toBe('needs-render');
    expect(plan.readyCount).toBe(1);
    expect(plan.totalCount).toBe(2);
    expect(plan.items[0]).toMatchObject({
      exportId: 'export-x-9x16',
      status: 'ready',
      videoAssetId: 'render-export-x-9x16-video',
      posterAssetId: 'render-export-x-9x16-poster',
      subtitleAssetId: 'render-export-x-9x16-subtitle',
      transcriptAssetId: 'render-export-x-9x16-transcript',
      manifestAssetId: 'render-export-x-9x16-manifest',
      missingAssetKinds: [],
      canvasDrop: {
        kind: 'video',
        exportId: 'export-x-9x16',
        label: 'x 9:16 MP4',
        targetLabel: 'x 9:16',
        assetId: 'render-export-x-9x16-video',
        url: 'asset://renders/export-x-9x16/video.mp4',
        path: 'renders/motion-aether-launch/export-x-9x16/video.mp4',
        width: 1080,
        height: 1920,
        mimeType: 'video/mp4',
        posterAssetId: 'render-export-x-9x16-poster',
        subtitleAssetId: 'render-export-x-9x16-subtitle',
        transcriptAssetId: 'render-export-x-9x16-transcript',
        sourceManifestAssetId: 'render-export-x-9x16-manifest',
        exportPackManifestId: null,
      },
    });
    expect(plan.items[1]).toMatchObject({
      exportId: 'export-youtube-16x9',
      missingAssetKinds: ['video', 'poster', 'subtitle', 'transcript', 'manifest'],
    });
    expect(plan.manifest).toBeNull();
  });

  it('builds a ready export pack manifest when every target has render receipts', () => {
    const afterVertical = applyMotionRenderResultToMotionProject(
      project(),
      renderResultFor('export-x-9x16'),
      { updatedAt: 310 }
    );
    const fullyRendered = applyMotionRenderResultToMotionProject(
      afterVertical,
      renderResultFor('export-youtube-16x9'),
      { updatedAt: 311 }
    );

    const plan = buildMotionExportPackPlan(fullyRendered, { requestedAt: 312 });

    expect(plan).toMatchObject({
      status: 'ready',
      readyCount: 2,
      totalCount: 2,
      blockers: [],
      manifest: {
        id: 'export-pack-motion-aether-launch-draft-primary-manifest',
        path: 'export-packs/motion-aether-launch/draft-primary/manifest.json',
        mimeType: 'application/json',
        exportIds: ['export-x-9x16', 'export-youtube-16x9'],
      },
    });
    expect(plan.items.every((item) => item.status === 'ready')).toBe(true);
    expect(plan.items.every((item) => item.canvasDrop?.kind === 'video')).toBe(true);
    expect(plan.items[0]?.canvasDrop).toMatchObject({
      kind: 'video',
      exportId: 'export-x-9x16',
      label: 'x 9:16 MP4',
      targetLabel: 'x 9:16',
      assetId: 'render-export-x-9x16-video',
      url: 'asset://renders/export-x-9x16/video.mp4',
      path: 'renders/motion-aether-launch/export-x-9x16/video.mp4',
      width: 1080,
      height: 1920,
      mimeType: 'video/mp4',
      posterAssetId: 'render-export-x-9x16-poster',
      subtitleAssetId: 'render-export-x-9x16-subtitle',
      transcriptAssetId: 'render-export-x-9x16-transcript',
      sourceManifestAssetId: 'render-export-x-9x16-manifest',
      exportPackManifestId: 'export-pack-motion-aether-launch-draft-primary-manifest',
    });
    expect(plan.items[1]?.canvasDrop).toMatchObject({
      exportId: 'export-youtube-16x9',
      label: 'youtube 16:9 MP4',
      targetLabel: 'youtube 16:9',
      width: 1920,
      height: 1080,
      exportPackManifestId: 'export-pack-motion-aether-launch-draft-primary-manifest',
    });
    expect(plan.provenance).toContainEqual({
      kind: 'render',
      ref: 'render-export-x-9x16-video',
    });
  });

  it('returns a target blocker when no export targets exist', () => {
    const noTargets = {
      ...project(),
      exports: [],
      brief: {
        ...project().brief,
        platformTargets: [],
      },
    };

    const plan = buildMotionExportPackPlan(noTargets, { requestedAt: 313 });

    expect(plan).toMatchObject({
      status: 'needs-targets',
      readyCount: 0,
      totalCount: 0,
      items: [],
      manifest: null,
      blockers: [
        {
          id: 'export-targets-required',
          label: 'Add at least one export target before packaging',
        },
      ],
    });
  });
});

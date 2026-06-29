import { describe, expect, it, vi } from 'vitest';
import { dropVideoOnCanvas } from './dropVideo';

function makeEditor() {
  return {
    createAssets: vi.fn(),
    getViewportPageBounds: () => ({ w: 2000, h: 1200, midX: 1000, midY: 600 }),
    createShape: vi.fn(),
    select: vi.fn(),
    zoomToSelection: vi.fn(),
  };
}

describe('dropVideoOnCanvas', () => {
  it('creates a video asset + shape scaled to the viewport', () => {
    const editor = makeEditor();
    const id = dropVideoOnCanvas(editor as never, {
      url: 'https://cdn.example/motion.mp4',
      width: 1080,
      height: 1920,
      label: 'quote cascade',
    });

    expect(typeof id).toBe('string');
    const [[asset]] = editor.createAssets.mock.calls[0]!;
    expect(asset.type).toBe('video');
    expect(asset.props.src).toBe('https://cdn.example/motion.mp4');
    expect(asset.props.name).toBe('quote cascade');
    expect(asset.props.mimeType).toBe('video/mp4');

    const shape = editor.createShape.mock.calls[0]![0];
    expect(shape.type).toBe('video');
    expect(shape.props.assetId).toBe(asset.id);
    // 1080×1920 into a 1200-high viewport: scaled down, ratio kept.
    expect(shape.props.h).toBeLessThanOrEqual(1200 * 0.7);
    expect(shape.props.w / shape.props.h).toBeCloseTo(1080 / 1920, 2);

    expect(editor.select).toHaveBeenCalledWith(shape.id);
    expect(editor.zoomToSelection).toHaveBeenCalled();
  });

  it('marks provenance meta on the shape', () => {
    const editor = makeEditor();
    dropVideoOnCanvas(editor as never, {
      url: 'https://cdn.example/motion.mp4',
      width: 1080,
      height: 1920,
      briefId: 'evt-1-quotes',
    });
    const shape = editor.createShape.mock.calls[0]![0];
    expect(shape.meta.aetherRole).toBe('motion-asset');
    expect(shape.meta.aetherMotionBriefId).toBe('evt-1-quotes');
  });

  it('preserves export pack sidecar metadata on the asset and shape', () => {
    const editor = makeEditor();
    dropVideoOnCanvas(editor as never, {
      url: 'asset://renders/export-x-9x16/video.mp4',
      width: 1080,
      height: 1920,
      label: 'x 9:16 MP4',
      motionProjectId: 'motion-aether-launch',
      exportId: 'export-x-9x16',
      sourceAssetId: 'render-export-x-9x16-video',
      posterAssetId: 'render-export-x-9x16-poster',
      subtitleAssetId: 'render-export-x-9x16-subtitle',
      transcriptAssetId: 'render-export-x-9x16-transcript',
      sourceManifestAssetId: 'render-export-x-9x16-manifest',
      exportPackManifestId: 'export-pack-motion-aether-launch-draft-primary-manifest',
      targetLabel: 'x 9:16',
    });

    const [[asset]] = editor.createAssets.mock.calls[0]!;
    const shape = editor.createShape.mock.calls[0]![0];
    expect(asset.meta).toMatchObject({
      aetherRole: 'motion-asset',
      aetherMotionProjectId: 'motion-aether-launch',
      aetherMotionExportId: 'export-x-9x16',
      aetherMotionSourceAssetId: 'render-export-x-9x16-video',
      aetherMotionPosterAssetId: 'render-export-x-9x16-poster',
      aetherMotionSubtitleAssetId: 'render-export-x-9x16-subtitle',
      aetherMotionTranscriptAssetId: 'render-export-x-9x16-transcript',
      aetherMotionSourceManifestAssetId: 'render-export-x-9x16-manifest',
      aetherMotionExportPackManifestId: 'export-pack-motion-aether-launch-draft-primary-manifest',
      aetherMotionTargetLabel: 'x 9:16',
    });
    expect(shape.meta).toMatchObject(asset.meta);
  });
});

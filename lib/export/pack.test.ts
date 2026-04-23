import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { buildExportPack, type ExportArtboardInput } from './pack';
import { manifestSchema } from './manifest';

// Minimal valid PNG: 1x1 transparent. Reused across cases so tests stay cheap.
const TINY_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

function artboard(overrides: Partial<ExportArtboardInput> = {}): ExportArtboardInput {
  return {
    id: 'ig-post',
    label: 'IG Post',
    aspectRatio: '4:5',
    prompt: 'neon hero',
    capabilityRunIds: ['run_1'],
    provider: 'openai',
    model: 'gpt-image-1',
    png: TINY_PNG,
    ...overrides,
  };
}

describe('buildExportPack', () => {
  it('writes one PNG per artboard plus manifest.json at the archive root', async () => {
    const result = await buildExportPack({
      workspaceId: 'demo-ws',
      artboards: [
        artboard({ id: 'ig-post', label: 'IG Post', aspectRatio: '4:5' }),
        artboard({
          id: 'story',
          label: 'Story',
          aspectRatio: '9:16',
          capabilityRunIds: ['run_2'],
        }),
      ],
      pinnedSkills: [{ definitionId: 'cap_1', name: 'neon drench' }],
      brandTokens: { palette: ['#dd4a1e'], typography: ['Inter', 'Fraunces'] },
      now: new Date('2026-04-23T00:00:00Z'),
    });

    expect(result.filenames).toEqual(['ig-post.png', 'story.png', 'manifest.json']);
    expect(result.manifest.generatedAt).toBe('2026-04-23T00:00:00.000Z');
    expect(result.manifest.workspaceId).toBe('demo-ws');
    expect(result.manifest.formats.map((f) => f.filename)).toEqual([
      'ig-post.png',
      'story.png',
    ]);
    expect(result.manifest.pinnedSkills[0]?.name).toBe('neon drench');
    expect(result.manifest.brandTokens.palette).toEqual(['#dd4a1e']);

    const archive = await JSZip.loadAsync(result.zip);
    expect(Object.keys(archive.files).sort()).toEqual([
      'ig-post.png',
      'manifest.json',
      'story.png',
    ]);

    const manifestJson = await archive.file('manifest.json')!.async('string');
    const parsed = manifestSchema.parse(JSON.parse(manifestJson));
    expect(parsed.formats[0]?.capabilityRunIds).toEqual(['run_1']);
    expect(parsed.formats[1]?.capabilityRunIds).toEqual(['run_2']);

    const pngBytes = await archive.file('ig-post.png')!.async('uint8array');
    expect(pngBytes.slice(0, 8)).toEqual(TINY_PNG.slice(0, 8));
  });

  it('slugifies ids and dedupes collisions', async () => {
    const result = await buildExportPack({
      workspaceId: 'demo-ws',
      artboards: [
        artboard({ id: 'shape:ABC 123', filenameHint: 'Hero Frame' }),
        artboard({ id: 'shape:DEF 456', filenameHint: 'Hero Frame' }),
      ],
    });

    expect(result.manifest.formats.map((f) => f.filename)).toEqual([
      'hero-frame.png',
      'hero-frame-2.png',
    ]);
  });

  it('defaults brandTokens and pinnedSkills to empty collections', async () => {
    const result = await buildExportPack({
      workspaceId: 'demo-ws',
      artboards: [],
    });
    expect(result.manifest.formats).toEqual([]);
    expect(result.manifest.pinnedSkills).toEqual([]);
    expect(result.manifest.brandTokens).toEqual({ palette: [], typography: [] });

    const archive = await JSZip.loadAsync(result.zip);
    expect(archive.file('manifest.json')).toBeTruthy();
  });
});

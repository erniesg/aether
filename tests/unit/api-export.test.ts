import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { POST } from '@/app/api/export/route';
import { manifestSchema } from '@/app/api/export/schema';

const TINY_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);
const TINY_PNG_B64 = Buffer.from(TINY_PNG).toString('base64');

function postJson(body: unknown): Request {
  return new Request('http://test.local/api/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/export', () => {
  it('returns 400 when the body is not valid JSON', async () => {
    const res = await POST(
      new Request('http://test.local/api/export', {
        method: 'POST',
        body: 'not-json',
        headers: { 'Content-Type': 'application/json' },
      })
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await POST(postJson({ workspaceId: 'demo-ws' }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/artboardIds|artboards/);
  });

  it('returns 400 when artboardIds references an id missing from artboards', async () => {
    const res = await POST(
      postJson({
        workspaceId: 'demo-ws',
        artboardIds: ['ig-post', 'story'],
        artboards: [
          {
            id: 'ig-post',
            label: 'IG Post',
            aspectRatio: '4:5',
            prompt: 'hero',
            capabilityRunIds: [],
            provider: 'openai',
            model: 'gpt-image-1',
            pngBase64: TINY_PNG_B64,
          },
        ],
      })
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('story');
  });

  it('streams a zip with one PNG per artboard plus a schema-valid manifest.json', async () => {
    const res = await POST(
      postJson({
        workspaceId: 'demo-ws',
        artboardIds: ['ig-post', 'story'],
        artboards: [
          {
            id: 'ig-post',
            label: 'IG Post',
            aspectRatio: '4:5',
            prompt: 'neon product portrait',
            capabilityRunIds: ['run_1'],
            provider: 'openai',
            model: 'gpt-image-1',
            pngBase64: TINY_PNG_B64,
          },
          {
            id: 'story',
            label: 'Story',
            aspectRatio: '9:16',
            prompt: 'neon product portrait',
            capabilityRunIds: ['run_2'],
            provider: 'openai',
            model: 'gpt-image-1',
            pngBase64: `data:image/png;base64,${TINY_PNG_B64}`,
          },
        ],
        pinnedSkills: [{ definitionId: 'cap_1', name: 'neon drench' }],
        brandTokens: { palette: ['#dd4a1e'], typography: ['Inter', 'Fraunces'] },
      })
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/zip');
    expect(res.headers.get('Content-Disposition')).toContain('aether-demo-ws.zip');

    const archive = await JSZip.loadAsync(await res.arrayBuffer());
    expect(Object.keys(archive.files).sort()).toEqual([
      'ig-post.png',
      'manifest.json',
      'story.png',
    ]);

    const manifest = manifestSchema.parse(
      JSON.parse(await archive.file('manifest.json')!.async('string'))
    );
    expect(manifest.workspaceId).toBe('demo-ws');
    expect(manifest.formats.map((f) => f.id)).toEqual(['ig-post', 'story']);
    expect(manifest.formats[0]?.filename).toBe('ig-post.png');
    expect(manifest.pinnedSkills).toEqual([
      { definitionId: 'cap_1', name: 'neon drench' },
    ]);
    expect(manifest.brandTokens.palette).toEqual(['#dd4a1e']);

    const pngBytes = await archive.file('ig-post.png')!.async('uint8array');
    expect(pngBytes.slice(0, 8)).toEqual(TINY_PNG.slice(0, 8));
  });
});

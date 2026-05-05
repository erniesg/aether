import { describe, expect, it } from 'vitest';
import { buildExportRequestBody } from './client';
import type { CapabilityRunRecord } from '@/lib/store/runs.types';
import type { RunDetailsRecord } from '@/lib/store/runDetails';

const TINY_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZwkmBYAAAAASUVORK5CYII=';
const TINY_B64 = TINY_DATA_URL.slice(TINY_DATA_URL.indexOf(',') + 1);

function run(overrides: Partial<CapabilityRunRecord>): CapabilityRunRecord {
  return {
    id: 'run_x',
    tool: 'image-gen',
    provider: 'openai',
    model: 'gpt-image-1',
    prompt: 'hero',
    status: 'ok',
    startedAt: 0,
    ...overrides,
  };
}

function details(
  runId: string,
  frames: Array<{ id: string; imageUrl?: string; updatedAt?: number }>
): RunDetailsRecord {
  return {
    runId,
    activities: [],
    frames: frames.map((f) => ({
      id: f.id,
      status: f.imageUrl ? 'placed' : 'error',
      updatedAt: f.updatedAt ?? 0,
      imageUrl: f.imageUrl,
    })),
  };
}

describe('buildExportRequestBody', () => {
  it('picks the latest completed run for each artboard', async () => {
    const runs = [
      run({ id: 'run_a', startedAt: 10, finishedAt: 20, rewrittenPrompt: 'older' }),
      run({ id: 'run_b', startedAt: 30, finishedAt: 40, rewrittenPrompt: 'newer' }),
    ];
    const runDetails = [
      details('run_a', [{ id: 'ig-post', imageUrl: TINY_DATA_URL, updatedAt: 20 }]),
      details('run_b', [{ id: 'ig-post', imageUrl: TINY_DATA_URL, updatedAt: 40 }]),
    ];

    const { body, skipped } = await buildExportRequestBody({
      workspaceId: 'demo-ws',
      artboards: [{ id: 'ig-post', label: 'IG Post', aspectRatio: '4:5' }],
      runs,
      runDetails,
      pinnedSkills: [],
    });

    expect(skipped).toEqual([]);
    expect(body.workspaceId).toBe('demo-ws');
    expect(body.artboardIds).toEqual(['ig-post']);
    const artboards = body.artboards as Array<{
      id: string;
      format?: string;
      locale?: string;
      platforms?: string[];
      prompt: string;
      pngBase64: string;
      capabilityRunIds: string[];
    }>;
    expect(artboards).toHaveLength(1);
    expect(artboards[0]?.format).toBe('4x5');
    expect(artboards[0]?.platforms).toEqual(['instagram', 'pinterest']);
    expect(artboards[0]?.prompt).toBe('newer');
    expect(artboards[0]?.pngBase64).toBe(TINY_B64);
    expect(artboards[0]?.capabilityRunIds.sort()).toEqual(['run_a', 'run_b']);
  });

  it('reports artboards with no completed generation as skipped', async () => {
    const result = await buildExportRequestBody({
      workspaceId: 'demo-ws',
      artboards: [
        { id: 'ig-post', label: 'IG Post', aspectRatio: '4:5' },
        { id: 'story', label: 'Story', aspectRatio: '9:16' },
      ],
      runs: [run({ id: 'run_a', finishedAt: 10 })],
      runDetails: [
        details('run_a', [{ id: 'ig-post', imageUrl: TINY_DATA_URL, updatedAt: 10 }]),
      ],
      pinnedSkills: [],
    });

    expect(result.skipped).toEqual(['story']);
    expect((result.body.artboardIds as string[]).sort()).toEqual(['ig-post']);
  });

  it('uses a live canvas render when one is provided', async () => {
    const canvasB64 = 'Y2FudmFzLWVkaXRz';
    const jpegB64 = 'anBlZy1lZGl0cw==';
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"><text>Editable</text></svg>';
    const { body, skipped } = await buildExportRequestBody({
      workspaceId: 'demo-ws',
      artboards: [{ id: 'ig-post', label: 'IG Post', aspectRatio: '4:5' }],
      runs: [run({ id: 'run_a', finishedAt: 10 })],
      runDetails: [
        details('run_a', [{ id: 'ig-post', imageUrl: TINY_DATA_URL, updatedAt: 10 }]),
      ],
      pinnedSkills: [],
      renderArtboardPngBase64: async () => canvasB64,
      renderArtboardJpegBase64: async () => jpegB64,
      renderArtboardSvg: async () => ({ svg, width: 1080, height: 1350 }),
      locale: 'zh-Hans-SG',
      locales: ['en-SG', 'zh-Hans-SG'],
      languageMode: 'single',
    });

    expect(skipped).toEqual([]);
    const artboards = body.artboards as Array<{
      pngBase64: string;
      jpegBase64?: string;
      svg?: string;
      locale?: string;
      locales?: string[];
      languageMode?: string;
      width?: number;
      height?: number;
    }>;
    expect(artboards[0]?.pngBase64).toBe(canvasB64);
    expect(artboards[0]?.jpegBase64).toBe(jpegB64);
    expect(artboards[0]?.svg).toBe(svg);
    expect(artboards[0]?.locale).toBe('zh-Hans-SG');
    expect(artboards[0]?.locales).toEqual(['zh-Hans-SG']);
    expect(artboards[0]?.languageMode).toBe('single');
    expect(artboards[0]?.width).toBe(1080);
    expect(artboards[0]?.height).toBe(1350);
  });

  it('marks multilingual exports with selected locales', async () => {
    const { body } = await buildExportRequestBody({
      workspaceId: 'demo-ws',
      artboards: [{ id: 'story', label: 'Story', aspectRatio: '9:16' }],
      runs: [run({ id: 'run_a', finishedAt: 10 })],
      runDetails: [
        details('run_a', [{ id: 'story', imageUrl: TINY_DATA_URL, updatedAt: 10 }]),
      ],
      pinnedSkills: [],
      locale: 'ja-JP',
      locales: ['en-SG', 'zh-Hans-SG', 'ja-JP'],
      languageMode: 'multilingual',
    });

    const artboards = body.artboards as Array<{
      locale?: string;
      locales?: string[];
      languageMode?: string;
      format?: string;
    }>;
    expect(artboards[0]?.locale).toBe('multilingual');
    expect(artboards[0]?.locales).toEqual(['en-SG', 'zh-Hans-SG', 'ja-JP']);
    expect(artboards[0]?.languageMode).toBe('multilingual');
    expect(artboards[0]?.format).toBe('9x16');
  });
});

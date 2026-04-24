import { describe, expect, it, vi } from 'vitest';
import {
  findLinkedVariants,
  propagateEditAcrossVariants,
  type LinkedVariant,
} from './linkedVariants';

interface MockShape {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

function makeEditor(shapes: MockShape[], assets: Record<string, MockShape>) {
  const frameChildren: Record<string, string[]> = {};
  for (const s of shapes) {
    const parent = (s as { parentId?: string }).parentId;
    if (parent) {
      (frameChildren[parent] ??= []).push(s.id);
    }
  }
  return {
    getCurrentPageShapes: vi.fn(() => shapes),
    getShape: vi.fn((id: string) => shapes.find((s) => s.id === id)),
    getAsset: vi.fn((id: string) => assets[id]),
    getSortedChildIdsForParent: vi.fn((id: string) => frameChildren[id] ?? []),
  };
}

describe('findLinkedVariants', () => {
  it('returns empty when the page has only the source frame', () => {
    const editor = makeEditor(
      [
        {
          id: 'frame-a',
          type: 'frame',
          props: { name: 'IG Post · 1080×1350', w: 1080, h: 1350 },
          meta: { aetherPreset: 'ig-post' },
        },
      ],
      {}
    );
    const out = findLinkedVariants(editor as never, 'frame-a');
    expect(out).toEqual([]);
  });

  it('returns each sibling frame with its first image child and resolved preset', () => {
    const image1 = {
      id: 'img-1',
      type: 'image',
      parentId: 'frame-b',
      props: { assetId: 'asset-1' },
    } as MockShape & { parentId: string };
    const image2 = {
      id: 'img-2',
      type: 'image',
      parentId: 'frame-c',
      props: { assetId: 'asset-2' },
    } as MockShape & { parentId: string };
    const frames: MockShape[] = [
      {
        id: 'frame-a',
        type: 'frame',
        props: { name: 'IG Post · 1080×1350', w: 1080, h: 1350 },
        meta: { aetherPreset: 'ig-post' },
      },
      {
        id: 'frame-b',
        type: 'frame',
        props: { name: 'Story · 1080×1920', w: 1080, h: 1920 },
        meta: { aetherPreset: 'story' },
      },
      {
        id: 'frame-c',
        type: 'frame',
        props: { name: 'LinkedIn · 1200×627', w: 1200, h: 627 },
        meta: { aetherPreset: 'linkedin-landscape' },
      },
    ];
    const editor = makeEditor(
      [...frames, image1, image2],
      {
        'asset-1': {
          id: 'asset-1',
          type: 'image',
          props: { src: 'https://cdn/story.png', w: 1080, h: 1920 },
        },
        'asset-2': {
          id: 'asset-2',
          type: 'image',
          props: { src: 'https://cdn/linkedin.png', w: 1200, h: 627 },
        },
      }
    );
    const out = findLinkedVariants(editor as never, 'frame-a');
    expect(out).toHaveLength(2);
    expect(out.map((v) => v.preset).sort()).toEqual(
      ['linkedin-landscape', 'story'].sort()
    );
    expect(out.map((v) => v.imageSourceUrl)).toEqual(
      expect.arrayContaining(['https://cdn/story.png', 'https://cdn/linkedin.png'])
    );
  });

  it('skips sibling frames that have no image children', () => {
    const editor = makeEditor(
      [
        {
          id: 'frame-a',
          type: 'frame',
          props: { name: 'IG Post', w: 1080, h: 1350 },
          meta: { aetherPreset: 'ig-post' },
        },
        {
          id: 'frame-b',
          type: 'frame',
          props: { name: 'Story', w: 1080, h: 1920 },
          meta: { aetherPreset: 'story' },
        },
      ],
      {}
    );
    const out = findLinkedVariants(editor as never, 'frame-a');
    expect(out).toEqual([]);
  });

  it('skips image shapes whose asset is missing', () => {
    const editor = makeEditor(
      [
        {
          id: 'frame-a',
          type: 'frame',
          props: { name: 'IG', w: 1080, h: 1350 },
          meta: { aetherPreset: 'ig-post' },
        },
        {
          id: 'frame-b',
          type: 'frame',
          props: { name: 'Story', w: 1080, h: 1920 },
          meta: { aetherPreset: 'story' },
        },
        {
          id: 'img-b',
          type: 'image',
          parentId: 'frame-b',
          props: { assetId: 'missing' },
        } as MockShape & { parentId: string },
      ],
      {}
    );
    const out = findLinkedVariants(editor as never, 'frame-a');
    expect(out).toEqual([]);
  });
});

describe('propagateEditAcrossVariants', () => {
  const variants: LinkedVariant[] = [
    {
      frameId: 'f1',
      frameName: 'Story',
      frameWidth: 1080,
      frameHeight: 1920,
      preset: 'story',
      imageShapeId: 's1',
      imageAssetId: 'a1',
      imageSourceUrl: 'https://cdn/story.png',
    },
    {
      frameId: 'f2',
      frameName: 'LinkedIn',
      frameWidth: 1200,
      frameHeight: 627,
      preset: 'linkedin-landscape',
      imageShapeId: 's2',
      imageAssetId: 'a2',
      imageSourceUrl: 'https://cdn/linkedin.png',
    },
  ];

  it('fires one /api/generate/edit per variant with its preset', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockImplementation(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          images: [{ url: 'https://cdn/edit.png', width: 512, height: 512, mimeType: 'image/png' }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const results = await propagateEditAcrossVariants(variants, 'replace sky with sunset', fetchMock);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const call of fetchMock.mock.calls) {
      const [url, init] = call;
      expect(url).toBe('/api/generate/edit');
      expect(init?.method).toBe('POST');
    }
    const bodies = fetchMock.mock.calls.map((c) => JSON.parse(c[1]?.body as string));
    expect(bodies.map((b) => b.preset).sort()).toEqual(
      ['linkedin-landscape', 'story'].sort()
    );
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it('returns a per-variant error when a response is not ok', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ok: true, images: [{ url: 'https://cdn/edit.png', width: 1, height: 1, mimeType: 'image/png' }] }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: false, error: 'provider down' }), { status: 503 })
      );

    const results = await propagateEditAcrossVariants(variants, 'x', fetchMock);
    const ok = results.filter((r) => r.ok);
    const bad = results.filter((r) => !r.ok);
    expect(ok).toHaveLength(1);
    expect(bad).toHaveLength(1);
    expect(bad[0]?.error).toMatch(/provider down/);
  });

  it('returns an error on thrown fetches (network error)', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockRejectedValue(new Error('net'));
    const results = await propagateEditAcrossVariants([variants[0]!], 'x', fetchMock);
    expect(results[0]?.ok).toBe(false);
    expect(results[0]?.error).toMatch(/net/);
  });
});

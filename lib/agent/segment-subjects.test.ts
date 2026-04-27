import { describe, expect, it, vi } from 'vitest';
import {
  ONE_SHOT_PROMPTS,
  componentKindToForbiddenKind,
  segmentSubjects,
  segmentSubjectsToForbiddenRegions,
  type SegmentSubjectsResult,
} from './segment-subjects';

describe('ONE_SHOT_PROMPTS', () => {
  it('covers face / subject / apparel / accessory / product / logo / background', () => {
    const kinds = new Set(ONE_SHOT_PROMPTS.map((p) => p.componentKind));
    expect(kinds.has('face')).toBe(true);
    expect(kinds.has('subject')).toBe(true);
    expect(kinds.has('apparel')).toBe(true);
    expect(kinds.has('accessory')).toBe(true);
    expect(kinds.has('product')).toBe(true);
    expect(kinds.has('logo')).toBe(true);
    expect(kinds.has('background')).toBe(true);
  });

  it('places face first so it has highest priority on the planner side', () => {
    expect(ONE_SHOT_PROMPTS[0]).toMatchObject({
      prompt: 'face',
      componentKind: 'face',
    });
  });
});

describe('componentKindToForbiddenKind', () => {
  it('passes face / product / logo through identity', () => {
    expect(componentKindToForbiddenKind('face')).toBe('face');
    expect(componentKindToForbiddenKind('product')).toBe('product');
    expect(componentKindToForbiddenKind('logo')).toBe('logo');
  });

  it('maps everything else to "other" so the planner stays in its 4-kind taxonomy', () => {
    expect(componentKindToForbiddenKind('subject')).toBe('other');
    expect(componentKindToForbiddenKind('apparel')).toBe('other');
    expect(componentKindToForbiddenKind('accessory')).toBe('other');
    expect(componentKindToForbiddenKind('background')).toBe('other');
    expect(componentKindToForbiddenKind('other')).toBe('other');
  });
});

describe('segmentSubjects', () => {
  function buildOk(masks: Array<{ x: number; y: number; w: number; h: number; conf?: number }>) {
    return {
      ok: true,
      json: async () => ({
        raw: {
          masks: masks.map((m) => ({
            kind: 'face',
            bbox: { x: m.x, y: m.y, w: m.w, h: m.h },
            confidence: m.conf ?? 0.9,
          })),
        },
      }),
    } as unknown as Response;
  }

  function buildBad() {
    return {
      ok: false,
      json: async () => ({}),
    } as unknown as Response;
  }

  it('issues one POST per prompt and tags each returned mask with the prompt label + kind', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}'));
      // Echo the prompt back as a 1-mask result so we can assert tagging.
      return buildOk([{ x: body.prompt.length * 10, y: 0, w: 100, h: 100, conf: 0.8 }]);
    });

    const result = await segmentSubjects({
      imageUrl: 'https://cdn/x.png',
      prompts: [
        { prompt: 'face', componentKind: 'face' },
        { prompt: 'jacket', componentKind: 'apparel' },
      ],
      baseUrl: 'http://api',
      width: 1024,
      height: 1024,
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.prompted).toBe(2);
    expect(result.matched).toBe(2);
    expect(result.masks).toHaveLength(2);
    const face = result.masks.find((m) => m.label === 'face');
    const jacket = result.masks.find((m) => m.label === 'jacket');
    expect(face?.componentKind).toBe('face');
    expect(jacket?.componentKind).toBe('apparel');
    // Assert the request body shape so the SAM3 worker contract is honored.
    const firstBody = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
    expect(firstBody).toMatchObject({
      sourceUrl: 'https://cdn/x.png',
      mode: 'unmask',
      width: 1024,
      height: 1024,
      prompt: 'face',
    });
  });

  it('counts a prompt as matched only when SAM3 returns at least one mask', async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? '{}'));
      // 'jacket' returns a mask, 'background' returns empty (SAM3 didn't find one).
      if (body.prompt === 'background') return buildOk([]);
      return buildOk([{ x: 0, y: 0, w: 100, h: 100 }]);
    });

    const result = await segmentSubjects({
      imageUrl: 'https://cdn/x.png',
      prompts: [
        { prompt: 'jacket', componentKind: 'apparel' },
        { prompt: 'background', componentKind: 'background' },
      ],
      baseUrl: 'http://api',
      width: 1024,
      height: 1024,
      fetchImpl,
    });

    expect(result.prompted).toBe(2);
    expect(result.matched).toBe(1);
    expect(result.masks).toHaveLength(1);
    expect(result.masks[0].label).toBe('jacket');
  });

  it('absorbs per-prompt fetch failures without aborting the lap', async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? '{}'));
      if (body.prompt === 'logo') throw new Error('network down');
      if (body.prompt === 'product') return buildBad();
      return buildOk([{ x: 0, y: 0, w: 100, h: 100 }]);
    });

    const result = await segmentSubjects({
      imageUrl: 'https://cdn/x.png',
      prompts: [
        { prompt: 'face', componentKind: 'face' },
        { prompt: 'logo', componentKind: 'logo' },
        { prompt: 'product', componentKind: 'product' },
      ],
      baseUrl: 'http://api',
      width: 1024,
      height: 1024,
      fetchImpl,
    });

    expect(result.prompted).toBe(3);
    // Only 'face' returned a mask; the network and 4xx errors didn't crash.
    expect(result.matched).toBe(1);
    expect(result.masks.map((m) => m.label)).toEqual(['face']);
  });

  it('propagates multiple masks per prompt (e.g. two faces) with the same kind tag', async () => {
    const fetchImpl = vi.fn(async () =>
      buildOk([
        { x: 100, y: 100, w: 50, h: 50, conf: 0.95 },
        { x: 400, y: 100, w: 50, h: 50, conf: 0.92 },
      ])
    );

    const result = await segmentSubjects({
      imageUrl: 'https://cdn/x.png',
      prompts: [{ prompt: 'face', componentKind: 'face' }],
      baseUrl: 'http://api',
      width: 1024,
      height: 1024,
      fetchImpl,
    });

    expect(result.masks).toHaveLength(2);
    expect(result.masks.every((m) => m.componentKind === 'face')).toBe(true);
    expect(result.masks.every((m) => m.label === 'face')).toBe(true);
  });

  it('falls back to SAM2 salient-object when SAM3 fan-out returns 0 masks across every prompt', async () => {
    // Photographic heroes routinely return 0 masks from SAM3 grounding (the
    // problem the handoff calls out: masksOneShotMatched=0 every lap).
    // The fallback fires ONE /api/segment call with providerId='sam2',
    // mode='cutout' (no prompt — birefnet does salient-object detection).
    const fetchImpl = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? '{}'));
      // SAM3 fan-out: every prompt returns empty.
      if (body.providerId !== 'sam2') return buildOk([]);
      // SAM2 fallback: one mask with a real bbox.
      return {
        ok: true,
        json: async () => ({
          ok: true,
          provider: { id: 'sam2', model: 'men1scus/birefnet' },
          preview: {
            sourceDataUrl: 'data:image/png;base64,AA',
            maskDataUrl: 'data:image/png;base64,BB',
            cutoutDataUrl: 'data:image/png;base64,CC',
            width: 1024,
            height: 1024,
            bbox: { x: 200, y: 150, w: 600, h: 720 },
          },
        }),
      } as unknown as Response;
    });

    const result = await segmentSubjects({
      imageUrl: 'https://cdn/x.png',
      prompts: [
        { prompt: 'face', componentKind: 'face' },
        { prompt: 'product', componentKind: 'product' },
      ],
      baseUrl: 'http://api',
      width: 1024,
      height: 1024,
      fetchImpl,
    });

    // 2 fan-out prompts + 1 SAM2 fallback POST.
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const fallbackCall = fetchImpl.mock.calls.find((c) => {
      const b = JSON.parse(String(c[1]?.body ?? '{}'));
      return b.providerId === 'sam2';
    });
    expect(fallbackCall).toBeDefined();
    const fallbackBody = JSON.parse(String(fallbackCall![1]?.body));
    expect(fallbackBody).toMatchObject({
      providerId: 'sam2',
      mode: 'cutout',
      sourceUrl: 'https://cdn/x.png',
      width: 1024,
      height: 1024,
    });
    // No prompt — birefnet doesn't take one.
    expect(fallbackBody.prompt).toBeUndefined();

    // matched > 0 (the handoff verification metric) and the single mask is
    // tagged as a salient subject so the planner treats it as one.
    expect(result.matched).toBe(1);
    expect(result.masks).toHaveLength(1);
    expect(result.masks[0]).toMatchObject({
      componentKind: 'subject',
      bbox: { x: 200, y: 150, w: 600, h: 720 },
    });
  });

  it('does NOT fire SAM2 fallback when SAM3 already matched at least one prompt', async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? '{}'));
      if (body.prompt === 'face') return buildOk([{ x: 0, y: 0, w: 100, h: 100 }]);
      return buildOk([]);
    });

    await segmentSubjects({
      imageUrl: 'https://cdn/x.png',
      prompts: [
        { prompt: 'face', componentKind: 'face' },
        { prompt: 'logo', componentKind: 'logo' },
      ],
      baseUrl: 'http://api',
      width: 1024,
      height: 1024,
      fetchImpl,
    });

    // No call should have providerId='sam2' — fallback is silent only when needed.
    const sam2Calls = fetchImpl.mock.calls.filter((c) => {
      const b = JSON.parse(String(c[1]?.body ?? '{}'));
      return b.providerId === 'sam2';
    });
    expect(sam2Calls).toHaveLength(0);
  });

  it('uses full-image bbox when SAM2 fallback response omits bbox (still ticks matched>0)', async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? '{}'));
      if (body.providerId !== 'sam2') return buildOk([]);
      return {
        ok: true,
        json: async () => ({
          ok: true,
          provider: { id: 'sam2', model: 'men1scus/birefnet' },
          preview: {
            sourceDataUrl: 'data:image/png;base64,AA',
            maskDataUrl: 'data:image/png;base64,BB',
            cutoutDataUrl: 'data:image/png;base64,CC',
            width: 1024,
            height: 1024,
            // bbox missing — Replicate provider doesn't compute it.
          },
        }),
      } as unknown as Response;
    });

    const result = await segmentSubjects({
      imageUrl: 'https://cdn/x.png',
      prompts: [{ prompt: 'face', componentKind: 'face' }],
      baseUrl: 'http://api',
      width: 1024,
      height: 1024,
      fetchImpl,
    });

    expect(result.matched).toBe(1);
    expect(result.masks).toHaveLength(1);
    expect(result.masks[0].bbox).toEqual({ x: 0, y: 0, w: 1024, h: 1024 });
  });

  it('returns the original empty result when SAM2 fallback itself errors (no infinite escalation)', async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? '{}'));
      if (body.providerId === 'sam2') {
        return { ok: false, json: async () => ({}) } as unknown as Response;
      }
      return buildOk([]);
    });

    const result = await segmentSubjects({
      imageUrl: 'https://cdn/x.png',
      prompts: [{ prompt: 'face', componentKind: 'face' }],
      baseUrl: 'http://api',
      width: 1024,
      height: 1024,
      fetchImpl,
    });

    expect(result.matched).toBe(0);
    expect(result.masks).toHaveLength(0);
  });

  it('drops masks with malformed bbox shapes', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        raw: {
          masks: [
            { kind: 'face', bbox: { x: 0, y: 0, w: 10, h: 10 }, confidence: 0.8 },
            { kind: 'face', bbox: { x: 'nope' }, confidence: 0.7 }, // malformed
            { kind: 'face', confidence: 0.6 }, // no bbox at all
          ],
        },
      }),
    } as unknown as Response));

    const result = await segmentSubjects({
      imageUrl: 'https://cdn/x.png',
      prompts: [{ prompt: 'face', componentKind: 'face' }],
      baseUrl: 'http://api',
      width: 1024,
      height: 1024,
      fetchImpl,
    });

    expect(result.masks).toHaveLength(1);
  });
});

describe('segmentSubjectsToForbiddenRegions', () => {
  it('normalizes pixel-space bboxes to 0..1 against width/height', () => {
    const input: SegmentSubjectsResult = {
      width: 1000,
      height: 800,
      masks: [
        {
          label: 'face',
          componentKind: 'face',
          bbox: { x: 250, y: 200, w: 200, h: 200 },
          confidence: 0.9,
        },
      ],
      matched: 1,
      prompted: 1,
    };
    const regions = segmentSubjectsToForbiddenRegions(input);
    expect(regions).toHaveLength(1);
    expect(regions[0]).toMatchObject({
      kind: 'face',
      confidence: 0.9,
      bbox: { x: 0.25, y: 0.25, w: 0.2, h: 0.25 },
    });
  });

  it('maps wider componentKinds (subject / apparel / accessory) to "other"', () => {
    const input: SegmentSubjectsResult = {
      width: 100,
      height: 100,
      masks: [
        { label: 'jacket', componentKind: 'apparel', bbox: { x: 0, y: 0, w: 50, h: 50 }, confidence: 0.8 },
        { label: 'jewelry', componentKind: 'accessory', bbox: { x: 50, y: 50, w: 10, h: 10 }, confidence: 0.7 },
        { label: 'person', componentKind: 'subject', bbox: { x: 0, y: 0, w: 100, h: 100 }, confidence: 0.85 },
      ],
      matched: 3,
      prompted: 3,
    };
    const regions = segmentSubjectsToForbiddenRegions(input);
    expect(regions.map((r) => r.kind)).toEqual(['other', 'other', 'other']);
  });

  it('returns [] when width or height is 0 (cannot normalize)', () => {
    expect(
      segmentSubjectsToForbiddenRegions({
        width: 0,
        height: 1024,
        masks: [{ label: 'x', componentKind: 'face', bbox: { x: 0, y: 0, w: 1, h: 1 }, confidence: 0.5 }],
        matched: 1,
        prompted: 1,
      })
    ).toEqual([]);
  });

  it('clamps out-of-bounds bboxes to [0,1]', () => {
    const input: SegmentSubjectsResult = {
      width: 100,
      height: 100,
      masks: [
        { label: 'face', componentKind: 'face', bbox: { x: -10, y: -10, w: 200, h: 200 }, confidence: 0.5 },
      ],
      matched: 1,
      prompted: 1,
    };
    const [region] = segmentSubjectsToForbiddenRegions(input);
    expect(region.bbox.x).toBe(0);
    expect(region.bbox.y).toBe(0);
    expect(region.bbox.w).toBe(1);
    expect(region.bbox.h).toBe(1);
  });
});

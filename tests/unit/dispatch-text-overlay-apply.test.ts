import { describe, expect, it, vi } from 'vitest';
import {
  buildPlacementFromZone,
  buildSemanticComponent,
  defaultSafeZonesForFanout,
  dispatchTextOverlayApply,
  normalizeLocaleList,
  placementToCanvasRect,
  type PlacedShapeInput,
  type TextOverlayRowInput,
} from '@/lib/text-overlay/dispatch-apply';
import { asBCP47LocaleCode } from '@/lib/text-overlay/types';
import { DEMO_CREATOR_CONTEXT } from '@/lib/context/model';

const FRAME = { id: 'frame-ig', w: 1080, h: 1350, aspectRatio: '4:5' as const };

const PLANNER_RESPONSE = {
  ok: true,
  layers: [
    {
      zone: {
        purpose: 'headline',
        bbox: { x: 0.08, y: 0.62, w: 0.84, h: 0.12 },
      },
      content: {
        en: 'Slow morning, golden hour',
        'zh-Hans': '慢早晨，黄金时刻',
        'ja-JP': 'ゆっくりとした朝',
      },
      textAlign: 'center',
    },
    {
      zone: { purpose: 'cta', bbox: { x: 0.32, y: 0.88, w: 0.36, h: 0.07 } },
      content: { en: 'Shop the drop', 'zh-Hans': '现在购买', 'ja-JP': '今すぐ買う' },
      textAlign: 'center',
    },
  ],
  plannerMode: 'fallback',
  rationale: 'fallback copy used',
  provenance: { sourceLocale: 'en', targetLocales: ['zh-Hans', 'ja-JP'] },
};

describe('buildSemanticComponent', () => {
  it('builds a SemanticCreativeComponent from creator context + frame, with default safe zones', () => {
    const component = buildSemanticComponent({
      wsId: 'ws-1',
      frame: FRAME,
      creatorContext: DEMO_CREATOR_CONTEXT,
      sourceLocale: asBCP47LocaleCode('en'),
      targetLocales: [asBCP47LocaleCode('zh-Hans')],
    });

    expect(component.formats[0]).toMatchObject({ id: 'frame-ig', w: 1080, h: 1350 });
    expect(component.cropPriorities.primary).toBeDefined();
    expect(component.safeZones.length).toBeGreaterThanOrEqual(3);
    expect(component.safeZones.some((z) => z.purpose === 'headline')).toBe(true);
    expect(component.safeZones.some((z) => z.purpose === 'cta')).toBe(true);
    expect(component.hero.description).toContain(DEMO_CREATOR_CONTEXT.offer.summary);
  });

  it('honours explicit safeZones override', () => {
    const customZones = [
      { purpose: 'caption' as const, bbox: { x: 0, y: 0.9, w: 1, h: 0.08 } },
    ];
    const component = buildSemanticComponent({
      wsId: 'ws-1',
      frame: FRAME,
      creatorContext: DEMO_CREATOR_CONTEXT,
      sourceLocale: asBCP47LocaleCode('en'),
      targetLocales: [],
      safeZones: customZones,
    });
    expect(component.safeZones).toEqual(customZones);
  });
});

describe('placementToCanvasRect / buildPlacementFromZone', () => {
  it('projects a normalized safe zone onto canvas-unit coords inside the frame', () => {
    const zone = defaultSafeZonesForFanout()[0]!;
    const rect = placementToCanvasRect(zone, { x: 100, y: 200, w: 1000, h: 1000 });
    expect(rect.x).toBeCloseTo(100 + 0.08 * 1000, 1);
    expect(rect.y).toBeCloseTo(200 + 0.62 * 1000, 1);
    expect(rect.w).toBeCloseTo(0.84 * 1000, 1);
    expect(rect.h).toBeCloseTo(0.12 * 1000, 1);
  });

  it('builds an AetherTextPlacement anchored at the zone center', () => {
    const placement = buildPlacementFromZone(defaultSafeZonesForFanout()[0]!);
    expect(placement.mode).toBe('smart');
    expect(placement.anchor.relativeTo).toBe('artboard');
    expect(placement.anchor.normalizedX).toBeCloseTo(0.5, 2);
  });
});

describe('dispatchTextOverlayApply', () => {
  it('posts to /api/text-overlay/apply, persists each overlay, and inserts a canvas shape per layer', async () => {
    const fetchSpy = vi.fn(async (_url: string, _init: RequestInit) =>
      new Response(JSON.stringify(PLANNER_RESPONSE), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const insertedRows: TextOverlayRowInput[] = [];
    const insertTextOverlay = vi.fn(async (row: TextOverlayRowInput) => {
      insertedRows.push(row);
      return `row-${insertedRows.length}`;
    });

    const insertedShapes: PlacedShapeInput[] = [];
    const insertCanvasShape = vi.fn((placed: PlacedShapeInput) => {
      insertedShapes.push(placed);
      return `shape-${insertedShapes.length}`;
    });

    const result = await dispatchTextOverlayApply(
      {
        wsId: 'ws-1',
        frame: FRAME,
        creatorContext: DEMO_CREATOR_CONTEXT,
        sourceLocale: asBCP47LocaleCode('en'),
        targetLocales: [asBCP47LocaleCode('zh-Hans'), asBCP47LocaleCode('ja-JP')],
        capabilityRunId: 'run-7',
      },
      {
        fetchImpl: fetchSpy as unknown as typeof fetch,
        insertTextOverlay,
        insertCanvasShape,
      },
      { x: 50, y: 80 }
    );

    expect(result.ok).toBe(true);
    expect(result.applied).toHaveLength(2);
    expect(result.plannerMode).toBe('fallback');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [, init] = fetchSpy.mock.calls[0]!;
    const body = JSON.parse(init.body as string);
    expect(body.sourceLocale).toBe('en');
    expect(body.targetLocales).toEqual(['zh-Hans', 'ja-JP']);
    expect(body.artboardId).toBe('frame-ig');
    expect(body.capabilityRunId).toBe('run-7');
    expect(body.brand.name).toBe(DEMO_CREATOR_CONTEXT.brand.name);

    expect(insertedRows).toHaveLength(2);
    expect(insertedRows[0]!.activeLanguage).toBe('en');
    expect((insertedRows[0]!.content as Record<string, string>)['en']).toBeTruthy();
    expect((insertedRows[0]!.content as Record<string, string>)['zh-Hans']).toBeTruthy();

    expect(insertedShapes).toHaveLength(2);
    expect(insertedShapes[0]!.artboardId).toBe('frame-ig');
    expect(insertedShapes[0]!.wsId).toBe('ws-1');
    expect(
      (insertedShapes[0]!.proposal.content as Record<string, string>)['en']
    ).toBe('Slow morning, golden hour');
    expect(insertedShapes[0]!.textOverlayRowId).toBe('row-1');
  });

  it('drops the source locale from targetLocales so the planner never sees a duplicate', async () => {
    const fetchSpy = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response(JSON.stringify({ ok: true, layers: [], plannerMode: 'noop' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    );
    await dispatchTextOverlayApply(
      {
        wsId: 'ws-1',
        frame: FRAME,
        creatorContext: DEMO_CREATOR_CONTEXT,
        sourceLocale: asBCP47LocaleCode('en'),
        targetLocales: [
          asBCP47LocaleCode('en'),
          asBCP47LocaleCode('zh-Hans'),
          asBCP47LocaleCode('en'),
        ],
      },
      {
        fetchImpl: fetchSpy as unknown as typeof fetch,
        insertCanvasShape: () => 'noop',
      },
      { x: 0, y: 0 }
    );

    const [, init] = fetchSpy.mock.calls[0]!;
    const body = JSON.parse(init.body as string);
    expect(body.targetLocales).toEqual(['zh-Hans']);
  });

  it('returns http-error mode when the API responds with 5xx', async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ ok: false, error: 'planner unreachable' }), {
        status: 500,
      })
    );
    const result = await dispatchTextOverlayApply(
      {
        wsId: 'ws-1',
        frame: FRAME,
        creatorContext: DEMO_CREATOR_CONTEXT,
        sourceLocale: asBCP47LocaleCode('en'),
        targetLocales: [],
      },
      {
        fetchImpl: fetchSpy as unknown as typeof fetch,
        insertCanvasShape: () => 'noop',
      },
      { x: 0, y: 0 }
    );

    expect(result.ok).toBe(false);
    expect(result.plannerMode).toBe('http-error');
    expect(result.error).toBe('planner unreachable');
    expect(result.applied).toHaveLength(0);
  });

  it('still returns ok when the persistence sink is missing — Convex is optional in demo mode', async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify(PLANNER_RESPONSE), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const insertedShapes: PlacedShapeInput[] = [];
    const result = await dispatchTextOverlayApply(
      {
        wsId: 'ws-1',
        frame: FRAME,
        creatorContext: DEMO_CREATOR_CONTEXT,
        sourceLocale: asBCP47LocaleCode('en'),
        targetLocales: [asBCP47LocaleCode('zh-Hans')],
      },
      {
        fetchImpl: fetchSpy as unknown as typeof fetch,
        insertCanvasShape: (placed) => {
          insertedShapes.push(placed);
          return `shape-${insertedShapes.length}`;
        },
      },
      { x: 0, y: 0 }
    );

    expect(result.ok).toBe(true);
    expect(insertedShapes).toHaveLength(2);
    expect(insertedShapes[0]!.textOverlayRowId).toBe('');
  });
});

describe('normalizeLocaleList', () => {
  it('trims, dedupes, and brands strings as BCP47', () => {
    const out = normalizeLocaleList(['en', ' zh-Hans ', 'en', 'ja-JP']);
    expect(out.map(String)).toEqual(['en', 'zh-Hans', 'ja-JP']);
  });
});

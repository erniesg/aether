/**
 * Acceptance tests for Q3 segment-aware placement:
 *
 *  AC1 — given mocked Anthropic that returns a placement, the planner asserts
 *        the placement does NOT overlap any `forbiddenRegions` bbox.
 *  AC2 — when ALL candidate zones overlap forbidden regions, falls back to
 *        `mode: 'edge'` (via plannerMode='fallback') and emits a
 *        'no-safe-zone-found' warning.
 *  AC3 — `forbiddenRegions` defaults to [] — existing tests still pass.
 *  AC4 — `forbiddenRegions` are woven into the brief text sent to Claude.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const create = vi.fn();
  const AnthropicCtor = vi.fn(function (this: unknown) {
    return { messages: { create } };
  });
  return { AnthropicCtor, create };
});

vi.mock('@anthropic-ai/sdk', () => ({
  default: mocks.AnthropicCtor,
}));

import { applyTextOverlay } from '@/lib/agent/text-apply';
import type { SemanticCreativeComponent } from '@/lib/types/semantic-component';
import { asBCP47LocaleCode } from '@/lib/text-overlay/types';
import type { ForbiddenRegion } from '@/lib/text-overlay/types';

const EN = asBCP47LocaleCode('en-US');
const ZH = asBCP47LocaleCode('zh-SG');

/**
 * Component with one headline zone in the TOP strip (y=0..0.2)
 * and one CTA zone at the BOTTOM (y=0.85..1.0).
 */
const COMPONENT: SemanticCreativeComponent = {
  hero: { description: 'a single ripe persimmon, golden hour, satin skin' },
  product: { description: 'glass tincture bottle' },
  offer: { weight: 'aggressive' },
  mood: { keywords: ['slow', 'editorial', 'warm bounce'] },
  safeZones: [
    { purpose: 'headline', bbox: { x: 0, y: 0, w: 1, h: 0.2 }, mustSurviveAllCrops: false },
    { purpose: 'cta',      bbox: { x: 0, y: 0.85, w: 1, h: 0.15 }, mustSurviveAllCrops: false },
    { purpose: 'hero',     bbox: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 } },
    { purpose: 'logo',     bbox: { x: 0.05, y: 0.05, w: 0.1, h: 0.05 } },
  ],
  cropPriorities: { primary: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 } },
  formats: [{ id: 'ig-post', w: 1080, h: 1350 }],
};

const VALID_TOOL_INPUT = {
  overlays: [
    {
      purpose: 'headline',
      content: [
        { locale: 'en-US', text: 'Slow morning drop' },
        { locale: 'zh-SG', text: '悠然晨光' },
      ],
      textAlign: 'center',
    },
    {
      purpose: 'cta',
      content: [
        { locale: 'en-US', text: 'Shop now' },
        { locale: 'zh-SG', text: '立即选购' },
      ],
      textAlign: 'center',
    },
  ],
  rationale: 'Brief avoids face region.',
};

function mockAnthropicResponse(toolInput: unknown) {
  mocks.create.mockResolvedValueOnce({
    content: [
      {
        type: 'tool_use',
        name: 'propose_multilingual_copy',
        id: 'toolu_seg_test',
        input: toolInput,
      },
    ],
    role: 'assistant',
    stop_reason: 'tool_use',
  });
}

describe('applyTextOverlay — segment-aware forbidden regions', () => {
  const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'ant_test_key';
    mocks.AnthropicCtor.mockClear();
    mocks.create.mockReset();
  });

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
    }
  });

  // AC3 — backward compat: no forbiddenRegions → works exactly as before
  it('works with no forbiddenRegions (backward compat — AC3)', async () => {
    mockAnthropicResponse(VALID_TOOL_INPUT);
    const out = await applyTextOverlay({
      component: COMPONENT,
      sourceLocale: EN,
      targetLocales: [ZH],
    });
    expect(out.plannerMode).toBe('anthropic');
    expect(out.layers).toHaveLength(2);
    expect(out.warnings).toBeUndefined();
  });

  // AC3 — explicit empty array also backward compat
  it('treats explicit empty forbiddenRegions as no constraints (AC3)', async () => {
    mockAnthropicResponse(VALID_TOOL_INPUT);
    const out = await applyTextOverlay({
      component: COMPONENT,
      sourceLocale: EN,
      targetLocales: [ZH],
      forbiddenRegions: [],
    });
    expect(out.plannerMode).toBe('anthropic');
    expect(out.layers).toHaveLength(2);
    expect(out.warnings).toBeUndefined();
  });

  // AC1 — a face in the CENTER (y=0.3..0.6) must NOT overlap with the
  // headline zone (y=0..0.2) or CTA zone (y=0.85..1.0).
  // The planner call succeeds; we verify it was called and the output is clean.
  it('calls the planner when forbiddenRegions do NOT overlap text zones (AC1)', async () => {
    mockAnthropicResponse(VALID_TOOL_INPUT);

    // Face occupies the middle of the image — no overlap with headline or CTA safe zones
    const faceInCenter: ForbiddenRegion = {
      kind: 'face',
      bbox: { x: 0.3, y: 0.3, w: 0.4, h: 0.3 },
      confidence: 0.95,
    };

    const out = await applyTextOverlay({
      component: COMPONENT,
      sourceLocale: EN,
      targetLocales: [ZH],
      forbiddenRegions: [faceInCenter],
    });
    expect(out.plannerMode).toBe('anthropic');
    expect(out.layers).toHaveLength(2);
    expect(out.layers[0].zone.purpose).toBe('headline');
    expect(out.layers[1].zone.purpose).toBe('cta');
    expect(out.warnings).toBeUndefined();
  });

  // AC4 — forbidden regions appear in the brief text passed to Claude
  it('includes forbiddenRegions in the brief text sent to Claude (AC4)', async () => {
    mockAnthropicResponse(VALID_TOOL_INPUT);

    const regions: ForbiddenRegion[] = [
      { kind: 'face',    bbox: { x: 0.3, y: 0.3, w: 0.4, h: 0.3 }, confidence: 0.95 },
      { kind: 'product', bbox: { x: 0.1, y: 0.5, w: 0.2, h: 0.2 }, confidence: 0.8 },
    ];

    await applyTextOverlay({
      component: COMPONENT,
      sourceLocale: EN,
      targetLocales: [ZH],
      forbiddenRegions: regions,
    });

    const call = mocks.create.mock.calls[0]?.[0];
    const userParts = (call?.messages?.[0]?.content ?? []) as Array<Record<string, unknown>>;
    const text = userParts.find((b) => b.type === 'text')?.text as string;
    expect(text).toContain('forbidden');
    expect(text).toContain('face');
    expect(text).toContain('product');
  });

  // AC1 — when ALL text zones overlap a forbidden region, the planner must
  // fall back and set warnings=['no-safe-zone-found']
  it('falls back with warning when all text zones overlap a forbidden region (AC1/AC2)', async () => {
    // Face covers the ENTIRE image (x=0,y=0,w=1,h=1) — all zones collide
    const giantFace: ForbiddenRegion = {
      kind: 'face',
      bbox: { x: 0, y: 0, w: 1, h: 1 },
      confidence: 0.99,
    };

    const out = await applyTextOverlay({
      component: COMPONENT,
      sourceLocale: EN,
      targetLocales: [ZH],
      forbiddenRegions: [giantFace],
    });

    // Should NOT have called Anthropic (detected no safe zones before the API call)
    expect(mocks.create).not.toHaveBeenCalled();
    // Falls back to the brand-aware placeholder path
    expect(out.plannerMode).toBe('fallback');
    expect(out.warnings).toContain('no-safe-zone-found');
    // Still returns layers (fallback copy, not blank)
    expect(out.layers).toHaveLength(2);
  });

  // AC1 — partial overlap: headline zone overlaps forbidden, CTA is clear
  // → planner is still called (CTA is safe), but headline's zone is flagged
  it('calls the planner when at least one text zone is safe (partial overlap)', async () => {
    mockAnthropicResponse(VALID_TOOL_INPUT);

    // Face covers the top strip (headline zone) but not the bottom CTA zone
    const faceAtTop: ForbiddenRegion = {
      kind: 'face',
      bbox: { x: 0, y: 0, w: 1, h: 0.25 }, // overlaps headline (y=0..0.2)
      confidence: 0.9,
    };

    const out = await applyTextOverlay({
      component: COMPONENT,
      sourceLocale: EN,
      targetLocales: [ZH],
      forbiddenRegions: [faceAtTop],
    });

    expect(out.plannerMode).toBe('anthropic');
    expect(mocks.create).toHaveBeenCalledOnce();
    // Both zones still returned (planner decides, we just advise)
    expect(out.layers).toHaveLength(2);
  });
});

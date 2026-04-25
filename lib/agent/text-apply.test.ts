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

import { applyTextOverlay } from './text-apply';
import type { SemanticCreativeComponent } from '@/lib/types/semantic-component';
import { asBCP47LocaleCode } from '@/lib/text-overlay/types';

const EN = asBCP47LocaleCode('en-US');
const ZH = asBCP47LocaleCode('zh-SG');
const FR = asBCP47LocaleCode('fr-FR');

const COMPONENT: SemanticCreativeComponent = {
  hero: { description: 'a single ripe persimmon, golden hour, satin skin' },
  product: { description: 'glass tincture bottle' },
  offer: { weight: 'aggressive' },
  mood: { keywords: ['slow', 'editorial', 'warm bounce'] },
  safeZones: [
    { purpose: 'headline', bbox: { x: 0, y: 0, w: 1, h: 0.2 }, mustSurviveAllCrops: false },
    { purpose: 'cta', bbox: { x: 0, y: 0.85, w: 1, h: 0.15 }, mustSurviveAllCrops: false },
    { purpose: 'hero', bbox: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 } },
    { purpose: 'logo', bbox: { x: 0.05, y: 0.05, w: 0.1, h: 0.05 } },
  ],
  cropPriorities: { primary: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 } },
  formats: [
    { id: 'ig-post', w: 1080, h: 1350 },
    { id: 'story', w: 1080, h: 1920 },
  ],
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
  rationale: 'Soft editorial English, parallel idiomatic zh-SG.',
};

function mockResponse(toolInput: unknown) {
  mocks.create.mockResolvedValueOnce({
    content: [
      {
        type: 'tool_use',
        name: 'propose_multilingual_copy',
        id: 'toolu_test',
        input: toolInput,
      },
    ],
    role: 'assistant',
    stop_reason: 'tool_use',
  });
}

describe('applyTextOverlay', () => {
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

  it('throws when sourceLocale is missing', async () => {
    await expect(
      applyTextOverlay({
        component: COMPONENT,
        sourceLocale: '' as ReturnType<typeof asBCP47LocaleCode>,
      })
    ).rejects.toThrow(/sourceLocale is required/);
  });

  it('returns noop when component has no text-bearing safeZones', async () => {
    const out = await applyTextOverlay({
      component: {
        ...COMPONENT,
        safeZones: [
          { purpose: 'hero', bbox: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 } },
          { purpose: 'logo', bbox: { x: 0.05, y: 0.05, w: 0.1, h: 0.05 } },
        ],
      },
      sourceLocale: EN,
      targetLocales: [ZH],
    });
    expect(out.plannerMode).toBe('noop');
    expect(out.layers).toEqual([]);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('parses a valid tool call into typed layers in zone order', async () => {
    mockResponse(VALID_TOOL_INPUT);
    const out = await applyTextOverlay({
      component: COMPONENT,
      sourceLocale: EN,
      targetLocales: [ZH],
      brand: { name: 'Solstice Skin', voice: 'slow, certain' },
      wsId: 'ws-1',
      artboardId: 'ab-hero',
      capabilityRunId: 'cap-run-42',
    });
    expect(out.plannerMode).toBe('anthropic');
    expect(out.plannerModel).toBe('claude-opus-4-7');
    expect(out.layers).toHaveLength(2);
    // Layer 0: headline (first text zone in component.safeZones)
    expect(out.layers[0].zone.purpose).toBe('headline');
    expect(out.layers[0].content[EN]).toBe('Slow morning drop');
    expect(out.layers[0].content[ZH]).toBe('悠然晨光');
    expect(out.layers[0].textAlign).toBe('center');
    // Layer 1: cta (second text zone, after the visual hero zone is filtered out)
    expect(out.layers[1].zone.purpose).toBe('cta');
    expect(out.layers[1].content[EN]).toBe('Shop now');
    expect(out.layers[1].content[ZH]).toBe('立即选购');
    expect(out.rationale).toBe('Soft editorial English, parallel idiomatic zh-SG.');
    expect(out.provenance).toEqual({
      sourceLocale: EN,
      targetLocales: [ZH],
      wsId: 'ws-1',
      artboardId: 'ab-hero',
      capabilityRunId: 'cap-run-42',
    });
  });

  it('forces tool use on propose_multilingual_copy with system caching', async () => {
    mockResponse(VALID_TOOL_INPUT);
    await applyTextOverlay({
      component: COMPONENT,
      sourceLocale: EN,
      targetLocales: [ZH],
    });
    const call = mocks.create.mock.calls[0]?.[0];
    expect(call?.tool_choice).toEqual({
      type: 'tool',
      name: 'propose_multilingual_copy',
    });
    expect(call?.tools).toHaveLength(1);
    expect(call?.tools?.[0]?.name).toBe('propose_multilingual_copy');
    expect(call?.model).toBe('claude-opus-4-7');
    expect(call?.system?.[0]?.cache_control).toEqual({ type: 'ephemeral' });
  });

  it('weaves brand voice + creator intent + locales + zones into the brief', async () => {
    mockResponse(VALID_TOOL_INPUT);
    await applyTextOverlay({
      component: COMPONENT,
      sourceLocale: EN,
      targetLocales: [ZH, FR],
      brand: {
        name: 'Solstice Skin',
        voice: 'slow, certain',
        moodKeywords: ['warm bounce', 'lived-in'],
      },
      creatorIntent: 'tonight only',
    });
    const call = mocks.create.mock.calls[0]?.[0];
    const userParts = (call?.messages?.[0]?.content ?? []) as Array<Record<string, unknown>>;
    const text = userParts.find((b) => b.type === 'text')?.text as string;
    expect(text).toContain('Source locale: en-US');
    expect(text).toContain('zh-SG');
    expect(text).toContain('fr-FR');
    expect(text).toContain('Solstice Skin');
    expect(text).toContain('warm bounce');
    expect(text).toContain('Creator intent: tonight only');
    expect(text).toContain('purpose=headline');
    expect(text).toContain('purpose=cta');
    expect(text).not.toContain('purpose=hero');
    expect(text).not.toContain('purpose=logo');
  });

  it('falls back to brand-aware placeholders when API key is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const out = await applyTextOverlay({
      component: COMPONENT,
      sourceLocale: EN,
      targetLocales: [ZH],
      brand: { name: 'Solstice Skin' },
      creatorIntent: 'tonight only',
    });
    expect(out.plannerMode).toBe('fallback');
    expect(out.plannerError).toMatch(/ANTHROPIC_API_KEY/);
    expect(out.layers).toHaveLength(2);
    expect(out.layers[0].zone.purpose).toBe('headline');
    expect(out.layers[0].content[EN]).toBe('Solstice Skin');
    // Target locale mirrors source on fallback
    expect(out.layers[0].content[ZH]).toBe('Solstice Skin');
    expect(out.layers[1].zone.purpose).toBe('cta');
    // Aggressive offer → urgent CTA placeholder
    expect(out.layers[1].content[EN]).toBe('Shop now');
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('falls back when Anthropic returns a billing/credit error', async () => {
    mocks.create.mockRejectedValueOnce(
      new Error('400 invalid_request_error: Your credit balance is too low')
    );
    const out = await applyTextOverlay({
      component: COMPONENT,
      sourceLocale: EN,
      targetLocales: [ZH],
    });
    expect(out.plannerMode).toBe('fallback');
    expect(out.plannerError).toMatch(/credit balance/i);
    expect(out.layers).toHaveLength(2);
  });

  it('rethrows non-fallback errors', async () => {
    mocks.create.mockRejectedValueOnce(new Error('500 internal'));
    await expect(
      applyTextOverlay({ component: COMPONENT, sourceLocale: EN, targetLocales: [ZH] })
    ).rejects.toThrow(/500 internal/);
  });

  it('throws when the response has no propose_multilingual_copy tool call', async () => {
    mocks.create.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'I cannot do that.' }],
      role: 'assistant',
      stop_reason: 'end_turn',
    });
    await expect(
      applyTextOverlay({ component: COMPONENT, sourceLocale: EN, targetLocales: [ZH] })
    ).rejects.toThrow(/did not emit a propose_multilingual_copy/);
  });

  it('throws when overlays is missing for a text-bearing zone', async () => {
    mockResponse({
      overlays: [VALID_TOOL_INPUT.overlays[0]], // only headline, no cta
    });
    await expect(
      applyTextOverlay({ component: COMPONENT, sourceLocale: EN, targetLocales: [ZH] })
    ).rejects.toThrow(/missing overlay for purpose 'cta'/);
  });

  it('tolerates Claude reordering overlays by purpose', async () => {
    mockResponse({
      overlays: [
        VALID_TOOL_INPUT.overlays[1], // cta first
        VALID_TOOL_INPUT.overlays[0], // headline second
      ],
    });
    const out = await applyTextOverlay({
      component: COMPONENT,
      sourceLocale: EN,
      targetLocales: [ZH],
    });
    // Output order follows component.safeZones, not the model's emit order
    expect(out.layers[0].zone.purpose).toBe('headline');
    expect(out.layers[1].zone.purpose).toBe('cta');
  });

  it('falls back per-locale to source text when Claude skips a target', async () => {
    mockResponse({
      overlays: [
        {
          purpose: 'headline',
          // missing zh-SG entry
          content: [{ locale: 'en-US', text: 'Slow morning drop' }],
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
    });
    const out = await applyTextOverlay({
      component: COMPONENT,
      sourceLocale: EN,
      targetLocales: [ZH],
    });
    expect(out.layers[0].content[EN]).toBe('Slow morning drop');
    // missing zh-SG falls back to source
    expect(out.layers[0].content[ZH]).toBe('Slow morning drop');
    // cta has both, normal path
    expect(out.layers[1].content[ZH]).toBe('立即选购');
  });

  it('throws when source locale is missing from any overlay', async () => {
    mockResponse({
      overlays: [
        {
          purpose: 'headline',
          content: [{ locale: 'zh-SG', text: '悠然晨光' }], // no en-US
          textAlign: 'center',
        },
        VALID_TOOL_INPUT.overlays[1],
      ],
    });
    await expect(
      applyTextOverlay({ component: COMPONENT, sourceLocale: EN, targetLocales: [ZH] })
    ).rejects.toThrow(/missing source locale/);
  });

  it('defaults textAlign to center when value is invalid', async () => {
    mockResponse({
      overlays: [
        { ...VALID_TOOL_INPUT.overlays[0], textAlign: 'gibberish' },
        VALID_TOOL_INPUT.overlays[1],
      ],
    });
    const out = await applyTextOverlay({
      component: COMPONENT,
      sourceLocale: EN,
      targetLocales: [ZH],
    });
    expect(out.layers[0].textAlign).toBe('center');
  });

  it('dedupes target locales when source appears in the list', async () => {
    mockResponse(VALID_TOOL_INPUT);
    const out = await applyTextOverlay({
      component: COMPONENT,
      sourceLocale: EN,
      // EN duplicated; ZH listed twice
      targetLocales: [EN, ZH, ZH],
    });
    expect(out.provenance.targetLocales).toEqual([ZH]);
  });

  it('handles empty targetLocales — emits source-only copy', async () => {
    mockResponse({
      overlays: [
        {
          purpose: 'headline',
          content: [{ locale: 'en-US', text: 'Slow morning drop' }],
          textAlign: 'center',
        },
        {
          purpose: 'cta',
          content: [{ locale: 'en-US', text: 'Shop now' }],
          textAlign: 'center',
        },
      ],
    });
    const out = await applyTextOverlay({
      component: COMPONENT,
      sourceLocale: EN,
    });
    expect(out.provenance.targetLocales).toEqual([]);
    expect(out.layers[0].content[EN]).toBe('Slow morning drop');
    expect(Object.keys(out.layers[0].content)).toEqual(['en-US']);
  });

  it('respects an injected anthropic dep over the env-based client', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const create = vi.fn();
    create.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          name: 'propose_multilingual_copy',
          id: 'x',
          input: VALID_TOOL_INPUT,
        },
      ],
    });
    const fakeClient = { messages: { create } } as unknown;
    const out = await applyTextOverlay(
      { component: COMPONENT, sourceLocale: EN, targetLocales: [ZH] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { anthropic: fakeClient as any }
    );
    expect(out.plannerMode).toBe('anthropic');
    expect(create).toHaveBeenCalledOnce();
  });

  it('preserves zone metadata (mustSurviveAllCrops) on each layer', async () => {
    mockResponse(VALID_TOOL_INPUT);
    const out = await applyTextOverlay({
      component: COMPONENT,
      sourceLocale: EN,
      targetLocales: [ZH],
    });
    expect(out.layers[0].zone.mustSurviveAllCrops).toBe(false);
    expect(out.layers[0].zone.bbox).toEqual({ x: 0, y: 0, w: 1, h: 0.2 });
    expect(out.layers[1].zone.bbox).toEqual({ x: 0, y: 0.85, w: 1, h: 0.15 });
  });
});

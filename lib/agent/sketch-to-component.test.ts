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

import { sketchToComponent } from './sketch-to-component';
import type { FormatTarget } from '@/lib/types/semantic-component';

const FORMATS: FormatTarget[] = [
  { id: 'ig-post', w: 1080, h: 1350 },
  { id: 'story', w: 1080, h: 1920 },
  { id: 'banner', w: 1200, h: 627 },
];

const VALID_TOOL_INPUT = {
  hero: { description: 'a single ripe persimmon, golden hour, satin skin' },
  product: { description: 'glass tincture bottle, label off' },
  offer: { weight: 'aggressive' as const },
  mood: { keywords: ['slow', 'editorial', 'warm bounce'] },
  safeZones: [
    { purpose: 'headline' as const, bbox: { x: 0, y: 0, w: 1, h: 0.22 }, mustSurviveAllCrops: false },
    { purpose: 'cta' as const, bbox: { x: 0, y: 0.86, w: 1, h: 0.14 }, mustSurviveAllCrops: false },
    { purpose: 'hero' as const, bbox: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 } },
  ],
  cropPriorities: {
    primary: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
  },
};

function mockResponse(toolInput: unknown) {
  mocks.create.mockResolvedValueOnce({
    content: [
      {
        type: 'tool_use',
        name: 'propose_creative_component',
        id: 'toolu_test',
        input: toolInput,
      },
    ],
    role: 'assistant',
    stop_reason: 'tool_use',
  });
}

describe('sketchToComponent', () => {
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

  it('throws when sketchImageUrl is missing', async () => {
    await expect(
      sketchToComponent({ sketchImageUrl: '', formats: FORMATS })
    ).rejects.toThrow(/sketchImageUrl is required/);
  });

  it('throws when no formats are supplied', async () => {
    await expect(
      sketchToComponent({ sketchImageUrl: 'data:image/png;base64,iVBOR', formats: [] })
    ).rejects.toThrow(/at least one format/);
  });

  it('parses a valid tool call into a typed component', async () => {
    mockResponse(VALID_TOOL_INPUT);
    const out = await sketchToComponent({
      sketchImageUrl: 'data:image/png;base64,iVBORw0KGgo=',
      formats: FORMATS,
      creatorIntent: 'tonight only',
      brand: { name: 'Solstice Skin', palette: ['#0F1013', '#E8E4D6'] },
    });
    expect(out.plannerMode).toBe('anthropic');
    expect(out.plannerModel).toBe('claude-opus-4-7');
    expect(out.component.hero.description).toBe(
      'a single ripe persimmon, golden hour, satin skin'
    );
    expect(out.component.product?.description).toBe('glass tincture bottle, label off');
    expect(out.component.offer?.weight).toBe('aggressive');
    expect(out.component.mood.keywords).toEqual(['slow', 'editorial', 'warm bounce']);
    expect(out.component.safeZones).toHaveLength(3);
    expect(out.component.cropPriorities.primary).toEqual({
      x: 0.25,
      y: 0.25,
      w: 0.5,
      h: 0.5,
    });
    expect(out.component.formats).toEqual(FORMATS);
  });

  it('forces tool use on propose_creative_component', async () => {
    mockResponse(VALID_TOOL_INPUT);
    await sketchToComponent({
      sketchImageUrl: 'https://example.com/sketch.png',
      formats: FORMATS,
    });
    const call = mocks.create.mock.calls[0]?.[0];
    expect(call?.tool_choice).toEqual({ type: 'tool', name: 'propose_creative_component' });
    expect(call?.tools).toHaveLength(1);
    expect(call?.tools?.[0]?.name).toBe('propose_creative_component');
    expect(call?.model).toBe('claude-opus-4-7');
    expect(call?.system?.[0]?.cache_control).toEqual({ type: 'ephemeral' });
  });

  it('sends a base64 image block when given a data URL', async () => {
    mockResponse(VALID_TOOL_INPUT);
    await sketchToComponent({
      sketchImageUrl: 'data:image/png;base64,iVBORw0KGgo=',
      formats: FORMATS,
    });
    const call = mocks.create.mock.calls[0]?.[0];
    const userParts = (call?.messages?.[0]?.content ?? []) as Array<Record<string, unknown>>;
    const imageBlock = userParts.find((b) => b.type === 'image');
    expect(imageBlock).toBeDefined();
    const source = imageBlock?.source as Record<string, unknown>;
    expect(source.type).toBe('base64');
    expect(source.media_type).toBe('image/png');
    expect(source.data).toBe('iVBORw0KGgo=');
  });

  it('sends a URL image block when given an https URL', async () => {
    mockResponse(VALID_TOOL_INPUT);
    await sketchToComponent({
      sketchImageUrl: 'https://example.com/sketch.png',
      formats: FORMATS,
    });
    const call = mocks.create.mock.calls[0]?.[0];
    const userParts = (call?.messages?.[0]?.content ?? []) as Array<Record<string, unknown>>;
    const imageBlock = userParts.find((b) => b.type === 'image');
    const source = imageBlock?.source as Record<string, unknown>;
    expect(source.type).toBe('url');
    expect(source.url).toBe('https://example.com/sketch.png');
  });

  it('weaves brand + creator intent + references + aspect ratios into the brief', async () => {
    mockResponse(VALID_TOOL_INPUT);
    await sketchToComponent({
      sketchImageUrl: 'https://example.com/sketch.png',
      formats: FORMATS,
      brand: {
        name: 'Solstice Skin',
        palette: ['#0F1013', '#E8E4D6'],
        type: ['Editorial serif'],
        voice: 'slow, certain',
        moodKeywords: ['warm bounce'],
      },
      references: [{ caption: 'persimmon still life on linen' }, { url: 'https://ex.com/r2.jpg' }],
      creatorIntent: 'tonight only',
    });
    const call = mocks.create.mock.calls[0]?.[0];
    const userParts = (call?.messages?.[0]?.content ?? []) as Array<Record<string, unknown>>;
    const text = userParts.find((b) => b.type === 'text')?.text as string;
    expect(text).toContain('Creator intent: tonight only');
    expect(text).toContain('Solstice Skin');
    expect(text).toContain('warm bounce');
    expect(text).toContain('persimmon still life on linen');
    expect(text).toContain('https://ex.com/r2.jpg');
    expect(text).toContain('4:5');
    expect(text).toContain('9:16');
  });

  it('falls back to a default component when API key is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const out = await sketchToComponent({
      sketchImageUrl: 'data:image/png;base64,iVBORw0KGgo=',
      formats: FORMATS,
      creatorIntent: 'tonight only',
    });
    expect(out.plannerMode).toBe('fallback');
    expect(out.plannerError).toMatch(/ANTHROPIC_API_KEY/);
    expect(out.component.hero.description).toBe('tonight only');
    expect(out.component.formats).toEqual(FORMATS);
    expect(out.component.cropPriorities.primary).toEqual({
      x: 0.25,
      y: 0.25,
      w: 0.5,
      h: 0.5,
    });
    // Should not have called the SDK
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('falls back when Anthropic returns a billing/credit error', async () => {
    mocks.create.mockRejectedValueOnce(
      new Error(
        '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}'
      )
    );
    const out = await sketchToComponent({
      sketchImageUrl: 'data:image/png;base64,iVBORw0KGgo=',
      formats: FORMATS,
    });
    expect(out.plannerMode).toBe('fallback');
    expect(out.plannerError).toMatch(/credit balance/i);
  });

  it('rethrows non-fallback errors', async () => {
    mocks.create.mockRejectedValueOnce(new Error('500 internal'));
    await expect(
      sketchToComponent({
        sketchImageUrl: 'data:image/png;base64,iVBORw0KGgo=',
        formats: FORMATS,
      })
    ).rejects.toThrow(/500 internal/);
  });

  it('throws when the response has no propose_creative_component tool call', async () => {
    mocks.create.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'sorry, can\'t do that' }],
      role: 'assistant',
      stop_reason: 'end_turn',
    });
    await expect(
      sketchToComponent({
        sketchImageUrl: 'data:image/png;base64,iVBORw0KGgo=',
        formats: FORMATS,
      })
    ).rejects.toThrow(/did not emit a propose_creative_component/);
  });

  it('throws on invalid tool input (missing hero.description)', async () => {
    mockResponse({
      hero: {},
      mood: { keywords: [] },
      safeZones: [],
      cropPriorities: { primary: { x: 0, y: 0, w: 1, h: 1 } },
    });
    await expect(
      sketchToComponent({
        sketchImageUrl: 'data:image/png;base64,iVBORw0KGgo=',
        formats: FORMATS,
      })
    ).rejects.toThrow(/hero.description required/);
  });

  it('clamps out-of-range bbox coordinates instead of throwing', async () => {
    mockResponse({
      ...VALID_TOOL_INPUT,
      cropPriorities: { primary: { x: -0.1, y: 0.5, w: 1.5, h: 0.5 } },
    });
    const out = await sketchToComponent({
      sketchImageUrl: 'data:image/png;base64,iVBORw0KGgo=',
      formats: FORMATS,
    });
    expect(out.component.cropPriorities.primary).toEqual({
      x: 0,
      y: 0.5,
      w: 1,
      h: 0.5,
    });
  });

  it('drops safeZones with invalid purpose strings', async () => {
    mockResponse({
      ...VALID_TOOL_INPUT,
      safeZones: [
        ...VALID_TOOL_INPUT.safeZones,
        { purpose: 'gibberish', bbox: { x: 0, y: 0, w: 0.1, h: 0.1 } },
      ],
    });
    await expect(
      sketchToComponent({
        sketchImageUrl: 'data:image/png;base64,iVBORw0KGgo=',
        formats: FORMATS,
      })
    ).rejects.toThrow(/purpose must be one of/);
  });

  it('respects an injected anthropic dep over the env-based client', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const create = vi.fn();
    create.mockResolvedValueOnce({
      content: [{ type: 'tool_use', name: 'propose_creative_component', id: 'x', input: VALID_TOOL_INPUT }],
    });
    const fakeClient = { messages: { create } } as unknown as ConstructorParameters<typeof Object>[0];
    const out = await sketchToComponent(
      { sketchImageUrl: 'data:image/png;base64,iVBORw0KGgo=', formats: FORMATS },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { anthropic: fakeClient as any }
    );
    expect(out.plannerMode).toBe('anthropic');
    expect(create).toHaveBeenCalledOnce();
  });
});

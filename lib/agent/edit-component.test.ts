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

import { applyComponentEdit } from './edit-component';
import type { SemanticCreativeComponent } from '@/lib/types/semantic-component';

const SOURCE: SemanticCreativeComponent = {
  hero: { description: 'a single ripe persimmon, golden hour, satin skin' },
  product: { description: 'glass tincture bottle, label off' },
  offer: { weight: 'aggressive' },
  mood: { keywords: ['slow', 'editorial', 'warm bounce'] },
  safeZones: [
    { purpose: 'headline', bbox: { x: 0, y: 0, w: 1, h: 0.22 } },
    { purpose: 'cta', bbox: { x: 0, y: 0.86, w: 1, h: 0.14 } },
    { purpose: 'hero', bbox: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 } },
  ],
  cropPriorities: { primary: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 } },
  formats: [
    { id: 'ig-post', w: 1080, h: 1350 },
    { id: 'story', w: 1080, h: 1920 },
  ],
};

const MORE_PREMIUM_PATCH = {
  hero: {
    description: 'a single ripe persimmon, museum-grade lighting, satin skin, restrained palette',
  },
  product: { description: 'crystal tincture bottle, embossed label' },
  offer: { weight: 'aggressive' as const },
  mood: { keywords: ['slow', 'editorial', 'restrained', 'considered', 'premium'] },
  safeZones: SOURCE.safeZones,
  cropPriorities: SOURCE.cropPriorities,
  rationale: 'Lifted material + lighting language toward premium; offer weight unchanged.',
};

function mockResponse(toolInput: unknown) {
  mocks.create.mockResolvedValueOnce({
    content: [
      {
        type: 'tool_use',
        name: 'patch_creative_component',
        id: 'toolu_test',
        input: toolInput,
      },
    ],
    role: 'assistant',
    stop_reason: 'tool_use',
  });
}

describe('applyComponentEdit', () => {
  const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'ant_test_key';
    mocks.AnthropicCtor.mockClear();
    mocks.create.mockReset();
  });

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  });

  it('throws on a blank instruction', async () => {
    await expect(
      applyComponentEdit({ component: SOURCE, instruction: '   ' })
    ).rejects.toThrow(/instruction is required/);
  });

  it('returns the patched component with the model rationale', async () => {
    mockResponse(MORE_PREMIUM_PATCH);
    const out = await applyComponentEdit({
      component: SOURCE,
      instruction: 'make the product feel more premium but keep the offer aggressive',
    });
    expect(out.plannerMode).toBe('anthropic');
    expect(out.plannerModel).toBe('claude-opus-4-7');
    expect(out.component.hero.description).toContain('museum-grade lighting');
    expect(out.component.product?.description).toContain('crystal');
    expect(out.component.offer?.weight).toBe('aggressive'); // preserved
    expect(out.component.mood.keywords).toContain('premium');
    expect(out.rationale).toContain('offer weight unchanged');
  });

  it('always preserves the source formats array exactly (model cannot mutate it)', async () => {
    mockResponse({
      ...MORE_PREMIUM_PATCH,
      // Even if the model tried to send formats, parser ignores them
    });
    const out = await applyComponentEdit({
      component: SOURCE,
      instruction: 'something',
    });
    expect(out.component.formats).toEqual(SOURCE.formats);
    // Reference equality NOT required; deep equal is enough — the implementation
    // returns source.formats directly though.
    expect(out.component.formats).toBe(SOURCE.formats);
  });

  it('forces tool_choice on patch_creative_component and caches the system prompt', async () => {
    mockResponse(MORE_PREMIUM_PATCH);
    await applyComponentEdit({ component: SOURCE, instruction: 'shift mood toward calm' });
    const call = mocks.create.mock.calls[0]?.[0];
    expect(call?.tool_choice).toEqual({ type: 'tool', name: 'patch_creative_component' });
    expect(call?.tools?.[0]?.name).toBe('patch_creative_component');
    expect(call?.system?.[0]?.cache_control).toEqual({ type: 'ephemeral' });
    expect(call?.model).toBe('claude-opus-4-7');
  });

  it('serializes the source component and instruction into the user message', async () => {
    mockResponse(MORE_PREMIUM_PATCH);
    await applyComponentEdit({
      component: SOURCE,
      instruction: 'move the headline strip lower',
    });
    const call = mocks.create.mock.calls[0]?.[0];
    const text = (call?.messages?.[0]?.content?.[0] as { text: string })?.text ?? '';
    expect(text).toContain('Current component (JSON):');
    expect(text).toContain('persimmon');
    expect(text).toContain('Edit instruction: move the headline strip lower');
  });

  it('falls back to the source component when the API key is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const out = await applyComponentEdit({
      component: SOURCE,
      instruction: 'shift mood',
    });
    expect(out.plannerMode).toBe('fallback');
    expect(out.component).toBe(SOURCE);
    expect(out.plannerError).toMatch(/ANTHROPIC_API_KEY/);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('falls back on billing errors', async () => {
    mocks.create.mockRejectedValueOnce(
      new Error(
        'invalid_request_error: Your credit balance is too low to access the Anthropic API.'
      )
    );
    const out = await applyComponentEdit({
      component: SOURCE,
      instruction: 'shift mood',
    });
    expect(out.plannerMode).toBe('fallback');
    expect(out.component).toBe(SOURCE);
  });

  it('rethrows non-fallback errors (5xx, network)', async () => {
    mocks.create.mockRejectedValueOnce(new Error('500 internal'));
    await expect(
      applyComponentEdit({ component: SOURCE, instruction: 'shift mood' })
    ).rejects.toThrow(/500 internal/);
  });

  it('throws when the response has no patch_creative_component tool block', async () => {
    mocks.create.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'no patch' }],
      role: 'assistant',
      stop_reason: 'end_turn',
    });
    await expect(
      applyComponentEdit({ component: SOURCE, instruction: 'shift mood' })
    ).rejects.toThrow(/did not emit a patch_creative_component/);
  });

  it('falls back to source mood/safeZones when the model omits them', async () => {
    mockResponse({
      hero: { description: 'updated hero' },
      mood: {}, // missing keywords
      safeZones: [], // empty array
      cropPriorities: SOURCE.cropPriorities,
    });
    const out = await applyComponentEdit({
      component: SOURCE,
      instruction: 'just refresh the hero copy',
    });
    expect(out.component.hero.description).toBe('updated hero');
    expect(out.component.mood.keywords).toEqual(SOURCE.mood.keywords);
    expect(out.component.safeZones).toEqual(SOURCE.safeZones);
  });

  it('preserves source product/offer when model omits them', async () => {
    mockResponse({
      hero: { description: 'updated hero' },
      mood: { keywords: ['slow'] },
      safeZones: SOURCE.safeZones,
      cropPriorities: SOURCE.cropPriorities,
    });
    const out = await applyComponentEdit({
      component: SOURCE,
      instruction: 'just refresh the hero copy',
    });
    expect(out.component.product).toEqual(SOURCE.product);
    expect(out.component.offer).toEqual(SOURCE.offer);
  });

  it('throws on malformed bbox in the patch', async () => {
    mockResponse({
      hero: { description: 'updated' },
      mood: { keywords: ['slow'] },
      safeZones: [],
      cropPriorities: { primary: { x: 'bogus', y: 0, w: 1, h: 1 } },
    });
    await expect(
      applyComponentEdit({ component: SOURCE, instruction: 'shift' })
    ).rejects.toThrow(/cropPriorities.primary.x must be a finite number/);
  });

  it('clamps out-of-range bbox values to [0,1]', async () => {
    mockResponse({
      hero: { description: 'updated' },
      mood: { keywords: ['slow'] },
      safeZones: [],
      cropPriorities: { primary: { x: -0.5, y: 1.2, w: 2, h: 0.5 } },
    });
    const out = await applyComponentEdit({
      component: SOURCE,
      instruction: 'shift',
    });
    expect(out.component.cropPriorities.primary).toEqual({
      x: 0,
      y: 1,
      w: 1,
      h: 0.5,
    });
  });

  it('respects an injected anthropic dep', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const create = vi.fn();
    create.mockResolvedValueOnce({
      content: [
        { type: 'tool_use', name: 'patch_creative_component', id: 'x', input: MORE_PREMIUM_PATCH },
      ],
    });
    const fakeClient = { messages: { create } };
    const out = await applyComponentEdit(
      { component: SOURCE, instruction: 'edit' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { anthropic: fakeClient as any }
    );
    expect(out.plannerMode).toBe('anthropic');
    expect(create).toHaveBeenCalledOnce();
  });
});

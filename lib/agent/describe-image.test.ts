import { describe, expect, it, vi } from 'vitest';
import {
  buildSystemPrompt,
  describeImage,
  descriptionToSegmentPrompts,
  parseImageDescription,
  pickSegmentPrompt,
  type ImageDescription,
} from './describe-image';

describe('parseImageDescription', () => {
  it('parses a clean JSON-only response', () => {
    const text = JSON.stringify({
      faces: [{ name: 'jin', description: 'wet face under jacket' }],
      products: [{ name: 'leather jacket', description: 'black, water-soaked' }],
      brands: [],
      otherComponents: [
        { name: 'wet white shirt', kind: 'apparel' },
        { name: 'rain on body', kind: 'environment-prop' },
      ],
      smallObjectGroups: [
        { groupName: 'jewelry', members: ['necklace', 'earrings'] },
      ],
      background: { description: 'rainy urban street' },
    });
    const out = parseImageDescription(text);
    expect(out.faces).toEqual([
      { name: 'jin', description: 'wet face under jacket' },
    ]);
    expect(out.products).toHaveLength(1);
    expect(out.products[0].name).toBe('leather jacket');
    expect(out.otherComponents).toHaveLength(2);
    expect(out.smallObjectGroups[0].groupName).toBe('jewelry');
    expect(out.background.description).toBe('rainy urban street');
  });

  it('extracts JSON from prose-wrapped output', () => {
    const text =
      "Here's the inventory:\n```json\n{ \"faces\": [{\"description\":\"x\"}], \"products\":[], \"brands\":[], \"otherComponents\":[], \"smallObjectGroups\":[], \"background\":{\"description\":\"y\"} }\n```\nThanks!";
    const out = parseImageDescription(text);
    expect(out.faces).toEqual([{ description: 'x' }]);
    expect(out.background.description).toBe('y');
  });

  it('returns an empty description when the model produces unparsable text', () => {
    const out = parseImageDescription('I tried but no JSON');
    expect(out.faces).toEqual([]);
    expect(out.products).toEqual([]);
    expect(out.brands).toEqual([]);
    expect(out.otherComponents).toEqual([]);
    expect(out.smallObjectGroups).toEqual([]);
    expect(out.background.description).toBe('');
  });

  it('drops faces missing a description (we need that for SAM3 prompting)', () => {
    const out = parseImageDescription(
      JSON.stringify({
        faces: [
          { name: 'jin' }, // no description — drop
          { description: 'kept' },
        ],
        products: [],
        brands: [],
        otherComponents: [],
        smallObjectGroups: [],
        background: { description: '' },
      })
    );
    expect(out.faces).toHaveLength(1);
    expect(out.faces[0].description).toBe('kept');
  });

  it('coerces unrecognized other-component kinds to environment-prop (safe default)', () => {
    const out = parseImageDescription(
      JSON.stringify({
        faces: [],
        products: [],
        brands: [],
        otherComponents: [{ name: 'something', kind: 'made-up' }],
        smallObjectGroups: [],
        background: { description: '' },
      })
    );
    expect(out.otherComponents).toEqual([
      { name: 'something', kind: 'environment-prop' },
    ]);
  });
});

describe('descriptionToSegmentPrompts', () => {
  it('builds per-face / per-product / per-brand prompts with correct componentKind', () => {
    const desc: ImageDescription = {
      faces: [
        { description: "man's wet face under jacket" },
        { description: "woman's face beside him" },
      ],
      products: [{ name: 'leather jacket', description: 'black' }],
      brands: [{ name: 'COS logo', description: 'embroidered' }],
      otherComponents: [
        { name: 'wet white shirt', kind: 'apparel' },
        { name: 'arm raised', kind: 'pose' },
      ],
      smallObjectGroups: [
        { groupName: 'jewelry', members: ['necklace', 'earrings'] },
      ],
      background: { description: 'rainy urban street' },
    };
    const prompts = descriptionToSegmentPrompts(desc);

    // Per the granularity rule: each face / product / brand gets its own
    // prompt, with the matching kind tag.
    const kinds = prompts.map((p) => p.componentKind);
    expect(kinds.filter((k) => k === 'face').length).toBe(2);
    expect(kinds.filter((k) => k === 'product').length).toBe(1);
    expect(kinds.filter((k) => k === 'logo').length).toBe(1);
    expect(kinds.filter((k) => k === 'apparel').length).toBe(1);
    // Pose maps to 'other' (not apparel/accessory).
    expect(kinds.filter((k) => k === 'other').length).toBe(1);
    expect(kinds.filter((k) => k === 'accessory').length).toBe(1);
    // Background appears as a single prompt at the end.
    expect(kinds.filter((k) => k === 'background').length).toBe(1);
  });

  it('omits the background prompt when description is empty', () => {
    const desc: ImageDescription = {
      faces: [{ description: 'a face' }],
      products: [],
      brands: [],
      otherComponents: [],
      smallObjectGroups: [],
      background: { description: '' },
    };
    const prompts = descriptionToSegmentPrompts(desc);
    expect(prompts.some((p) => p.componentKind === 'background')).toBe(false);
  });

  it('uses the face name when description is missing (defensive — should not normally happen)', () => {
    // Bypassing the parser — direct construction may have name-only faces.
    const desc: ImageDescription = {
      faces: [{ name: 'jin', description: '' }],
      products: [],
      brands: [],
      otherComponents: [],
      smallObjectGroups: [],
      background: { description: '' },
    };
    const prompts = descriptionToSegmentPrompts(desc);
    expect(prompts[0].prompt).toContain('jin');
  });
});

describe('describeImage', () => {
  it('calls Anthropic vision with the image url and parses the JSON response', async () => {
    const messagesCreate = vi.fn().mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            faces: [{ description: 'a face' }],
            products: [],
            brands: [],
            otherComponents: [],
            smallObjectGroups: [],
            background: { description: 'studio' },
          }),
        },
      ],
    });
    const fakeClient = {
      messages: { create: messagesCreate },
    } as unknown as Parameters<typeof describeImage>[0]['client'];

    const out = await describeImage({
      imageUrl: 'https://cdn/hero.png',
      client: fakeClient,
    });

    expect(out.faces).toEqual([{ description: 'a face' }]);
    expect(out.background.description).toBe('studio');
    expect(messagesCreate).toHaveBeenCalledTimes(1);
    const call = messagesCreate.mock.calls[0][0];
    expect(call.model).toBe('claude-opus-4-7');
    // The image content block carries the URL through the SDK's url-source shape.
    const content = call.messages[0].content;
    expect(content[0].type).toBe('image');
    expect(content[0].source.type).toBe('url');
    expect(content[0].source.url).toBe('https://cdn/hero.png');
  });

  it('throws a clear error when neither client nor ANTHROPIC_API_KEY is provided', async () => {
    const previousKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    await expect(
      describeImage({ imageUrl: 'https://cdn/hero.png' })
    ).rejects.toThrow(/ANTHROPIC_API_KEY not set/);
    if (previousKey) process.env.ANTHROPIC_API_KEY = previousKey;
  });

  it('pipes brandContext into the system prompt so the model labels Eight Sleep products by canonical name', async () => {
    const messagesCreate = vi.fn().mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            faces: [],
            products: [
              { name: 'Pod 4 Ultra', description: 'mattress with thermal cover and Hub' },
            ],
            brands: [{ name: 'Eight Sleep', description: '' }],
            otherComponents: [],
            smallObjectGroups: [],
            background: { description: 'bedroom' },
          }),
        },
      ],
    });
    const fakeClient = {
      messages: { create: messagesCreate },
    } as unknown as Parameters<typeof describeImage>[0]['client'];
    const brandContext =
      'Page title: Eight Sleep | Pod 4 Ultra — The World\'s Most Intelligent Mattress\n' +
      'Page summary: The Pod tunes each side of your bed to your ideal temperature for deeper sleep.\n' +
      'Products mentioned on the page:\n' +
      '  - Pod 4 Ultra — The Pod 4 Ultra features a mattress with thermal cover and under-bed Hub for sleep tracking.';

    await describeImage({
      imageUrl: 'https://cdn/pod4-hero.png',
      client: fakeClient,
      brandContext,
    });

    const call = messagesCreate.mock.calls[0][0];
    // The system prompt must mention the canonical product name so the model
    // doesn't fall back to guessing from silhouette ("air purifier").
    expect(call.system).toContain('Pod 4 Ultra');
    expect(call.system).toContain('BRAND CONTEXT');
  });
});

/**
 * B1 regression — Eight Sleep fixture.
 *
 * Reproduces the "air purifier" bug:
 *   - WITHOUT brand context → pickSegmentPrompt receives only a generic
 *     visual description and the product name might not appear.
 *   - WITH brand context correctly wired → the description coming back from
 *     the vision model will say "mattress with thermal cover" (not "white box"
 *     or "air purifier") because buildSystemPrompt anchored it.
 *
 * These tests verify the Two-layer fix:
 *   Layer 1 — buildSystemPrompt injects canonical names into the vision call
 *             (tested above in the describeImage suite).
 *   Layer 2 — pickSegmentPrompt prefers the visual description (≥12 chars)
 *             over the brand name, so SAM3 gets grounded visual prompts
 *             instead of brand-semantic ones that 500.
 */
describe('pickSegmentPrompt — Eight Sleep fixture (B1 regression)', () => {
  it('prefers the visual description when it is ≥12 chars (mattress case)', () => {
    // After brand context fix, vision model returns this description.
    const prompt = pickSegmentPrompt({
      name: 'Pod 4 Ultra',
      description: 'mattress with thermal cover and chrome under-bed Hub',
    });
    // Must be the visual description, not the product name.
    expect(prompt).toBe('mattress with thermal cover and chrome under-bed Hub');
    // Critical regression: must NOT be the generic white-box guess.
    expect(prompt).not.toMatch(/white\s*box/i);
    expect(prompt).not.toMatch(/air.?purifier/i);
  });

  it('falls back to name when description is short (< 12 chars)', () => {
    // Edge case: model returns a terse description.
    const prompt = pickSegmentPrompt({ name: 'Pod Hub', description: 'device' });
    expect(prompt).toBe('Pod Hub');
  });

  it('returns null when both name and description are missing', () => {
    expect(pickSegmentPrompt({})).toBeNull();
  });

  it('uses the name when description is absent', () => {
    expect(pickSegmentPrompt({ name: 'Pod 4 Ultra' })).toBe('Pod 4 Ultra');
  });

  it('returns the description when name is absent and description is long enough', () => {
    const prompt = pickSegmentPrompt({
      description: 'low-profile mattress with chromium leg lighting',
    });
    expect(prompt).toBe('low-profile mattress with chromium leg lighting');
  });

  /**
   * Full-fixture test: given a vision description that looks like what the
   * model should produce WITH brand context wired in, assert that
   * descriptionToSegmentPrompts produces prompts containing "mattress"
   * (not "white box" or "air purifier"). This is the acceptance criterion
   * from the handoff — feed an Eight Sleep ingestion fixture and assert
   * the SAM3 prompt is product-accurate.
   */
  it('descriptionToSegmentPrompts with Eight Sleep fixture produces mattress-grounded SAM3 prompts', () => {
    // Simulated model output AFTER brand context is wired in:
    const desc: ImageDescription = {
      faces: [],
      products: [
        {
          name: 'Pod 4 Ultra',
          description: 'white mattress with thermal cover on a low-profile bed frame',
        },
      ],
      brands: [
        {
          name: 'Eight Sleep',
          description: 'circular Hub device under the bed for sleep tracking',
        },
      ],
      otherComponents: [
        { name: 'bedside table', kind: 'environment-prop' },
      ],
      smallObjectGroups: [],
      background: { description: 'modern Scandinavian bedroom with soft lighting' },
    };

    const prompts = descriptionToSegmentPrompts(desc);
    const promptTexts = prompts.map((p) => p.prompt);

    // The product prompt must be the VISUAL description, not the brand name.
    const productPrompt = prompts.find((p) => p.componentKind === 'product');
    expect(productPrompt).toBeDefined();
    expect(productPrompt!.prompt).toContain('mattress');
    // Must not be the air-purifier mis-label.
    expect(productPrompt!.prompt).not.toMatch(/air.?purifier/i);

    // The brand/logo prompt should use the visual description of the Hub.
    const logoPrompt = prompts.find((p) => p.componentKind === 'logo');
    expect(logoPrompt).toBeDefined();
    // Hub description is ≥12 chars — should prefer it over just "Eight Sleep".
    expect(logoPrompt!.prompt).toContain('Hub');

    // Background is present.
    expect(promptTexts).toContain('background');
  });
});

describe('buildSystemPrompt — Eight Sleep brand context injection', () => {
  it('includes canonical product name in system prompt when brand context supplied', () => {
    const ctx =
      'Page title: Eight Sleep | Pod 4 Ultra\nProducts mentioned on the page:\n  - Pod 4 Ultra — mattress with thermal cover, sleep tracking Hub';
    const system = buildSystemPrompt(ctx);
    expect(system).toContain('Pod 4 Ultra');
    expect(system).toContain('BRAND CONTEXT');
    expect(system).toContain('CANONICAL names');
  });

  it('returns base prompt unchanged when no brand context supplied', () => {
    const system = buildSystemPrompt();
    expect(system).not.toContain('BRAND CONTEXT');
    expect(system).toContain('hero-image analyst');
  });

  it('returns base prompt unchanged when brand context is whitespace-only', () => {
    const system = buildSystemPrompt('   ');
    expect(system).not.toContain('BRAND CONTEXT');
  });
});

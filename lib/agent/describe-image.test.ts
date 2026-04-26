import { describe, expect, it, vi } from 'vitest';
import {
  describeImage,
  descriptionToSegmentPrompts,
  parseImageDescription,
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
});

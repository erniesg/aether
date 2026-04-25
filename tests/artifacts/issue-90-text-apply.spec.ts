/**
 * Artifact for issue #90 part 1 — proves /api/text-overlay/apply is wired
 * end-to-end: a request body that's a valid SemanticCreativeComponent
 * produces ProposedTextOverlay layers shaped by the agent (or its
 * brand-aware fallback when ANTHROPIC_API_KEY isn't configured on the
 * runtime).
 *
 * The reviewer agent + Ernie consume this from #aether-review. Real test
 * coverage of the agent itself lives in lib/agent/text-apply.test.ts (18
 * unit tests against mocked Anthropic SDK).
 */
import { expect, test } from '@playwright/test';

const FIXTURE = {
  component: {
    hero: { description: 'a single ripe persimmon, golden hour, satin skin' },
    product: { description: 'glass tincture bottle' },
    offer: { weight: 'aggressive' as const },
    mood: { keywords: ['slow', 'editorial', 'warm bounce'] },
    safeZones: [
      { purpose: 'headline', bbox: { x: 0, y: 0, w: 1, h: 0.2 }, mustSurviveAllCrops: false },
      { purpose: 'cta', bbox: { x: 0, y: 0.85, w: 1, h: 0.15 }, mustSurviveAllCrops: false },
      { purpose: 'hero', bbox: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 } },
    ],
    cropPriorities: { primary: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 } },
    formats: [
      { id: 'ig-post', w: 1080, h: 1350, label: 'IG Post' },
      { id: 'story', w: 1080, h: 1920, label: 'Story' },
    ],
  },
  sourceLocale: 'en-US',
  targetLocales: ['zh-SG'],
  brand: { name: 'Solstice Skin', voice: 'slow, certain' },
  wsId: 'demo-ws',
  artboardId: 'ab-hero',
  capabilityRunId: 'cap-run-fixture',
};

test('POST /api/text-overlay/apply returns multilingual layers for a valid component', async ({
  request,
}) => {
  const response = await request.post('/api/text-overlay/apply', { data: FIXTURE });
  expect(response.status()).toBe(200);

  const body = await response.json();
  expect(body.ok).toBe(true);
  expect(['anthropic', 'fallback', 'noop']).toContain(body.plannerMode);
  expect(body.provenance).toMatchObject({
    sourceLocale: 'en-US',
    targetLocales: ['zh-SG'],
    wsId: 'demo-ws',
    artboardId: 'ab-hero',
    capabilityRunId: 'cap-run-fixture',
  });

  // The fixture has 2 text-bearing safe zones (headline + cta) plus 1 visual
  // (hero). The agent must filter the visual zone and emit exactly 2 layers.
  expect(Array.isArray(body.layers)).toBe(true);
  expect(body.layers).toHaveLength(2);

  for (const layer of body.layers) {
    expect(['headline', 'subhead', 'body', 'caption', 'cta']).toContain(layer.zone.purpose);
    expect(layer.zone.bbox).toMatchObject({ x: expect.any(Number), y: expect.any(Number) });
    expect(layer.content).toMatchObject({ 'en-US': expect.any(String) });
    // zh-SG should be present (either translated by Anthropic or mirrored from
    // source on fallback). Both are acceptable artifact-level outcomes.
    expect(layer.content['zh-SG']).toEqual(expect.any(String));
    expect(['start', 'center', 'end']).toContain(layer.textAlign);
  }
});

test('POST /api/text-overlay/apply rejects malformed body with 400', async ({ request }) => {
  const response = await request.post('/api/text-overlay/apply', {
    data: { sourceLocale: 'en-US' }, // no component
  });
  expect(response.status()).toBe(400);
  const body = await response.json();
  expect(body.ok).toBe(false);
  expect(body.error).toMatch(/component/i);
});

test('POST /api/text-overlay/apply rejects missing sourceLocale with 400', async ({
  request,
}) => {
  const response = await request.post('/api/text-overlay/apply', {
    data: { component: FIXTURE.component }, // no sourceLocale
  });
  expect(response.status()).toBe(400);
  const body = await response.json();
  expect(body.ok).toBe(false);
  expect(body.error).toMatch(/sourceLocale|BCP-47/i);
});

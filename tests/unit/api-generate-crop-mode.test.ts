/**
 * Tests for crop-from-hero wiring in /api/generate.
 *
 * Verifies that:
 *   - mode='crop'   → 1 image gen call + N-1 cropHeroToFormats calls
 *   - mode='fanout' → N image gen calls, 0 crop calls (existing behaviour)
 *   - mode='auto'   → delegates to pickRenderMode (spread threshold)
 *   - mode='crop'   → single target behaves like fanout (1 gen, 0 crop calls)
 *
 * The route is imported fresh per test group to avoid cross-test mock state.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

// ─── hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  planGenerate: vi.fn(),
  providerGenerate: vi.fn(),
  cropHeroToFormats: vi.fn(),
  recordRunStart: vi.fn(),
  recordRunFinish: vi.fn(),
  recordRunFail: vi.fn(),
}));

vi.mock('@/lib/agent/generate', () => ({
  CLAUDE_MODEL: 'claude-opus-4-7',
  planGenerate: mocks.planGenerate,
  runGenerate: vi.fn(),
}));

vi.mock('@/lib/providers/image/registry', () => ({
  listAvailableProviders: () => ['openai'],
  resolveProvider: () => ({
    id: 'openai',
    displayName: 'OpenAI Images',
    listModels: () => ['gpt-image-1'],
    generate: mocks.providerGenerate,
  }),
}));

vi.mock('@/lib/canvas/cropToFormat', () => ({
  cropHeroToFormats: mocks.cropHeroToFormats,
}));

vi.mock('@/lib/convex/http', () => ({
  recordRunStart: mocks.recordRunStart,
  recordRunFinish: mocks.recordRunFinish,
  recordRunFail: mocks.recordRunFail,
}));

// ─── helpers ──────────────────────────────────────────────────────────────────

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZwkmBYAAAAASUVORK5CYII=';

/** A 1024×1280 (4:5) image returned by the mock provider. */
const HERO_IMAGE = {
  url: TINY_PNG,
  width: 1024,
  height: 1280,
  mimeType: 'image/png',
};

/** Default plan stub — provider result is separate. */
const PLAN_STUB = {
  plan: {
    rewrittenPrompt: 'vivid editorial still-life',
    aspectRatio: '4:5',
    rationale: 'test plan',
  },
  provider: { id: 'openai', displayName: 'OpenAI Images', model: 'gpt-image-1' },
  debug: { plannerMode: 'bypass' as const },
};

function providerResult(ar: string = '4:5', w = 1024, h = 1280) {
  return {
    provider: 'openai',
    model: 'gpt-image-1',
    latencyMs: 1000,
    images: [{ url: TINY_PNG, width: w, height: h, mimeType: 'image/png' }],
  };
}

function parseSse(text: string): Array<Record<string, unknown>> {
  return text
    .trim()
    .split(/\n\n+/)
    .map((chunk) =>
      chunk
        .split('\n')
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice(6))
        .join('\n')
    )
    .filter(Boolean)
    .map((payload) => JSON.parse(payload) as Record<string, unknown>);
}

async function post(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/generate/route');
  return POST(
    new Request('http://localhost/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
}

// ─── four targets used across tests ──────────────────────────────────────────

const FOUR_TARGETS = [
  { id: 'frame_post',     label: 'IG Post',   aspectRatio: '4:5'  }, // 1024 × 1280 px
  { id: 'frame_story',   label: 'Story',     aspectRatio: '9:16' }, // 1080 × 1920 px
  { id: 'frame_square',  label: 'Square',    aspectRatio: '1:1'  }, // 1080 × 1080 px
  { id: 'frame_banner',  label: 'Banner',    aspectRatio: '16:9' }, // 1920 × 1080 px
];

// ─── crop-mode stubs ──────────────────────────────────────────────────────────

/**
 * cropHeroToFormats returns one CroppedFormat per format.
 * We only need a minimal shape: { formatId, format, crop, w, h, fit, clippedZones }.
 */
function stubCroppedFormats(formats: typeof FOUR_TARGETS) {
  return formats.map((t) => ({
    formatId: t.id,
    format: { id: t.id, w: 1080, h: 1080 },
    crop: { topLeft: { x: 0, y: 0 }, bottomRight: { x: 1, y: 1 } },
    w: 1080,
    h: 1080,
    fit: 'centered-fallback',
    clippedZones: [],
  }));
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('/api/generate · mode=crop', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('generates once (hero) and crops the remaining 3 targets — 1 gen + 3 crops', async () => {
    mocks.planGenerate.mockResolvedValue(PLAN_STUB);
    mocks.providerGenerate.mockResolvedValue(providerResult());
    mocks.cropHeroToFormats.mockReturnValue(stubCroppedFormats(FOUR_TARGETS.slice(1)));

    const response = await post({
      prompt: 'product launch still life',
      bypassAgent: true,
      mode: 'crop',
      targets: FOUR_TARGETS,
    });

    const events = parseSse(await response.text());

    // Exactly one image generation call.
    expect(mocks.providerGenerate).toHaveBeenCalledTimes(1);
    // cropHeroToFormats called once for the non-hero targets.
    expect(mocks.cropHeroToFormats).toHaveBeenCalledTimes(1);

    // All 4 frames complete (1 generated + 3 cropped).
    const completed = events.filter((e) => e.type === 'frame.completed');
    expect(completed).toHaveLength(4);

    const runCompleted = events.at(-1) as Record<string, unknown>;
    expect(runCompleted).toMatchObject({
      type: 'run.completed',
      status: 'ok',
      frames: { total: 4, completed: 4, failed: 0 },
    });
    // Mode surfaced in run.started event.
    const runStarted = events[0] as Record<string, unknown>;
    expect(runStarted).toMatchObject({ type: 'run.started', mode: 'crop' });
  });

  it('generates N times with mode=fanout — 4 gen calls, 0 crops', async () => {
    mocks.planGenerate.mockResolvedValue(PLAN_STUB);
    mocks.providerGenerate.mockImplementation(async () => providerResult());

    const response = await post({
      prompt: 'product launch still life',
      bypassAgent: true,
      mode: 'fanout',
      targets: FOUR_TARGETS,
    });

    const events = parseSse(await response.text());

    expect(mocks.providerGenerate).toHaveBeenCalledTimes(4);
    expect(mocks.cropHeroToFormats).not.toHaveBeenCalled();

    const completed = events.filter((e) => e.type === 'frame.completed');
    expect(completed).toHaveLength(4);
    expect(events.at(-1)).toMatchObject({
      type: 'run.completed',
      status: 'ok',
      frames: { total: 4, completed: 4, failed: 0 },
    });
    const runStarted = events[0] as Record<string, unknown>;
    expect(runStarted).toMatchObject({ type: 'run.started', mode: 'fanout' });
  });

  it('mode=auto with wide spread (3:4 + 16:9, spread 2.37) fans out — 2 gen calls, 0 crops', async () => {
    // 3:4 = 0.75, 16:9 = 1.778 → spread = 1.778/0.75 = 2.37 > 2 → fanout.
    mocks.planGenerate.mockResolvedValue(PLAN_STUB);
    mocks.providerGenerate.mockImplementation(async () => providerResult());

    const spreadTargets = [
      { id: 'frame_portrait', label: 'Portrait', aspectRatio: '3:4'  },
      { id: 'frame_wide',     label: 'Wide',     aspectRatio: '16:9' },
    ];

    const response = await post({
      prompt: 'spread test',
      bypassAgent: true,
      mode: 'auto',
      targets: spreadTargets,
    });

    const events = parseSse(await response.text());

    expect(mocks.providerGenerate).toHaveBeenCalledTimes(2);
    expect(mocks.cropHeroToFormats).not.toHaveBeenCalled();
    // run.completed carries the resolved mode.
    expect(events.at(-1)).toMatchObject({ type: 'run.completed', mode: 'fanout' });
  });

  it('mode=auto with tight spread crops (1:1 + 4:5 = spread 1.25)', async () => {
    mocks.planGenerate.mockResolvedValue(PLAN_STUB);
    mocks.providerGenerate.mockResolvedValue(providerResult());
    mocks.cropHeroToFormats.mockReturnValue(stubCroppedFormats([
      { id: 'frame_post', label: 'IG Post', aspectRatio: '4:5' },
    ]));

    const tightTargets = [
      { id: 'frame_square', label: 'Square', aspectRatio: '1:1' },
      { id: 'frame_post',   label: 'IG Post', aspectRatio: '4:5' },
    ];

    const response = await post({
      prompt: 'tight spread test',
      bypassAgent: true,
      mode: 'auto',
      targets: tightTargets,
    });

    const events = parseSse(await response.text());

    // 1:1 (1.0) and 4:5 (0.8) → spread = 1.0/0.8 = 1.25 ≤ 2 → crop.
    expect(mocks.providerGenerate).toHaveBeenCalledTimes(1);
    expect(mocks.cropHeroToFormats).toHaveBeenCalledTimes(1);
    expect(events[0]).toMatchObject({ type: 'run.started', mode: 'crop' });
  });

  it('mode=crop with single target generates once and calls no crop', async () => {
    mocks.planGenerate.mockResolvedValue(PLAN_STUB);
    mocks.providerGenerate.mockResolvedValue(providerResult());

    const response = await post({
      prompt: 'single target crop',
      bypassAgent: true,
      mode: 'crop',
      targets: [{ id: 'frame_post', label: 'IG Post', aspectRatio: '4:5' }],
    });

    const events = parseSse(await response.text());

    // With 1 target crop is a no-op: just generate the hero.
    expect(mocks.providerGenerate).toHaveBeenCalledTimes(1);
    expect(mocks.cropHeroToFormats).not.toHaveBeenCalled();

    const completed = events.filter((e) => e.type === 'frame.completed');
    expect(completed).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({
      type: 'run.completed',
      status: 'ok',
      frames: { total: 1, completed: 1, failed: 0 },
    });
  });

  it('run.completed payload includes mode field', async () => {
    mocks.planGenerate.mockResolvedValue(PLAN_STUB);
    mocks.providerGenerate.mockResolvedValue(providerResult());
    mocks.cropHeroToFormats.mockReturnValue(stubCroppedFormats(FOUR_TARGETS.slice(1)));

    const response = await post({
      prompt: 'mode field test',
      bypassAgent: true,
      mode: 'crop',
      targets: FOUR_TARGETS,
    });

    const events = parseSse(await response.text());
    const completed = events.at(-1) as Record<string, unknown>;
    expect(completed.type).toBe('run.completed');
    expect(completed.mode).toBe('crop');
  });

  it('hero is the largest target by pixel area', async () => {
    mocks.planGenerate.mockResolvedValue(PLAN_STUB);
    mocks.providerGenerate.mockResolvedValue(providerResult('16:9', 1920, 1080));
    mocks.cropHeroToFormats.mockReturnValue(stubCroppedFormats([
      { id: 'frame_post',   label: 'IG Post',  aspectRatio: '4:5'  },
      { id: 'frame_square', label: 'Square',   aspectRatio: '1:1'  },
    ]));

    // 16:9 frame has 1920×1080 = 2,073,600 px — largest.
    const targetsWithLargeBanner = [
      { id: 'frame_post',   label: 'IG Post',  aspectRatio: '4:5'  },
      { id: 'frame_square', label: 'Square',   aspectRatio: '1:1'  },
      { id: 'frame_banner', label: 'Banner',   aspectRatio: '16:9' },
    ];

    await post({
      prompt: 'hero is banner',
      bypassAgent: true,
      mode: 'crop',
      targets: targetsWithLargeBanner,
    });

    // The provider must have been called with the hero's aspect ratio.
    expect(mocks.providerGenerate).toHaveBeenCalledTimes(1);
    const call = mocks.providerGenerate.mock.calls[0][0] as { aspectRatio: string };
    expect(call.aspectRatio).toBe('16:9');
  });
});

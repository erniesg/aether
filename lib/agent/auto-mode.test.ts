import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Auto Mode orchestrator (handoff §9 v1):
 *
 * For each variation 1..N, runMultiAgent drives the existing tool loop with
 * a per-variation system prompt that asks for a structured JSON envelope.
 * The orchestrator parses the envelope (caption/hashtags/schedule/mood),
 * extracts the hero image URL from the agent's tool steps, persists a
 * campaignVariation row in Convex via lib/convex/http, and on lap completion
 * fires a Discord webhook in 'notify' mode.
 *
 * These tests mock runMultiAgent + the Convex http helpers + the Discord
 * helper so the lap is exercised end-to-end without network or LLM calls.
 */

const mocks = vi.hoisted(() => {
  const runMultiAgent = vi.fn();
  const startCampaign = vi.fn();
  const setCampaignStatus = vi.fn();
  const insertCampaignVariation = vi.fn();
  const recordScheduledPost = vi.fn();
  const notifyDiscord = vi.fn();
  const publisherSchedule = vi.fn();
  const resolvePublisher = vi.fn();
  const resolvePublisherForPost = vi.fn();
  const segmentSubjects = vi.fn();
  const describeImage = vi.fn();
  const fetchUrlIngestion = vi.fn();
  const fetchPdfIngestion = vi.fn();
  const uploadAssetToConvex = vi.fn();
  const renderPerFormatHeroes = vi.fn();
  // B2: research agent mock — fail-soft by default (resolves to undefined → no bundle).
  const runResearchAgent = vi.fn().mockResolvedValue(undefined);
  // Signoff Managed Agent mock — by default not invoked (gated by env flag).
  const runSignoffAgent = vi.fn();
  return {
    runMultiAgent,
    startCampaign,
    setCampaignStatus,
    insertCampaignVariation,
    recordScheduledPost,
    notifyDiscord,
    publisherSchedule,
    resolvePublisher,
    resolvePublisherForPost,
    segmentSubjects,
    describeImage,
    fetchUrlIngestion,
    fetchPdfIngestion,
    uploadAssetToConvex,
    renderPerFormatHeroes,
    runResearchAgent,
    runSignoffAgent,
  };
});

vi.mock('./multi', () => ({
  runMultiAgent: mocks.runMultiAgent,
}));

vi.mock('@/lib/convex/http', () => ({
  startCampaign: mocks.startCampaign,
  setCampaignStatus: mocks.setCampaignStatus,
  insertCampaignVariation: mocks.insertCampaignVariation,
  recordScheduledPost: mocks.recordScheduledPost,
  // Persistence helpers added when researchBundle / schedulePlan / clusterBundle
  // moved onto the campaign row. Mocked as no-ops so tests don't crash on the
  // import-side check; not asserted on by default.
  setCampaignResearchBundle: vi.fn().mockResolvedValue(undefined),
  setCampaignSchedulePlan: vi.fn().mockResolvedValue(undefined),
  setCampaignClusterBundle: vi.fn().mockResolvedValue(undefined),
  // Structured per-lap event log (lib/agent/lap-logger.ts → recordLapEvent).
  // No-op mock so the lap-event sprinkles don't blow up tests.
  recordLapEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/notify/discord', () => ({
  notifyDiscord: mocks.notifyDiscord,
}));

vi.mock('@/lib/providers/publisher/registry', () => ({
  resolvePublisher: mocks.resolvePublisher,
  resolvePublisherForPost: mocks.resolvePublisherForPost,
}));

vi.mock('./segment-subjects', async () => {
  // Keep ONE_SHOT_PROMPTS + segmentSubjectsToForbiddenRegions real — they are
  // pure helpers; only segmentSubjects is mocked since it does network I/O.
  const actual = await vi.importActual<typeof import('./segment-subjects')>(
    './segment-subjects'
  );
  return {
    ...actual,
    segmentSubjects: mocks.segmentSubjects,
  };
});

vi.mock('./describe-image', async () => {
  const actual = await vi.importActual<typeof import('./describe-image')>(
    './describe-image'
  );
  return {
    ...actual,
    describeImage: mocks.describeImage,
  };
});

vi.mock('@/lib/ingest/url', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ingest/url')>(
    '@/lib/ingest/url'
  );
  return {
    ...actual,
    fetchUrlIngestion: mocks.fetchUrlIngestion,
  };
});

vi.mock('@/lib/ingest/pdf', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ingest/pdf')>(
    '@/lib/ingest/pdf'
  );
  return {
    ...actual,
    fetchPdfIngestion: mocks.fetchPdfIngestion,
  };
});

vi.mock('@/lib/storage/convexAsset', async () => {
  const actual = await vi.importActual<typeof import('@/lib/storage/convexAsset')>(
    '@/lib/storage/convexAsset'
  );
  return {
    ...actual,
    uploadAssetToConvex: mocks.uploadAssetToConvex,
  };
});

vi.mock('./per-format-render', async () => {
  const actual = await vi.importActual<typeof import('./per-format-render')>(
    './per-format-render'
  );
  return {
    ...actual,
    renderPerFormatHeroes: mocks.renderPerFormatHeroes,
  };
});

// B2: mock the research agent so runAutoMode can be tested without LLM calls.
vi.mock('./managed/research', () => ({
  runResearchAgent: mocks.runResearchAgent,
}));

// Signoff Managed Agent — mocked so runAutoMode tests exercise the gate
// without burning Anthropic credits.
vi.mock('./managed/signoff', () => ({
  runSignoffAgent: mocks.runSignoffAgent,
}));

// Cluster Managed Agent — mocked as undefined-resolver so cluster wiring
// doesn't fire in tests that don't explicitly expect it.
vi.mock('./managed/cluster', () => ({
  runClusterAgent: vi.fn().mockResolvedValue(undefined),
}));

import {
  parseAgentEnvelope,
  pickHeroImageUrl,
  runAutoMode,
} from './auto-mode';

describe('parseAgentEnvelope', () => {
  it('parses a clean JSON-only final text', () => {
    const out = parseAgentEnvelope(
      JSON.stringify({
        caption: 'a calm urban park',
        hashtags: ['#one', '#two'],
        platform: 'instagram',
        whenLocal: '2026-04-27T19:00:00+08:00',
        moodNote: 'urban serenity',
      })
    );
    expect(out).toMatchObject({
      caption: 'a calm urban park',
      hashtags: ['#one', '#two'],
      platform: 'instagram',
      whenLocal: '2026-04-27T19:00:00+08:00',
      moodNote: 'urban serenity',
    });
  });

  it('extracts JSON from prose-wrapped final text', () => {
    const out = parseAgentEnvelope(
      'Here is the plan you asked for:\n```json\n{ "caption": "x", "moodNote": "warm dusk" }\n```\nThanks!'
    );
    expect(out.caption).toBe('x');
    expect(out.moodNote).toBe('warm dusk');
  });

  it('returns empty object on unparsable text', () => {
    const out = parseAgentEnvelope('I tried but could not produce JSON');
    expect(out).toEqual({});
  });

  it('drops non-string hashtags defensively', () => {
    const out = parseAgentEnvelope(
      JSON.stringify({ hashtags: ['#ok', 42, null, '#fine'] })
    );
    expect(out.hashtags).toEqual(['#ok', '#fine']);
  });

  // Regression: IKEA lap shipped `<no caption>` because the agent emitted
  // `captionsByLocale.en-SG` but omitted top-level `caption`. The lap-end
  // ping read ONLY `caption`, so the en-SG translation was effectively
  // invisible. parseAgentEnvelope must hoist en-SG → caption when caption
  // is absent so all downstream consumers (Discord text + embed) see it.
  it('falls back to captionsByLocale.en-SG when top-level caption is absent', () => {
    const out = parseAgentEnvelope(
      JSON.stringify({
        captionsByLocale: {
          'en-SG': 'IKEA SG sustainable furniture, made affordable',
          'zh-Hans-SG': '宜家新加坡可持续家具，价格实惠',
        },
        moodNote: 'warm bright',
      })
    );
    expect(out.caption).toBe('IKEA SG sustainable furniture, made affordable');
    expect(out.captionsByLocale?.['en-SG']).toBe(
      'IKEA SG sustainable furniture, made affordable'
    );
  });

  it('keeps top-level caption when both are present (does NOT overwrite)', () => {
    const out = parseAgentEnvelope(
      JSON.stringify({
        caption: 'top-level wins',
        captionsByLocale: { 'en-SG': 'do not use this' },
      })
    );
    expect(out.caption).toBe('top-level wins');
  });
});

describe('pickHeroImageUrl', () => {
  it('returns the first generate_image step result image url', () => {
    const url = pickHeroImageUrl([
      { index: 0, name: 'search_signals', input: {}, ok: true, ms: 10, output: {} },
      {
        index: 1,
        name: 'generate_image',
        input: {},
        ok: true,
        ms: 12,
        output: { result: { images: [{ url: 'https://cdn/x.png' }] } },
      },
    ]);
    expect(url).toBe('https://cdn/x.png');
  });

  it('falls back to top-level imageUrl when result.images is absent', () => {
    const url = pickHeroImageUrl([
      {
        index: 0,
        name: 'generate_image',
        input: {},
        ok: true,
        ms: 12,
        output: { imageUrl: 'https://cdn/y.png' },
      },
    ]);
    expect(url).toBe('https://cdn/y.png');
  });

  it('skips failed generate_image steps', () => {
    const url = pickHeroImageUrl([
      { index: 0, name: 'generate_image', input: {}, ok: false, errorMessage: 'x', ms: 1 },
    ]);
    expect(url).toBeUndefined();
  });
});

describe('runAutoMode · orchestration', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.startCampaign.mockResolvedValue('camp_1');
    mocks.insertCampaignVariation.mockResolvedValue('var_x');
    mocks.setCampaignStatus.mockResolvedValue(undefined);
    mocks.notifyDiscord.mockResolvedValue(true);
  });

  afterEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
  });

  it('runs N variations in sequence, persists each, and notifies when notifyMode=notify', async () => {
    const variationOutputs = [
      {
        finalText: JSON.stringify({
          caption: 'one',
          hashtags: ['#a'],
          platform: 'instagram',
          whenLocal: '2026-04-27T10:00+08:00',
          moodNote: 'mood-A',
        }),
        steps: [
          {
            index: 0,
            name: 'search_signals',
            input: {},
            ok: true,
            ms: 5,
            output: {},
            clientRunId: 'agent_signals-search_1',
          },
          {
            index: 1,
            name: 'generate_image',
            input: {},
            ok: true,
            ms: 12,
            output: { result: { images: [{ url: 'https://cdn/A.png' }] } },
            clientRunId: 'agent_image-gen_1',
          },
        ],
        iterations: 2,
        stopReason: 'end_turn',
      },
      {
        finalText: JSON.stringify({
          caption: 'two',
          hashtags: ['#b'],
          platform: 'instagram',
          whenLocal: '2026-04-28T19:00+08:00',
          moodNote: 'mood-B',
        }),
        steps: [
          {
            index: 0,
            name: 'generate_image',
            input: {},
            ok: true,
            ms: 11,
            output: { result: { images: [{ url: 'https://cdn/B.png' }] } },
            clientRunId: 'agent_image-gen_2',
          },
        ],
        iterations: 1,
        stopReason: 'end_turn',
      },
    ];
    mocks.runMultiAgent
      .mockResolvedValueOnce(variationOutputs[0])
      .mockResolvedValueOnce(variationOutputs[1]);

    const result = await runAutoMode({
      baseUrl: 'http://localhost:3000',
      workspaceId: 'ws_x',
      trigger: { kind: 'text', payload: 'streetwear lookbook' },
      variationCount: 2,
      notifyMode: 'notify',
    });

    expect(result.status).toBe('completed');
    expect(result.campaignId).toBe('camp_1');
    expect(result.variations).toHaveLength(2);
    expect(result.variations[0]).toMatchObject({
      index: 1,
      status: 'ready',
      heroImageUrl: 'https://cdn/A.png',
      caption: 'one',
      moodNote: 'mood-A',
    });
    expect(result.variations[1]).toMatchObject({
      index: 2,
      status: 'ready',
      heroImageUrl: 'https://cdn/B.png',
      caption: 'two',
      moodNote: 'mood-B',
    });

    // Persistence: one start, two variations, one final status flip.
    expect(mocks.startCampaign).toHaveBeenCalledTimes(1);
    expect(mocks.insertCampaignVariation).toHaveBeenCalledTimes(2);
    expect(mocks.setCampaignStatus).toHaveBeenCalledWith('camp_1', 'completed');

    // Discord ping in 'notify' mode.
    expect(result.notified).toBe(true);
    // 2 pings: lap-start + lap-end. The user explicitly asked for visibility
    // on kickoff so the start ping fires regardless of notifyMode.
    expect(mocks.notifyDiscord).toHaveBeenCalledTimes(2);
    const tags = mocks.notifyDiscord.mock.calls.map((c: any[]) => c[0].tag);
    expect(tags).toContain('lap-start');
    expect(tags).toContain('lap-end-notify');
    const endCall = mocks.notifyDiscord.mock.calls.find(
      (c: any[]) => c[0].tag === 'lap-end-notify'
    );
    if (!endCall) throw new Error('expected lap-end-notify Discord call');
    expect(endCall[0].content).toContain('2/2 variations ready');
  });

  it('passes prior moodNotes into the next variation prompt for distinctness', async () => {
    mocks.runMultiAgent
      .mockResolvedValueOnce({
        finalText: JSON.stringify({ moodNote: 'serene-A' }),
        steps: [],
        iterations: 1,
        stopReason: 'end_turn',
      })
      .mockResolvedValueOnce({
        finalText: JSON.stringify({ moodNote: 'punchy-B' }),
        steps: [],
        iterations: 1,
        stopReason: 'end_turn',
      });

    await runAutoMode({
      baseUrl: 'http://localhost:3000',
      trigger: { kind: 'text', payload: 'keto recipes' },
      variationCount: 2,
      notifyMode: 'review',
    });

    expect(mocks.runMultiAgent).toHaveBeenCalledTimes(2);
    const firstPrompt = mocks.runMultiAgent.mock.calls[0][0].prompt as string;
    const secondPrompt = mocks.runMultiAgent.mock.calls[1][0].prompt as string;
    expect(firstPrompt).toContain('first variation');
    expect(secondPrompt).toContain('serene-A');
  });

  it('fires lap-start AND lap-end pings on review mode (with AWAITING APPROVAL header)', async () => {
    mocks.runMultiAgent.mockResolvedValueOnce({
      finalText: '{}',
      steps: [],
      iterations: 1,
      stopReason: 'end_turn',
    });

    await runAutoMode({
      baseUrl: 'http://localhost:3000',
      trigger: { kind: 'text', payload: 'x' },
      variationCount: 1,
      notifyMode: 'review',
    });

    // Lifecycle: 2 pings (start + end). The 'review' end ping flags
    // approval-required copy so the user knows action is needed.
    expect(mocks.notifyDiscord).toHaveBeenCalledTimes(2);
    const tags = mocks.notifyDiscord.mock.calls.map((c: any[]) => c[0].tag);
    expect(tags).toEqual(['lap-start', 'lap-end-review']);
    const endCall = mocks.notifyDiscord.mock.calls.find(
      (c: any[]) => c[0].tag === 'lap-end-review'
    );
    if (!endCall) throw new Error('expected lap-end-review Discord call');
    expect(endCall[0].content).toContain('AWAITING APPROVAL');
  });

  it('caption appears in lap-end embed and text body even when only captionsByLocale.en-SG is present', async () => {
    // Regression for the IKEA `<no caption>` Discord ping. The agent emitted
    // captionsByLocale but no top-level `caption`; the lap-end body printed
    // `<no caption>` because it read `v.caption` directly. After the fix:
    //   - parseAgentEnvelope hoists en-SG → caption
    //   - both the variation-line (text) and the embed surface the caption
    mocks.runMultiAgent.mockResolvedValueOnce({
      finalText: JSON.stringify({
        // No top-level `caption` — only captionsByLocale.
        captionsByLocale: {
          'en-SG': 'IKEA SG sustainable furniture, made affordable',
          'zh-Hans-SG': '宜家新加坡可持续家具，价格实惠',
          'ms-SG': 'Perabot mampan IKEA SG, harga berpatutan',
          'ta-SG': 'IKEA SG நீடித்த தளபாடங்கள், மலிவான விலையில்',
        },
        platform: 'instagram',
        whenLocal: '2026-04-27T19:00+08:00',
        moodNote: 'warm-bright',
      }),
      steps: [
        {
          index: 0,
          name: 'generate_image',
          input: {},
          ok: true,
          ms: 12,
          output: { result: { images: [{ url: 'https://cdn/ikea.png' }] } },
          clientRunId: 'agent_image-gen_1',
        },
      ],
      iterations: 1,
      stopReason: 'end_turn',
    });

    const result = await runAutoMode({
      baseUrl: 'http://localhost:3000',
      workspaceId: 'ws_x',
      trigger: { kind: 'text', payload: 'IKEA' },
      variationCount: 1,
      notifyMode: 'notify',
    });

    expect(result.variations[0].caption).toBe(
      'IKEA SG sustainable furniture, made affordable'
    );

    const endCall = mocks.notifyDiscord.mock.calls.find(
      (c: any[]) => c[0].tag === 'lap-end-notify'
    );
    if (!endCall) throw new Error('expected lap-end-notify Discord call');
    // Text body MUST NOT show the placeholder.
    expect(endCall[0].content).not.toContain('<no caption>');
    // Text body MUST contain (a prefix of) the en-SG caption.
    expect(endCall[0].content).toContain('IKEA SG sustainable furniture');
    // Embed array MUST carry the caption as title and description.
    expect(endCall[0].embeds).toBeDefined();
    expect(endCall[0].embeds[0].title).toContain('IKEA SG sustainable');
    expect(endCall[0].embeds[0].description).toContain(
      'IKEA SG sustainable furniture'
    );
  });

  it('uses POSTS SCHEDULED copy on auto-post lap-end ping', async () => {
    mocks.runMultiAgent.mockResolvedValueOnce({
      finalText: JSON.stringify({
        platform: 'instagram',
        whenLocal: '2026-04-27T20:00+08:00',
      }),
      steps: [],
      iterations: 1,
      stopReason: 'end_turn',
    });

    await runAutoMode({
      baseUrl: 'http://localhost:3000',
      trigger: { kind: 'text', payload: 'x' },
      variationCount: 1,
      notifyMode: 'auto-post',
    });

    const endCall = mocks.notifyDiscord.mock.calls.find(
      (c: any[]) => c[0].tag === 'lap-end-auto-post'
    );
    if (!endCall) throw new Error('expected lap-end-auto-post Discord call');
    expect(endCall[0].content).toContain('POSTS SCHEDULED');
  });

  it('AUTO_MODE_NATIVE_PER_FORMAT=1 fires renderPerFormatHeroes with the agent prompt + refs, in parallel', async () => {
    // Bug-4: when the flag is on, the lap should re-render 4:5 / 9:16 / 16:9
    // natively in parallel rather than cropping from the 1:1 hero. The
    // helper is mocked here to verify the wiring (prompt extraction +
    // refs forwarding); the helper's parallelism is verified in
    // per-format-render.test.ts.
    const prevFlag = process.env.AUTO_MODE_NATIVE_PER_FORMAT;
    process.env.AUTO_MODE_NATIVE_PER_FORMAT = '1';
    try {
      mocks.runMultiAgent.mockResolvedValueOnce({
        finalText: JSON.stringify({ caption: 'a calm urban park' }),
        steps: [
          {
            index: 0,
            name: 'generate_image',
            input: { prompt: 'a calm urban park, dawn light', aspectRatio: '1:1' },
            ok: true,
            ms: 12,
            output: { result: { images: [{ url: 'https://cdn/hero.png' }] } },
            clientRunId: 'agent_image-gen_1',
          },
        ],
        iterations: 1,
        stopReason: 'end_turn',
      });
      mocks.renderPerFormatHeroes.mockResolvedValueOnce({
        byAspect: new Map([
          ['4:5', { url: 'https://cdn/4-5.png', width: 1080, height: 1350, latencyMs: 30 }],
          ['9:16', { url: 'https://cdn/9-16.png', width: 1080, height: 1920, latencyMs: 32 }],
          ['16:9', { url: 'https://cdn/16-9.png', width: 1920, height: 1080, latencyMs: 28 }],
        ]),
        totalLatencyMs: 35,
        errorsByAspect: new Map(),
      });

      await runAutoMode({
        baseUrl: 'http://localhost:3000',
        workspaceId: 'ws_x',
        trigger: { kind: 'text', payload: 'urban park' },
        variationCount: 1,
        notifyMode: 'notify',
        referenceImages: [{ url: 'https://example.com/ref.png' }],
      });

      expect(mocks.renderPerFormatHeroes).toHaveBeenCalledTimes(1);
      const call = mocks.renderPerFormatHeroes.mock.calls[0][0];
      expect(call.prompt).toBe('a calm urban park, dawn light');
      expect(call.aspectRatios).toEqual(['4:5', '9:16', '16:9']);
      expect(call.refs).toEqual([{ url: 'https://example.com/ref.png' }]);
    } finally {
      if (prevFlag === undefined) delete process.env.AUTO_MODE_NATIVE_PER_FORMAT;
      else process.env.AUTO_MODE_NATIVE_PER_FORMAT = prevFlag;
    }
  });

  it('does NOT fire renderPerFormatHeroes when AUTO_MODE_NATIVE_PER_FORMAT is unset (default off)', async () => {
    // Cost guard: opt-in flag stays default off. No renderPerFormatHeroes
    // call without the explicit '1'.
    const prevFlag = process.env.AUTO_MODE_NATIVE_PER_FORMAT;
    delete process.env.AUTO_MODE_NATIVE_PER_FORMAT;
    try {
      mocks.runMultiAgent.mockResolvedValueOnce({
        finalText: JSON.stringify({ caption: 'x' }),
        steps: [
          {
            index: 0,
            name: 'generate_image',
            input: { prompt: 'p', aspectRatio: '1:1' },
            ok: true,
            ms: 1,
            output: { result: { images: [{ url: 'https://cdn/hero.png' }] } },
          },
        ],
        iterations: 1,
        stopReason: 'end_turn',
      });
      await runAutoMode({
        baseUrl: 'http://localhost:3000',
        workspaceId: 'ws_x',
        trigger: { kind: 'text', payload: 'x' },
        variationCount: 1,
        notifyMode: 'notify',
      });
      expect(mocks.renderPerFormatHeroes).not.toHaveBeenCalled();
    } finally {
      if (prevFlag !== undefined) process.env.AUTO_MODE_NATIVE_PER_FORMAT = prevFlag;
    }
  });

  it('marks lap as failed when a variation throws and persists the variation as failed', async () => {
    mocks.runMultiAgent.mockRejectedValueOnce(new Error('ANTHROPIC_API_KEY not set'));

    const result = await runAutoMode({
      baseUrl: 'http://localhost:3000',
      trigger: { kind: 'text', payload: 'x' },
      variationCount: 1,
      notifyMode: 'notify',
    });

    expect(result.status).toBe('failed');
    expect(result.variations[0]).toMatchObject({
      index: 1,
      status: 'failed',
      error: 'ANTHROPIC_API_KEY not set',
    });
    expect(mocks.setCampaignStatus).toHaveBeenCalledWith('camp_1', 'failed');
  });

  it('returns campaignId=null when Convex persistence is not provisioned', async () => {
    mocks.startCampaign.mockResolvedValueOnce(null);
    mocks.runMultiAgent.mockResolvedValueOnce({
      finalText: '{}',
      steps: [],
      iterations: 1,
      stopReason: 'end_turn',
    });

    const result = await runAutoMode({
      baseUrl: 'http://localhost:3000',
      trigger: { kind: 'text', payload: 'x' },
      variationCount: 1,
      notifyMode: 'review',
    });

    expect(result.campaignId).toBeNull();
    expect(mocks.insertCampaignVariation).not.toHaveBeenCalled();
    expect(mocks.setCampaignStatus).not.toHaveBeenCalled();
  });

  it('parallel concurrency runs all variations concurrently with up-front mood seeds', async () => {
    // Both variations resolve, but with overlap — order of insertion in
    // Convex follows the result array order, not start order.
    const orderOfStarts: number[] = [];
    mocks.runMultiAgent.mockImplementation(async (params: { prompt: string }) => {
      // Stamp the variation index based on the prompt's "variation N of M" line
      const m = /variation (\d+) of/.exec(params.prompt);
      const idx = m ? Number(m[1]) : 0;
      orderOfStarts.push(idx);
      // Stagger so variation 1 finishes AFTER variation 2 — proves parallelism.
      const delay = idx === 1 ? 20 : 5;
      await new Promise((r) => setTimeout(r, delay));
      return {
        finalText: JSON.stringify({ moodNote: `parallel-${idx}` }),
        // Include a successful generate_image step so the variation has a
        // hero and is therefore marked 'ready' (a hero-less variation is
        // 'failed' under the post-Apr-26 status rule).
        steps: [
          {
            index: 0,
            name: 'generate_image',
            input: {},
            ok: true,
            ms: 5,
            output: { result: { images: [{ url: `https://cdn/p${idx}.png` }] } },
          },
        ],
        iterations: 1,
        stopReason: 'end_turn',
      };
    });

    const result = await runAutoMode({
      baseUrl: 'http://localhost:3000',
      trigger: { kind: 'text', payload: 'x' },
      variationCount: 2,
      notifyMode: 'review',
      concurrency: 'parallel',
    });

    expect(result.status).toBe('completed');
    expect(result.variations).toHaveLength(2);
    // Both starts happened before either finished — parallel.
    expect(orderOfStarts.length).toBe(2);
    // Each variation got a parallel mood seed in its prompt — assert the
    // first variation's prompt mentions the seed pool's first entry.
    const firstPrompt = mocks.runMultiAgent.mock.calls[0][0].prompt as string;
    expect(firstPrompt).toContain('warm dawn');
  });

  it('parallel concurrency persists a failed variation when one rejects', async () => {
    mocks.runMultiAgent
      .mockResolvedValueOnce({
        finalText: '{}',
        steps: [],
        iterations: 1,
        stopReason: 'end_turn',
      })
      .mockRejectedValueOnce(new Error('boom'));

    const result = await runAutoMode({
      baseUrl: 'http://localhost:3000',
      trigger: { kind: 'text', payload: 'x' },
      variationCount: 2,
      notifyMode: 'review',
      concurrency: 'parallel',
    });

    expect(result.status).toBe('failed');
    expect(result.variations[1]).toMatchObject({ status: 'failed' });
    expect(mocks.setCampaignStatus).toHaveBeenCalledWith('camp_1', 'failed');
  });

  it('forwards a singular legacy referenceImage to runMultiAgent and into the variation prompt', async () => {
    mocks.runMultiAgent.mockResolvedValueOnce({
      finalText: '{}',
      steps: [],
      iterations: 1,
      stopReason: 'end_turn',
    });

    await runAutoMode({
      baseUrl: 'http://localhost:3000',
      trigger: { kind: 'text', payload: 'x' },
      variationCount: 1,
      notifyMode: 'review',
      referenceImage: { url: 'https://cdn/ref.png', hint: 'rainy idol scene' },
    });

    const call = mocks.runMultiAgent.mock.calls[0][0];
    expect(call.referenceImages).toEqual([
      { url: 'https://cdn/ref.png', dataUrl: undefined },
    ]);
    expect(call.prompt).toContain('https://cdn/ref.png');
    expect(call.prompt).toContain('rainy idol scene');
  });

  it('forwards a plural referenceImages array to runMultiAgent and lists all in the variation prompt', async () => {
    mocks.runMultiAgent.mockResolvedValueOnce({
      finalText: '{}',
      steps: [],
      iterations: 1,
      stopReason: 'end_turn',
    });

    await runAutoMode({
      baseUrl: 'http://localhost:3000',
      trigger: { kind: 'text', payload: 'x' },
      variationCount: 1,
      notifyMode: 'review',
      referenceImages: [
        { url: 'https://cdn/brand.png', hint: 'brand kit' },
        { url: 'https://cdn/product.png', hint: 'product photo' },
        { url: 'https://cdn/lifestyle.png' },
      ],
    });

    const call = mocks.runMultiAgent.mock.calls[0][0];
    expect(call.referenceImages).toHaveLength(3);
    expect(call.referenceImages[0].url).toBe('https://cdn/brand.png');
    expect(call.prompt).toContain('3 reference images');
    expect(call.prompt).toContain('brand kit');
    expect(call.prompt).toContain('https://cdn/lifestyle.png');
  });

  it('injects a layout-aware hero prompt body so generate_image renders crop-friendly heroes', async () => {
    // The fast tier wants ONE hero that survives crops to 1:1 / 4:5 / 9:16 / 16:9
    // without per-format regeneration. We pre-compose a layout-aware prompt
    // (safe zones + multi-aspect guidance baked in) and instruct Claude to
    // pass it verbatim to generate_image. Without this, Claude composes a
    // free-form prompt and the resulting hero often crops to 'partial'.
    mocks.runMultiAgent.mockResolvedValueOnce({
      finalText: '{}',
      steps: [],
      iterations: 1,
      stopReason: 'end_turn',
    });

    await runAutoMode({
      baseUrl: 'http://localhost:3000',
      trigger: {
        kind: 'text',
        payload: 'idol drama like shot, guy is wet by the rain pulling jacket overhead',
      },
      variationCount: 1,
      notifyMode: 'review',
    });

    const prompt = mocks.runMultiAgent.mock.calls[0][0].prompt as string;
    // Multi-aspect guidance from buildLayoutAwarePrompt — the proof we
    // wove the layout planner into the variation prompt.
    expect(prompt).toMatch(/cropped to any of these aspect ratios/);
    // Safe-zone reservation language.
    expect(prompt).toMatch(/Reserve the following regions/);
    // The trigger payload survives into the layout-aware body.
    expect(prompt).toMatch(/idol drama/);
    // Claude is told to use the layout-aware body verbatim, not free-form.
    expect(prompt).toMatch(/verbatim/i);
    // No on-image text — overlays are added separately downstream.
    expect(prompt).toMatch(/Do not render any text, logos, or watermarks/);
  });

  it('auto-post mode schedules each ready variation and includes IDs in lap-end ping', async () => {
    // Build two variations that finish ready with full envelopes.
    mocks.runMultiAgent
      .mockResolvedValueOnce({
        finalText: JSON.stringify({
          caption: 'wet idol energy',
          hashtags: ['#rainmood'],
          platform: 'instagram',
          whenLocal: '2026-04-27T20:30:00+08:00',
          moodNote: 'rain-drama',
        }),
        steps: [
          {
            index: 0,
            name: 'generate_image',
            input: {},
            ok: true,
            ms: 12,
            output: { result: { images: [{ url: 'https://cdn/idol-A.png' }] } },
            clientRunId: 'run-A',
          },
        ],
        iterations: 1,
        stopReason: 'end_turn',
      })
      .mockResolvedValueOnce({
        finalText: JSON.stringify({
          caption: 'second take',
          hashtags: ['#late'],
          platform: 'instagram',
          whenLocal: '2026-04-28T19:00:00+08:00',
          moodNote: 'softer',
        }),
        steps: [
          {
            index: 0,
            name: 'generate_image',
            input: {},
            ok: true,
            ms: 11,
            output: { result: { images: [{ url: 'https://cdn/idol-B.png' }] } },
            clientRunId: 'run-B',
          },
        ],
        iterations: 1,
        stopReason: 'end_turn',
      });
    mocks.publisherSchedule
      .mockResolvedValueOnce({
        previewUrl: '/workspace/ws_x?publishPreview=preview-A',
      })
      .mockResolvedValueOnce({
        previewUrl: '/workspace/ws_x?publishPreview=preview-B',
      });
    mocks.resolvePublisherForPost.mockReturnValue({
      id: 'preview',
      canPublish: () => true,
      schedule: mocks.publisherSchedule,
      list: async () => [],
      cancel: async () => {},
    });
    mocks.recordScheduledPost
      .mockResolvedValueOnce('sched-A')
      .mockResolvedValueOnce('sched-B');

    const result = await runAutoMode({
      baseUrl: 'http://localhost:3000',
      workspaceId: 'ws_x',
      trigger: { kind: 'text', payload: 'idol drama' },
      variationCount: 2,
      notifyMode: 'auto-post',
    });

    expect(result.scheduledPostIds).toEqual(['sched-A', 'sched-B']);
    // Per-post resolution — once per ready variation, with the post object.
    expect(mocks.resolvePublisherForPost).toHaveBeenCalledTimes(2);
    expect(mocks.resolvePublisherForPost.mock.calls[0][0]).toMatchObject({
      workspaceId: 'ws_x',
    });
    // One scheduled-post insert per ready variation.
    expect(mocks.recordScheduledPost).toHaveBeenCalledTimes(2);
    const firstScheduleCall = mocks.recordScheduledPost.mock.calls[0][0];
    expect(firstScheduleCall.workspaceId).toBe('ws_x');
    expect(firstScheduleCall.provider).toBe('preview');
    expect(firstScheduleCall.post.platform).toBe('instagram');
    expect(firstScheduleCall.post.mediaUrls).toEqual(['https://cdn/idol-A.png']);
    expect(firstScheduleCall.post.caption).toBe('wet idol energy');
    expect(firstScheduleCall.post.hashtags).toEqual(['#rainmood']);
    expect(firstScheduleCall.post.scheduledAt).toBe('2026-04-27T20:30:00+08:00');
    // Lap-end ping lists the scheduled IDs so the user can audit downstream.
    const endCall = mocks.notifyDiscord.mock.calls.find(
      (c: any[]) => c[0].tag === 'lap-end-auto-post'
    );
    if (!endCall) throw new Error('expected lap-end-auto-post Discord call');
    expect(endCall[0].content).toContain('sched-A');
    expect(endCall[0].content).toContain('sched-B');
    expect(endCall[0].content).toContain('2/2 posts scheduled');
  });

  it('auto-post mode skips failed variations when scheduling', async () => {
    mocks.runMultiAgent
      .mockResolvedValueOnce({
        finalText: JSON.stringify({
          caption: 'one',
          platform: 'instagram',
          whenLocal: '2026-04-27T19:00:00+08:00',
        }),
        steps: [
          {
            index: 0,
            name: 'generate_image',
            input: {},
            ok: true,
            ms: 9,
            output: { result: { images: [{ url: 'https://cdn/A.png' }] } },
          },
        ],
        iterations: 1,
        stopReason: 'end_turn',
      })
      .mockRejectedValueOnce(new Error('boom'));
    mocks.publisherSchedule.mockResolvedValueOnce({
      previewUrl: '/workspace/ws/?publishPreview=p1',
    });
    mocks.resolvePublisherForPost.mockReturnValue({
      id: 'preview',
      canPublish: () => true,
      schedule: mocks.publisherSchedule,
      list: async () => [],
      cancel: async () => {},
    });
    mocks.recordScheduledPost.mockResolvedValueOnce('sched-only-1');

    const result = await runAutoMode({
      baseUrl: 'http://localhost:3000',
      workspaceId: 'ws_x',
      trigger: { kind: 'text', payload: 'x' },
      variationCount: 2,
      notifyMode: 'auto-post',
    });

    // Only the ready variation got scheduled; the failed one was skipped.
    expect(result.scheduledPostIds).toEqual(['sched-only-1']);
    expect(mocks.publisherSchedule).toHaveBeenCalledTimes(1);
    expect(mocks.recordScheduledPost).toHaveBeenCalledTimes(1);
  });

  it('auto-post mode is a no-op when workspaceId is missing', async () => {
    // The preview publisher requires a workspace to scope its storage. With
    // no workspaceId we skip auto-post rather than fabricate one.
    mocks.runMultiAgent.mockResolvedValueOnce({
      finalText: JSON.stringify({
        caption: 'x',
        platform: 'instagram',
        whenLocal: '2026-04-27T20:00:00+08:00',
      }),
      steps: [
        {
          index: 0,
          name: 'generate_image',
          input: {},
          ok: true,
          ms: 7,
          output: { result: { images: [{ url: 'https://cdn/x.png' }] } },
        },
      ],
      iterations: 1,
      stopReason: 'end_turn',
    });

    const result = await runAutoMode({
      baseUrl: 'http://localhost:3000',
      // no workspaceId
      trigger: { kind: 'text', payload: 'x' },
      variationCount: 1,
      notifyMode: 'auto-post',
    });

    expect(result.scheduledPostIds).toEqual([]);
    expect(mocks.resolvePublisher).not.toHaveBeenCalled();
    expect(mocks.recordScheduledPost).not.toHaveBeenCalled();
  });

  it('auto-post mode skips variations missing a hero or schedule fields', async () => {
    mocks.runMultiAgent
      .mockResolvedValueOnce({
        // No platform — should be skipped.
        finalText: JSON.stringify({
          caption: 'no platform',
          whenLocal: '2026-04-27T19:00:00+08:00',
        }),
        steps: [
          {
            index: 0,
            name: 'generate_image',
            input: {},
            ok: true,
            ms: 5,
            output: { result: { images: [{ url: 'https://cdn/no-plat.png' }] } },
          },
        ],
        iterations: 1,
        stopReason: 'end_turn',
      })
      .mockResolvedValueOnce({
        // No hero image — should be skipped.
        finalText: JSON.stringify({
          caption: 'no hero',
          platform: 'instagram',
          whenLocal: '2026-04-27T20:00:00+08:00',
        }),
        steps: [],
        iterations: 1,
        stopReason: 'end_turn',
      })
      .mockResolvedValueOnce({
        // OK — should be scheduled.
        finalText: JSON.stringify({
          caption: 'ok',
          platform: 'instagram',
          whenLocal: '2026-04-27T21:00:00+08:00',
        }),
        steps: [
          {
            index: 0,
            name: 'generate_image',
            input: {},
            ok: true,
            ms: 9,
            output: { result: { images: [{ url: 'https://cdn/ok.png' }] } },
          },
        ],
        iterations: 1,
        stopReason: 'end_turn',
      });
    mocks.publisherSchedule.mockResolvedValue({
      previewUrl: '/workspace/ws/?publishPreview=ok',
    });
    mocks.resolvePublisherForPost.mockReturnValue({
      id: 'preview',
      canPublish: () => true,
      schedule: mocks.publisherSchedule,
      list: async () => [],
      cancel: async () => {},
    });
    mocks.recordScheduledPost.mockResolvedValue('sched-ok');

    const result = await runAutoMode({
      baseUrl: 'http://localhost:3000',
      workspaceId: 'ws_x',
      trigger: { kind: 'text', payload: 'x' },
      variationCount: 3,
      notifyMode: 'auto-post',
    });

    // Variation 3 is the only schedulable one.
    expect(result.scheduledPostIds).toEqual(['sched-ok']);
    expect(mocks.publisherSchedule).toHaveBeenCalledTimes(1);
  });

  it('runs both one-shot AND vision-guided segmentation in parallel and persists both mask sets', async () => {
    // Force the vision-guided path to engage by giving it an API key.
    const previousKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'test-key';

    mocks.runMultiAgent.mockResolvedValueOnce({
      finalText: JSON.stringify({
        caption: 'wet idol energy',
        platform: 'instagram',
        whenLocal: '2026-04-27T20:30:00+08:00',
      }),
      steps: [
        {
          index: 0,
          name: 'generate_image',
          input: {},
          ok: true,
          ms: 12,
          output: { result: { images: [{ url: 'https://cdn/idol.png' }] } },
          clientRunId: 'run-1',
        },
      ],
      iterations: 1,
      stopReason: 'end_turn',
    });

    // Vision-guided emits a richer prompt list per-image.
    mocks.describeImage.mockResolvedValueOnce({
      faces: [{ description: 'wet face under jacket' }],
      products: [{ name: 'leather jacket', description: 'black' }],
      brands: [],
      otherComponents: [],
      smallObjectGroups: [],
      background: { description: 'rain' },
    });

    // segmentSubjects is called twice — once with ONE_SHOT_PROMPTS (12 entries),
    // once with the vision-derived prompt list. We can tell which is which
    // by inspecting the input.prompts shape.
    mocks.segmentSubjects.mockImplementation(async (input: any) => {
      const isVisionGuided = input.prompts.some((p: any) =>
        p.prompt.toLowerCase().includes('wet face')
      );
      return {
        width: input.width,
        height: input.height,
        masks: isVisionGuided
          ? [
              {
                label: 'wet face under jacket',
                componentKind: 'face',
                bbox: { x: 100, y: 100, w: 200, h: 200 },
                confidence: 0.95,
              },
            ]
          : [
              {
                label: 'face',
                componentKind: 'face',
                bbox: { x: 90, y: 90, w: 220, h: 220 },
                confidence: 0.85,
              },
            ],
        matched: 1,
        prompted: input.prompts.length,
      };
    });

    await runAutoMode({
      baseUrl: 'http://localhost:3000',
      workspaceId: 'ws_x',
      trigger: { kind: 'text', payload: 'idol drama' },
      variationCount: 1,
      notifyMode: 'review',
    });

    // Both segmentation paths ran for this single variation.
    expect(mocks.segmentSubjects).toHaveBeenCalledTimes(2);
    expect(mocks.describeImage).toHaveBeenCalledTimes(1);

    // Both mask sets persisted on the variation row so the right rail
    // can show A/B without re-fetching.
    const persistCall = mocks.insertCampaignVariation.mock.calls[0][0];
    expect(persistCall.masksOneShot).toBeDefined();
    expect(persistCall.masksOneShot.matched).toBe(1);
    expect(persistCall.masksOneShot.masks[0].label).toBe('face');
    expect(persistCall.masksVisionGuided).toBeDefined();
    expect(persistCall.masksVisionGuided.matched).toBe(1);
    expect(persistCall.masksVisionGuided.masks[0].label).toBe(
      'wet face under jacket'
    );

    if (previousKey) process.env.ANTHROPIC_API_KEY = previousKey;
    else delete process.env.ANTHROPIC_API_KEY;
  });

  it('skips vision-guided path when ANTHROPIC_API_KEY is absent — one-shot still runs', async () => {
    const previousKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    mocks.runMultiAgent.mockResolvedValueOnce({
      finalText: '{}',
      steps: [
        {
          index: 0,
          name: 'generate_image',
          input: {},
          ok: true,
          ms: 9,
          output: { result: { images: [{ url: 'https://cdn/x.png' }] } },
        },
      ],
      iterations: 1,
      stopReason: 'end_turn',
    });

    mocks.segmentSubjects.mockResolvedValue({
      width: 1024,
      height: 1024,
      masks: [],
      matched: 0,
      prompted: 12,
    });

    await runAutoMode({
      baseUrl: 'http://localhost:3000',
      trigger: { kind: 'text', payload: 'x' },
      variationCount: 1,
      notifyMode: 'review',
    });

    // describeImage never called — vision-guided path noticed the missing
    // env var and short-circuited before the LLM call.
    expect(mocks.describeImage).not.toHaveBeenCalled();
    // One-shot still ran (one segmentSubjects call).
    expect(mocks.segmentSubjects).toHaveBeenCalledTimes(1);

    if (previousKey) process.env.ANTHROPIC_API_KEY = previousKey;
  });

  it('ingests a URL trigger, weaves the page into the prompt, and uses the OG image as default reference', async () => {
    mocks.fetchUrlIngestion.mockResolvedValueOnce({
      url: 'https://www.eightsleep.com/',
      finalUrl: 'https://www.eightsleep.com/',
      title: 'Eight Sleep | Now in Singapore',
      description:
        'Fall asleep faster and stay asleep longer with personalised cooling.',
      primaryImage: {
        url: 'https://cdn.example.com/og-hero.jpg',
        source: 'og-image',
        width: 1200,
        height: 630,
      },
      images: [
        {
          url: 'https://cdn.example.com/og-hero.jpg',
          source: 'og-image',
          width: 1200,
          height: 630,
        },
      ],
      products: [
        {
          name: 'Pod 4 Ultra',
          description: 'Adaptive temperature sleep system',
          brand: 'Eight Sleep',
          schemaType: 'Product',
          offers: { price: 4995, currency: 'SGD' },
        },
      ],
      bodyExcerpt: 'Sleep, deeper.\nCooling. Warming. Tracking.',
      fetchedAt: '2026-04-26T12:00:00Z',
      rawHtmlBytes: 1_024_000,
    });

    mocks.runMultiAgent.mockResolvedValueOnce({
      finalText: JSON.stringify({ caption: 'x', platform: 'instagram' }),
      steps: [
        {
          index: 0,
          name: 'generate_image',
          input: {},
          ok: true,
          ms: 9,
          output: { result: { images: [{ url: 'https://cdn/x.png' }] } },
        },
      ],
      iterations: 1,
      stopReason: 'end_turn',
    });

    const result = await runAutoMode({
      baseUrl: 'http://localhost:3000',
      trigger: { kind: 'url', payload: 'https://www.eightsleep.com/' },
      variationCount: 1,
      notifyMode: 'review',
    });

    // Ingestion ran once and surfaces in the result.
    expect(mocks.fetchUrlIngestion).toHaveBeenCalledTimes(1);
    expect(mocks.fetchUrlIngestion).toHaveBeenCalledWith(
      'https://www.eightsleep.com/'
    );
    expect(result.urlIngestion?.title).toBe('Eight Sleep | Now in Singapore');

    // The agent prompt got the ingestion section + product data.
    const prompt = mocks.runMultiAgent.mock.calls[0][0].prompt as string;
    expect(prompt).toContain('INGESTED PAGE CONTENT');
    expect(prompt).toContain('Eight Sleep | Now in Singapore');
    expect(prompt).toContain('Pod 4 Ultra');
    expect(prompt).toContain('SGD');
    expect(prompt).toContain('og-hero.jpg');

    // The OG image became the default reference because the caller didn't
    // supply one. When fetch of the primary image URL fails (no real network
    // in tests), the code falls back to the URL-based ref shape.
    const refs = mocks.runMultiAgent.mock.calls[0][0].referenceImages;
    expect(refs).toBeDefined();
    // url-based fallback (fetch failed silently in test env → primaryImageDataUrl is undefined)
    expect(refs[0]).toMatchObject({ url: 'https://cdn.example.com/og-hero.jpg' });

    // The layout-aware blob's hero subject now reflects the page title +
    // description, not the raw URL string.
    expect(prompt).toMatch(
      /Hero subject: Eight Sleep \| Now in Singapore.*personalised cooling/
    );
    expect(prompt).not.toMatch(
      /Hero subject: https:\/\/www\.eightsleep\.com/
    );
  });

  it('honours an explicit referenceImage even when URL ingestion has its own primary image', async () => {
    mocks.fetchUrlIngestion.mockResolvedValueOnce({
      url: 'https://example.com/',
      finalUrl: 'https://example.com/',
      title: 'page',
      description: '',
      primaryImage: {
        url: 'https://cdn.example.com/og.jpg',
        source: 'og-image',
      },
      images: [],
      products: [],
      bodyExcerpt: '',
      fetchedAt: '2026-04-26T12:00:00Z',
      rawHtmlBytes: 1000,
    });

    mocks.runMultiAgent.mockResolvedValueOnce({
      finalText: '{}',
      steps: [
        {
          index: 0,
          name: 'generate_image',
          input: {},
          ok: true,
          ms: 9,
          output: { result: { images: [{ url: 'https://cdn/x.png' }] } },
        },
      ],
      iterations: 1,
      stopReason: 'end_turn',
    });

    await runAutoMode({
      baseUrl: 'http://localhost:3000',
      trigger: { kind: 'url', payload: 'https://example.com/' },
      variationCount: 1,
      notifyMode: 'review',
      referenceImage: {
        url: 'https://cdn.example.com/explicit.jpg',
        hint: 'creator override',
      },
    });

    // The explicit reference wins; ingestion's primary image is NOT used.
    const refs = mocks.runMultiAgent.mock.calls[0][0].referenceImages;
    expect(refs).toMatchObject([{ url: 'https://cdn.example.com/explicit.jpg' }]);
  });

  it('survives URL ingestion failure — lap continues with raw trigger', async () => {
    mocks.fetchUrlIngestion.mockRejectedValueOnce(new Error('HTTP 403'));

    mocks.runMultiAgent.mockResolvedValueOnce({
      finalText: '{}',
      steps: [
        {
          index: 0,
          name: 'generate_image',
          input: {},
          ok: true,
          ms: 9,
          output: { result: { images: [{ url: 'https://cdn/x.png' }] } },
        },
      ],
      iterations: 1,
      stopReason: 'end_turn',
    });

    const result = await runAutoMode({
      baseUrl: 'http://localhost:3000',
      trigger: { kind: 'url', payload: 'https://blocked.example.com/' },
      variationCount: 1,
      notifyMode: 'review',
    });

    // Ingestion failed, but the lap completed.
    expect(result.urlIngestion).toBeUndefined();
    expect(result.status).toBe('completed');
    // No reference images attached (ingestion couldn't supply any and the
    // caller didn't either).
    const refs = mocks.runMultiAgent.mock.calls[0][0].referenceImages;
    expect(refs === undefined || refs.length === 0).toBe(true);
  });

  it('ingests a PDF trigger and weaves the document into the prompt', async () => {
    mocks.fetchPdfIngestion.mockResolvedValueOnce({
      source: 'https://eightsleep.com/spec-sheet.pdf',
      title: 'Pod 4 Ultra · Technical Spec Sheet',
      author: 'Eight Sleep Inc.',
      text: 'Pod 4 Ultra is the world\'s most advanced sleep system…',
      textExcerpt:
        'Pod 4 Ultra · Technical Spec Sheet\nDual-zone temperature control\n30-night risk-free trial',
      pageCount: 4,
      fetchedAt: '2026-04-26T12:00:00Z',
      rawBytes: 1_200_000,
    });

    mocks.runMultiAgent.mockResolvedValueOnce({
      finalText: '{}',
      steps: [
        {
          index: 0,
          name: 'generate_image',
          input: {},
          ok: true,
          ms: 9,
          output: { result: { images: [{ url: 'https://cdn/x.png' }] } },
        },
      ],
      iterations: 1,
      stopReason: 'end_turn',
    });

    const result = await runAutoMode({
      baseUrl: 'http://localhost:3000',
      trigger: {
        kind: 'file',
        payload: 'https://eightsleep.com/spec-sheet.pdf',
      },
      variationCount: 1,
      notifyMode: 'review',
    });

    expect(mocks.fetchPdfIngestion).toHaveBeenCalledTimes(1);
    expect(mocks.fetchPdfIngestion).toHaveBeenCalledWith(
      'https://eightsleep.com/spec-sheet.pdf'
    );
    expect(result.pdfIngestion?.title).toBe('Pod 4 Ultra · Technical Spec Sheet');

    const prompt = mocks.runMultiAgent.mock.calls[0][0].prompt as string;
    expect(prompt).toContain('INGESTED PDF CONTENT');
    expect(prompt).toContain('Pod 4 Ultra · Technical Spec Sheet');
    expect(prompt).toContain('Eight Sleep Inc.');
    expect(prompt).toContain('Pages: 4');
    expect(prompt).toContain('Dual-zone temperature control');
    // Hero subject derived from PDF title, not the raw .pdf URL.
    expect(prompt).toMatch(/Hero subject: Pod 4 Ultra/);
    expect(prompt).not.toMatch(/Hero subject: https:\/\/.*\.pdf/);
  });

  it('detects PDFs by data: URL too', async () => {
    mocks.fetchPdfIngestion.mockResolvedValueOnce({
      source: 'data:application/pdf;base64,<bytes>',
      title: 'Inline doc',
      author: '',
      text: 'inline body',
      textExcerpt: 'inline body',
      pageCount: 1,
      fetchedAt: '2026-04-26T12:00:00Z',
      rawBytes: 800,
    });
    mocks.runMultiAgent.mockResolvedValueOnce({
      finalText: '{}',
      steps: [
        {
          index: 0,
          name: 'generate_image',
          input: {},
          ok: true,
          ms: 9,
          output: { result: { images: [{ url: 'https://cdn/x.png' }] } },
        },
      ],
      iterations: 1,
      stopReason: 'end_turn',
    });
    await runAutoMode({
      baseUrl: 'http://localhost:3000',
      trigger: {
        kind: 'file',
        payload: 'data:application/pdf;base64,<bytes>',
      },
      variationCount: 1,
      notifyMode: 'review',
    });
    expect(mocks.fetchPdfIngestion).toHaveBeenCalledTimes(1);
  });

  it('does NOT call PDF ingestion when the file payload is not a PDF', async () => {
    mocks.runMultiAgent.mockResolvedValueOnce({
      finalText: '{}',
      steps: [
        {
          index: 0,
          name: 'generate_image',
          input: {},
          ok: true,
          ms: 9,
          output: { result: { images: [{ url: 'https://cdn/x.png' }] } },
        },
      ],
      iterations: 1,
      stopReason: 'end_turn',
    });
    await runAutoMode({
      baseUrl: 'http://localhost:3000',
      trigger: {
        kind: 'file',
        payload: 'data:image/png;base64,iVBORw0KGgo',
      },
      variationCount: 1,
      notifyMode: 'review',
    });
    expect(mocks.fetchPdfIngestion).not.toHaveBeenCalled();
  });

  it('survives PDF ingestion failure — lap continues with raw trigger', async () => {
    mocks.fetchPdfIngestion.mockRejectedValueOnce(new Error('parse failed'));
    mocks.runMultiAgent.mockResolvedValueOnce({
      finalText: '{}',
      steps: [
        {
          index: 0,
          name: 'generate_image',
          input: {},
          ok: true,
          ms: 9,
          output: { result: { images: [{ url: 'https://cdn/x.png' }] } },
        },
      ],
      iterations: 1,
      stopReason: 'end_turn',
    });
    const result = await runAutoMode({
      baseUrl: 'http://localhost:3000',
      trigger: {
        kind: 'file',
        payload: 'https://example.com/broken.pdf',
      },
      variationCount: 1,
      notifyMode: 'review',
    });
    expect(result.pdfIngestion).toBeUndefined();
    expect(result.status).toBe('completed');
  });

  it('routes an image-file trigger as an auto-derived reference image', async () => {
    mocks.runMultiAgent.mockResolvedValueOnce({
      finalText: '{}',
      steps: [
        {
          index: 0,
          name: 'generate_image',
          input: {},
          ok: true,
          ms: 9,
          output: { result: { images: [{ url: 'https://cdn/x.png' }] } },
        },
      ],
      iterations: 1,
      stopReason: 'end_turn',
    });

    await runAutoMode({
      baseUrl: 'http://localhost:3000',
      trigger: {
        kind: 'file',
        payload: 'https://eightsleep.com/products/pod-4-ultra.jpg',
      },
      variationCount: 1,
      notifyMode: 'review',
    });

    // No PDF ingestion called (it's an image, not a PDF).
    expect(mocks.fetchPdfIngestion).not.toHaveBeenCalled();
    expect(mocks.fetchUrlIngestion).not.toHaveBeenCalled();

    // The image payload became the default reference image.
    const refs = mocks.runMultiAgent.mock.calls[0][0].referenceImages;
    expect(refs).toHaveLength(1);
    expect(refs[0]).toEqual({
      url: 'https://eightsleep.com/products/pod-4-ultra.jpg',
      dataUrl: undefined,
    });
  });

  it('routes a data:image trigger as a dataUrl-shaped reference image', async () => {
    mocks.runMultiAgent.mockResolvedValueOnce({
      finalText: '{}',
      steps: [
        {
          index: 0,
          name: 'generate_image',
          input: {},
          ok: true,
          ms: 9,
          output: { result: { images: [{ url: 'https://cdn/x.png' }] } },
        },
      ],
      iterations: 1,
      stopReason: 'end_turn',
    });

    // Build a fake long base64 payload to also exercise the redaction path.
    const dataUrl = 'data:image/png;base64,' + 'A'.repeat(2048);

    await runAutoMode({
      baseUrl: 'http://localhost:3000',
      trigger: { kind: 'file', payload: dataUrl },
      variationCount: 1,
      notifyMode: 'review',
    });

    const refs = mocks.runMultiAgent.mock.calls[0][0].referenceImages;
    expect(refs[0]).toEqual({
      url: undefined,
      dataUrl,
    });
    // The variation prompt redacts the huge data URL so we don't waste
    // tokens dumping 2KB of base64 into the system note.
    const prompt = mocks.runMultiAgent.mock.calls[0][0].prompt as string;
    expect(prompt).toContain('<inline image/png');
    expect(prompt).not.toContain('A'.repeat(100));
  });

  it('skips URL ingestion entirely for text triggers', async () => {
    mocks.runMultiAgent.mockResolvedValueOnce({
      finalText: '{}',
      steps: [
        {
          index: 0,
          name: 'generate_image',
          input: {},
          ok: true,
          ms: 9,
          output: { result: { images: [{ url: 'https://cdn/x.png' }] } },
        },
      ],
      iterations: 1,
      stopReason: 'end_turn',
    });

    await runAutoMode({
      baseUrl: 'http://localhost:3000',
      trigger: { kind: 'text', payload: 'streetwear lookbook' },
      variationCount: 1,
      notifyMode: 'review',
    });

    expect(mocks.fetchUrlIngestion).not.toHaveBeenCalled();
  });

  it('uploads a data:image hero to Convex storage so SAM3 can fetch it', async () => {
    mocks.runMultiAgent.mockResolvedValueOnce({
      finalText: '{}',
      steps: [
        {
          index: 0,
          name: 'generate_image',
          input: {},
          ok: true,
          ms: 12,
          // Hero comes back as a data URL — that's what gpt-image-2 does today.
          output: {
            result: {
              images: [
                {
                  url: 'data:image/png;base64,iVBORw0KGgoAAA…',
                },
              ],
            },
          },
        },
      ],
      iterations: 1,
      stopReason: 'end_turn',
    });

    mocks.uploadAssetToConvex.mockResolvedValueOnce({
      id: 'asset_doc_42',
      publicUrl: 'https://convex.cdn/abc/hero.png',
      storageId: 'sid_42',
      bytes: 1024 * 1000,
      mime: 'image/png',
    });

    const result = await runAutoMode({
      baseUrl: 'http://localhost:3000',
      trigger: { kind: 'text', payload: 'idol drama' },
      variationCount: 1,
      notifyMode: 'review',
    });

    expect(mocks.uploadAssetToConvex).toHaveBeenCalledTimes(1);
    const uploadArgs = mocks.uploadAssetToConvex.mock.calls[0][0];
    expect(uploadArgs.kind).toBe('hero');
    expect(uploadArgs.source).toMatch(/^data:image\/png;base64,/);

    // The variation now carries the public URL + asset id, NOT the data URL.
    const v = result.variations[0];
    expect(v.heroImageUrl).toBe('https://convex.cdn/abc/hero.png');
    expect(v.heroAssetId).toBe('asset_doc_42');
  });

  it('keeps the data URL when Convex upload fails (fail-soft, downstream segmentation skips)', async () => {
    mocks.runMultiAgent.mockResolvedValueOnce({
      finalText: '{}',
      steps: [
        {
          index: 0,
          name: 'generate_image',
          input: {},
          ok: true,
          ms: 12,
          output: {
            result: {
              images: [{ url: 'data:image/png;base64,iVBOR…' }],
            },
          },
        },
      ],
      iterations: 1,
      stopReason: 'end_turn',
    });
    // Convex unreachable / not provisioned.
    mocks.uploadAssetToConvex.mockResolvedValueOnce(null);

    const result = await runAutoMode({
      baseUrl: 'http://localhost:3000',
      trigger: { kind: 'text', payload: 'x' },
      variationCount: 1,
      notifyMode: 'review',
    });

    const v = result.variations[0];
    expect(v.heroImageUrl).toBe('data:image/png;base64,iVBOR…');
    expect(v.heroAssetId).toBeUndefined();
    // Variation is still 'ready' — we have a hero, just not a fetchable one.
    expect(v.status).toBe('ready');
  });

  it('does NOT upload when the hero is already a public URL', async () => {
    mocks.runMultiAgent.mockResolvedValueOnce({
      finalText: '{}',
      steps: [
        {
          index: 0,
          name: 'generate_image',
          input: {},
          ok: true,
          ms: 9,
          output: {
            result: { images: [{ url: 'https://cdn.example.com/x.png' }] },
          },
        },
      ],
      iterations: 1,
      stopReason: 'end_turn',
    });

    const result = await runAutoMode({
      baseUrl: 'http://localhost:3000',
      trigger: { kind: 'text', payload: 'x' },
      variationCount: 1,
      notifyMode: 'review',
    });

    expect(mocks.uploadAssetToConvex).not.toHaveBeenCalled();
    expect(result.variations[0].heroImageUrl).toBe(
      'https://cdn.example.com/x.png'
    );
    expect(result.variations[0].heroAssetId).toBeUndefined();
  });

  it('feeds parallel mood seed into the layout-aware prompt mood keywords', async () => {
    mocks.runMultiAgent
      .mockResolvedValueOnce({
        finalText: '{}',
        steps: [],
        iterations: 1,
        stopReason: 'end_turn',
      })
      .mockResolvedValueOnce({
        finalText: '{}',
        steps: [],
        iterations: 1,
        stopReason: 'end_turn',
      });

    await runAutoMode({
      baseUrl: 'http://localhost:3000',
      trigger: { kind: 'text', payload: 'streetwear lookbook' },
      variationCount: 2,
      notifyMode: 'review',
      concurrency: 'parallel',
    });

    const firstPrompt = mocks.runMultiAgent.mock.calls[0][0].prompt as string;
    // PARALLEL_MOOD_SEEDS[0] = 'warm dawn — soft golden palette, low contrast, hopeful'
    // The seed's keywords should be present in the layout-aware Mood line.
    expect(firstPrompt).toMatch(/Mood:.*(warm|dawn|golden|hopeful)/);
  });

  // ─── Discord embed enrichment ────────────────────────────────────────────

  it('lap-end ping includes embeds array with one embed per variation', async () => {
    // Variation with a public hero URL and full envelope.
    mocks.runMultiAgent.mockResolvedValueOnce({
      finalText: JSON.stringify({
        caption: 'slow glow key visual',
        captionsByLocale: {
          'en-SG': 'slow glow key visual',
          'zh-Hans-SG': '慢光关键视觉',
          'ms-SG': 'visual utama cahaya perlahan',
          'ta-SG': 'மெல்லிய ஒளி முக்கிய காட்சி',
        },
        hashtags: ['#aether', '#launch'],
        platform: 'instagram',
        whenLocal: '2026-04-27T19:00:00+08:00',
        moodNote: 'warm dawn — soft golden palette',
      }),
      steps: [
        {
          index: 0,
          name: 'generate_image',
          input: {},
          ok: true,
          ms: 12,
          output: { result: { images: [{ url: 'https://cdn.aether.test/hero_v1.png' }] } },
        },
      ],
      iterations: 1,
      stopReason: 'end_turn',
    });

    await runAutoMode({
      baseUrl: 'http://localhost:3000',
      workspaceId: 'ws_demo',
      trigger: { kind: 'text', payload: 'aether launch day' },
      variationCount: 1,
      notifyMode: 'notify',
    });

    const endCall = mocks.notifyDiscord.mock.calls.find(
      (c: any[]) => c[0].tag === 'lap-end-notify'
    );
    if (!endCall) throw new Error('expected lap-end-notify Discord call');

    // The lap-end call must carry an embeds array.
    expect(endCall[0].embeds).toBeDefined();
    expect(Array.isArray(endCall[0].embeds)).toBe(true);
    expect(endCall[0].embeds).toHaveLength(1);

    const embed = endCall[0].embeds[0];
    // Title: first 60 chars of the en-SG caption.
    expect(embed.title).toContain('slow glow');
    // Description: full caption.
    expect(embed.description).toBe('slow glow key visual');
    // Image: public CDN URL passed through.
    expect(embed.image?.url).toBe('https://cdn.aether.test/hero_v1.png');
    // Footer: campaign + variation index.
    expect(embed.footer?.text).toContain('camp_1');
    expect(embed.footer?.text).toContain('v1');
    // Fields: Platform and Scheduled are present.
    const fieldNames = embed.fields?.map((f: { name: string }) => f.name) ?? [];
    expect(fieldNames).toContain('Platform');
    expect(fieldNames).toContain('Scheduled');
    expect(fieldNames).toContain('Locales');
    // All 4 SG locales present.
    const localeField = embed.fields?.find((f: { name: string }) => f.name === 'Locales');
    expect(localeField?.value).toContain('EN ✓');
    expect(localeField?.value).toContain('ZH ✓');
    expect(localeField?.value).toContain('MS ✓');
    expect(localeField?.value).toContain('TA ✓');
    // Color: green for ready in notify mode.
    expect(embed.color).toBe(0x57f287);
  });

  it('lap-end embed is yellow for review mode (awaiting approval)', async () => {
    mocks.runMultiAgent.mockResolvedValueOnce({
      finalText: JSON.stringify({
        caption: 'pending review',
        platform: 'instagram',
        whenLocal: '2026-04-27T19:00:00+08:00',
        moodNote: 'soft pastel',
      }),
      steps: [
        {
          index: 0,
          name: 'generate_image',
          input: {},
          ok: true,
          ms: 10,
          output: { result: { images: [{ url: 'https://cdn.aether.test/hero_review.png' }] } },
        },
      ],
      iterations: 1,
      stopReason: 'end_turn',
    });

    await runAutoMode({
      baseUrl: 'http://localhost:3000',
      trigger: { kind: 'text', payload: 'x' },
      variationCount: 1,
      notifyMode: 'review',
    });

    const endCall = mocks.notifyDiscord.mock.calls.find(
      (c: any[]) => c[0].tag === 'lap-end-review'
    );
    if (!endCall) throw new Error('expected lap-end-review Discord call');
    expect(endCall[0].embeds).toHaveLength(1);
    // Yellow for review mode.
    expect(endCall[0].embeds[0].color).toBe(0xfee75c);
  });

  it('lap-end embed is red for a failed variation', async () => {
    // Agent throws → variation status = 'failed'.
    mocks.runMultiAgent.mockRejectedValueOnce(new Error('provider error'));

    await runAutoMode({
      baseUrl: 'http://localhost:3000',
      trigger: { kind: 'text', payload: 'x' },
      variationCount: 1,
      notifyMode: 'notify',
    });

    const endCall = mocks.notifyDiscord.mock.calls.find(
      (c: any[]) => c[0].tag === 'lap-end-notify'
    );
    if (!endCall) throw new Error('expected lap-end-notify Discord call');
    expect(endCall[0].embeds).toHaveLength(1);
    expect(endCall[0].embeds[0].color).toBe(0xed4245);
  });

  it('lap-end embed skips image.url when heroImageUrl is a data: URL', async () => {
    mocks.runMultiAgent.mockResolvedValueOnce({
      // Agent returns a data URL hero (before Convex upload failed/skipped).
      finalText: JSON.stringify({ caption: 'inline hero' }),
      steps: [
        {
          index: 0,
          name: 'generate_image',
          input: {},
          ok: true,
          ms: 8,
          output: { imageUrl: 'data:image/png;base64,ABC123' },
        },
      ],
      iterations: 1,
      stopReason: 'end_turn',
    });

    await runAutoMode({
      baseUrl: 'http://localhost:3000',
      trigger: { kind: 'text', payload: 'x' },
      variationCount: 1,
      notifyMode: 'notify',
    });

    const endCall = mocks.notifyDiscord.mock.calls.find(
      (c: any[]) => c[0].tag === 'lap-end-notify'
    );
    if (!endCall) throw new Error('expected lap-end-notify Discord call');
    // image should be absent — Discord cannot fetch data: URLs.
    expect(endCall[0].embeds[0].image).toBeUndefined();
  });

  /**
   * B1 regression — Eight Sleep 1×1 atlas air-purifier bug.
   *
   * Root cause: effectiveReferenceImages used URL-based refs from
   * urlIngestion.images; the OpenAI provider's editWithRefs only activates
   * for base64 data URLs, so URL refs were silently dropped and the 1×1
   * hero was generated text-only without the actual product photo as anchor.
   *
   * Fix: fetch the primary ingested image URL and convert it to a base64
   * data URL so the Images Edits API is invoked and the hero is anchored
   * on the ACTUAL product photo (Pod 4 Ultra mattress + Hub).
   *
   * This test verifies that when fetch succeeds, the primary ref is a
   * dataUrl-shaped reference (triggering Edits API); when fetch fails,
   * it falls back gracefully to URL-based refs (no regression).
   */
  it('B1: converts primary ingested image URL to data URL so Edits API anchors the hero on the real product photo', async () => {
    // Mock fetch to return a small PNG for the primary image URL.
    // The base64 PNG is a 1×1 white pixel.
    const fakePngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScAAAAAElFTkSuQmCC';
    const fakePngBuf = Buffer.from(fakePngBase64, 'base64');
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockImplementationOnce(
      async (url) => {
        if (String(url).includes('og-pod4.jpg')) {
          return new Response(fakePngBuf, {
            status: 200,
            headers: { 'content-type': 'image/jpeg' },
          });
        }
        // Any other fetch (e.g. Convex upload) → fail.
        throw new Error(`unexpected fetch: ${url}`);
      }
    );

    mocks.fetchUrlIngestion.mockResolvedValueOnce({
      url: 'https://www.eightsleep.com/',
      finalUrl: 'https://www.eightsleep.com/',
      title: 'Eight Sleep | Pod 4 Ultra — The World\'s Most Intelligent Mattress',
      description:
        'The Pod 4 Ultra features a mattress with thermal cover and Hub for sleep tracking.',
      primaryImage: {
        url: 'https://cdn.eightsleep.com/og-pod4.jpg',
        source: 'og-image',
        width: 1200,
        height: 630,
      },
      images: [
        {
          url: 'https://cdn.eightsleep.com/og-pod4.jpg',
          source: 'og-image',
          width: 1200,
          height: 630,
        },
      ],
      products: [
        {
          name: 'Pod 4 Ultra',
          description: 'mattress with thermal cover, sleep tracking Hub',
          brand: 'Eight Sleep',
          schemaType: 'Product',
          offers: { price: 4995, currency: 'SGD' },
        },
      ],
      bodyExcerpt: 'Sleep, deeper.\nCooling. Warming. Tracking.',
      fetchedAt: '2026-04-28T00:00:00Z',
      rawHtmlBytes: 512_000,
    });

    mocks.runMultiAgent.mockResolvedValueOnce({
      finalText: JSON.stringify({ caption: 'Eight Sleep Pod 4 Ultra — now in SG', platform: 'instagram', whenLocal: '2026-04-28T19:00:00+08:00' }),
      steps: [
        {
          index: 0,
          name: 'generate_image',
          input: { prompt: 'Eight Sleep Pod 4 Ultra mattress hero', aspectRatio: '1:1' },
          ok: true,
          ms: 120,
          output: { result: { images: [{ url: 'https://cdn.openai.com/pod4-hero.png' }] } },
        },
      ],
      iterations: 1,
      stopReason: 'end_turn',
    });

    await runAutoMode({
      baseUrl: 'http://localhost:3000',
      workspaceId: 'ws_eightsleep',
      trigger: { kind: 'url', payload: 'https://www.eightsleep.com/' },
      variationCount: 1,
      notifyMode: 'review',
    });

    // The primary image URL was fetched and encoded as a data URL.
    expect(mockFetch).toHaveBeenCalledWith(
      'https://cdn.eightsleep.com/og-pod4.jpg'
    );

    // The ref passed to runMultiAgent MUST be a data URL (not a remote URL)
    // so the Images Edits API activates and anchors the 1×1 hero on the
    // actual product photo (mattress + Hub), not a hallucinated tower.
    const refs = mocks.runMultiAgent.mock.calls[0][0].referenceImages;
    expect(refs).toBeDefined();
    expect(refs.length).toBeGreaterThan(0);
    // Primary ref is a data URL.
    expect(refs[0].dataUrl).toMatch(/^data:image\/jpeg;base64,/);
    // Remote URL field absent on the primary ref (it's a data URL ref now).
    expect(refs[0].url).toBeUndefined();

    // The variation prompt still has the brand context and product info.
    const prompt = mocks.runMultiAgent.mock.calls[0][0].prompt as string;
    expect(prompt).toContain('Pod 4 Ultra');
    expect(prompt).toContain('mattress');

    mockFetch.mockRestore();
  });

  it('B1: falls back to URL-based ref when primary image fetch fails (fail-soft, no crash)', async () => {
    // Simulate network failure for the primary image URL fetch.
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockImplementationOnce(
      async (_url) => {
        throw new Error('network error');
      }
    );

    mocks.fetchUrlIngestion.mockResolvedValueOnce({
      url: 'https://www.eightsleep.com/',
      finalUrl: 'https://www.eightsleep.com/',
      title: 'Eight Sleep | Pod 4 Ultra',
      description: 'Sleep deeper.',
      primaryImage: {
        url: 'https://cdn.eightsleep.com/og-pod4.jpg',
        source: 'og-image',
        width: 1200,
        height: 630,
      },
      images: [
        {
          url: 'https://cdn.eightsleep.com/og-pod4.jpg',
          source: 'og-image',
          width: 1200,
          height: 630,
        },
      ],
      products: [],
      bodyExcerpt: '',
      fetchedAt: '2026-04-28T00:00:00Z',
      rawHtmlBytes: 100_000,
    });

    mocks.runMultiAgent.mockResolvedValueOnce({
      finalText: '{}',
      steps: [
        {
          index: 0,
          name: 'generate_image',
          input: {},
          ok: true,
          ms: 10,
          output: { result: { images: [{ url: 'https://cdn.openai.com/x.png' }] } },
        },
      ],
      iterations: 1,
      stopReason: 'end_turn',
    });

    // Should not throw — fail-soft path.
    const result = await runAutoMode({
      baseUrl: 'http://localhost:3000',
      trigger: { kind: 'url', payload: 'https://www.eightsleep.com/' },
      variationCount: 1,
      notifyMode: 'review',
    });

    expect(result.status).toBe('completed');

    // Fallback: URL-based ref (not a data URL).
    const refs = mocks.runMultiAgent.mock.calls[0][0].referenceImages;
    expect(refs).toBeDefined();
    expect(refs[0]).toMatchObject({ url: 'https://cdn.eightsleep.com/og-pod4.jpg' });
    expect(refs[0].dataUrl).toBeUndefined();

    mockFetch.mockRestore();
  });

  /**
   * B2 — Research agent wiring.
   *
   * runAutoMode should invoke runResearchAgent when:
   *   - trigger.kind === 'url'
   *   - ANTHROPIC_API_KEY is set
   *   - AUTO_MODE_SKIP_RESEARCH is not '1'
   *
   * The returned ResearchBundle must:
   *   - be surfaced in the AutoModeResult as `researchBundle`
   *   - be injected into each variation's system note so headline/sub copy
   *     can cite competitive signals and recent campaigns
   */
  it('B2: research agent is invoked for URL triggers and its bundle surfaces in the result and variation prompt', async () => {
    const prevKey = process.env.ANTHROPIC_API_KEY;
    const prevSkip = process.env.AUTO_MODE_SKIP_RESEARCH;
    process.env.ANTHROPIC_API_KEY = 'test-key-b2';
    delete process.env.AUTO_MODE_SKIP_RESEARCH;

    const fakeBundle = {
      headline: 'Eight Sleep enters SG — disrupting the $B sleep market',
      summary: 'Pod 4 Ultra targets affluent SG urbanites; key competitors are Tempur-Pedic, TEMPUR, and Nolah.',
      competitors: ['Tempur-Pedic', 'TEMPUR', 'Nolah Sleep'],
      recentCampaigns: [
        { title: 'Eight Sleep NYC Launch', platform: 'instagram', url: 'https://www.instagram.com/p/abc123/' },
      ],
      localeInsights: [
        { locale: 'en-SG', note: 'Lead with data: HDB and condo dwellers cite sleep quality as top health concern.' },
      ],
      sources: [{ title: 'Eight Sleep SG Press', url: 'https://www.eightsleep.com/sg' }],
      usedManagedAgentsApi: false,
      latencyMs: 80,
    };
    mocks.runResearchAgent.mockResolvedValueOnce(fakeBundle);

    mocks.fetchUrlIngestion.mockResolvedValueOnce({
      url: 'https://www.eightsleep.com/',
      finalUrl: 'https://www.eightsleep.com/',
      title: 'Eight Sleep | Pod 4 Ultra',
      description: 'Sleep deeper with personalised cooling.',
      primaryImage: { url: 'https://cdn.eightsleep.com/og-pod4.jpg', source: 'og-image', width: 1200, height: 630 },
      images: [{ url: 'https://cdn.eightsleep.com/og-pod4.jpg', source: 'og-image', width: 1200, height: 630 }],
      products: [{ name: 'Pod 4 Ultra', description: 'mattress + Hub', brand: 'Eight Sleep', schemaType: 'Product', offers: { price: 4995, currency: 'SGD' } }],
      bodyExcerpt: 'Sleep, deeper.',
      fetchedAt: '2026-04-28T00:00:00Z',
      rawHtmlBytes: 100_000,
    });

    mocks.runMultiAgent.mockResolvedValueOnce({
      finalText: JSON.stringify({ caption: 'Sleep better, wake stronger', platform: 'instagram', whenLocal: '2026-04-28T19:00:00+08:00' }),
      steps: [
        {
          index: 0,
          name: 'generate_image',
          input: { prompt: 'Eight Sleep Pod 4 Ultra hero', aspectRatio: '1:1' },
          ok: true,
          ms: 100,
          output: { result: { images: [{ url: 'https://cdn.openai.com/pod4-b2.png' }] } },
        },
      ],
      iterations: 1,
      stopReason: 'end_turn',
    });

    const result = await runAutoMode({
      baseUrl: 'http://localhost:3000',
      workspaceId: 'ws_b2',
      trigger: { kind: 'url', payload: 'https://www.eightsleep.com/' },
      variationCount: 1,
      notifyMode: 'review',
    });

    // Research agent was called with the brand, URL, and ingestion context.
    expect(mocks.runResearchAgent).toHaveBeenCalledTimes(1);
    const researchCall = mocks.runResearchAgent.mock.calls[0][0];
    expect(researchCall.brand).toBeTruthy();
    expect(researchCall.url).toBe('https://www.eightsleep.com/');
    expect(researchCall.ingestion).toBeDefined();

    // The bundle surfaces in the AutoModeResult.
    expect(result.researchBundle).toBeDefined();
    expect(result.researchBundle?.competitors).toEqual(['Tempur-Pedic', 'TEMPUR', 'Nolah Sleep']);

    // The variation system prompt includes the competitive context so
    // headline/sub copy writers can cite real signals.
    const prompt = mocks.runMultiAgent.mock.calls[0][0].prompt as string;
    expect(prompt).toContain('Competitors in SG:');
    expect(prompt).toContain('Tempur-Pedic');

    // Restore env.
    if (prevKey !== undefined) process.env.ANTHROPIC_API_KEY = prevKey;
    else delete process.env.ANTHROPIC_API_KEY;
    if (prevSkip !== undefined) process.env.AUTO_MODE_SKIP_RESEARCH = prevSkip;
    else delete process.env.AUTO_MODE_SKIP_RESEARCH;
  });

  it('B2: research agent is skipped for text triggers (no URL to research)', async () => {
    const prevKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'test-key-b2';
    try {
      mocks.runMultiAgent.mockResolvedValueOnce({
        finalText: '{}',
        steps: [{ index: 0, name: 'generate_image', input: {}, ok: true, ms: 5, output: { result: { images: [{ url: 'https://cdn/x.png' }] } } }],
        iterations: 1,
        stopReason: 'end_turn',
      });

      await runAutoMode({
        baseUrl: 'http://localhost:3000',
        trigger: { kind: 'text', payload: 'streetwear lookbook' },
        variationCount: 1,
        notifyMode: 'review',
      });

      expect(mocks.runResearchAgent).not.toHaveBeenCalled();
    } finally {
      if (prevKey !== undefined) process.env.ANTHROPIC_API_KEY = prevKey;
      else delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it('B2: research agent failure is fail-soft — lap completes without a bundle', async () => {
    const prevKey = process.env.ANTHROPIC_API_KEY;
    const prevSkip = process.env.AUTO_MODE_SKIP_RESEARCH;
    process.env.ANTHROPIC_API_KEY = 'test-key-b2';
    delete process.env.AUTO_MODE_SKIP_RESEARCH;

    mocks.runResearchAgent.mockRejectedValueOnce(new Error('research timeout'));

    mocks.fetchUrlIngestion.mockResolvedValueOnce({
      url: 'https://www.eightsleep.com/',
      finalUrl: 'https://www.eightsleep.com/',
      title: 'Eight Sleep',
      description: '',
      primaryImage: null,
      images: [],
      products: [],
      bodyExcerpt: '',
      fetchedAt: '2026-04-28T00:00:00Z',
      rawHtmlBytes: 10_000,
    });

    mocks.runMultiAgent.mockResolvedValueOnce({
      finalText: '{}',
      steps: [{ index: 0, name: 'generate_image', input: {}, ok: true, ms: 5, output: { result: { images: [{ url: 'https://cdn/x.png' }] } } }],
      iterations: 1,
      stopReason: 'end_turn',
    });

    const result = await runAutoMode({
      baseUrl: 'http://localhost:3000',
      trigger: { kind: 'url', payload: 'https://www.eightsleep.com/' },
      variationCount: 1,
      notifyMode: 'review',
    });

    // Lap did not crash.
    expect(result.status).toBe('completed');
    // No research bundle (agent failed).
    expect(result.researchBundle).toBeUndefined();

    if (prevKey !== undefined) process.env.ANTHROPIC_API_KEY = prevKey;
    else delete process.env.ANTHROPIC_API_KEY;
    if (prevSkip !== undefined) process.env.AUTO_MODE_SKIP_RESEARCH = prevSkip;
    else delete process.env.AUTO_MODE_SKIP_RESEARCH;
  });

  /**
   * Signoff Managed Agent — gates the auto-post lap.
   *
   * When AUTO_MODE_USE_SIGNOFF=1 + notifyMode='auto-post', runSignoffAgent
   * runs after variations finish. Its per-variation decision filters which
   * variations actually go through scheduleVariationPosts:
   *   - 'auto-post'        → scheduled normally
   *   - 'hold-for-review'  → NOT scheduled; Discord ping fires with rationale
   *   - 'reject'           → NOT scheduled; rationale logged
   * Signoff failure is fail-soft — falls through to the legacy behaviour
   * (all ready variations scheduled) so a flaky agent never blocks a lap.
   */
  it('signoff: AUTO_MODE_USE_SIGNOFF=1 only schedules variations with decision auto-post', async () => {
    const prevFlag = process.env.AUTO_MODE_USE_SIGNOFF;
    const prevKey = process.env.ANTHROPIC_API_KEY;
    process.env.AUTO_MODE_USE_SIGNOFF = '1';
    process.env.ANTHROPIC_API_KEY = 'test-key-signoff';

    // Two variations finish ready.
    mocks.runMultiAgent
      .mockResolvedValueOnce({
        finalText: JSON.stringify({
          caption: 'on-brand calm copy',
          platform: 'instagram',
          whenLocal: '2026-04-27T20:30:00+08:00',
        }),
        steps: [
          {
            index: 0,
            name: 'generate_image',
            input: {},
            ok: true,
            ms: 12,
            output: { result: { images: [{ url: 'https://cdn/safe.png' }] } },
          },
        ],
        iterations: 1,
        stopReason: 'end_turn',
      })
      .mockResolvedValueOnce({
        finalText: JSON.stringify({
          caption: 'spicy hot take',
          platform: 'instagram',
          whenLocal: '2026-04-28T19:00:00+08:00',
        }),
        steps: [
          {
            index: 0,
            name: 'generate_image',
            input: {},
            ok: true,
            ms: 11,
            output: { result: { images: [{ url: 'https://cdn/risky.png' }] } },
          },
        ],
        iterations: 1,
        stopReason: 'end_turn',
      });

    // Signoff: variation 1 = auto-post, variation 2 = hold-for-review.
    mocks.runSignoffAgent.mockResolvedValueOnce({
      latencyMs: 100,
      usedManagedAgentsApi: true,
      sessionId: 'sess_signoff_1',
      overallRecommendation: 'one safe, one risky',
      variations: [
        { variationIndex: 1, decision: 'auto-post', rationale: 'on-brand and within length' },
        { variationIndex: 2, decision: 'hold-for-review', rationale: 'tone risk: "spicy hot take"' },
      ],
    });

    mocks.publisherSchedule.mockResolvedValueOnce({
      previewUrl: '/workspace/ws_signoff?publishPreview=preview-A',
    });
    mocks.resolvePublisherForPost.mockReturnValue({
      id: 'preview',
      canPublish: () => true,
      schedule: mocks.publisherSchedule,
      list: async () => [],
      cancel: async () => {},
    });
    mocks.recordScheduledPost.mockResolvedValueOnce('sched-A');

    const result = await runAutoMode({
      baseUrl: 'http://localhost:3000',
      workspaceId: 'ws_signoff',
      trigger: { kind: 'text', payload: 'launch copy' },
      variationCount: 2,
      notifyMode: 'auto-post',
    });

    // Signoff was called with both variations.
    expect(mocks.runSignoffAgent).toHaveBeenCalledTimes(1);
    const sig = mocks.runSignoffAgent.mock.calls[0][0];
    expect(sig.variations).toHaveLength(2);

    // Only the auto-post variation got scheduled.
    expect(result.scheduledPostIds).toEqual(['sched-A']);
    expect(mocks.publisherSchedule).toHaveBeenCalledTimes(1);

    // Hold-for-review variation got a Discord ping with rationale.
    const holdCall = mocks.notifyDiscord.mock.calls.find(
      (c: any[]) => typeof c[0]?.tag === 'string' && c[0].tag.startsWith('signoff-hold-')
    );
    if (!holdCall) throw new Error('expected signoff-hold-* Discord call');
    expect(holdCall[0].content).toContain('tone risk');
    expect(holdCall[0].content).toContain('v2');

    // Schedule plan surfaces in the result.
    expect(result.schedulePlan).toBeTruthy();
    expect(result.schedulePlan?.variations).toHaveLength(2);
    expect(result.schedulePlan?.usedManagedAgentsApi).toBe(true);

    if (prevFlag !== undefined) process.env.AUTO_MODE_USE_SIGNOFF = prevFlag;
    else delete process.env.AUTO_MODE_USE_SIGNOFF;
    if (prevKey !== undefined) process.env.ANTHROPIC_API_KEY = prevKey;
    else delete process.env.ANTHROPIC_API_KEY;
  });

  it('signoff: flag unset → runSignoffAgent is NOT called (current behaviour preserved)', async () => {
    const prevFlag = process.env.AUTO_MODE_USE_SIGNOFF;
    delete process.env.AUTO_MODE_USE_SIGNOFF;

    mocks.runMultiAgent.mockResolvedValueOnce({
      finalText: JSON.stringify({
        caption: 'baseline',
        platform: 'instagram',
        whenLocal: '2026-04-27T19:00:00+08:00',
      }),
      steps: [
        {
          index: 0,
          name: 'generate_image',
          input: {},
          ok: true,
          ms: 5,
          output: { result: { images: [{ url: 'https://cdn/baseline.png' }] } },
        },
      ],
      iterations: 1,
      stopReason: 'end_turn',
    });
    mocks.publisherSchedule.mockResolvedValueOnce({
      previewUrl: '/workspace/ws_x?publishPreview=p-1',
    });
    mocks.resolvePublisherForPost.mockReturnValue({
      id: 'preview',
      canPublish: () => true,
      schedule: mocks.publisherSchedule,
      list: async () => [],
      cancel: async () => {},
    });
    mocks.recordScheduledPost.mockResolvedValueOnce('sched-1');

    await runAutoMode({
      baseUrl: 'http://localhost:3000',
      workspaceId: 'ws_x',
      trigger: { kind: 'text', payload: 'baseline' },
      variationCount: 1,
      notifyMode: 'auto-post',
    });

    expect(mocks.runSignoffAgent).not.toHaveBeenCalled();
    expect(mocks.publisherSchedule).toHaveBeenCalledTimes(1);

    if (prevFlag !== undefined) process.env.AUTO_MODE_USE_SIGNOFF = prevFlag;
  });

  it('signoff: agent failure is fail-soft — all ready variations still scheduled', async () => {
    const prevFlag = process.env.AUTO_MODE_USE_SIGNOFF;
    const prevKey = process.env.ANTHROPIC_API_KEY;
    process.env.AUTO_MODE_USE_SIGNOFF = '1';
    process.env.ANTHROPIC_API_KEY = 'test-key-signoff-fail';

    mocks.runMultiAgent.mockResolvedValueOnce({
      finalText: JSON.stringify({
        caption: 'safe copy',
        platform: 'instagram',
        whenLocal: '2026-04-27T19:00:00+08:00',
      }),
      steps: [
        {
          index: 0,
          name: 'generate_image',
          input: {},
          ok: true,
          ms: 5,
          output: { result: { images: [{ url: 'https://cdn/safe.png' }] } },
        },
      ],
      iterations: 1,
      stopReason: 'end_turn',
    });

    mocks.runSignoffAgent.mockRejectedValueOnce(new Error('signoff timed out'));

    mocks.publisherSchedule.mockResolvedValueOnce({
      previewUrl: '/workspace/ws_x?publishPreview=p-1',
    });
    mocks.resolvePublisherForPost.mockReturnValue({
      id: 'preview',
      canPublish: () => true,
      schedule: mocks.publisherSchedule,
      list: async () => [],
      cancel: async () => {},
    });
    mocks.recordScheduledPost.mockResolvedValueOnce('sched-fb');

    const result = await runAutoMode({
      baseUrl: 'http://localhost:3000',
      workspaceId: 'ws_x',
      trigger: { kind: 'text', payload: 'fallback' },
      variationCount: 1,
      notifyMode: 'auto-post',
    });

    // Agent threw → fall through to legacy behaviour: schedule the ready variation.
    expect(result.scheduledPostIds).toEqual(['sched-fb']);
    expect(result.schedulePlan).toBeUndefined();

    if (prevFlag !== undefined) process.env.AUTO_MODE_USE_SIGNOFF = prevFlag;
    else delete process.env.AUTO_MODE_USE_SIGNOFF;
    if (prevKey !== undefined) process.env.ANTHROPIC_API_KEY = prevKey;
    else delete process.env.ANTHROPIC_API_KEY;
  });

  /**
   * useManagedAgents toggle — per-lap override that forces all three
   * managed agents (research / cluster / signoff) to skip the Managed
   * Agents API path and run on messages.create even when AGENT_ID env
   * vars are configured. The UI surfaces this in AutoModeToggle and the
   * /api/auto-mode/run route forwards it to runAutoMode.
   */
  it('useManagedAgents=false propagates into runResearchAgent and runSignoffAgent input', async () => {
    const prevFlag = process.env.AUTO_MODE_USE_SIGNOFF;
    const prevKey = process.env.ANTHROPIC_API_KEY;
    process.env.AUTO_MODE_USE_SIGNOFF = '1';
    process.env.ANTHROPIC_API_KEY = 'test-key-toggle';

    mocks.runResearchAgent.mockResolvedValueOnce({
      latencyMs: 10,
      competitors: [],
      recentCampaigns: [],
      localeInsights: [],
      sources: [],
      summary: 'mock',
      usedManagedAgentsApi: false,
    });
    mocks.runSignoffAgent.mockResolvedValueOnce({
      latencyMs: 10,
      usedManagedAgentsApi: false,
      overallRecommendation: 'ok',
      variations: [
        { variationIndex: 1, decision: 'auto-post', rationale: 'fine' },
      ],
    });

    mocks.fetchUrlIngestion.mockResolvedValueOnce({
      url: 'https://example.com/',
      finalUrl: 'https://example.com/',
      title: 'Example',
      description: 'sample',
      primaryImage: null,
      images: [{ url: 'https://example.com/og.jpg', source: 'og-image' as const }],
      products: [{ name: 'thing', brand: 'Example' }],
      bodyExcerpt: '',
      fetchedAt: '2026-04-28T00:00:00Z',
      rawHtmlBytes: 1_000,
    });
    mocks.runMultiAgent.mockResolvedValueOnce({
      finalText: JSON.stringify({
        caption: 'on-brand copy',
        platform: 'instagram',
        whenLocal: '2026-04-28T19:00:00+08:00',
      }),
      steps: [
        {
          index: 0,
          name: 'generate_image',
          input: {},
          ok: true,
          ms: 5,
          output: { result: { images: [{ url: 'https://cdn/x.png' }] } },
        },
      ],
      iterations: 1,
      stopReason: 'end_turn',
    });
    mocks.publisherSchedule.mockResolvedValueOnce({
      previewUrl: '/workspace/ws_x?publishPreview=p-1',
    });
    mocks.resolvePublisherForPost.mockReturnValue({
      id: 'preview',
      canPublish: () => true,
      schedule: mocks.publisherSchedule,
      list: async () => [],
      cancel: async () => {},
    });
    mocks.recordScheduledPost.mockResolvedValueOnce('sched-toggle');

    await runAutoMode({
      baseUrl: 'http://localhost:3000',
      workspaceId: 'ws_toggle',
      trigger: { kind: 'url', payload: 'https://example.com/' },
      variationCount: 1,
      notifyMode: 'auto-post',
      useManagedAgents: false,
    });

    // Research agent received the toggle = false.
    expect(mocks.runResearchAgent).toHaveBeenCalledOnce();
    expect(mocks.runResearchAgent.mock.calls[0]![0]).toMatchObject({
      useManagedAgents: false,
    });

    // Signoff agent received the toggle = false.
    expect(mocks.runSignoffAgent).toHaveBeenCalledOnce();
    expect(mocks.runSignoffAgent.mock.calls[0]![0]).toMatchObject({
      useManagedAgents: false,
    });

    if (prevFlag !== undefined) process.env.AUTO_MODE_USE_SIGNOFF = prevFlag;
    else delete process.env.AUTO_MODE_USE_SIGNOFF;
    if (prevKey !== undefined) process.env.ANTHROPIC_API_KEY = prevKey;
    else delete process.env.ANTHROPIC_API_KEY;
  });

  it('useManagedAgents defaults to undefined (= managed-agents path on when IDs present)', async () => {
    const prevKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'test-key-default';

    mocks.runResearchAgent.mockResolvedValueOnce({
      latencyMs: 10,
      competitors: [],
      recentCampaigns: [],
      localeInsights: [],
      sources: [],
      summary: 'mock',
      usedManagedAgentsApi: true,
    });
    mocks.fetchUrlIngestion.mockResolvedValueOnce({
      url: 'https://example.com/',
      finalUrl: 'https://example.com/',
      title: 'Example',
      description: 'sample',
      primaryImage: null,
      images: [],
      products: [{ name: 'thing', brand: 'Example' }],
      bodyExcerpt: '',
      fetchedAt: '2026-04-28T00:00:00Z',
      rawHtmlBytes: 1_000,
    });
    mocks.runMultiAgent.mockResolvedValueOnce({
      finalText: '{}',
      steps: [
        {
          index: 0,
          name: 'generate_image',
          input: {},
          ok: true,
          ms: 5,
          output: { result: { images: [{ url: 'https://cdn/x.png' }] } },
        },
      ],
      iterations: 1,
      stopReason: 'end_turn',
    });

    await runAutoMode({
      baseUrl: 'http://localhost:3000',
      trigger: { kind: 'url', payload: 'https://example.com/' },
      variationCount: 1,
      notifyMode: 'review',
      // No useManagedAgents field — default behaviour.
    });

    // Research agent saw `useManagedAgents: undefined` (= default on).
    expect(mocks.runResearchAgent.mock.calls[0]![0].useManagedAgents).toBeUndefined();

    if (prevKey !== undefined) process.env.ANTHROPIC_API_KEY = prevKey;
    else delete process.env.ANTHROPIC_API_KEY;
  });
});

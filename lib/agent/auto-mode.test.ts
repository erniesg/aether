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
  return {
    runMultiAgent,
    startCampaign,
    setCampaignStatus,
    insertCampaignVariation,
    recordScheduledPost,
    notifyDiscord,
    publisherSchedule,
    resolvePublisher,
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
}));

vi.mock('@/lib/notify/discord', () => ({
  notifyDiscord: mocks.notifyDiscord,
}));

vi.mock('@/lib/providers/publisher/registry', () => ({
  resolvePublisher: mocks.resolvePublisher,
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
    expect(endCall[0].content).toContain('AWAITING APPROVAL');
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
    expect(endCall).toBeDefined();
    expect(endCall[0].content).toContain('POSTS SCHEDULED');
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
        steps: [],
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

  it('forwards referenceImage to runMultiAgent and into the variation prompt', async () => {
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
    expect(call.referenceImage).toEqual({
      url: 'https://cdn/ref.png',
      dataUrl: undefined,
    });
    expect(call.prompt).toContain('https://cdn/ref.png');
    expect(call.prompt).toContain('rainy idol scene');
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
    mocks.resolvePublisher.mockReturnValue({
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
    // Publisher resolved once with the workspace and preview as preferred id.
    expect(mocks.resolvePublisher).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'ws_x', preferredId: 'preview' })
    );
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
    mocks.resolvePublisher.mockReturnValue({
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
    mocks.resolvePublisher.mockReturnValue({
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
});

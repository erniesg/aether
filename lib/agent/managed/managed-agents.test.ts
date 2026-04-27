/**
 * Contract tests for lib/agent/managed/{research,cluster,signoff}.ts
 *
 * All Anthropic SDK and Convex HTTP calls are mocked so no real API
 * credits are consumed overnight. Tests verify:
 *   - The correct SDK surface is called (Managed Agents path vs fallback)
 *   - ResearchBundle / ClusterBundle / SchedulePlan shapes are produced
 *   - Provenance ledger (recordRunStart/Finish/Fail) is always written
 *   - Fail-soft: a thrown error surfaces in recordRunFail, not a crash
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoist mocks BEFORE module imports (vitest requirement).
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => {
  const recordRunStart = vi.fn().mockResolvedValue(undefined);
  const recordRunFinish = vi.fn().mockResolvedValue(undefined);
  const recordRunFail = vi.fn().mockResolvedValue(undefined);
  return { recordRunStart, recordRunFinish, recordRunFail };
});

vi.mock('@/lib/convex/http', () => ({
  recordRunStart: mocks.recordRunStart,
  recordRunFinish: mocks.recordRunFinish,
  recordRunFail: mocks.recordRunFail,
  // stub other exports so the import doesn't break
  startCampaign: vi.fn(),
  setCampaignStatus: vi.fn(),
  insertCampaignVariation: vi.fn(),
  recordScheduledPost: vi.fn(),
}));

import { runResearchAgent, type ResearchBundle } from './research';
import { runClusterAgent, type ClusterBundle } from './cluster';
import { runSignoffAgent, type SchedulePlan } from './signoff';

// ---------------------------------------------------------------------------
// Fake Anthropic client builder
// ---------------------------------------------------------------------------

/**
 * Build a minimal fake Anthropic client that satisfies the managed-agent
 * and messages.create call sites without importing the real SDK.
 */
function makeFakeClient(overrides: {
  /** What the standard messages.create call returns (fallback path). */
  messagesCreateText?: string;
  /** What the beta sessions path returns (managed agents path). */
  sessionsText?: string;
  /** Whether to simulate a session create + stream (managed agents) or just messages. */
  useSessions?: boolean;
}) {
  const { messagesCreateText = '{}', sessionsText = '{}', useSessions = false } = overrides;

  const messagesCreate = vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: messagesCreateText }],
  });

  // Managed Agents sessions path.
  const sessionCreate = vi.fn().mockResolvedValue({ id: 'session_test_123' });
  const sessionEventsSend = vi.fn().mockResolvedValue(undefined);
  // The stream is an async iterable that yields agent.message then session.status_idle.
  const sessionEventsStream = vi.fn().mockImplementation(() => {
    const events = useSessions
      ? [
          { type: 'agent.message', content: [{ type: 'text', text: sessionsText }] },
          { type: 'session.status_idle', stop_reason: { type: 'end_turn' } },
        ]
      : [];
    return {
      [Symbol.asyncIterator]() {
        let i = 0;
        return {
          next() {
            if (i < events.length) {
              return Promise.resolve({ value: events[i++], done: false });
            }
            return Promise.resolve({ value: undefined, done: true });
          },
        };
      },
    };
  });

  return {
    messages: { create: messagesCreate },
    beta: {
      messages: {
        create: messagesCreate,
      },
      sessions: {
        create: sessionCreate,
        events: {
          send: sessionEventsSend,
          stream: sessionEventsStream,
        },
      },
    },
    _sessionCreate: sessionCreate,
    _sessionEventsSend: sessionEventsSend,
    _sessionEventsStream: sessionEventsStream,
    _messagesCreate: messagesCreate,
  } as unknown as Parameters<typeof runResearchAgent>[0]['client'];
}

// ---------------------------------------------------------------------------
// Research agent tests
// ---------------------------------------------------------------------------

describe('runResearchAgent — contract tests', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockClear());
    // Ensure managed agents env vars are absent (fallback path by default).
    delete process.env.ANTHROPIC_RESEARCH_AGENT_ID;
    delete process.env.ANTHROPIC_RESEARCH_ENVIRONMENT_ID;
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_RESEARCH_AGENT_ID;
    delete process.env.ANTHROPIC_RESEARCH_ENVIRONMENT_ID;
  });

  it('throws when neither client nor ANTHROPIC_API_KEY is provided', async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    await expect(
      runResearchAgent({ brand: 'Eight Sleep', url: 'https://eightsleep.com' })
    ).rejects.toThrow(/ANTHROPIC_API_KEY not set/);
    if (prev) process.env.ANTHROPIC_API_KEY = prev;
  });

  it('fallback path: calls beta.messages.create and writes provenance', async () => {
    const responseJson = JSON.stringify({
      competitors: ['Whoop', 'Oura Ring'],
      recentCampaigns: ['Eight Sleep "Sleep, deeper" SG launch'],
      localeInsights: [
        { locale: 'en-SG', insight: 'Professional tone, emphasise ROI of sleep' },
        { locale: 'zh-Hans-SG', insight: '强调科技感和效率' },
      ],
      sources: [
        {
          url: 'https://techcrunch.com/2026/01/eightsleep',
          snippet: 'Eight Sleep raises…',
          retrievedAt: '2026-04-28T00:00:00Z',
        },
      ],
      summary: 'Eight Sleep is leading in SG smart sleep. Competitors are behind.',
    });

    const fakeClient = makeFakeClient({ messagesCreateText: responseJson });

    const bundle = await runResearchAgent({
      brand: 'Eight Sleep',
      url: 'https://eightsleep.com',
      client: fakeClient,
    });

    // ResearchBundle shape is well-formed.
    expect(bundle.competitors).toEqual(['Whoop', 'Oura Ring']);
    expect(bundle.recentCampaigns).toHaveLength(1);
    expect(bundle.localeInsights).toHaveLength(2);
    expect(bundle.localeInsights[0].locale).toBe('en-SG');
    expect(bundle.sources).toHaveLength(1);
    expect(bundle.sources[0].url).toBe('https://techcrunch.com/2026/01/eightsleep');
    expect(bundle.summary).toContain('Eight Sleep');
    expect(bundle.usedManagedAgentsApi).toBe(false);
    expect(bundle.latencyMs).toBeGreaterThanOrEqual(0);

    // Provenance ledger written.
    expect(mocks.recordRunStart).toHaveBeenCalledTimes(1);
    expect(mocks.recordRunStart.mock.calls[0][0].tool).toBe('managed-research');
    expect(mocks.recordRunFinish).toHaveBeenCalledTimes(1);
    expect(mocks.recordRunFail).not.toHaveBeenCalled();
  });

  it('managed agents path: uses session API when env vars are set', async () => {
    process.env.ANTHROPIC_RESEARCH_AGENT_ID = 'agent_research_test';
    process.env.ANTHROPIC_RESEARCH_ENVIRONMENT_ID = 'env_test';

    const responseJson = JSON.stringify({
      competitors: ['Nesto', 'Hyperice'],
      recentCampaigns: [],
      localeInsights: [],
      sources: [],
      summary: 'Research via managed sessions.',
    });

    const fakeClient = makeFakeClient({ sessionsText: responseJson, useSessions: true });

    const bundle = await runResearchAgent({
      brand: 'Eight Sleep',
      url: 'https://eightsleep.com',
      client: fakeClient,
    });

    // Session was created with the correct agent id.
    const clientAsAny = fakeClient as unknown as { _sessionCreate: ReturnType<typeof vi.fn> };
    expect(clientAsAny._sessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ agent: 'agent_research_test', environment_id: 'env_test' })
    );

    expect(bundle.sessionId).toBe('session_test_123');
    expect(bundle.usedManagedAgentsApi).toBe(true);
    expect(bundle.competitors).toEqual(['Nesto', 'Hyperice']);
    expect(mocks.recordRunFinish).toHaveBeenCalledTimes(1);
    expect(mocks.recordRunFail).not.toHaveBeenCalled();
  });

  it('writes recordRunFail and rethrows on API error', async () => {
    const fakeClient = makeFakeClient({});
    (fakeClient as unknown as { _messagesCreate: ReturnType<typeof vi.fn> })._messagesCreate.mockRejectedValueOnce(
      new Error('rate limit')
    );
    // Wire the beta.messages.create to also reject.
    const betaMessages = (fakeClient as unknown as { beta: { messages: { create: ReturnType<typeof vi.fn> } } }).beta.messages;
    betaMessages.create.mockRejectedValueOnce(new Error('rate limit'));

    await expect(
      runResearchAgent({ brand: 'Eight Sleep', url: 'https://eightsleep.com', client: fakeClient })
    ).rejects.toThrow('rate limit');

    expect(mocks.recordRunFail).toHaveBeenCalledTimes(1);
    expect(mocks.recordRunFail.mock.calls[0][1]).toContain('rate limit');
  });

  it('accepts ingestion context and includes product name in prompt', async () => {
    const fakeClient = makeFakeClient({ messagesCreateText: '{"competitors":[],"recentCampaigns":[],"localeInsights":[],"sources":[],"summary":"ok"}' });
    const messages = (fakeClient as unknown as { beta: { messages: { create: ReturnType<typeof vi.fn> } } }).beta.messages;

    await runResearchAgent({
      brand: 'Eight Sleep',
      url: 'https://eightsleep.com',
      client: fakeClient,
      ingestion: {
        url: 'https://eightsleep.com',
        finalUrl: 'https://eightsleep.com',
        title: 'Eight Sleep | Pod 4 Ultra',
        description: 'Sleep system with thermal cover',
        primaryImage: undefined,
        images: [],
        products: [{ name: 'Pod 4 Ultra', description: '', brand: 'Eight Sleep', schemaType: 'Product', offers: null }],
        bodyExcerpt: '',
        fetchedAt: '2026-04-28T00:00:00Z',
        rawHtmlBytes: 1000,
      } as unknown as Parameters<typeof runResearchAgent>[0]['ingestion'],
    });

    // The user message passed to messages.create must mention the product.
    const call = messages.create.mock.calls[0];
    const userContent = Array.isArray(call[0].messages[0].content)
      ? JSON.stringify(call[0].messages[0].content)
      : call[0].messages[0].content;
    expect(userContent).toContain('Pod 4 Ultra');
  });

  it('returns sensible defaults when the model returns unparsable text', async () => {
    const fakeClient = makeFakeClient({ messagesCreateText: 'I could not parse anything useful.' });

    const bundle = await runResearchAgent({
      brand: 'Brand X',
      url: 'https://example.com',
      client: fakeClient,
    });

    // Should not throw; defaults are returned.
    expect(bundle.competitors).toEqual([]);
    expect(bundle.sources).toEqual([]);
    // Summary falls back to a slice of the model's text.
    expect(bundle.summary.length).toBeGreaterThan(0);
    expect(bundle.usedManagedAgentsApi).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cluster agent tests
// ---------------------------------------------------------------------------

describe('runClusterAgent — contract tests', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockClear());
    delete process.env.ANTHROPIC_CLUSTER_AGENT_ID;
    delete process.env.ANTHROPIC_CLUSTER_ENVIRONMENT_ID;
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_CLUSTER_AGENT_ID;
    delete process.env.ANTHROPIC_CLUSTER_ENVIRONMENT_ID;
  });

  it('returns empty bundle for 0 refs without calling the SDK', async () => {
    const fakeClient = makeFakeClient({});
    const bundle = await runClusterAgent({ refs: [], client: fakeClient });
    expect(bundle.clusters).toEqual([]);
    expect(bundle.unclustered).toEqual([]);
    expect(mocks.recordRunStart).not.toHaveBeenCalled();
  });

  it('fallback path: calls messages.create and parses Cluster[] shape', async () => {
    const responseJson = JSON.stringify({
      clusters: [
        {
          label: 'warm minimalist bedroom',
          rationale: 'Soft lighting, neutral palette, shared bedroom setting',
          tags: ['soft lighting', 'neutral palette', 'bedroom'],
          memberIndexes: [0, 2],
        },
        {
          label: 'bold product hero',
          rationale: 'High contrast, product centred, white background',
          tags: ['high contrast', 'product focus'],
          memberIndexes: [1],
        },
      ],
      unclustered: [],
    });

    const fakeClient = makeFakeClient({ messagesCreateText: responseJson });

    const bundle = await runClusterAgent({
      refs: [
        { url: 'https://cdn/a.jpg', label: 'bedroom warm' },
        { url: 'https://cdn/b.jpg', label: 'product white bg' },
        { url: 'https://cdn/c.jpg' },
      ],
      client: fakeClient,
    });

    expect(bundle.clusters).toHaveLength(2);
    expect(bundle.clusters[0].label).toBe('warm minimalist bedroom');
    expect(bundle.clusters[0].memberIndexes).toEqual([0, 2]);
    expect(bundle.clusters[0].tags).toContain('soft lighting');
    expect(bundle.clusters[1].label).toBe('bold product hero');
    expect(bundle.unclustered).toEqual([]);
    expect(bundle.usedManagedAgentsApi).toBe(false);
    expect(mocks.recordRunStart).toHaveBeenCalledTimes(1);
    expect(mocks.recordRunStart.mock.calls[0][0].tool).toBe('managed-cluster');
    expect(mocks.recordRunFinish).toHaveBeenCalledTimes(1);
  });

  it('managed agents path: creates session and streams response', async () => {
    process.env.ANTHROPIC_CLUSTER_AGENT_ID = 'agent_cluster_test';
    process.env.ANTHROPIC_CLUSTER_ENVIRONMENT_ID = 'env_test';

    const responseJson = JSON.stringify({
      clusters: [
        {
          label: 'cool blue palette',
          rationale: 'All refs share cool tones and morning light',
          tags: ['cool', 'blue'],
          memberIndexes: [0, 1],
        },
      ],
      unclustered: [],
    });

    const fakeClient = makeFakeClient({ sessionsText: responseJson, useSessions: true });

    const bundle = await runClusterAgent({
      refs: [{ url: 'https://cdn/a.jpg' }, { url: 'https://cdn/b.jpg' }],
      client: fakeClient,
    });

    expect(bundle.sessionId).toBe('session_test_123');
    expect(bundle.usedManagedAgentsApi).toBe(true);
    expect(bundle.clusters).toHaveLength(1);
    expect(bundle.clusters[0].memberIndexes).toEqual([0, 1]);
  });

  it('returns sensible defaults on parse failure', async () => {
    const fakeClient = makeFakeClient({ messagesCreateText: 'no JSON here' });

    const bundle = await runClusterAgent({
      refs: [{ url: 'https://cdn/x.jpg' }, { url: 'https://cdn/y.jpg' }],
      client: fakeClient,
    });

    // Defaults to all refs unclustered.
    expect(bundle.clusters).toEqual([]);
    expect(bundle.unclustered).toEqual([0, 1]);
  });
});

// ---------------------------------------------------------------------------
// Signoff agent tests
// ---------------------------------------------------------------------------

describe('runSignoffAgent — contract tests', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockClear());
    delete process.env.ANTHROPIC_SIGNOFF_AGENT_ID;
    delete process.env.ANTHROPIC_SIGNOFF_ENVIRONMENT_ID;
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_SIGNOFF_AGENT_ID;
    delete process.env.ANTHROPIC_SIGNOFF_ENVIRONMENT_ID;
  });

  const baseInput: Parameters<typeof runSignoffAgent>[0] = {
    variations: [
      {
        index: 1,
        caption: 'Sleep deeper with Eight Sleep Pod 4 Ultra in SG — limited time',
        platform: 'instagram',
        scheduleWhenLocal: '2026-04-28T19:00:00+08:00',
        moodNote: 'warm dawn',
        hasHero: true,
      },
      {
        index: 2,
        caption: undefined,
        platform: 'instagram',
        scheduleWhenLocal: undefined,
        hasHero: false,
      },
    ],
    guardrails: {
      brandNames: ['Eight Sleep', 'Pod 4 Ultra'],
      forbiddenTopics: ['cryptocurrency', 'politics'],
      requiredElements: [],
    },
  };

  it('fallback path: calls messages.create and parses SchedulePlan shape', async () => {
    const responseJson = JSON.stringify({
      variations: [
        {
          variationIndex: 1,
          decision: 'auto-post',
          rationale: 'Meets all guardrails, has hero, schedule within 36h',
          suggestedSchedule: {
            platform: 'instagram',
            whenLocal: '2026-04-28T19:00:00+08:00',
          },
        },
        {
          variationIndex: 2,
          decision: 'reject',
          rationale: 'No hero image; no schedule; no caption',
        },
      ],
      overallRecommendation:
        'Variation 1 is ready to post. Variation 2 must be fixed before publishing.',
    });

    const fakeClient = makeFakeClient({ messagesCreateText: responseJson });

    const plan = await runSignoffAgent({ ...baseInput, client: fakeClient });

    expect(plan.variations).toHaveLength(2);
    expect(plan.variations[0].decision).toBe('auto-post');
    expect(plan.variations[0].variationIndex).toBe(1);
    expect(plan.variations[0].suggestedSchedule?.platform).toBe('instagram');
    expect(plan.variations[1].decision).toBe('reject');
    expect(plan.overallRecommendation).toContain('Variation 1 is ready');
    expect(plan.usedManagedAgentsApi).toBe(false);
    expect(mocks.recordRunStart).toHaveBeenCalledTimes(1);
    expect(mocks.recordRunStart.mock.calls[0][0].tool).toBe('managed-signoff');
    expect(mocks.recordRunFinish).toHaveBeenCalledTimes(1);
  });

  it('injects server-supplied "now" + 36h window into the prompt', async () => {
    // Regression guard (2026-04-27): the model rejected legitimate posts as
    // "far beyond the 36-hour window" because it computed today's date from
    // its training cutoff. Prompt MUST anchor the window on a server clock.
    const fakeClient = makeFakeClient({ messagesCreateText: '{}' });
    const fixedNow = new Date('2026-04-27T08:30:00.000Z');
    const expectedWindowEnd = new Date(
      fixedNow.getTime() + 36 * 60 * 60 * 1000
    ).toISOString();

    await runSignoffAgent({ ...baseInput, client: fakeClient, now: fixedNow });

    const messagesCreate = (fakeClient as unknown as { _messagesCreate: { mock: { calls: unknown[][] } } })._messagesCreate;
    const callArgs = messagesCreate.mock.calls[0]![0] as { messages: Array<{ content: string }> };
    const userPrompt = callArgs.messages[0].content;

    expect(userPrompt).toContain(fixedNow.toISOString());
    expect(userPrompt).toContain(expectedWindowEnd);
    expect(userPrompt).toMatch(/server-supplied/i);
    expect(userPrompt).toMatch(/Do NOT (use|rely)/i);
  });

  it('managed agents path: creates session and streams response', async () => {
    process.env.ANTHROPIC_SIGNOFF_AGENT_ID = 'agent_signoff_test';
    process.env.ANTHROPIC_SIGNOFF_ENVIRONMENT_ID = 'env_test';

    const responseJson = JSON.stringify({
      variations: [
        { variationIndex: 1, decision: 'auto-post', rationale: 'Looks great' },
        { variationIndex: 2, decision: 'hold-for-review', rationale: 'Missing hero' },
      ],
      overallRecommendation: 'One ready, one needs work.',
    });

    const fakeClient = makeFakeClient({ sessionsText: responseJson, useSessions: true });

    const plan = await runSignoffAgent({ ...baseInput, client: fakeClient });

    expect(plan.sessionId).toBe('session_test_123');
    expect(plan.usedManagedAgentsApi).toBe(true);
    expect(plan.variations[0].decision).toBe('auto-post');
  });

  it('falls back to hold-for-review for all variations on parse failure', async () => {
    const fakeClient = makeFakeClient({ messagesCreateText: 'not json at all' });

    const plan = await runSignoffAgent({ ...baseInput, client: fakeClient });

    // All variations default to hold-for-review.
    expect(plan.variations).toHaveLength(2);
    plan.variations.forEach((v) => {
      expect(v.decision).toBe('hold-for-review');
    });
  });

  it('rejects invalid decision strings and coerces to hold-for-review', async () => {
    const responseJson = JSON.stringify({
      variations: [
        { variationIndex: 1, decision: 'magic-decision', rationale: 'coerced' },
      ],
      overallRecommendation: 'test',
    });

    const fakeClient = makeFakeClient({ messagesCreateText: responseJson });
    const plan = await runSignoffAgent({
      variations: [baseInput.variations[0]],
      guardrails: baseInput.guardrails,
      client: fakeClient,
    });

    expect(plan.variations[0].decision).toBe('hold-for-review');
  });

  it('includes brand guardrail context in the prompt sent to the model', async () => {
    const fakeClient = makeFakeClient({ messagesCreateText: '{"variations":[],"overallRecommendation":""}' });
    const messages = (fakeClient as unknown as { messages: { create: ReturnType<typeof vi.fn> } }).messages;

    await runSignoffAgent({
      variations: [baseInput.variations[0]],
      guardrails: {
        brandNames: ['Eight Sleep'],
        forbiddenTopics: ['alcohol', 'tobacco'],
        requiredElements: ['#eightsleep'],
        maxCaptionLength: 180,
      },
      client: fakeClient,
    });

    const promptText = messages.create.mock.calls[0][0].messages[0].content;
    expect(promptText).toContain('Eight Sleep');
    expect(promptText).toContain('alcohol');
    expect(promptText).toContain('#eightsleep');
    expect(promptText).toContain('180 chars');
  });
});

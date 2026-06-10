import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const messagesCreate = vi.fn();
  const AnthropicCtor = vi.fn(function () {
    return { messages: { create: messagesCreate } };
  });
  const convexMutation = vi.fn();
  const convexQuery = vi.fn();
  const ConvexHttpClient = vi.fn(function () {
    return { mutation: convexMutation, query: convexQuery };
  });
  return { messagesCreate, AnthropicCtor, convexMutation, convexQuery, ConvexHttpClient };
});

vi.mock('@anthropic-ai/sdk', () => ({
  default: mocks.AnthropicCtor,
}));

vi.mock('convex/browser', () => ({
  ConvexHttpClient: mocks.ConvexHttpClient,
}));

describe('/api/presence/strategy', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;
  const originalConvexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'ant_test';
    delete process.env.NEXT_PUBLIC_CONVEX_URL;
    mocks.messagesCreate.mockReset();
    mocks.AnthropicCtor.mockClear();
    mocks.convexMutation.mockReset();
    mocks.convexQuery.mockReset();
    mocks.ConvexHttpClient.mockClear();
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
    if (originalConvexUrl === undefined) delete process.env.NEXT_PUBLIC_CONVEX_URL;
    else process.env.NEXT_PUBLIC_CONVEX_URL = originalConvexUrl;
    vi.resetModules();
  });

  it('returns a complete proposed strategy and embeds the exemplar reasoning shape', async () => {
    mocks.messagesCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          name: 'emit_presence_strategy',
          id: 'tool_1',
          input: {
            strategy: {
              positioning:
                'I ship visible AI agents and the harnesses that keep them accountable.',
              icpAccounts: [
                { handle: '@openai', reason: 'platform builders reshare credible demos' },
                { handle: '@AnthropicAI', reason: 'agent reliability audience' },
                { handle: '@modal_labs', reason: 'infra-heavy AI deployment lane' },
                { handle: '@vercel', reason: 'DX audience for builders' },
                { handle: '@convex_dev', reason: 'reactive app builders match receipts' },
              ],
              pillars: [
                {
                  name: 'agent harnesses',
                  evidenceRefs: ['repo:https://github.com/erniesg/aether'],
                  exampleFormats: ['failure-honest thread'],
                },
                {
                  name: 'visible demos',
                  evidenceRefs: ['site:https://ernie.sg'],
                  exampleFormats: ['demo video post'],
                },
                {
                  name: 'production rigor',
                  evidenceRefs: ['resume:resume.md'],
                  exampleFormats: ['earned opinion'],
                },
              ],
              cadence: '2 posts/week · 15 min replies/day',
              replyPlaybook: {
                dailyMinutes: 15,
                accountListSize: 25,
              },
              skipList: ['model hot takes', 'generic launch commentary'],
              goalMetric90d:
                '5 replies or DMs from named lab/tooling engineers referencing specific posts',
            },
          },
        },
      ],
    });

    const { POST } = await import('@/app/api/presence/strategy/route');
    const res = await POST(
      new Request('http://localhost/api/presence/strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'demo-ws',
          profile: {
            id: 'profile_personal',
            label: 'personal',
            xHandle: 'x.com/erniesg',
            goal: 'get seen for FDE and AI-engineering roles',
            targetMetric: 'right people replying',
          },
          evidenceFacts: [
            {
              text: 'aether uses Next.js 15 and Convex.',
              source: { kind: 'repo', ref: 'https://github.com/erniesg/aether' },
            },
          ],
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.status).toBe('proposed');
    expect(json.profile.xHandle).toBe('@erniesg');
    expect(json.strategy.icpAccounts).toHaveLength(5);
    expect(json.strategy.icpAccounts.every((account: { reason?: string }) => account.reason)).toBe(
      true
    );
    expect(json.strategy.pillars).toHaveLength(3);
    expect(json.strategy.pillars[0].evidenceRefs).toEqual([
      'repo:https://github.com/erniesg/aether',
    ]);
    expect(json.strategy.goalMetric90d.toLowerCase()).not.toContain('follower');

    const call = mocks.messagesCreate.mock.calls[0][0];
    const prompt = JSON.stringify(call.messages);
    expect(prompt).toContain('Reframe the goal as evidence, not audience');
    expect(prompt).toContain('ICP in priority order, with a reason each');
    expect(prompt).toContain('get seen for FDE and AI-engineering roles');
    expect(call.tool_choice).toEqual({
      type: 'tool',
      name: 'emit_presence_strategy',
    });
  });

  it('falls back without evidence sources and still avoids follower-count goals', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { POST } = await import('@/app/api/presence/strategy/route');
    const res = await POST(
      new Request('http://localhost/api/presence/strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'demo-ws',
          profile: {
            id: 'profile_product',
            label: 'product',
            xHandle: '@aether',
            goal: 'reach AI creative tool builders',
          },
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.fallback).toBe('no-api-key');
    expect(json.strategy.icpAccounts).toHaveLength(5);
    expect(json.strategy.goalMetric90d.toLowerCase()).not.toContain('follower');
  });

  it('persists the proposed strategy row when Convex is configured', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.NEXT_PUBLIC_CONVEX_URL = 'https://example.convex.cloud';
    mocks.convexMutation.mockResolvedValueOnce('strategy_1');

    const { POST } = await import('@/app/api/presence/strategy/route');
    const res = await POST(
      new Request('http://localhost/api/presence/strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'demo-ws',
          profile: {
            id: 'profile_product',
            label: 'product',
            xHandle: '@aether',
            goal: 'reach AI creative tool builders',
          },
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.proposalId).toBe('strategy_1');
    expect(mocks.ConvexHttpClient).toHaveBeenCalledWith(
      'https://example.convex.cloud'
    );
    expect(mocks.convexMutation).toHaveBeenCalledWith(expect.anything(), {
      workspaceId: 'demo-ws',
      profileId: 'profile_product',
      strategy: expect.objectContaining({
        positioning: expect.any(String),
        pillars: expect.any(Array),
      }),
    });
  });

  it('loads persisted product facts into the planner prompt when the UI omits evidence facts', async () => {
    process.env.NEXT_PUBLIC_CONVEX_URL = 'https://example.convex.cloud';
    mocks.convexQuery.mockResolvedValueOnce([
      {
        name: 'aether',
        claims: ['aether persists generated facts through productFact rows.'],
        claimSources: [{ kind: 'repo', ref: 'https://github.com/erniesg/aether' }],
      },
    ]);
    mocks.messagesCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          name: 'emit_presence_strategy',
          id: 'tool_1',
          input: {
            strategy: {
              positioning: 'Evidence-backed positioning.',
              icpAccounts: [
                { handle: '@openai', reason: 'platform builders' },
                { handle: '@AnthropicAI', reason: 'agent builders' },
                { handle: '@modal_labs', reason: 'infra builders' },
                { handle: '@vercel', reason: 'DX builders' },
                { handle: '@convex_dev', reason: 'reactive app builders' },
              ],
              pillars: [
                { name: 'agent harnesses', evidenceRefs: ['repo:https://github.com/erniesg/aether'], exampleFormats: ['thread'] },
                { name: 'visible demos', evidenceRefs: ['repo:https://github.com/erniesg/aether'], exampleFormats: ['demo'] },
                { name: 'production rigor', evidenceRefs: ['repo:https://github.com/erniesg/aether'], exampleFormats: ['opinion'] },
              ],
              cadence: '2 posts/week',
              replyPlaybook: { dailyMinutes: 15, accountListSize: 25 },
              skipList: ['generic hot takes'],
              goalMetric90d: '5 DMs from named builders',
            },
          },
        },
      ],
    });

    const { POST } = await import('@/app/api/presence/strategy/route');
    await POST(
      new Request('http://localhost/api/presence/strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'demo-ws',
          profile: {
            id: 'profile_personal',
            label: 'personal',
            xHandle: '@erniesg',
            goal: 'get seen for FDE roles',
          },
        }),
      })
    );

    const prompt = JSON.stringify(mocks.messagesCreate.mock.calls[0][0].messages);
    expect(mocks.convexQuery).toHaveBeenCalledWith(expect.anything(), {
      wsId: 'demo-ws',
    });
    expect(prompt).toContain('Evidence facts:');
    expect(prompt).toContain('repo:https://github.com/erniesg/aether');
    expect(prompt).toContain('aether persists generated facts through productFact rows.');
  });

  it('includes brand, offer, and campaign context in the planner prompt when supplied', async () => {
    mocks.messagesCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          name: 'emit_presence_strategy',
          id: 'tool_1',
          input: {
            strategy: {
              positioning: 'Creator-context positioning.',
              icpAccounts: [
                { handle: '@openai', reason: 'platform builders' },
                { handle: '@AnthropicAI', reason: 'agent builders' },
                { handle: '@modal_labs', reason: 'infra builders' },
                { handle: '@vercel', reason: 'DX builders' },
                { handle: '@convex_dev', reason: 'reactive app builders' },
              ],
              pillars: [
                { name: 'agent harnesses', evidenceRefs: ['profile:x'], exampleFormats: ['thread'] },
                { name: 'visible demos', evidenceRefs: ['profile:x'], exampleFormats: ['demo'] },
                { name: 'production rigor', evidenceRefs: ['profile:x'], exampleFormats: ['opinion'] },
              ],
              cadence: '2 posts/week',
              replyPlaybook: { dailyMinutes: 15, accountListSize: 25 },
              skipList: ['generic hot takes'],
              goalMetric90d: '5 DMs from named builders',
            },
          },
        },
      ],
    });

    const { POST } = await import('@/app/api/presence/strategy/route');
    await POST(
      new Request('http://localhost/api/presence/strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'demo-ws',
          profile: {
            id: 'profile_personal',
            label: 'personal',
            xHandle: '@erniesg',
            goal: 'get seen for FDE roles',
          },
          creatorContext: {
            brand: { name: 'aether', voice: 'precise builder notes' },
            offer: {
              name: 'FDE hiring signal',
              summary: 'proof of AI engineering work',
              claims: ['ships creator-first canvas workflows'],
            },
            campaign: {
              name: 'AI engineering presence',
              goal: 'earn FDE conversations',
              audience: 'AI tooling teams',
            },
          },
        }),
      })
    );

    const prompt = JSON.stringify(mocks.messagesCreate.mock.calls[0][0].messages);
    expect(prompt).toContain('Creator context:');
    expect(prompt).toContain('Brand: aether');
    expect(prompt).toContain('Offer: FDE hiring signal');
    expect(prompt).toContain('Campaign: AI engineering presence');
  });

  it('includes the ICP insights digest in the planner prompt when supplied', async () => {
    mocks.messagesCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          name: 'emit_presence_strategy',
          id: 'tool_1',
          input: {
            strategy: {
              positioning: 'Digest-informed positioning.',
              icpAccounts: [
                { handle: '@openai', reason: 'platform builders' },
                { handle: '@AnthropicAI', reason: 'agent builders' },
                { handle: '@modal_labs', reason: 'infra builders' },
                { handle: '@vercel', reason: 'DX builders' },
                { handle: '@convex_dev', reason: 'reactive app builders' },
              ],
              pillars: [
                { name: 'agent harnesses', evidenceRefs: ['profile:x'], exampleFormats: ['thread'] },
                { name: 'visible demos', evidenceRefs: ['profile:x'], exampleFormats: ['demo'] },
                { name: 'production rigor', evidenceRefs: ['profile:x'], exampleFormats: ['opinion'] },
              ],
              cadence: '2 posts/week',
              replyPlaybook: { dailyMinutes: 15, accountListSize: 25 },
              skipList: ['generic hot takes'],
              goalMetric90d: '5 DMs from named builders',
            },
          },
        },
      ],
    });

    const { POST } = await import('@/app/api/presence/strategy/route');
    await POST(
      new Request('http://localhost/api/presence/strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'demo-ws',
          profile: {
            id: 'profile_personal',
            label: 'personal',
            xHandle: '@erniesg',
            goal: 'get seen for FDE roles',
          },
          insightsDigest: {
            medianEngagementByHook: { 'number-led': 52 },
            topQuartilePostingHoursUtc: [10, 11, 12, 13],
          },
        }),
      })
    );

    const prompt = JSON.stringify(mocks.messagesCreate.mock.calls[0][0].messages);
    expect(prompt).toContain('ICP insights digest');
    expect(prompt).toContain('number-led');
    expect(prompt).toContain('topQuartilePostingHoursUtc');
  });
});

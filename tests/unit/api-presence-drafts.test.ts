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

const acceptedStrategy = {
  positioning: 'Ship visible agents with production receipts.',
  icpAccounts: [
    { handle: '@openai', reason: 'platform builders' },
    { handle: '@AnthropicAI', reason: 'agent builders' },
    { handle: '@modal_labs', reason: 'infra builders' },
    { handle: '@vercel', reason: 'DX builders' },
    { handle: '@convex_dev', reason: 'reactive app builders' },
  ],
  pillars: [
    { name: 'agent harnesses', evidenceRefs: ['repo:aether'], exampleFormats: ['thread'] },
    { name: 'visible demos', evidenceRefs: ['site:ernie.sg'], exampleFormats: ['demo'] },
    { name: 'production rigor', evidenceRefs: ['resume:resume.md'], exampleFormats: ['opinion'] },
  ],
  cadence: '2 posts/week',
  replyPlaybook: { dailyMinutes: 15, accountListSize: 25 },
  skipList: ['generic hot takes'],
  goalMetric90d: '5 DMs from named builders',
};

describe('/api/presence/drafts', () => {
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

  it('accepts only pillar-matching receipt-grounded drafts and persists the batch idempotently', async () => {
    process.env.NEXT_PUBLIC_CONVEX_URL = 'https://example.convex.cloud';
    mocks.convexMutation.mockResolvedValueOnce({ created: 1, skipped: 0 });
    mocks.messagesCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          name: 'emit_presence_drafts',
          id: 'drafts_1',
          input: {
            drafts: [
              {
                kind: 'post',
                text: 'I let a coding agent run overnight. It produced [N] PRs; [N] were mergeable. The harness is the product: https://github.com/erniesg/aether',
                pillar: 'agent harnesses',
                receipt: { kind: 'evidence-fact', ref: 'repo:aether#claim-1' },
              },
              {
                kind: 'post',
                text: 'x'.repeat(300),
                pillar: 'agent harnesses',
                receipt: { kind: 'evidence-fact', ref: 'repo:aether#claim-2' },
              },
              {
                kind: 'reply',
                text: 'We hit this too; the revocable credential boundary mattered more than the model.',
                pillar: 'not a strategy pillar',
                targetUrl: 'https://x.com/openai/status/1780000000000000001',
                receipt: { kind: 'signal-post', ref: 'https://x.com/openai/status/1780000000000000001' },
              },
            ],
          },
        },
      ],
    });

    const { POST } = await import('@/app/api/presence/drafts/route');
    const res = await POST(
      new Request('http://localhost/api/presence/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'demo-ws',
          lapId: 'lap_1',
          profile: {
            id: 'profile_personal',
            workspaceId: 'demo-ws',
            label: 'personal',
            xHandle: '@erniesg',
            goal: 'get seen for FDE roles',
            createdAt: 1,
            updatedAt: 1,
          },
          strategy: acceptedStrategy,
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
    expect(json.drafts).toHaveLength(1);
    expect(json.drafts[0]).toMatchObject({
      pillar: 'agent harnesses',
      receipt: { ref: 'repo:aether#claim-1' },
    });
    expect(json.rejected).toEqual([
      expect.objectContaining({ reason: 'over-weight' }),
      expect.objectContaining({ reason: 'pillar-not-in-strategy' }),
    ]);
    expect(json.persistence).toEqual({ created: 1, skipped: 0 });
    expect(mocks.convexMutation).toHaveBeenCalledWith(expect.anything(), {
      workspaceId: 'demo-ws',
      profileId: 'profile_personal',
      lapId: 'lap_1',
      drafts: [
        expect.objectContaining({
          kind: 'post',
          status: 'draft',
          receiptKind: 'evidence-fact',
          receiptRef: 'repo:aether#claim-1',
        }),
      ],
    });

    const prompt = JSON.stringify(mocks.messagesCreate.mock.calls[0][0].messages);
    expect(prompt).toContain('Strategy pillars:');
    expect(prompt).toContain('agent harnesses');
    expect(prompt).toContain('Numbers are never invented');
    expect(prompt).toContain('Evidence facts:');
  });

  it('omits the facts block cleanly when no evidence exists', async () => {
    mocks.messagesCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          name: 'emit_presence_drafts',
          id: 'drafts_1',
          input: { drafts: [] },
        },
      ],
    });

    const { POST } = await import('@/app/api/presence/drafts/route');
    const res = await POST(
      new Request('http://localhost/api/presence/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'demo-ws',
          profile: {
            id: 'profile_personal',
            workspaceId: 'demo-ws',
            label: 'personal',
            xHandle: '@erniesg',
            goal: 'get seen for FDE roles',
            createdAt: 1,
            updatedAt: 1,
          },
          strategy: acceptedStrategy,
        }),
      })
    );

    expect(res.status).toBe(200);
    const prompt = JSON.stringify(mocks.messagesCreate.mock.calls[0][0].messages);
    expect(prompt).toContain('Strategy pillars:');
    expect(prompt).not.toContain('Evidence facts:');
  });

  it('loads persisted product facts into the draft prompt when the UI omits evidence facts', async () => {
    process.env.NEXT_PUBLIC_CONVEX_URL = 'https://example.convex.cloud';
    mocks.convexQuery.mockResolvedValueOnce([
      {
        name: 'aether',
        claims: ['aether keeps generated draft receipts linked to product facts.'],
        claimSources: [{ kind: 'repo', ref: 'https://github.com/erniesg/aether' }],
      },
    ]);
    mocks.convexMutation.mockResolvedValueOnce({ created: 1, skipped: 0 });
    mocks.messagesCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          name: 'emit_presence_drafts',
          id: 'drafts_1',
          input: {
            drafts: [
              {
                kind: 'post',
                text: 'I shipped receipt-grounded drafts with [N] product facts. The failure mode was refs becoming fictional; the fix is server-side fact loading.',
                pillar: 'agent harnesses',
                receipt: { kind: 'evidence-fact', ref: 'repo:https://github.com/erniesg/aether' },
              },
            ],
          },
        },
      ],
    });

    const { POST } = await import('@/app/api/presence/drafts/route');
    await POST(
      new Request('http://localhost/api/presence/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'demo-ws',
          lapId: 'lap_2',
          profile: {
            id: 'profile_personal',
            workspaceId: 'demo-ws',
            label: 'personal',
            xHandle: '@erniesg',
            goal: 'get seen for FDE roles',
            createdAt: 1,
            updatedAt: 1,
          },
          strategy: acceptedStrategy,
        }),
      })
    );

    const prompt = JSON.stringify(mocks.messagesCreate.mock.calls[0][0].messages);
    expect(mocks.convexQuery).toHaveBeenCalledWith(expect.anything(), {
      wsId: 'demo-ws',
    });
    expect(prompt).toContain('Evidence facts:');
    expect(prompt).toContain('repo:https://github.com/erniesg/aether');
    expect(prompt).toContain('aether keeps generated draft receipts linked to product facts.');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ingestEvidenceFacts: vi.fn(),
  convexMutation: vi.fn(),
  ConvexHttpClient: vi.fn(function () {
    return { mutation: mocks.convexMutation };
  }),
}));

vi.mock('@/lib/research/evidence-ingest', () => ({
  ingestEvidenceFacts: mocks.ingestEvidenceFacts,
}));

vi.mock('convex/browser', () => ({
  ConvexHttpClient: mocks.ConvexHttpClient,
}));

describe('/api/evidence/ingest', () => {
  const originalConvexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_CONVEX_URL;
  });

  afterEach(() => {
    if (originalConvexUrl === undefined) delete process.env.NEXT_PUBLIC_CONVEX_URL;
    else process.env.NEXT_PUBLIC_CONVEX_URL = originalConvexUrl;
    vi.resetModules();
    mocks.ingestEvidenceFacts.mockReset();
    mocks.convexMutation.mockReset();
    mocks.ConvexHttpClient.mockClear();
  });

  it('accepts a repo ingest request and returns grounded facts', async () => {
    mocks.ingestEvidenceFacts.mockResolvedValueOnce({
      facts: {
        name: 'aether',
        description: 'Canvas-native creative system.',
        claims: [
          {
            text: 'aether uses Next.js 15 and Convex.',
            source: { kind: 'repo', ref: 'https://github.com/erniesg/aether' },
          },
        ],
        releases: [],
        languages: ['TypeScript'],
        readmeHighlights: ['Next.js 15'],
        enrichment: 'none',
      },
      persisted: false,
    });

    const { POST } = await import('@/app/api/evidence/ingest/route');
    const res = await POST(
      new Request('http://localhost/api/evidence/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'demo-ws',
          kind: 'repo',
          source: 'https://github.com/erniesg/aether',
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.facts.claims[0].source.kind).toBe('repo');
    expect(mocks.ingestEvidenceFacts).toHaveBeenCalledWith(
      {
        workspaceId: 'demo-ws',
        kind: 'repo',
        source: 'https://github.com/erniesg/aether',
      },
      expect.any(Object)
    );
  });

  it('persists extracted claims when a workspace id and Convex URL are present', async () => {
    process.env.NEXT_PUBLIC_CONVEX_URL = 'https://example.convex.cloud';
    mocks.convexMutation.mockResolvedValueOnce({
      sourceItemId: 'sourceItem_1',
      productFactId: 'productFact_1',
    });
    mocks.ingestEvidenceFacts.mockResolvedValueOnce({
      facts: {
        name: 'aether',
        description: 'Canvas-native creative system.',
        claims: [
          {
            text: 'aether uses Next.js 15 and Convex.',
            source: { kind: 'repo', ref: 'https://github.com/erniesg/aether' },
          },
          {
            text: 'aether has 42 GitHub stars.',
            source: { kind: 'repo', ref: 'https://github.com/erniesg/aether' },
          },
        ],
        releases: [],
        languages: ['TypeScript'],
        readmeHighlights: ['Next.js 15'],
        enrichment: 'none',
      },
      persisted: false,
    });

    const { POST } = await import('@/app/api/evidence/ingest/route');
    const res = await POST(
      new Request('http://localhost/api/evidence/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'demo-ws',
          kind: 'repo',
          source: 'https://github.com/erniesg/aether',
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.persisted).toBe(true);
    expect(json.persistence).toEqual({
      sourceItemId: 'sourceItem_1',
      productFactId: 'productFact_1',
    });
    expect(mocks.ConvexHttpClient).toHaveBeenCalledWith(
      'https://example.convex.cloud'
    );
    expect(mocks.convexMutation).toHaveBeenCalledWith(expect.anything(), {
      wsId: 'demo-ws',
      source: { kind: 'repo', ref: 'https://github.com/erniesg/aether' },
      name: 'aether',
      claims: [
        {
          text: 'aether uses Next.js 15 and Convex.',
          source: { kind: 'repo', ref: 'https://github.com/erniesg/aether' },
        },
        {
          text: 'aether has 42 GitHub stars.',
          source: { kind: 'repo', ref: 'https://github.com/erniesg/aether' },
        },
      ],
    });
  });

  it('rejects unknown evidence kinds', async () => {
    const { POST } = await import('@/app/api/evidence/ingest/route');
    const res = await POST(
      new Request('http://localhost/api/evidence/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'other', source: 'x' }),
      })
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toMatch(/kind must be one of/i);
  });
});

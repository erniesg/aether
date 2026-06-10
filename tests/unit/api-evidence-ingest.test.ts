import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ingestEvidenceFacts: vi.fn(),
}));

vi.mock('@/lib/research/evidence-ingest', () => ({
  ingestEvidenceFacts: mocks.ingestEvidenceFacts,
}));

describe('/api/evidence/ingest', () => {
  afterEach(() => {
    vi.resetModules();
    mocks.ingestEvidenceFacts.mockReset();
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

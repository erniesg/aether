import { describe, expect, it, vi } from 'vitest';
import {
  buildRequestSnippets,
  executeDeckRequest,
  validateDeckRequest,
  type DeckLiveDemoConfig,
} from './liveDemo';

const config: DeckLiveDemoConfig = {
  baseUrl: 'https://example.test',
  endpoints: [
    {
      id: 'search',
      label: 'Product search',
      method: 'POST',
      path: '/api/search',
      authModes: ['public', 'signed-in', 'presenter-provided'],
    },
  ],
};

describe('deck live demo guard', () => {
  it('rejects unsupported methods and paths before execution', () => {
    expect(() =>
      validateDeckRequest(config, {
        endpointId: 'search',
        method: 'GET',
        path: '/api/search',
        authMode: 'public',
      })
    ).toThrow('not allowlisted');
    expect(() =>
      validateDeckRequest(config, {
        endpointId: 'search',
        method: 'POST',
        path: '/api/admin',
        authMode: 'public',
      })
    ).toThrow('not allowlisted');
  });

  it('blocks auth-gated requests without a presenter or signed-in grant', () => {
    expect(() =>
      validateDeckRequest(config, {
        endpointId: 'search',
        method: 'POST',
        path: '/api/search',
        authMode: 'signed-in',
      })
    ).toThrow('sign in');
    expect(() =>
      validateDeckRequest(config, {
        endpointId: 'search',
        method: 'POST',
        path: '/api/search',
        authMode: 'presenter-provided',
      })
    ).toThrow('presenter credential');
  });

  it('records secret-safe success provenance and snippets', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ results: [{ id: 'one' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Server-Timing': 'search;dur=12' },
      })
    );
    const request = {
      endpointId: 'search',
      method: 'POST' as const,
      path: '/api/search',
      authMode: 'presenter-provided' as const,
      presenterCredential: 'super-secret',
      body: { query: 'linen' },
    };
    const result = await executeDeckRequest(config, request, {
      fetcher,
      now: () => 100,
      elapsed: () => 28,
    });
    expect(result.status).toBe(200);
    expect(result.metrics).toMatchObject({ durationMs: 28, resultCount: 1, serverTiming: 'search;dur=12' });
    expect(result.provenance).toMatchObject({
      sourceEndpoint: '/api/search',
      requestShape: ['query'],
      authMode: 'presenter-provided',
      timestamp: 100,
    });
    expect(JSON.stringify(result)).not.toContain('super-secret');
    const snippets = buildRequestSnippets(config, request);
    expect(snippets.curl).toContain('Authorization: Bearer $PRESENTER_TOKEN');
    expect(JSON.stringify(snippets)).not.toContain('super-secret');
  });

  it('returns a typed error result for an allowed failed response', async () => {
    const result = await executeDeckRequest(
      config,
      {
        endpointId: 'search',
        method: 'POST',
        path: '/api/search',
        authMode: 'public',
      },
      { fetcher: vi.fn().mockResolvedValue(new Response('{"error":"busy"}', { status: 503 })) }
    );
    expect(result).toMatchObject({ status: 503, ok: false, responseSummary: 'busy' });
  });

  it('summarizes the nested public-search response shape used by Paillette', async () => {
    const result = await executeDeckRequest(
      config,
      {
        endpointId: 'search',
        method: 'POST',
        path: '/api/search',
        authMode: 'public',
      },
      {
        fetcher: vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ success: true, data: { results: [{ id: '2019-00754' }] } }), { status: 200 })
        ),
      }
    );

    expect(result.responseSummary).toBe('1 results');
    expect(result.metrics.resultCount).toBe(1);
  });
});

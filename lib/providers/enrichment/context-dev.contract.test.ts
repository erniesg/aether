import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createContextDevProvider } from './context-dev';
import { enrichProjectFacts } from './registry';
import type { ProjectFacts } from '@/lib/research/repo-facts';

const BASE_FACTS: ProjectFacts = {
  name: 'aether',
  description: 'Canvas-native creative system.',
  claims: [
    {
      text: 'aether uses Next.js 15 and Convex for the creator workspace.',
      source: { kind: 'repo', ref: 'https://github.com/erniesg/aether' },
    },
  ],
  releases: [],
  languages: ['TypeScript'],
  readmeHighlights: ['Next.js 15'],
  enrichment: 'none',
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('context.dev enrichment adapter · contract', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const originalKey = process.env.CONTEXT_DEV_API_KEY;

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    delete process.env.CONTEXT_DEV_API_KEY;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalKey === undefined) delete process.env.CONTEXT_DEV_API_KEY;
    else process.env.CONTEXT_DEV_API_KEY = originalKey;
  });

  it('reports unavailable without CONTEXT_DEV_API_KEY and leaves repo facts GitHub-only', async () => {
    const provider = createContextDevProvider(undefined, { fetcher: fetchMock });

    expect(provider.isAvailable()).toBe(false);
    const result = await enrichProjectFacts(BASE_FACTS, { provider });

    expect(result.enrichment).toBe('none');
    expect(result.claims).toEqual(BASE_FACTS.claims);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts the expected extract request shape and maps returned claims as enriched facts', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          claims: [
            'aether ships provider adapters for 4 model families.',
            'The repo documents Cloudflare Workers deployment.',
          ],
        },
      })
    );

    const provider = createContextDevProvider('ctx_test', {
      fetcher: fetchMock,
      endpoint: 'https://api.context.dev/v1/web/extract',
    });
    const result = await provider.enrich({
      facts: BASE_FACTS,
      url: 'https://github.com/erniesg/aether',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.context.dev/v1/web/extract');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer ctx_test',
      'Content-Type': 'application/json',
    });
    const body = JSON.parse(String(init?.body));
    expect(body.url).toBe('https://github.com/erniesg/aether');
    expect(body.schema.properties.claims.type).toBe('array');

    expect(result.enrichment).toBe('context.dev');
    expect(result.claims).toEqual([
      expect.objectContaining({
        text: 'aether ships provider adapters for 4 model families.',
        source: { kind: 'repo', ref: 'https://github.com/erniesg/aether' },
      }),
      expect.objectContaining({
        text: 'The repo documents Cloudflare Workers deployment.',
        source: { kind: 'repo', ref: 'https://github.com/erniesg/aether' },
      }),
    ]);
  });
});

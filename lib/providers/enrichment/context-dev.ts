import type { EvidenceClaim } from '@/lib/research/evidence-facts';
import type { ProjectFacts } from '@/lib/research/repo-facts';
import type { ContextEnrichmentInput, ContextEnrichmentProvider } from './types';

interface ContextDevOptions {
  fetcher?: typeof fetch;
  endpoint?: string;
}

const DEFAULT_ENDPOINT = 'https://api.context.dev/v1/web/extract';

export function createContextDevProvider(
  apiKey = process.env.CONTEXT_DEV_API_KEY,
  opts: ContextDevOptions = {}
): ContextEnrichmentProvider {
  const key = apiKey?.trim();
  const fetcher = opts.fetcher ?? fetch;
  const endpoint = opts.endpoint ?? DEFAULT_ENDPOINT;

  return {
    id: 'context.dev',
    displayName: 'Context.dev',
    isAvailable() {
      return Boolean(key);
    },
    async enrich(input: ContextEnrichmentInput): Promise<ProjectFacts> {
      if (!key) return { ...input.facts, enrichment: 'none' };

      const res = await fetcher(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: input.url,
          schema: {
            type: 'object',
            properties: {
              claims: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            required: ['claims'],
            additionalProperties: false,
          },
        }),
      });
      if (!res.ok) {
        throw new Error(`context.dev enrichment failed: ${res.status}`);
      }
      const json = await res.json();
      const claims = claimsFromResponse(json, input);
      return {
        ...input.facts,
        claims: claims.length > 0 ? claims : input.facts.claims,
        enrichment: claims.length > 0 ? 'context.dev' : 'none',
      };
    },
  };
}

function claimsFromResponse(json: unknown, input: ContextEnrichmentInput): EvidenceClaim[] {
  const data = objectField(json, 'data') ?? json;
  const rawClaims = arrayField(data, 'claims').filter((claim): claim is string => typeof claim === 'string');
  const source = input.facts.claims[0]?.source ?? { kind: 'site' as const, ref: input.url };
  return rawClaims
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => ({
      text,
      source: { kind: source.kind, ref: input.url },
    }));
}

function objectField(value: unknown, key: string): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const field = (value as Record<string, unknown>)[key];
  return field && typeof field === 'object' && !Array.isArray(field)
    ? (field as Record<string, unknown>)
    : null;
}

function arrayField(value: unknown, key: string): unknown[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const field = (value as Record<string, unknown>)[key];
  return Array.isArray(field) ? field : [];
}

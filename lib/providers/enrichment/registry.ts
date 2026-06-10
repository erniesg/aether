import type { ProjectFacts } from '@/lib/research/repo-facts';
import { createContextDevProvider } from './context-dev';
import type { ContextEnrichmentProvider } from './types';

export function resolveContextEnrichmentProvider(): ContextEnrichmentProvider {
  return createContextDevProvider();
}

export async function enrichProjectFacts(
  facts: ProjectFacts,
  opts: { provider?: ContextEnrichmentProvider; url?: string } = {}
): Promise<ProjectFacts> {
  const provider = opts.provider ?? resolveContextEnrichmentProvider();
  if (!provider.isAvailable()) return { ...facts, enrichment: 'none' };
  const url = opts.url ?? facts.claims[0]?.source.ref;
  if (!url) return { ...facts, enrichment: 'none' };
  return provider.enrich({ facts, url });
}

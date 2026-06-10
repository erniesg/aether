import type { ProjectFacts } from '@/lib/research/repo-facts';

export interface ContextEnrichmentInput {
  facts: ProjectFacts;
  url: string;
}

export interface ContextEnrichmentProvider {
  id: string;
  displayName: string;
  isAvailable(): boolean;
  enrich(input: ContextEnrichmentInput): Promise<ProjectFacts>;
}

import { createClipModalProvider } from './clip-modal';
import {
  ClusteringUnavailableError,
  KNOWN_CLUSTERING_PROVIDER_IDS,
  type ClusteringProvider,
  type ClusteringProviderId,
} from './types';

/**
 * Env-driven selection of the active clustering provider (hard rule #7:
 * provider-agnostic AI). `CLUSTERING_PROVIDER` picks the adapter; when unset,
 * fall back to the first available one so dev works without explicit config.
 *
 * Keep this import the only place business logic reaches for a specific
 * provider.
 */

type ProviderFactory = () => ClusteringProvider;

const FACTORIES: Record<ClusteringProviderId, ProviderFactory> = {
  'clip-modal': () => createClipModalProvider(),
};

function readPreferredId(): ClusteringProviderId | undefined {
  const raw = process.env.CLUSTERING_PROVIDER?.trim();
  if (!raw) return undefined;
  if ((KNOWN_CLUSTERING_PROVIDER_IDS as readonly string[]).includes(raw)) {
    return raw as ClusteringProviderId;
  }
  return undefined;
}

export function resolveClusteringProvider(
  preferredId?: ClusteringProviderId
): ClusteringProvider {
  const requested = preferredId ?? readPreferredId();
  if (requested) {
    const provider = FACTORIES[requested]();
    if (!provider.isAvailable()) {
      throw new ClusteringUnavailableError(requested, provider.getAvailabilityIssue());
    }
    return provider;
  }
  for (const id of KNOWN_CLUSTERING_PROVIDER_IDS) {
    const provider = FACTORIES[id]();
    if (provider.isAvailable()) return provider;
  }
  const fallback = FACTORIES[KNOWN_CLUSTERING_PROVIDER_IDS[0]]();
  throw new ClusteringUnavailableError(
    fallback.id,
    fallback.getAvailabilityIssue()
  );
}

export function listAvailableClusteringProviders(): ClusteringProvider[] {
  return KNOWN_CLUSTERING_PROVIDER_IDS
    .map((id) => FACTORIES[id]())
    .filter((p) => p.isAvailable());
}

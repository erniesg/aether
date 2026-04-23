import { createDraftSpatialProvider } from './draft';
import {
  KNOWN_SPATIAL_PROVIDER_IDS,
  SpatialUnavailableError,
  type SpatialProvider,
  type SpatialProviderId,
  type SpatialProviderStatus,
} from './types';

type Registry = Record<SpatialProviderId, () => SpatialProvider>;

const REGISTRY: Registry = {
  draft: () => createDraftSpatialProvider(),
};

export { KNOWN_SPATIAL_PROVIDER_IDS } from './types';

export function resolveSpatialProvider(preferredId?: string, modelHint?: string): SpatialProvider {
  if (preferredId) {
    const factory = REGISTRY[preferredId as SpatialProviderId];
    if (!factory) {
      throw new SpatialUnavailableError(preferredId, 'unknown spatial provider');
    }

    const provider = factory();
    const availabilityIssue = provider.getAvailabilityIssue();
    if (availabilityIssue) {
      throw new SpatialUnavailableError(preferredId, availabilityIssue);
    }

    return provider;
  }

  let modelHintedId: SpatialProviderId | undefined;
  if (modelHint) {
    for (const id of KNOWN_SPATIAL_PROVIDER_IDS) {
      const provider = REGISTRY[id]();
      if (provider.isAvailable() && provider.listModels().includes(modelHint)) {
        modelHintedId = id;
        break;
      }
    }
  }

  const order = [modelHintedId, ...KNOWN_SPATIAL_PROVIDER_IDS].filter(
    (value): value is SpatialProviderId => typeof value === 'string' && value.length > 0
  );

  for (const id of order) {
    const provider = REGISTRY[id]();
    if (provider.isAvailable()) return provider;
  }

  throw new SpatialUnavailableError('any', 'no spatial provider is connected');
}

export function listSpatialProviders(): SpatialProviderStatus[] {
  return KNOWN_SPATIAL_PROVIDER_IDS.map((id) => {
    const provider = REGISTRY[id]();
    const unavailableReason = provider.getAvailabilityIssue();

    return {
      id: provider.id,
      displayName: provider.displayName,
      models: provider.listModels(),
      available: unavailableReason === undefined,
      unavailableReason,
    };
  });
}

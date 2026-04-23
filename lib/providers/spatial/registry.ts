import type {
  SpatialProvider,
  SpatialProviderId,
  SpatialProviderStatus,
} from './types';
import { KNOWN_SPATIAL_PROVIDER_IDS, SpatialUnavailableError } from './types';
import { createModalSplatProvider } from './modal';
import { createReplicateSplatProvider } from './replicate';

type Registry = Record<SpatialProviderId, () => SpatialProvider>;

const REGISTRY: Registry = {
  'replicate-splat': () => createReplicateSplatProvider(),
  'modal-splat': () => createModalSplatProvider(),
};

export { KNOWN_SPATIAL_PROVIDER_IDS } from './types';

export function resolveSpatialProvider(
  preferredId?: string,
  modelHint?: string
): SpatialProvider {
  const envDefault = process.env.SPATIAL_PROVIDER;

  if (preferredId) {
    const factory = REGISTRY[preferredId as SpatialProviderId];
    if (!factory) {
      throw new SpatialUnavailableError(
        preferredId,
        'unknown spatial provider'
      );
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

  const order = [modelHintedId, envDefault, ...KNOWN_SPATIAL_PROVIDER_IDS].filter(
    (value): value is string => typeof value === 'string' && value.length > 0
  );

  for (const id of order) {
    const factory = REGISTRY[id as SpatialProviderId];
    if (!factory) continue;
    const provider = factory();
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
      supportsImageToSplat: provider.supportsImageToSplat,
      supportsTextPrompt: provider.supportsTextPrompt,
      available: unavailableReason === undefined,
      unavailableReason,
    };
  });
}

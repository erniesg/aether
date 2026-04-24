import { createDraftSpatialProvider } from './draft';
import { createModalSplatProvider } from './modal';
import { createReplicateSplatProvider } from './replicate';
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
  'replicate-splat': () => createReplicateSplatProvider(),
  'modal-splat': () => createModalSplatProvider(),
};

export { KNOWN_SPATIAL_PROVIDER_IDS } from './types';

function isKnownId(value: unknown): value is SpatialProviderId {
  return (
    typeof value === 'string' &&
    (KNOWN_SPATIAL_PROVIDER_IDS as readonly string[]).includes(value)
  );
}

export function resolveSpatialProvider(preferredId?: string, modelHint?: string): SpatialProvider {
  if (preferredId) {
    if (!isKnownId(preferredId)) {
      throw new SpatialUnavailableError(preferredId, 'unknown spatial provider');
    }

    const provider = REGISTRY[preferredId]();
    const availabilityIssue = provider.getAvailabilityIssue();
    if (availabilityIssue) {
      throw new SpatialUnavailableError(preferredId, availabilityIssue);
    }

    return provider;
  }

  const envDefault = process.env.SPATIAL_PROVIDER;

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

  // Preferred resolution order:
  //   1. Model-hint match (e.g. `model=jd7h/splatter-image` → replicate)
  //   2. `SPATIAL_PROVIDER` env override
  //   3. Registered providers in declaration order
  //      (draft is listed last in that order so real providers win when both
  //      are available — but draft always wins when nothing is connected,
  //      keeping local demos alive without API keys).
  const realOrder: SpatialProviderId[] = ['replicate-splat', 'modal-splat'];
  const order: SpatialProviderId[] = [];
  const push = (value: string | undefined) => {
    if (isKnownId(value) && !order.includes(value)) order.push(value);
  };
  push(modelHintedId);
  push(envDefault);
  realOrder.forEach(push);
  push('draft');

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
      supportsImageToSplat: provider.supportsImageToSplat,
      supportsTextPrompt: provider.supportsTextPrompt,
    };
  });
}

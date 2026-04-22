import type {
  SegmentationProvider,
  SegmentationProviderId,
  SegmentationProviderStatus,
} from './types';
import {
  KNOWN_SEGMENTATION_PROVIDER_IDS,
  SegmentationUnavailableError,
} from './types';
import { createModalSam3Provider } from './modal';
import { createReplicateSegmentationProvider } from './replicate';

type Registry = Record<SegmentationProviderId, () => SegmentationProvider>;

const REGISTRY: Registry = {
  sam3: () => createModalSam3Provider(),
  sam2: () => createReplicateSegmentationProvider(),
};

export { KNOWN_SEGMENTATION_PROVIDER_IDS } from './types';

export function resolveSegmentationProvider(
  preferredId?: string,
  modelHint?: string
): SegmentationProvider {
  const envDefault = process.env.SEGMENTATION_PROVIDER;

  if (preferredId) {
    const factory = REGISTRY[preferredId as SegmentationProviderId];
    if (!factory) {
      throw new SegmentationUnavailableError(
        preferredId,
        'unknown segmentation provider'
      );
    }

    const provider = factory();
    const availabilityIssue = provider.getAvailabilityIssue();
    if (availabilityIssue) {
      throw new SegmentationUnavailableError(preferredId, availabilityIssue);
    }

    return provider;
  }

  let modelHintedId: SegmentationProviderId | undefined;
  if (modelHint) {
    for (const id of KNOWN_SEGMENTATION_PROVIDER_IDS) {
      const provider = REGISTRY[id]();
      if (provider.isAvailable() && provider.listModels().includes(modelHint)) {
        modelHintedId = id;
        break;
      }
    }
  }

  const order = [modelHintedId, envDefault, ...KNOWN_SEGMENTATION_PROVIDER_IDS].filter(
    (value): value is string => typeof value === 'string' && value.length > 0
  );

  for (const id of order) {
    const factory = REGISTRY[id as SegmentationProviderId];
    if (!factory) continue;
    const provider = factory();
    if (provider.isAvailable()) return provider;
  }

  throw new SegmentationUnavailableError(
    'any',
    'no segmentation provider is connected'
  );
}

export function listSegmentationProviders(): SegmentationProviderStatus[] {
  return KNOWN_SEGMENTATION_PROVIDER_IDS.map((id) => {
    const provider = REGISTRY[id]();
    const unavailableReason = provider.getAvailabilityIssue();

    return {
      id: provider.id,
      displayName: provider.displayName,
      models: provider.listModels(),
      supportsTextPrompt: provider.supportsTextPrompt,
      supportsPointPrompt: provider.supportsPointPrompt,
      supportsBoxPrompt: provider.supportsBoxPrompt,
      available: unavailableReason === undefined,
      unavailableReason,
    };
  });
}

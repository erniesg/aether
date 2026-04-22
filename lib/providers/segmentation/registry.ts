import type { SegmentationProvider } from './types';
import { SegmentationUnavailableError } from './types';
import { createModalSam3Provider } from './modal';
import { createReplicateSegmentationProvider } from './replicate';

type Registry = Record<string, () => SegmentationProvider>;

const REGISTRY: Registry = {
  sam3: () => createModalSam3Provider(),
  sam2: () => createReplicateSegmentationProvider(),
};

export const KNOWN_SEGMENTATION_PROVIDER_IDS = Object.keys(
  REGISTRY
) as ReadonlyArray<string>;

export function resolveSegmentationProvider(
  preferredId?: string,
  modelHint?: string
): SegmentationProvider {
  const envDefault = process.env.SEGMENTATION_PROVIDER;

  let modelHintedId: string | undefined;
  if (modelHint && !preferredId) {
    for (const id of KNOWN_SEGMENTATION_PROVIDER_IDS) {
      const provider = REGISTRY[id]();
      if (provider.isAvailable() && provider.listModels().includes(modelHint)) {
        modelHintedId = id;
        break;
      }
    }
  }

  const order = [preferredId, modelHintedId, envDefault, ...KNOWN_SEGMENTATION_PROVIDER_IDS]
    .filter((value): value is string => typeof value === 'string' && value.length > 0);

  for (const id of order) {
    const factory = REGISTRY[id];
    if (!factory) continue;
    const provider = factory();
    if (provider.isAvailable()) return provider;
  }

  throw new SegmentationUnavailableError(
    preferredId ?? 'any',
    'no segmentation provider has credentials set (checked: ' +
      KNOWN_SEGMENTATION_PROVIDER_IDS.join(', ') +
      ')'
  );
}

export function listAvailableSegmentationProviders(): Array<{
  id: string;
  displayName: string;
  models: string[];
  supportsTextPrompt: boolean;
}> {
  const out: Array<{
    id: string;
    displayName: string;
    models: string[];
    supportsTextPrompt: boolean;
  }> = [];

  for (const id of KNOWN_SEGMENTATION_PROVIDER_IDS) {
    const provider = REGISTRY[id]();
    if (provider.isAvailable()) {
      out.push({
        id: provider.id,
        displayName: provider.displayName,
        models: provider.listModels(),
        supportsTextPrompt: provider.supportsTextPrompt,
      });
    }
  }

  return out;
}

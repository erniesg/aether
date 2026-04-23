import { createOpenAIVisionProvider } from './openai';
import type { VisionProvider } from './types';
import { KNOWN_VISION_PROVIDER_IDS, VisionUnavailableError } from './types';

type Registry = Record<(typeof KNOWN_VISION_PROVIDER_IDS)[number], () => VisionProvider>;

const REGISTRY: Registry = {
  openai: () => createOpenAIVisionProvider(),
};

export { KNOWN_VISION_PROVIDER_IDS } from './types';

export function resolveVisionProvider(
  preferredId?: string,
  modelHint?: string
): VisionProvider {
  const envDefault = process.env.VISION_PROVIDER;

  let modelHintedId: string | undefined;
  if (modelHint && !preferredId) {
    for (const id of KNOWN_VISION_PROVIDER_IDS) {
      const provider = REGISTRY[id]();
      if (provider.isAvailable() && provider.listModels().includes(modelHint)) {
        modelHintedId = id;
        break;
      }
    }
  }

  const order = [preferredId, modelHintedId, envDefault, ...KNOWN_VISION_PROVIDER_IDS].filter(
    (value): value is string => typeof value === 'string' && value.length > 0
  );

  for (const id of order) {
    const factory = REGISTRY[id as keyof Registry];
    if (!factory) continue;
    const provider = factory();
    if (provider.isAvailable()) return provider;
  }

  throw new VisionUnavailableError(
    (preferredId as 'openai' | undefined) ?? 'openai',
    'no vision provider is connected'
  );
}

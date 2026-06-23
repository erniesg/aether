import type { VoiceProvider, VoiceProviderFactory } from './types';

const REGISTRY = new Map<string, VoiceProviderFactory>();

export class VoiceProviderUnavailableError extends Error {
  constructor(reason: string) {
    super(`Voice provider unavailable: ${reason}`);
    this.name = 'VoiceProviderUnavailableError';
  }
}

export function registerVoiceProvider(
  id: string,
  factory: VoiceProviderFactory
): () => void {
  const previous = REGISTRY.get(id);
  REGISTRY.set(id, factory);

  return () => {
    if (previous) {
      REGISTRY.set(id, previous);
    } else {
      REGISTRY.delete(id);
    }
  };
}

export function listVoiceProviders(): Array<{
  id: string;
  displayName: string;
  available: boolean;
}> {
  return Array.from(REGISTRY.entries()).map(([id, factory]) => {
    const provider = factory();
    return {
      id,
      displayName: provider.displayName,
      available: provider.available(),
    };
  });
}

export function resolveVoiceProvider(preferredId?: string): VoiceProvider {
  if (preferredId) {
    const factory = REGISTRY.get(preferredId);
    if (!factory) {
      throw new VoiceProviderUnavailableError(`unknown provider ${preferredId}`);
    }

    const provider = factory();
    if (provider.available()) return provider;

    throw new VoiceProviderUnavailableError(`${preferredId} is not configured`);
  }

  for (const factory of REGISTRY.values()) {
    const provider = factory();
    if (provider.available()) return provider;
  }

  throw new VoiceProviderUnavailableError('no voice provider has been configured');
}

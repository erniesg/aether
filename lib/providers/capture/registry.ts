import type { CaptureProvider, CaptureProviderFactory } from './types';

const REGISTRY = new Map<string, CaptureProviderFactory>();

export class CaptureProviderUnavailableError extends Error {
  constructor(reason: string) {
    super(`Capture provider unavailable: ${reason}`);
    this.name = 'CaptureProviderUnavailableError';
  }
}

export function registerCaptureProvider(
  id: string,
  factory: CaptureProviderFactory
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

export function listCaptureProviders(): Array<{
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

export function resolveCaptureProvider(preferredId?: string): CaptureProvider {
  if (preferredId) {
    const factory = REGISTRY.get(preferredId);
    if (!factory) {
      throw new CaptureProviderUnavailableError(`unknown provider ${preferredId}`);
    }

    const provider = factory();
    if (provider.available()) return provider;

    throw new CaptureProviderUnavailableError(`${preferredId} is not configured`);
  }

  for (const factory of REGISTRY.values()) {
    const provider = factory();
    if (provider.available()) return provider;
  }

  throw new CaptureProviderUnavailableError('no capture provider has been configured');
}

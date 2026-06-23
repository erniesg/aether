import type { CodeChangeProvider, CodeChangeProviderFactory } from './types';

const REGISTRY = new Map<string, CodeChangeProviderFactory>();

export class CodeChangeProviderUnavailableError extends Error {
  constructor(reason: string) {
    super(`Code-change provider unavailable: ${reason}`);
    this.name = 'CodeChangeProviderUnavailableError';
  }
}

export function registerCodeChangeProvider(
  id: string,
  factory: CodeChangeProviderFactory
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

export function listCodeChangeProviders(): Array<{
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

export function resolveCodeChangeProvider(preferredId?: string): CodeChangeProvider {
  if (preferredId) {
    const factory = REGISTRY.get(preferredId);
    if (!factory) {
      throw new CodeChangeProviderUnavailableError(`unknown provider ${preferredId}`);
    }

    const provider = factory();
    if (provider.available()) return provider;

    throw new CodeChangeProviderUnavailableError(`${preferredId} is not configured`);
  }

  for (const factory of REGISTRY.values()) {
    const provider = factory();
    if (provider.available()) return provider;
  }

  throw new CodeChangeProviderUnavailableError('no code-change provider has been configured');
}

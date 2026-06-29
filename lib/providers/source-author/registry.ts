import type {
  MotionSourceAuthorProvider,
  MotionSourceAuthorProviderFactory,
} from './types';

const REGISTRY = new Map<string, MotionSourceAuthorProviderFactory>();

export class MotionSourceAuthorProviderUnavailableError extends Error {
  constructor(reason: string) {
    super(`Motion source author provider unavailable: ${reason}`);
    this.name = 'MotionSourceAuthorProviderUnavailableError';
  }
}

export function registerMotionSourceAuthorProvider(
  id: string,
  factory: MotionSourceAuthorProviderFactory
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

export function listMotionSourceAuthorProviders(): Array<{
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

export function resolveMotionSourceAuthorProvider(
  preferredId?: string
): MotionSourceAuthorProvider {
  if (preferredId) {
    const factory = REGISTRY.get(preferredId);
    if (!factory) {
      throw new MotionSourceAuthorProviderUnavailableError(
        `unknown provider ${preferredId}`
      );
    }

    const provider = factory();
    if (provider.available()) return provider;

    throw new MotionSourceAuthorProviderUnavailableError(
      `${preferredId} is not configured`
    );
  }

  for (const factory of REGISTRY.values()) {
    const provider = factory();
    if (provider.available()) return provider;
  }

  throw new MotionSourceAuthorProviderUnavailableError(
    'no source author provider has been configured'
  );
}

export type { MotionSourceAuthorProvider } from './types';

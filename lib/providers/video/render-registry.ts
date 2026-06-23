import type {
  MotionRenderEngine,
  MotionRenderProvider,
  MotionRenderProviderFactory,
} from './types';

const REGISTRY = new Map<string, MotionRenderProviderFactory>();

export class MotionRenderProviderUnavailableError extends Error {
  constructor(reason: string) {
    super(`Motion render provider unavailable: ${reason}`);
    this.name = 'MotionRenderProviderUnavailableError';
  }
}

export interface ResolveMotionRenderProviderOptions {
  engine: MotionRenderEngine;
  preferredId?: string;
}

export function registerMotionRenderProvider(
  id: string,
  factory: MotionRenderProviderFactory
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

export function listMotionRenderProviders(): Array<{
  id: string;
  engine: MotionRenderEngine;
  displayName: string;
  available: boolean;
}> {
  return Array.from(REGISTRY.entries()).map(([id, factory]) => {
    const provider = factory();
    return {
      id,
      engine: provider.engine,
      displayName: provider.displayName,
      available: provider.available(),
    };
  });
}

export function resolveMotionRenderProvider(
  options: ResolveMotionRenderProviderOptions
): MotionRenderProvider {
  if (options.preferredId) {
    const factory = REGISTRY.get(options.preferredId);
    if (!factory) {
      throw new MotionRenderProviderUnavailableError(
        `unknown provider ${options.preferredId}`
      );
    }

    const provider = factory();
    if (provider.engine !== options.engine) {
      throw new MotionRenderProviderUnavailableError(
        `${options.preferredId} does not support ${options.engine}`
      );
    }
    if (provider.available()) return provider;

    throw new MotionRenderProviderUnavailableError(
      `${options.preferredId} is not configured`
    );
  }

  for (const factory of REGISTRY.values()) {
    const provider = factory();
    if (provider.engine === options.engine && provider.available()) {
      return provider;
    }
  }

  throw new MotionRenderProviderUnavailableError(
    `no ${options.engine} render provider has been configured`
  );
}

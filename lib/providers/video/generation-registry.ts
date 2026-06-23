import type {
  MotionImageToVideoProvider,
  MotionImageToVideoProviderFactory,
} from './types';

const IMAGE_TO_VIDEO_REGISTRY = new Map<string, MotionImageToVideoProviderFactory>();

export class MotionImageToVideoProviderUnavailableError extends Error {
  constructor(reason: string) {
    super(`Motion image-to-video provider unavailable: ${reason}`);
    this.name = 'MotionImageToVideoProviderUnavailableError';
  }
}

export function registerMotionImageToVideoProvider(
  id: string,
  factory: MotionImageToVideoProviderFactory
): () => void {
  const previous = IMAGE_TO_VIDEO_REGISTRY.get(id);
  IMAGE_TO_VIDEO_REGISTRY.set(id, factory);

  return () => {
    if (previous) {
      IMAGE_TO_VIDEO_REGISTRY.set(id, previous);
    } else {
      IMAGE_TO_VIDEO_REGISTRY.delete(id);
    }
  };
}

export function listMotionImageToVideoProviders(): Array<{
  id: string;
  displayName: string;
  available: boolean;
}> {
  return Array.from(IMAGE_TO_VIDEO_REGISTRY.entries()).map(([id, factory]) => {
    const provider = factory();
    return {
      id,
      displayName: provider.displayName,
      available: provider.available(),
    };
  });
}

export function resolveMotionImageToVideoProvider(
  preferredId?: string
): MotionImageToVideoProvider {
  if (preferredId) {
    const factory = IMAGE_TO_VIDEO_REGISTRY.get(preferredId);
    if (!factory) {
      throw new MotionImageToVideoProviderUnavailableError(
        `unknown provider ${preferredId}`
      );
    }

    const provider = factory();
    if (provider.available()) return provider;

    throw new MotionImageToVideoProviderUnavailableError(
      `${preferredId} is not configured`
    );
  }

  for (const factory of IMAGE_TO_VIDEO_REGISTRY.values()) {
    const provider = factory();
    if (provider.available()) return provider;
  }

  throw new MotionImageToVideoProviderUnavailableError(
    'no image-to-video provider has been configured'
  );
}

import type { VideoUnderstandingProvider } from './types';
import { VideoProviderUnavailableError } from './types';
import { createGeminiVideoProvider } from './gemini';

const REGISTRY: Record<string, () => VideoUnderstandingProvider> = {
  gemini: createGeminiVideoProvider,
};

export function listVideoProviders(): Array<{ id: string; displayName: string; available: boolean }> {
  return Object.entries(REGISTRY).map(([id, factory]) => {
    const p = factory();
    return { id, displayName: p.displayName, available: p.available() };
  });
}

export function resolveVideoProvider(preferredId?: string): VideoUnderstandingProvider {
  const envDefault = process.env.VIDEO_UNDERSTAND_PROVIDER;
  const order = [preferredId, envDefault].filter((x): x is string => !!x);
  for (const id of order) {
    const factory = REGISTRY[id];
    if (!factory) continue;
    const p = factory();
    if (p.available()) return p;
    if (preferredId === id) {
      throw new VideoProviderUnavailableError(`${id} is unavailable (missing API key)`);
    }
  }
  for (const factory of Object.values(REGISTRY)) {
    const p = factory();
    if (p.available()) return p;
  }
  throw new VideoProviderUnavailableError('no video understanding provider has its API key set');
}

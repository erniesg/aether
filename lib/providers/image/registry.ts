import type { ImageGenProvider } from './types';
import { ProviderUnavailableError } from './types';
import { createGeminiProvider } from './gemini';
import { createOpenAIProvider } from './openai';
import { createReplicateProvider } from './replicate';
import { createVolcengineProvider } from './volcengine';

/**
 * Every known image adapter lives here. The map is by id; `resolveProvider`
 * selects one, respecting (in order):
 *   1. an explicit id passed in (e.g. from a URL override or agent choice)
 *   2. the default from env var IMAGE_GEN_PROVIDER
 *   3. the first available adapter
 *
 * If none is available (no keys set), this throws — which the API route
 * surfaces as a 503 so the UI can explain what's missing.
 */

type Registry = Record<string, () => ImageGenProvider>;

const REGISTRY: Registry = {
  gemini: () => createGeminiProvider(),
  openai: () => createOpenAIProvider(),
  replicate: () => createReplicateProvider(),
  volcengine: () => createVolcengineProvider(),
};

export const KNOWN_PROVIDER_IDS = Object.keys(REGISTRY) as ReadonlyArray<string>;

export function resolveProvider(preferredId?: string): ImageGenProvider {
  const envDefault = process.env.IMAGE_GEN_PROVIDER;
  const order = [preferredId, envDefault, ...KNOWN_PROVIDER_IDS].filter(
    (x): x is string => typeof x === 'string' && x.length > 0
  );

  for (const id of order) {
    const factory = REGISTRY[id];
    if (!factory) continue;
    const provider = factory();
    if (provider.isAvailable()) return provider;
  }

  throw new ProviderUnavailableError(
    preferredId ?? 'any',
    'no provider has credentials set (checked: ' + KNOWN_PROVIDER_IDS.join(', ') + ')'
  );
}

export function listAvailableProviders(): Array<{ id: string; displayName: string; models: string[] }> {
  const out: Array<{ id: string; displayName: string; models: string[] }> = [];
  for (const id of KNOWN_PROVIDER_IDS) {
    const provider = REGISTRY[id]();
    if (provider.isAvailable()) {
      out.push({ id: provider.id, displayName: provider.displayName, models: provider.listModels() });
    }
  }
  return out;
}

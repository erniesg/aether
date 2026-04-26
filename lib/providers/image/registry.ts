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

// Order matters: this is the fallback iteration when no `?provider=` or
// IMAGE_GEN_PROVIDER is set. OpenAI is first because it's the most common
// demo target and its model name (`gpt-image-2`) is distinctive enough
// that a URL like `?model=gpt-image-2` is only meaningful for openai.
const REGISTRY: Registry = {
  openai: () => createOpenAIProvider(),
  gemini: () => createGeminiProvider(),
  replicate: () => createReplicateProvider(),
  volcengine: () => createVolcengineProvider(),
};

export const KNOWN_PROVIDER_IDS = Object.keys(REGISTRY) as ReadonlyArray<string>;

/**
 * Pick a provider. Precedence:
 *   1. explicit `preferredId` (URL `?provider=...` or agent choice)
 *   2. `modelHint` — if one of the known providers lists this model, prefer it.
 *      Lets `?model=gpt-image-2` route to openai without having to pass
 *      `?provider=openai` too. Must still pass availability check.
 *   3. env `IMAGE_GEN_PROVIDER`
 *   4. registry iteration order, taking the first available adapter.
 *
 * Throws ProviderUnavailableError when no adapter has credentials.
 */
export function resolveProvider(
  preferredId?: string,
  modelHint?: string
): ImageGenProvider {
  const envDefault = process.env.IMAGE_GEN_PROVIDER;

  let modelHintedId: string | undefined;
  if (modelHint && !preferredId) {
    for (const id of KNOWN_PROVIDER_IDS) {
      const p = REGISTRY[id]();
      if (p.isAvailable() && p.listModels().includes(modelHint)) {
        modelHintedId = id;
        break;
      }
    }
  }

  const order = [preferredId, modelHintedId, envDefault, ...KNOWN_PROVIDER_IDS].filter(
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

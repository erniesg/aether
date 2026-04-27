/**
 * Provider registry for background inpainting. Today only one adapter
 * exists (Replicate LAMA); the registry is structured the same as the
 * segmentation/image registries so a future local adapter (e.g. a
 * llama.cpp-style local LAMA server, similar to scripts/serve-local.sh
 * for SAM3) can drop in without callsite churn.
 */

import { createReplicateInpaintProvider } from './replicate';
import type { InpaintProvider, InpaintProviderId, InpaintProviderStatus } from './types';
import { InpaintUnavailableError } from './types';

let cached: InpaintProvider[] | null = null;

function buildAll(): InpaintProvider[] {
  return [createReplicateInpaintProvider()];
}

function getAll(): InpaintProvider[] {
  if (!cached) cached = buildAll();
  return cached;
}

/** Test-only — clears the memoised provider list. */
export function resetInpaintRegistryForTest(): void {
  cached = null;
}

export function listInpaintProviders(): InpaintProviderStatus[] {
  return getAll().map((p) => ({
    id: p.id,
    displayName: p.displayName,
    models: p.listModels(),
    available: p.isAvailable(),
    unavailableReason: p.getAvailabilityIssue(),
  }));
}

/**
 * Resolve the inpaint provider. Precedence: explicit `providerId` →
 * INPAINT_PROVIDER_ID env → first available adapter. Throws when no
 * available adapter matches.
 */
export function resolveInpaintProvider(
  providerId?: string,
  _model?: string
): InpaintProvider {
  const all = getAll();
  const requestedId = (providerId ?? process.env.INPAINT_PROVIDER_ID) as
    | InpaintProviderId
    | undefined;

  if (requestedId) {
    const match = all.find((p) => p.id === requestedId);
    if (!match) {
      throw new InpaintUnavailableError(
        requestedId,
        'no adapter registered for this id'
      );
    }
    if (!match.isAvailable()) {
      throw new InpaintUnavailableError(requestedId, match.getAvailabilityIssue());
    }
    return match;
  }

  const firstAvailable = all.find((p) => p.isAvailable());
  if (!firstAvailable) {
    throw new InpaintUnavailableError(
      'auto',
      'no inpaint provider has the credentials it needs (REPLICATE_API_TOKEN missing?)'
    );
  }
  return firstAvailable;
}

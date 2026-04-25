'use client';

/**
 * Convex-backed store for workspace provider preferences.
 * Follows the same conditional-hook pattern as lib/context/creator-store.ts:
 *   if (isConvexEnabled()) { useQuery(...) } else { fallback }
 *
 * When Convex is not provisioned (NEXT_PUBLIC_CONVEX_URL unset) or no
 * ConvexProvider is in the React tree, returns null / no-op — the shell
 * gracefully falls back to env-var defaults.
 */

import { useQuery, useMutation } from 'convex/react';
import { anyApi } from 'convex/server';
import { getConvexClient, isConvexEnabled } from '@/lib/convex/client';
import type { WorkspaceProviderPrefs } from '@/lib/providers/prefs';

const providerPrefsApi = (
  anyApi as unknown as {
    providerPrefs: {
      getProviderPrefs: unknown;
      saveProviderPrefs: unknown;
    };
  }
).providerPrefs;

/**
 * Reactive query. Returns null when Convex is not provisioned or no record
 * exists. Follows the same conditional-hook pattern as useBrandContext so the
 * shell renders cleanly in tests that don't mount ConvexProvider.
 */
export function useWorkspaceProviderPrefs(
  workspaceId: string
): WorkspaceProviderPrefs | null {
  /* eslint-disable react-hooks/rules-of-hooks */
  if (isConvexEnabled()) {
    const data = useQuery(providerPrefsApi.getProviderPrefs as never, {
      workspaceId,
    } as never) as WorkspaceProviderPrefs | null | undefined;
    return data ?? null;
  }
  return null;
  /* eslint-enable react-hooks/rules-of-hooks */
}

/**
 * Returns a save callback. When Convex is not provisioned the callback is a
 * no-op (still safe to call without a ConvexProvider in the tree).
 */
export function useSaveWorkspaceProviderPrefs(): (
  workspaceId: string,
  prefs: WorkspaceProviderPrefs
) => Promise<void> {
  /* eslint-disable react-hooks/rules-of-hooks */
  if (isConvexEnabled()) {
    const mutate = useMutation(providerPrefsApi.saveProviderPrefs as never);
    return async (workspaceId, prefs) => {
      await mutate({ workspaceId, prefs } as never);
    };
  }
  // Convex not provisioned: use the imperative HTTP client as a fallback.
  return async (workspaceId, prefs) => {
    const client = getConvexClient();
    if (!client) return;
    await client.mutation(providerPrefsApi.saveProviderPrefs as never, {
      workspaceId,
      prefs,
    } as never);
  };
  /* eslint-enable react-hooks/rules-of-hooks */
}

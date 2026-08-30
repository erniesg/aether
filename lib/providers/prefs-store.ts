'use client';

/**
 * Convex-backed store for workspace provider preferences.
 * Follows the same conditional-hook pattern as lib/context/creator-store.ts:
 *   if (isConvexEnabled()) { useQuery(...) } else { fallback }
 *
 * Broad live reads require NEXT_PUBLIC_AETHER_LIVE_MODE=all. The save callback
 * can still use the configured Convex client as an explicit write-on-change
 * path when the app has a Convex URL but broad live mode is off.
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
 * Returns a save callback. With broad live mode off, this uses the configured
 * Convex client directly so saves happen only on explicit preference changes.
 * Without a Convex URL, the callback is a no-op.
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
  // Broad live mode is off: use the imperative Convex client as a write-only
  // fallback without mounting a reactive query.
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

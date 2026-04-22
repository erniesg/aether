'use client';

import type { ReactNode } from 'react';
import { ConvexProvider } from 'convex/react';
import { getConvexClient, isConvexEnabled } from '@/lib/convex/client';

/**
 * Mounts Convex's React provider only when NEXT_PUBLIC_CONVEX_URL is set.
 * When the flag is empty the subtree renders untouched — the runs facade
 * stays on the in-memory path and never calls `useQuery`.
 */
export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!isConvexEnabled()) return <>{children}</>;
  const client = getConvexClient();
  if (!client) return <>{children}</>;
  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}

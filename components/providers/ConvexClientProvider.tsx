'use client';

import type { ReactNode } from 'react';
import { ConvexProvider } from 'convex/react';
import { getConvexClient, isCanvasLiveEnabled } from '@/lib/convex/client';

/**
 * Mounts Convex's React provider only when a live mode is explicitly enabled.
 * In `canvas` mode the provider exists for active canvas/run subscriptions,
 * while broad workspace rails still stay off unless `all` is selected.
 */
export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!isCanvasLiveEnabled()) return <>{children}</>;
  const client = getConvexClient();
  if (!client) return <>{children}</>;
  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}

'use client';

import { ConvexReactClient } from 'convex/react';

export type AetherLiveMode = 'off' | 'canvas' | 'all';

// Singleton ConvexReactClient. A configured Convex URL is enough for
// explicit mutations/queries, but not for broad React subscriptions; live
// mode controls which realtime readers are allowed to mount.

let client: ConvexReactClient | null = null;

export function getConvexClient(): ConvexReactClient | null {
  if (!isConvexConfigured()) return null;
  if (!client) {
    client = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL as string);
  }
  return client;
}

export function isConvexConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);
}

export function isConvexPersistenceEnabled(): boolean {
  return isConvexConfigured();
}

export function isConvexEnabled(): boolean {
  return isConvexConfigured() && aetherLiveMode() === 'all';
}

export function isCanvasLiveEnabled(): boolean {
  const mode = aetherLiveMode();
  return isConvexConfigured() && (mode === 'canvas' || mode === 'all');
}

export function aetherLiveMode(env: NodeJS.ProcessEnv = process.env): AetherLiveMode {
  const value = env.NEXT_PUBLIC_AETHER_LIVE_MODE?.trim().toLowerCase();
  if (value === 'canvas' || value === 'all') return value;
  return 'off';
}

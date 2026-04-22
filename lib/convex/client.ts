'use client';

import { ConvexReactClient } from 'convex/react';

// Singleton ConvexReactClient. Returns null when NEXT_PUBLIC_CONVEX_URL is
// empty so the feature flag short-circuits before touching the network.

let client: ConvexReactClient | null = null;

export function getConvexClient(): ConvexReactClient | null {
  if (!isConvexEnabled()) return null;
  if (!client) {
    client = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL as string);
  }
  return client;
}

export function isConvexEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);
}

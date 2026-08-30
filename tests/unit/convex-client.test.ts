import { afterEach, describe, expect, it } from 'vitest';

const ORIGINAL_CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;
const ORIGINAL_LIVE_MODE = process.env.NEXT_PUBLIC_AETHER_LIVE_MODE;

afterEach(() => {
  if (ORIGINAL_CONVEX_URL === undefined) delete process.env.NEXT_PUBLIC_CONVEX_URL;
  else process.env.NEXT_PUBLIC_CONVEX_URL = ORIGINAL_CONVEX_URL;
  if (ORIGINAL_LIVE_MODE === undefined) delete process.env.NEXT_PUBLIC_AETHER_LIVE_MODE;
  else process.env.NEXT_PUBLIC_AETHER_LIVE_MODE = ORIGINAL_LIVE_MODE;
});

describe('Convex client live-mode gate', () => {
  it('keeps broad React subscriptions off by default even when Convex is configured', async () => {
    process.env.NEXT_PUBLIC_CONVEX_URL = 'https://example.convex.cloud';
    delete process.env.NEXT_PUBLIC_AETHER_LIVE_MODE;

    const client = await import('@/lib/convex/client');
    expect(client.isConvexConfigured()).toBe(true);
    expect(client.isConvexPersistenceEnabled()).toBe(true);
    expect(client.aetherLiveMode()).toBe('off');
    expect(client.isConvexEnabled()).toBe(false);
  });

  it('enables canvas-only live mode without broad Convex React subscriptions', async () => {
    process.env.NEXT_PUBLIC_CONVEX_URL = 'https://example.convex.cloud';
    process.env.NEXT_PUBLIC_AETHER_LIVE_MODE = 'canvas';

    const client = await import('@/lib/convex/client');
    expect(client.isCanvasLiveEnabled()).toBe(true);
    expect(client.isConvexEnabled()).toBe(false);
  });

  it('requires all mode for legacy whole-workspace Convex reactivity', async () => {
    process.env.NEXT_PUBLIC_CONVEX_URL = 'https://example.convex.cloud';
    process.env.NEXT_PUBLIC_AETHER_LIVE_MODE = 'all';

    const client = await import('@/lib/convex/client');
    expect(client.isCanvasLiveEnabled()).toBe(true);
    expect(client.isConvexEnabled()).toBe(true);
  });
});

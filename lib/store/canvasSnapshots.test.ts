import { afterEach, describe, expect, it } from 'vitest';
import {
  hasCanvasFrames,
  isPersistableCanvasSnapshot,
  loadCanvasSnapshot,
  saveCanvasSnapshot,
} from './canvasSnapshots';

const ORIGINAL_CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

afterEach(() => {
  if (ORIGINAL_CONVEX_URL === undefined) delete process.env.NEXT_PUBLIC_CONVEX_URL;
  else process.env.NEXT_PUBLIC_CONVEX_URL = ORIGINAL_CONVEX_URL;
  window.localStorage.clear();
});

describe('canvas snapshots', () => {
  const FRAME_SNAPSHOT = JSON.stringify({
    document: {
      store: {
        'shape:frame': { typeName: 'shape', type: 'frame' },
      },
    },
  });

  it('rejects snapshots that would exceed Convex document limits', () => {
    expect(isPersistableCanvasSnapshot('')).toBe(false);
    expect(isPersistableCanvasSnapshot('x'.repeat(900_000))).toBe(true);
    expect(isPersistableCanvasSnapshot('x'.repeat(900_001))).toBe(false);
  });

  it('requires at least one artboard frame before restoring or saving', async () => {
    expect(hasCanvasFrames('{"document":{"store":{}}}')).toBe(false);
    expect(hasCanvasFrames(FRAME_SNAPSHOT)).toBe(true);
    await expect(saveCanvasSnapshot('demo-ws', '{"document":{"store":{}}}', 123)).resolves.toBe(false);
  });

  it('uses local storage as the immediate fallback cache', async () => {
    delete process.env.NEXT_PUBLIC_CONVEX_URL;

    await expect(
      saveCanvasSnapshot('demo-ws', FRAME_SNAPSHOT, 123)
    ).resolves.toBe(true);

    await expect(loadCanvasSnapshot('demo-ws')).resolves.toMatchObject({
      tldrawStoreJson: FRAME_SNAPSHOT,
      snapshottedAt: 123,
      source: 'local',
    });
  });
});

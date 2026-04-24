import { makeFunctionReference } from 'convex/server';
import { getConvexClient, isConvexEnabled } from '@/lib/convex/client';

const LOCAL_PREFIX = 'aether.canvasSnapshot.';
const MAX_SNAPSHOT_CHARS = 900_000;
const CONVEX_LOAD_TIMEOUT_MS = 1500;

const canvasApi = {
  latest: makeFunctionReference('canvas.js:latest'),
  save: makeFunctionReference('canvas.js:save'),
};

export interface PersistedCanvasSnapshot {
  tldrawStoreJson: string;
  snapshottedAt: number;
  source: 'convex' | 'local';
}

function localKey(wsKey: string) {
  return `${LOCAL_PREFIX}${wsKey}`;
}

function readLocalSnapshot(wsKey: string): PersistedCanvasSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(localKey(wsKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      tldrawStoreJson?: unknown;
      snapshottedAt?: unknown;
    };
    if (
      typeof parsed.tldrawStoreJson !== 'string' ||
      !hasCanvasFrames(parsed.tldrawStoreJson)
    ) {
      return null;
    }
    return {
      tldrawStoreJson: parsed.tldrawStoreJson,
      snapshottedAt:
        typeof parsed.snapshottedAt === 'number' ? parsed.snapshottedAt : 0,
      source: 'local',
    };
  } catch {
    return null;
  }
}

function writeLocalSnapshot(wsKey: string, tldrawStoreJson: string, snapshottedAt: number) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      localKey(wsKey),
      JSON.stringify({ tldrawStoreJson, snapshottedAt })
    );
  } catch {
    // local fallback is best-effort only.
  }
}

export function isPersistableCanvasSnapshot(tldrawStoreJson: string): boolean {
  return tldrawStoreJson.length > 0 && tldrawStoreJson.length <= MAX_SNAPSHOT_CHARS;
}

export function hasCanvasFrames(tldrawStoreJson: string): boolean {
  try {
    const snapshot = JSON.parse(tldrawStoreJson) as {
      document?: { store?: Record<string, unknown> };
      store?: Record<string, unknown>;
    };
    const store = snapshot.document?.store ?? snapshot.store;
    if (!store || typeof store !== 'object') return false;

    return Object.values(store).some((record) => {
      if (!record || typeof record !== 'object') return false;
      const candidate = record as { typeName?: unknown; type?: unknown };
      return candidate.typeName === 'shape' && candidate.type === 'frame';
    });
  } catch {
    return false;
  }
}

export async function loadCanvasSnapshot(
  wsKey: string
): Promise<PersistedCanvasSnapshot | null> {
  const local = readLocalSnapshot(wsKey);
  const client = getConvexClient();
  if (!isConvexEnabled() || !client) return local;

  try {
    const remote = (await Promise.race([
      client.query(canvasApi.latest as never, { wsKey } as never),
      new Promise<null>((resolve) =>
        window.setTimeout(() => resolve(null), CONVEX_LOAD_TIMEOUT_MS)
      ),
    ])) as
      | { tldrawStoreJson?: string; snapshottedAt?: number }
      | null;
    if (remote?.tldrawStoreJson && hasCanvasFrames(remote.tldrawStoreJson)) {
      return {
        tldrawStoreJson: remote.tldrawStoreJson,
        snapshottedAt: remote.snapshottedAt ?? 0,
        source: 'convex',
      };
    }
  } catch (error) {
    console.error('[canvas/snapshot] load failed', error);
  }

  return local;
}

export async function saveCanvasSnapshot(
  wsKey: string,
  tldrawStoreJson: string,
  snapshottedAt: number = Date.now()
): Promise<boolean> {
  if (!isPersistableCanvasSnapshot(tldrawStoreJson) || !hasCanvasFrames(tldrawStoreJson)) {
    return false;
  }

  writeLocalSnapshot(wsKey, tldrawStoreJson, snapshottedAt);

  const client = getConvexClient();
  if (!isConvexEnabled() || !client) return true;

  try {
    await client.mutation(canvasApi.save as never, {
      wsKey,
      tldrawStoreJson,
      snapshottedAt,
    } as never);
    return true;
  } catch (error) {
    console.error('[canvas/snapshot] save failed', error);
    return true;
  }
}

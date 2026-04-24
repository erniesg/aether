import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  KNOWN_PUBLISHER_IDS,
  createInMemoryStorageForTests,
  listAvailablePublishers,
  resolvePublisher,
} from './registry';

const PUBLISHER_ENV_KEYS = ['PUBLISHER_PROVIDER'] as const;

describe('publisher registry', () => {
  const snapshot: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of PUBLISHER_ENV_KEYS) {
      snapshot[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of PUBLISHER_ENV_KEYS) {
      if (snapshot[k] === undefined) delete process.env[k];
      else process.env[k] = snapshot[k];
    }
  });

  it('exposes the three publisher ids defined for the seam', () => {
    expect(new Set(KNOWN_PUBLISHER_IDS)).toEqual(
      new Set(['preview', 'postiz', 'social-auto-upload'])
    );
  });

  it('default resolution returns "preview" — no OAuth required, always demo-ready', () => {
    const publisher = resolvePublisher({
      workspaceId: 'ws_x',
      storage: createInMemoryStorageForTests(),
    });
    expect(publisher.id).toBe('preview');
  });

  it('PUBLISHER_PROVIDER=postiz silently falls through to preview (stub is reserved; adapter lands in Slice 2)', () => {
    process.env.PUBLISHER_PROVIDER = 'postiz';
    const publisher = resolvePublisher({
      workspaceId: 'ws_x',
      storage: createInMemoryStorageForTests(),
    });
    expect(publisher.id).toBe('preview');
  });

  it('explicit preferredId beats env default', () => {
    process.env.PUBLISHER_PROVIDER = 'postiz';
    const publisher = resolvePublisher({
      workspaceId: 'ws_x',
      storage: createInMemoryStorageForTests(),
      preferredId: 'preview',
    });
    expect(publisher.id).toBe('preview');
  });

  it('listAvailablePublishers returns only the preview adapter in M1', () => {
    const list = listAvailablePublishers();
    expect(list.map((p) => p.id)).toEqual(['preview']);
    expect(list[0]!.displayName).toBeTruthy();
  });
});

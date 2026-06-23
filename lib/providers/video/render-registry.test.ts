import { afterEach, describe, expect, it } from 'vitest';
import type {
  MotionRenderProvider,
  MotionRenderRequest,
} from './types';
import {
  MotionRenderProviderUnavailableError,
  listMotionRenderProviders,
  registerMotionRenderProvider,
  resolveMotionRenderProvider,
} from './render-registry';

const request: MotionRenderRequest = {
  id: 'render-plan-motion-aether-launch-draft-primary-remotion',
  projectId: 'motion-aether-launch',
  draftId: 'draft-primary',
  engine: 'remotion',
  compositionId: 'motion-aether-launch-draft-primary',
  fps: 30,
  durationFrames: 900,
  tracks: [],
  outputs: [],
  provenance: [{ kind: 'timeline', ref: 'track-text' }],
};

function createProvider(
  id: string,
  engine: MotionRenderProvider['engine'],
  available = true
): MotionRenderProvider {
  return {
    id,
    engine,
    displayName: `${id} render`,
    available: () => available,
    render: async () => ({
      providerId: id,
      engine,
      outputs: [],
      provenance: [{ kind: 'provider', ref: id }],
    }),
  };
}

describe('motion render provider registry', () => {
  const unregister: Array<() => void> = [];

  afterEach(() => {
    while (unregister.length > 0) {
      unregister.pop()?.();
    }
  });

  it('throws a typed unavailable error when no render provider is configured', () => {
    expect(() => resolveMotionRenderProvider({ engine: 'remotion' })).toThrow(
      MotionRenderProviderUnavailableError
    );
  });

  it('resolves an available provider by render engine without hardcoding a default', () => {
    unregister.push(
      registerMotionRenderProvider('hyperframes-local', () =>
        createProvider('hyperframes-local', 'hyperframes')
      )
    );
    unregister.push(
      registerMotionRenderProvider('remotion-local', () =>
        createProvider('remotion-local', 'remotion')
      )
    );

    expect(resolveMotionRenderProvider({ engine: 'remotion' }).id).toBe('remotion-local');
    expect(resolveMotionRenderProvider({ engine: 'hyperframes' }).id).toBe(
      'hyperframes-local'
    );
  });

  it('reports provider availability and rejects unavailable preferred providers', () => {
    unregister.push(
      registerMotionRenderProvider('remotion-local', () =>
        createProvider('remotion-local', 'remotion', false)
      )
    );

    expect(listMotionRenderProviders()).toEqual([
      {
        id: 'remotion-local',
        engine: 'remotion',
        displayName: 'remotion-local render',
        available: false,
      },
    ]);
    expect(() =>
      resolveMotionRenderProvider({
        engine: 'remotion',
        preferredId: 'remotion-local',
      })
    ).toThrow(/remotion-local is not configured/);
  });

  it('keeps render execution behind the provider contract', async () => {
    unregister.push(
      registerMotionRenderProvider('remotion-local', () =>
        createProvider('remotion-local', 'remotion')
      )
    );

    await expect(
      resolveMotionRenderProvider({ engine: 'remotion' }).render(request)
    ).resolves.toEqual({
      providerId: 'remotion-local',
      engine: 'remotion',
      outputs: [],
      provenance: [{ kind: 'provider', ref: 'remotion-local' }],
    });
  });
});

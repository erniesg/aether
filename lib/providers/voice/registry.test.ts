import { afterEach, describe, expect, it } from 'vitest';
import {
  VoiceProviderUnavailableError,
  listVoiceProviders,
  registerVoiceProvider,
  resolveVoiceProvider,
} from './registry';
import type { VoiceProvider, VoiceSynthesisRequest } from './types';

const request: VoiceSynthesisRequest = {
  id: 'voice-clip-beat-hook-voice',
  projectId: 'motion-aether-launch',
  draftId: 'draft-primary',
  clipId: 'clip-beat-hook-voice',
  text: 'aether: Canvas-native creative system.',
  voiceId: 'calm-launch-narrator',
  startFrame: 0,
  durationFrames: 90,
  fps: 30,
  expectedArtifacts: [],
  provenance: [{ kind: 'timeline', ref: 'clip-beat-hook-voice' }],
};

function createProvider(id: string, available = true): VoiceProvider {
  return {
    id,
    displayName: `${id} voice`,
    available: () => available,
    synthesize: async () => ({
      providerId: id,
      artifacts: [],
      provenance: [{ kind: 'provider', ref: id }],
    }),
  };
}

describe('voice provider registry', () => {
  const unregister: Array<() => void> = [];

  afterEach(() => {
    while (unregister.length > 0) {
      unregister.pop()?.();
    }
  });

  it('throws a typed unavailable error when no voice provider is configured', () => {
    expect(() => resolveVoiceProvider()).toThrow(VoiceProviderUnavailableError);
  });

  it('resolves the first available registered voice provider', () => {
    unregister.push(registerVoiceProvider('local-tts', () => createProvider('local-tts')));

    expect(resolveVoiceProvider().id).toBe('local-tts');
  });

  it('reports provider availability and rejects unavailable preferred providers', () => {
    unregister.push(registerVoiceProvider('elevenlabs', () => createProvider('elevenlabs', false)));

    expect(listVoiceProviders()).toEqual([
      { id: 'elevenlabs', displayName: 'elevenlabs voice', available: false },
    ]);
    expect(() => resolveVoiceProvider('elevenlabs')).toThrow(/elevenlabs is not configured/);
  });

  it('keeps synthesis execution behind the provider contract', async () => {
    unregister.push(registerVoiceProvider('local-tts', () => createProvider('local-tts')));

    await expect(resolveVoiceProvider('local-tts').synthesize(request)).resolves.toEqual({
      providerId: 'local-tts',
      artifacts: [],
      provenance: [{ kind: 'provider', ref: 'local-tts' }],
    });
  });
});

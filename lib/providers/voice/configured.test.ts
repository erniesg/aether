import { afterEach, describe, expect, it } from 'vitest';
import {
  ensureConfiguredVoiceProviders,
  resetConfiguredVoiceProvidersForTests,
} from './configured';
import { listVoiceProviders } from './registry';

const VOICE_ENV_KEYS = [
  'AETHER_VOICE_SYNTHESIS_PROJECT_DIR',
  'AETHER_VOICE_SYNTHESIS_COMMAND',
  'AETHER_VOICE_SYNTHESIS_ARGS',
] as const;

const ORIGINAL_ENV = Object.fromEntries(
  VOICE_ENV_KEYS.map((key) => [key, process.env[key]])
);

describe('ensureConfiguredVoiceProviders', () => {
  afterEach(() => {
    resetConfiguredVoiceProvidersForTests();
    restoreEnv();
  });

  it('registers the command voice provider when project directory and command are configured', () => {
    process.env.AETHER_VOICE_SYNTHESIS_PROJECT_DIR = '/repo';
    process.env.AETHER_VOICE_SYNTHESIS_COMMAND = 'node';
    process.env.AETHER_VOICE_SYNTHESIS_ARGS = 'scripts/tts.mjs --format mp3';

    ensureConfiguredVoiceProviders();

    expect(listVoiceProviders()).toEqual([
      {
        id: 'voice-command',
        displayName: 'Command voice synthesis',
        available: true,
      },
    ]);
  });

  it('does not register a default voice provider from a command alone', () => {
    delete process.env.AETHER_VOICE_SYNTHESIS_PROJECT_DIR;
    process.env.AETHER_VOICE_SYNTHESIS_COMMAND = 'node';

    ensureConfiguredVoiceProviders();

    expect(listVoiceProviders()).toEqual([]);
  });
});

function restoreEnv(): void {
  for (const key of VOICE_ENV_KEYS) {
    const original = ORIGINAL_ENV[key];
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
}

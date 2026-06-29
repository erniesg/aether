import { createCommandVoiceProvider } from './command';
import { registerVoiceProvider } from './registry';
import type { VoiceProviderFactory } from './types';

type VoiceProviderConfig = {
  id: string;
  factory: VoiceProviderFactory;
  signature: Record<string, string>;
};

let configuredSignature: string | null = null;
let unregisterConfiguredProviders: Array<() => void> = [];

export function ensureConfiguredVoiceProviders(env: NodeJS.ProcessEnv = process.env): void {
  const configs = voiceProviderConfigsFromEnv(env);
  const signature = JSON.stringify(configs.map((config) => config.signature));
  if (signature === configuredSignature) return;

  resetConfiguredVoiceProviders();
  configuredSignature = signature;
  unregisterConfiguredProviders = configs.map((config) =>
    registerVoiceProvider(config.id, config.factory)
  );
}

export function resetConfiguredVoiceProvidersForTests(): void {
  resetConfiguredVoiceProviders();
}

function resetConfiguredVoiceProviders(): void {
  while (unregisterConfiguredProviders.length > 0) {
    unregisterConfiguredProviders.pop()?.();
  }
  configuredSignature = null;
}

function voiceProviderConfigsFromEnv(env: NodeJS.ProcessEnv): VoiceProviderConfig[] {
  const projectDir = envValue(env.AETHER_VOICE_SYNTHESIS_PROJECT_DIR);
  const command = envValue(env.AETHER_VOICE_SYNTHESIS_COMMAND);
  if (!projectDir || !command) return [];

  const args = commandArgs(envValue(env.AETHER_VOICE_SYNTHESIS_ARGS));

  return [
    {
      id: 'voice-command',
      signature: {
        id: 'voice-command',
        projectDir,
        command,
        args: args.join('\u0000'),
      },
      factory: () =>
        createCommandVoiceProvider({
          id: 'voice-command',
          displayName: 'Command voice synthesis',
          projectDir,
          command,
          args,
        }),
    },
  ];
}

function commandArgs(value: string | undefined): string[] {
  if (!value) return [];
  const trimmed = value.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
        return parsed;
      }
    } catch {
      return trimmed.split(/\s+/);
    }
  }

  return trimmed.split(/\s+/);
}

function envValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

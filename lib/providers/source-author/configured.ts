import { createAnthropicMotionSourceAuthorProvider } from './anthropic';
import { registerMotionSourceAuthorProvider } from './registry';
import type { MotionSourceAuthorProviderFactory } from './types';

type SourceAuthorProviderConfig = {
  id: string;
  factory: MotionSourceAuthorProviderFactory;
  signature: Record<string, string>;
};

let configuredSignature: string | null = null;
let unregisterConfiguredProviders: Array<() => void> = [];

export function ensureConfiguredMotionSourceAuthorProviders(
  env: NodeJS.ProcessEnv = process.env
): void {
  const configs = sourceAuthorProviderConfigsFromEnv(env);
  const signature = JSON.stringify(configs.map((config) => config.signature));
  if (signature === configuredSignature) return;

  resetConfiguredMotionSourceAuthorProviders();
  configuredSignature = signature;
  unregisterConfiguredProviders = configs.map((config) =>
    registerMotionSourceAuthorProvider(config.id, config.factory)
  );
}

export function resetConfiguredMotionSourceAuthorProvidersForTests(): void {
  resetConfiguredMotionSourceAuthorProviders();
}

function resetConfiguredMotionSourceAuthorProviders(): void {
  while (unregisterConfiguredProviders.length > 0) {
    unregisterConfiguredProviders.pop()?.();
  }
  configuredSignature = null;
}

function sourceAuthorProviderConfigsFromEnv(
  env: NodeJS.ProcessEnv
): SourceAuthorProviderConfig[] {
  const apiKey = envValue(env.ANTHROPIC_API_KEY);
  const model =
    envValue(env.AETHER_MOTION_SOURCE_AUTHOR_MODEL) ??
    envValue(env.MOTION_SOURCE_AUTHOR_MODEL) ??
    envValue(env.ANTHROPIC_SOURCE_AUTHOR_MODEL);

  if (!apiKey || !model) return [];

  return [
    {
      id: 'anthropic-source-author',
      signature: {
        id: 'anthropic-source-author',
        model,
        apiKeyConfigured: 'true',
      },
      factory: () =>
        createAnthropicMotionSourceAuthorProvider({
          apiKey,
          model,
        }),
    },
  ];
}

function envValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

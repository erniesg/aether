import { createCommandImageToVideoProvider } from './command-image-to-video';
import { registerMotionImageToVideoProvider } from './generation-registry';
import type { MotionImageToVideoProviderFactory } from './types';

type ImageToVideoProviderConfig = {
  id: string;
  factory: MotionImageToVideoProviderFactory;
  signature: Record<string, string>;
};

let configuredSignature: string | null = null;
let unregisterConfiguredProviders: Array<() => void> = [];

export function ensureConfiguredMotionImageToVideoProviders(
  env: NodeJS.ProcessEnv = process.env
): void {
  const configs = imageToVideoProviderConfigsFromEnv(env);
  const signature = JSON.stringify(configs.map((config) => config.signature));
  if (signature === configuredSignature) return;

  resetConfiguredMotionImageToVideoProviders();
  configuredSignature = signature;
  unregisterConfiguredProviders = configs.map((config) =>
    registerMotionImageToVideoProvider(config.id, config.factory)
  );
}

export function resetConfiguredMotionImageToVideoProvidersForTests(): void {
  resetConfiguredMotionImageToVideoProviders();
}

function resetConfiguredMotionImageToVideoProviders(): void {
  while (unregisterConfiguredProviders.length > 0) {
    unregisterConfiguredProviders.pop()?.();
  }
  configuredSignature = null;
}

function imageToVideoProviderConfigsFromEnv(
  env: NodeJS.ProcessEnv
): ImageToVideoProviderConfig[] {
  const projectDir = envValue(env.AETHER_IMAGE_TO_VIDEO_PROJECT_DIR);
  const command = envValue(env.AETHER_IMAGE_TO_VIDEO_COMMAND);
  if (!projectDir || !command) return [];

  const args = commandArgs(envValue(env.AETHER_IMAGE_TO_VIDEO_ARGS));

  return [
    {
      id: 'image-video-command',
      signature: {
        id: 'image-video-command',
        projectDir,
        command,
        args: args.join('\u0000'),
      },
      factory: () =>
        createCommandImageToVideoProvider({
          id: 'image-video-command',
          displayName: 'Command image-to-video generation',
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

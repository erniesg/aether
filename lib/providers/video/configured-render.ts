import {
  createHyperFramesCommandRenderRunner,
  createRemotionCommandRenderRunner,
} from './command-render';
import {
  createHyperFramesRenderProvider,
  createRemotionRenderProvider,
} from './local-render';
import { registerMotionRenderProvider } from './render-registry';
import type { MotionRenderProviderFactory } from './types';

type RenderProviderConfig = {
  id: string;
  factory: MotionRenderProviderFactory;
  signature: Record<string, string>;
};

let configuredSignature: string | null = null;
let unregisterConfiguredProviders: Array<() => void> = [];

export function ensureConfiguredMotionRenderProviders(
  env: NodeJS.ProcessEnv = process.env
): void {
  const configs = renderProviderConfigsFromEnv(env);
  const signature = JSON.stringify(configs.map((config) => config.signature));
  if (signature === configuredSignature) return;

  resetConfiguredMotionRenderProviders();
  configuredSignature = signature;
  unregisterConfiguredProviders = configs.map((config) =>
    registerMotionRenderProvider(config.id, config.factory)
  );
}

export function resetConfiguredMotionRenderProvidersForTests(): void {
  resetConfiguredMotionRenderProviders();
}

function resetConfiguredMotionRenderProviders(): void {
  while (unregisterConfiguredProviders.length > 0) {
    unregisterConfiguredProviders.pop()?.();
  }
  configuredSignature = null;
}

function renderProviderConfigsFromEnv(env: NodeJS.ProcessEnv): RenderProviderConfig[] {
  const sharedProjectDir = envValue(env.AETHER_MOTION_RENDER_PROJECT_DIR);
  const sharedCommand = envValue(env.AETHER_MOTION_RENDER_COMMAND);
  const configs: RenderProviderConfig[] = [];

  const remotionProjectDir =
    envValue(env.AETHER_REMOTION_RENDER_PROJECT_DIR) ?? sharedProjectDir;
  if (remotionProjectDir) {
    const command = envValue(env.AETHER_REMOTION_RENDER_COMMAND) ?? sharedCommand;
    const packageName = envValue(env.AETHER_REMOTION_RENDER_PACKAGE);
    const entryPoint = envValue(env.AETHER_REMOTION_ENTRY_POINT);

    configs.push({
      id: 'remotion-local',
      signature: compactSignature({
        id: 'remotion-local',
        projectDir: remotionProjectDir,
        command,
        packageName,
        entryPoint,
      }),
      factory: () =>
        createRemotionRenderProvider({
          runner: createRemotionCommandRenderRunner({
            projectDir: remotionProjectDir,
            ...(command ? { command } : {}),
            ...(packageName ? { packageName } : {}),
            ...(entryPoint ? { entryPoint } : {}),
          }),
        }),
    });
  }

  const hyperFramesProjectDir =
    envValue(env.AETHER_HYPERFRAMES_RENDER_PROJECT_DIR) ?? sharedProjectDir;
  if (hyperFramesProjectDir) {
    const command = envValue(env.AETHER_HYPERFRAMES_RENDER_COMMAND) ?? sharedCommand;
    const packageName = envValue(env.AETHER_HYPERFRAMES_RENDER_PACKAGE);
    const quality = hyperFramesQuality(envValue(env.AETHER_HYPERFRAMES_RENDER_QUALITY));

    configs.push({
      id: 'hyperframes-local',
      signature: compactSignature({
        id: 'hyperframes-local',
        projectDir: hyperFramesProjectDir,
        command,
        packageName,
        quality,
      }),
      factory: () =>
        createHyperFramesRenderProvider({
          runner: createHyperFramesCommandRenderRunner({
            projectDir: hyperFramesProjectDir,
            ...(command ? { command } : {}),
            ...(packageName ? { packageName } : {}),
            ...(quality ? { quality } : {}),
          }),
        }),
    });
  }

  return configs;
}

function envValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function compactSignature(values: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, string] => Boolean(entry[1]))
  );
}

function hyperFramesQuality(
  value: string | undefined
): 'draft' | 'standard' | 'high' | undefined {
  if (value === 'draft' || value === 'standard' || value === 'high') return value;
  return undefined;
}

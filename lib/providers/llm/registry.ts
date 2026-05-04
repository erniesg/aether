import { createAnthropicCommandProvider } from './anthropic';
import { createDeepSeekProvider } from './deepseek';
import { createOpenAiCommandProvider } from './openai';
import {
  CommandLlmUnavailableError,
  type CommandLlmProvider,
  type CommandLlmProviderId,
} from './types';

type ProviderFactoryOptions = { allowSharedModel?: boolean };
type ProviderFactory = (options?: ProviderFactoryOptions) => CommandLlmProvider;

const FACTORIES: Record<CommandLlmProviderId, ProviderFactory> = {
  anthropic: (options) => createAnthropicCommandProvider(options),
  openai: (options) => createOpenAiCommandProvider(options),
  deepseek: (options) => createDeepSeekProvider(options),
};

const AUTO_PROVIDER_ORDER: CommandLlmProviderId[] = [
  'deepseek',
  'anthropic',
  'openai',
];

export function normalizeCommandProviderId(
  raw: string | undefined
): CommandLlmProviderId | undefined {
  const value = raw?.trim().toLowerCase();
  if (value === 'claude' || value === 'anthropic') return 'anthropic';
  if (value === 'openai') return 'openai';
  if (value === 'deepseek') return 'deepseek';
  return undefined;
}

export function readCommandProviderId(
  env: Record<string, string | undefined> = process.env
): CommandLlmProviderId | undefined {
  return normalizeCommandProviderId(env.AETHER_COMMAND_PROVIDER);
}

export function listCommandLlmProviders(): CommandLlmProvider[] {
  return AUTO_PROVIDER_ORDER.map((id) =>
    FACTORIES[id]({ allowSharedModel: false })
  );
}

export function resolveCommandLlmProvider(
  preferredId?: CommandLlmProviderId
): CommandLlmProvider {
  const id = preferredId ?? readCommandProviderId();
  if (!id) {
    const provider = listCommandLlmProviders().find((candidate) =>
      candidate.isAvailable()
    );
    if (provider) return provider;
    throw new CommandLlmUnavailableError(
      'command',
      'set AETHER_COMMAND_PROVIDER to anthropic, openai, or deepseek and configure the matching API key'
    );
  }
  const provider = FACTORIES[id]({ allowSharedModel: true });
  if (!provider.isAvailable()) {
    throw new CommandLlmUnavailableError(id, provider.getAvailabilityIssue());
  }
  return provider;
}

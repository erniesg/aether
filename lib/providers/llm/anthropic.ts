import Anthropic from '@anthropic-ai/sdk';
import {
  CommandLlmError,
  CommandLlmUnavailableError,
  type CommandLlmMessage,
  type CommandLlmProvider,
  type CommandToolCall,
  type CommandToolDefinition,
  type JsonCompletionRequest,
  type JsonCompletionResult,
  type ToolCompletionRequest,
  type ToolCompletionResult,
} from './types';
import { parseJsonFromText } from './json';

export const ANTHROPIC_COMMAND_MODELS = [
  'claude-opus-4-7',
  'claude-sonnet-4-5',
] as const;

function supportsTemperature(model: string): boolean {
  return model !== 'claude-opus-4-7';
}

interface AnthropicProviderOptions {
  apiKey?: string;
  model?: string;
  client?: Anthropic;
  allowSharedModel?: boolean;
}

function toAnthropicTools(
  tools: ReadonlyArray<CommandToolDefinition>
): Anthropic.Messages.Tool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema as Anthropic.Messages.Tool['input_schema'],
  }));
}

function toAnthropicMessages(
  messages: ReadonlyArray<CommandLlmMessage>
): Anthropic.Messages.MessageParam[] {
  const out: Anthropic.Messages.MessageParam[] = [];
  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i];
    if (message.role === 'user') {
      out.push({ role: 'user', content: [{ type: 'text', text: message.content }] });
      continue;
    }
    if (message.role === 'assistant') {
      const content: Anthropic.Messages.ContentBlockParam[] = [];
      if (message.content?.trim()) {
        content.push({ type: 'text', text: message.content });
      }
      for (const call of message.toolCalls ?? []) {
        content.push({
          type: 'tool_use',
          id: call.id,
          name: call.name,
          input: call.input as Anthropic.Messages.ToolUseBlockParam['input'],
        });
      }
      out.push({
        role: 'assistant',
        content: content.length > 0 ? content : [{ type: 'text', text: '' }],
      });
      continue;
    }

    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
    while (i < messages.length && messages[i].role === 'tool') {
      const toolMessage = messages[i] as Extract<CommandLlmMessage, { role: 'tool' }>;
      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolMessage.toolCallId,
        content: toolMessage.content,
        ...(toolMessage.isError ? { is_error: true } : {}),
      });
      i += 1;
    }
    i -= 1;
    out.push({ role: 'user', content: toolResults });
  }
  return out;
}

function parseToolCalls(content: unknown): {
  text: string;
  toolCalls: CommandToolCall[];
} {
  const blocks = Array.isArray(content) ? (content as Array<Record<string, unknown>>) : [];
  const text: string[] = [];
  const toolCalls: CommandToolCall[] = [];
  for (const block of blocks) {
    if (block.type === 'text' && typeof block.text === 'string') {
      text.push(block.text);
      continue;
    }
    if (block.type === 'tool_use' && typeof block.name === 'string') {
      toolCalls.push({
        id: typeof block.id === 'string' ? block.id : `tool_${block.name}_${toolCalls.length}`,
        name: block.name,
        input: block.input ?? {},
      });
    }
  }
  return { text: text.join('\n').trim(), toolCalls };
}

export function createAnthropicCommandProvider(
  options: AnthropicProviderOptions = {}
): CommandLlmProvider {
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
  const configuredModel =
    options.model ??
    (options.allowSharedModel === false ? undefined : process.env.AETHER_COMMAND_MODEL) ??
    process.env.ANTHROPIC_COMMAND_MODEL ??
    process.env.ANTHROPIC_MODEL;
  const client = options.client ?? (apiKey ? new Anthropic({ apiKey }) : undefined);

  return {
    id: 'anthropic',
    displayName: 'Claude',
    isAvailable: () => Boolean(apiKey || options.client),
    getAvailabilityIssue: () =>
      apiKey || options.client ? undefined : 'ANTHROPIC_API_KEY not set',
    listModels: () => [...ANTHROPIC_COMMAND_MODELS],
    async completeJson<T = unknown>(
      request: JsonCompletionRequest
    ): Promise<JsonCompletionResult<T>> {
      if (!client) {
        throw new CommandLlmUnavailableError(
          'anthropic',
          'ANTHROPIC_API_KEY not set'
        );
      }
      const model = request.model ?? configuredModel ?? ANTHROPIC_COMMAND_MODELS[0];
      let msg: Awaited<ReturnType<Anthropic['messages']['create']>>;
      try {
        msg = await client.messages.create({
          model,
          max_tokens: 2048,
          ...(supportsTemperature(model)
            ? { temperature: request.temperature ?? 0 }
            : {}),
          system: request.system,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `${request.user}\n\nReturn only valid JSON.`,
                },
              ],
            },
          ],
        });
      } catch (err) {
        throw new CommandLlmError('request failed', 'anthropic', err);
      }
      const { text } = parseToolCalls(msg.content);
      if (!text) throw new CommandLlmError('empty response', 'anthropic');
      return {
        json: parseJsonFromText<T>(text),
        text,
        provider: { id: 'anthropic', model },
      };
    },
    async completeToolCall(
      request: ToolCompletionRequest
    ): Promise<ToolCompletionResult> {
      if (!client) {
        throw new CommandLlmUnavailableError(
          'anthropic',
          'ANTHROPIC_API_KEY not set'
        );
      }
      const model = request.model ?? configuredModel ?? ANTHROPIC_COMMAND_MODELS[0];
      let msg: Awaited<ReturnType<Anthropic['messages']['create']>>;
      try {
        msg = await client.messages.create({
          model,
          max_tokens: request.maxTokens ?? 2048,
          ...(supportsTemperature(model)
            ? { temperature: request.temperature ?? 0 }
            : {}),
          system: [
            {
              type: 'text',
              text: request.system,
              cache_control: { type: 'ephemeral' },
            },
          ],
          tools: toAnthropicTools(request.tools),
          messages: toAnthropicMessages(request.messages),
        });
      } catch (err) {
        throw new CommandLlmError('request failed', 'anthropic', err);
      }
      const parsed = parseToolCalls(msg.content);
      return {
        text: parsed.text,
        toolCalls: parsed.toolCalls,
        stopReason: msg.stop_reason ?? null,
        provider: { id: 'anthropic', model },
      };
    },
  };
}

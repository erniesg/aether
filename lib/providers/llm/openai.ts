import {
  CommandLlmError,
  CommandLlmUnavailableError,
  type CommandLlmMessage,
  type CommandLlmProvider,
  type CommandToolCall,
  type JsonCompletionRequest,
  type JsonCompletionResult,
  type ToolCompletionRequest,
  type ToolCompletionResult,
} from './types';
import { parseJsonFromText } from './json';

export const OPENAI_COMMAND_MODELS = ['gpt-4.1-mini', 'gpt-4.1'] as const;

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

interface OpenAiProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  allowSharedModel?: boolean;
}

interface OpenAiToolCallResponse {
  id?: string;
  type?: 'function';
  function?: {
    name?: string;
    arguments?: string;
  };
}

interface OpenAiResponse {
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: string | null;
      tool_calls?: OpenAiToolCallResponse[];
    };
  }>;
  error?: {
    message?: string;
  };
}

type OpenAiMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | {
      role: 'assistant';
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }>;
    }
  | { role: 'tool'; tool_call_id: string; content: string };

function stringifyToolInput(input: unknown): string {
  if (typeof input === 'string') return input;
  return JSON.stringify(input ?? {});
}

function parseToolInput(value: string | undefined): unknown {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function toOpenAiMessages(messages: ReadonlyArray<CommandLlmMessage>): OpenAiMessage[] {
  return messages.map((message): OpenAiMessage => {
    switch (message.role) {
      case 'user':
        return { role: 'user', content: message.content };
      case 'assistant': {
        const toolCalls = (message.toolCalls ?? []).map((call) => ({
          id: call.id,
          type: 'function' as const,
          function: {
            name: call.name,
            arguments: stringifyToolInput(call.input),
          },
        }));
        return {
          role: 'assistant',
          content: message.content?.trim() ? message.content : null,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        };
      }
      case 'tool':
        return {
          role: 'tool',
          tool_call_id: message.toolCallId,
          content: message.content,
        };
    }
  });
}

function parseToolCalls(calls: OpenAiToolCallResponse[] | undefined): CommandToolCall[] {
  return (calls ?? []).flatMap((call, index) => {
    const name = call.function?.name;
    if (!name) return [];
    return [
      {
        id: call.id ?? `tool_${name}_${index}`,
        name,
        input: parseToolInput(call.function?.arguments),
      },
    ];
  });
}

export function createOpenAiCommandProvider(
  options: OpenAiProviderOptions = {}
): CommandLlmProvider {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  const baseUrl = (options.baseUrl ?? process.env.OPENAI_BASE_URL ?? DEFAULT_BASE_URL)
    .replace(/\/+$/, '');
  const configuredModel =
    options.model ??
    (options.allowSharedModel === false ? undefined : process.env.AETHER_COMMAND_MODEL) ??
    process.env.OPENAI_COMMAND_MODEL ??
    process.env.OPENAI_MODEL;
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    id: 'openai',
    displayName: 'OpenAI',
    isAvailable: () => Boolean(apiKey),
    getAvailabilityIssue: () =>
      apiKey ? undefined : 'OPENAI_API_KEY not set',
    listModels: () => [...OPENAI_COMMAND_MODELS],
    async completeJson<T = unknown>(
      request: JsonCompletionRequest
    ): Promise<JsonCompletionResult<T>> {
      if (!apiKey) {
        throw new CommandLlmUnavailableError('openai', 'OPENAI_API_KEY not set');
      }
      const model = request.model ?? configuredModel ?? OPENAI_COMMAND_MODELS[0];
      const res = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: request.system },
            { role: 'user', content: request.user },
          ],
          response_format: { type: 'json_object' },
          temperature: request.temperature ?? 0,
          stream: false,
        }),
      });
      let json: OpenAiResponse;
      try {
        json = (await res.json()) as OpenAiResponse;
      } catch (err) {
        throw new CommandLlmError('invalid JSON response', 'openai', err);
      }
      if (!res.ok) {
        throw new CommandLlmError(
          json.error?.message ?? `request failed (${res.status})`,
          'openai'
        );
      }
      const text = json.choices?.[0]?.message?.content?.trim() ?? '';
      if (!text) throw new CommandLlmError('empty response', 'openai');
      return {
        json: parseJsonFromText<T>(text),
        text,
        provider: { id: 'openai', model },
      };
    },
    async completeToolCall(
      request: ToolCompletionRequest
    ): Promise<ToolCompletionResult> {
      if (!apiKey) {
        throw new CommandLlmUnavailableError('openai', 'OPENAI_API_KEY not set');
      }
      const model = request.model ?? configuredModel ?? OPENAI_COMMAND_MODELS[0];
      const res = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: request.system },
            ...toOpenAiMessages(request.messages),
          ],
          tools: request.tools.map((tool) => ({
            type: 'function',
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.inputSchema,
            },
          })),
          tool_choice: 'auto',
          temperature: request.temperature ?? 0,
          max_tokens: request.maxTokens ?? 2048,
          stream: false,
        }),
      });
      let json: OpenAiResponse;
      try {
        json = (await res.json()) as OpenAiResponse;
      } catch (err) {
        throw new CommandLlmError('invalid JSON response', 'openai', err);
      }
      if (!res.ok) {
        throw new CommandLlmError(
          json.error?.message ?? `request failed (${res.status})`,
          'openai'
        );
      }
      const choice = json.choices?.[0];
      const message = choice?.message;
      return {
        text: message?.content?.trim() ?? '',
        toolCalls: parseToolCalls(message?.tool_calls),
        stopReason: choice?.finish_reason ?? null,
        provider: { id: 'openai', model },
      };
    },
  };
}

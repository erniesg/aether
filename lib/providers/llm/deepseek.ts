import {
  CommandLlmError,
  CommandLlmUnavailableError,
  type CommandLlmProvider,
  type CommandLlmMessage,
  type CommandToolCall,
  type JsonCompletionRequest,
  type JsonCompletionResult,
  type ToolCompletionRequest,
  type ToolCompletionResult,
} from './types';
import { parseJsonFromText } from './json';

export const DEEPSEEK_V4_MODELS = [
  'deepseek-v4-flash',
  'deepseek-v4-pro',
] as const;

const DEFAULT_BASE_URL = 'https://api.deepseek.com';

interface DeepSeekProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  allowSharedModel?: boolean;
}

interface DeepSeekToolCallResponse {
  id?: string;
  type?: 'function';
  function?: {
    name?: string;
    arguments?: string;
  };
}

interface DeepSeekResponse {
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: string;
      reasoning_content?: string;
      tool_calls?: DeepSeekToolCallResponse[];
    };
  }>;
  error?: {
    message?: string;
  };
}

type DeepSeekMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | {
      role: 'assistant';
      content: string | null;
      reasoning_content?: string;
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

function toDeepSeekMessages(messages: ReadonlyArray<CommandLlmMessage>): DeepSeekMessage[] {
  return messages.map((message): DeepSeekMessage => {
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
          ...(message.reasoningContent?.trim()
            ? { reasoning_content: message.reasoningContent }
            : {}),
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

function parseToolCalls(calls: DeepSeekToolCallResponse[] | undefined): CommandToolCall[] {
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

export function createDeepSeekProvider(
  options: DeepSeekProviderOptions = {}
): CommandLlmProvider {
  const apiKey = options.apiKey ?? process.env.DEEPSEEK_API_KEY;
  const baseUrl = (options.baseUrl ?? process.env.DEEPSEEK_BASE_URL ?? DEFAULT_BASE_URL)
    .replace(/\/+$/, '');
  const configuredModel =
    options.model ??
    (options.allowSharedModel === false ? undefined : process.env.AETHER_COMMAND_MODEL) ??
    process.env.DEEPSEEK_MODEL;
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    id: 'deepseek',
    displayName: 'DeepSeek',
    isAvailable: () => Boolean(apiKey),
    getAvailabilityIssue: () =>
      apiKey ? undefined : 'DEEPSEEK_API_KEY not set',
    listModels: () => [...DEEPSEEK_V4_MODELS],
    async completeJson<T = unknown>(
      request: JsonCompletionRequest
    ): Promise<JsonCompletionResult<T>> {
      if (!apiKey) {
        throw new CommandLlmUnavailableError(
          'deepseek',
          'DEEPSEEK_API_KEY not set'
        );
      }
      const model =
        request.model ?? configuredModel ?? DEEPSEEK_V4_MODELS[0];
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
          temperature: request.temperature ?? 0,
          response_format: { type: 'json_object' },
          stream: false,
        }),
      });
      let json: DeepSeekResponse;
      try {
        json = (await res.json()) as DeepSeekResponse;
      } catch (err) {
        throw new CommandLlmError('invalid JSON response', 'deepseek', err);
      }
      if (!res.ok) {
        throw new CommandLlmError(
          json.error?.message ?? `request failed (${res.status})`,
          'deepseek'
        );
      }
      const text = json.choices?.[0]?.message?.content?.trim() ?? '';
      if (!text) throw new CommandLlmError('empty response', 'deepseek');
      return {
        json: parseJsonFromText<T>(text),
        text,
        provider: { id: 'deepseek', model },
      };
    },
    async completeToolCall(
      request: ToolCompletionRequest
    ): Promise<ToolCompletionResult> {
      if (!apiKey) {
        throw new CommandLlmUnavailableError(
          'deepseek',
          'DEEPSEEK_API_KEY not set'
        );
      }
      const model =
        request.model ?? configuredModel ?? DEEPSEEK_V4_MODELS[0];
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
            ...toDeepSeekMessages(request.messages),
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
      let json: DeepSeekResponse;
      try {
        json = (await res.json()) as DeepSeekResponse;
      } catch (err) {
        throw new CommandLlmError('invalid JSON response', 'deepseek', err);
      }
      if (!res.ok) {
        throw new CommandLlmError(
          json.error?.message ?? `request failed (${res.status})`,
          'deepseek'
        );
      }
      const choice = json.choices?.[0];
      const message = choice?.message;
      const text = message?.content?.trim() ?? '';
      return {
        text,
        toolCalls: parseToolCalls(message?.tool_calls),
        stopReason: choice?.finish_reason ?? null,
        ...(message?.reasoning_content
          ? { reasoningContent: message.reasoning_content }
          : {}),
        provider: { id: 'deepseek', model },
      };
    },
  };
}

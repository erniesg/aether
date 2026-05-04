export type CommandLlmProviderId = 'anthropic' | 'openai' | 'deepseek';

export interface JsonCompletionRequest {
  system: string;
  user: string;
  model?: string;
  temperature?: number;
}

export interface JsonCompletionResult<T = unknown> {
  json: T;
  text: string;
  provider: {
    id: CommandLlmProviderId;
    model: string;
  };
}

export interface CommandToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface CommandToolCall {
  id: string;
  name: string;
  input: unknown;
}

export type CommandLlmMessage =
  | { role: 'user'; content: string }
  | {
      role: 'assistant';
      content?: string;
      toolCalls?: ReadonlyArray<CommandToolCall>;
      reasoningContent?: string;
    }
  | {
      role: 'tool';
      toolCallId: string;
      name: string;
      content: string;
      isError?: boolean;
    };

export interface ToolCompletionRequest {
  system: string;
  messages: ReadonlyArray<CommandLlmMessage>;
  tools: ReadonlyArray<CommandToolDefinition>;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ToolCompletionResult {
  text: string;
  toolCalls: CommandToolCall[];
  stopReason: string | null;
  reasoningContent?: string;
  provider: {
    id: CommandLlmProviderId;
    model: string;
  };
}

export interface CommandLlmProvider {
  id: CommandLlmProviderId;
  displayName: string;
  isAvailable(): boolean;
  getAvailabilityIssue(): string | undefined;
  listModels(): string[];
  completeJson<T = unknown>(
    request: JsonCompletionRequest
  ): Promise<JsonCompletionResult<T>>;
  completeToolCall?(
    request: ToolCompletionRequest
  ): Promise<ToolCompletionResult>;
}

export class CommandLlmUnavailableError extends Error {
  constructor(providerId: string, hint?: string) {
    super(
      hint
        ? `command LLM provider '${providerId}' is unavailable: ${hint}`
        : `command LLM provider '${providerId}' is unavailable`
    );
    this.name = 'CommandLlmUnavailableError';
  }
}

export class CommandLlmError extends Error {
  constructor(
    message: string,
    public readonly providerId: string,
    public readonly cause?: unknown
  ) {
    super(`${providerId}: ${message}`);
    this.name = 'CommandLlmError';
  }
}

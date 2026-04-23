/**
 * Voice transport contract. Phase 1: press-to-talk, transcripts, function
 * calls. Generation-via-voice and ambient listening are later phases and
 * belong in a new call shape — don't retrofit them here.
 *
 * The interface is provider-agnostic on purpose: OpenAI Realtime is the first
 * adapter, Gemini Live is expected to slot in behind the same surface.
 */

export type VoiceProviderId = 'openai-realtime' | 'gemini-live';

export type VoiceOrbState = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface VoiceSessionCredentials {
  /**
   * Provider-specific session id. For OpenAI, the session returned from
   * `/v1/realtime/sessions`.
   */
  sessionId: string;
  /**
   * Short-lived client token. For OpenAI this is `client_secret.value`. Never
   * the primary API key — the server mints this on every connect.
   */
  clientSecret: string;
  /** Epoch ms at which the ephemeral secret expires. */
  expiresAt: number;
  /** Model the server minted the session against. */
  model: string;
  /** Voice id the realtime model will speak in. */
  voice: string;
  /** Provider id echoed back for the client to pick the right adapter. */
  provider: VoiceProviderId;
}

export interface VoiceTranscriptEvent {
  /** 'partial' fires repeatedly; 'final' fires once with the full turn. */
  kind: 'partial' | 'final';
  /** Who spoke — the creator or the model. */
  speaker: 'user' | 'assistant';
  text: string;
  /** Epoch ms the event reached the client. */
  at: number;
}

export interface VoiceFunctionCallEvent {
  /** Provider call id — used to return the result for the same turn. */
  callId: string;
  /** Tool name — matches an entry in `VOICE_TOOL_DEFINITIONS`. */
  name: string;
  /** Parsed JSON arguments. Providers stream JSON; the adapter parses. */
  arguments: Record<string, unknown>;
  /** Epoch ms the event reached the client. */
  at: number;
}

export interface VoiceOrbStateEvent {
  state: VoiceOrbState;
  at: number;
}

export interface VoiceConnectOptions {
  /**
   * URL of the server endpoint that mints ephemeral credentials. Defaults to
   * `/api/voice/session` but the tests override it for stubbed transport.
   */
  sessionEndpoint?: string;
  /**
   * If provided, the client uses these credentials directly instead of
   * fetching them. Tests rely on this to stub out network I/O entirely.
   */
  credentials?: VoiceSessionCredentials;
  /** Optional abort signal to cancel the connection handshake. */
  signal?: AbortSignal;
}

export interface VoiceFunctionResult {
  callId: string;
  output: unknown;
}

/**
 * Thin WebRTC client surface. Every method maps to a single realtime verb.
 * `sendText` exists so the Playwright harness can drive a transcript without
 * a real microphone; production code paths go through `connect` + mic audio.
 */
export interface VoiceProvider {
  readonly id: VoiceProviderId;
  connect(options?: VoiceConnectOptions): Promise<void>;
  disconnect(): void;
  isConnected(): boolean;
  /**
   * Push raw creator text through the realtime channel. Used by tests and by
   * the keyboard fallback when the mic is denied.
   */
  sendText(text: string): void;
  /**
   * Complete a function call with the handler's result so the realtime model
   * can incorporate it into its next spoken turn.
   */
  sendFunctionResult(result: VoiceFunctionResult): void;
  onTranscript(listener: (event: VoiceTranscriptEvent) => void): () => void;
  onFunctionCall(listener: (event: VoiceFunctionCallEvent) => void): () => void;
  onStateChange(listener: (event: VoiceOrbStateEvent) => void): () => void;
  onError(listener: (error: Error) => void): () => void;
}

/**
 * JSON-schema-ish shape used by both OpenAI Realtime and Gemini Live tool
 * declarations. Keep the subset narrow — realtime providers don't support
 * the full JSON Schema dialect.
 */
export interface VoiceToolSchema {
  type: 'object';
  properties: Record<string, VoiceToolProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface VoiceToolProperty {
  type: 'string' | 'number' | 'boolean';
  description?: string;
  enum?: ReadonlyArray<string>;
}

export interface VoiceToolDefinition {
  name: string;
  description: string;
  parameters: VoiceToolSchema;
}

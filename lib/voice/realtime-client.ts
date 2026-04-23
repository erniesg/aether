/**
 * OpenAI Realtime adapter for the VoiceProvider contract.
 *
 * Phase 1 transport: WebRTC mic → realtime model, a single data channel for
 * control events (session.update, conversation.item.create, response.create,
 * output_audio_buffer deltas, function-call invocations).
 *
 * The client never talks to the OpenAI primary key. It pulls an ephemeral
 * `client_secret` from /api/voice/session and uses it as the bearer token
 * for the SDP handshake at `https://api.openai.com/v1/realtime`.
 *
 * Gemini Live will be a sibling module implementing the same VoiceProvider
 * surface; nothing in this file is OpenAI-specific beyond the SDP endpoint
 * and control-event parsing.
 */

import { VOICE_TOOL_DEFINITIONS } from './tools';
import type {
  VoiceConnectOptions,
  VoiceFunctionCallEvent,
  VoiceFunctionResult,
  VoiceOrbStateEvent,
  VoiceProvider,
  VoiceSessionCredentials,
  VoiceTranscriptEvent,
} from './types';

const OPENAI_REALTIME_SDP_URL = 'https://api.openai.com/v1/realtime';

interface Listeners {
  transcript: Set<(event: VoiceTranscriptEvent) => void>;
  fn: Set<(event: VoiceFunctionCallEvent) => void>;
  state: Set<(event: VoiceOrbStateEvent) => void>;
  error: Set<(error: Error) => void>;
}

function createListeners(): Listeners {
  return {
    transcript: new Set(),
    fn: new Set(),
    state: new Set(),
    error: new Set(),
  };
}

/**
 * Dependencies injected for testability. In production these resolve to the
 * browser globals; tests pass stubs that drive the state machine
 * synchronously.
 */
export interface RealtimeClientDeps {
  /**
   * Returns the audio track that will be attached to the peer connection.
   * In production wraps `getUserMedia`; tests pass a dummy track.
   */
  getMicStream?: () => Promise<MediaStream>;
  /** Constructs a peer connection. Default: `new RTCPeerConnection()`. */
  createPeerConnection?: () => RTCPeerConnection;
  /** Fetches ephemeral creds from the Next.js route. */
  fetchSession?: (endpoint: string) => Promise<VoiceSessionCredentials>;
  /** Performs the SDP exchange with the realtime endpoint. */
  sdpExchange?: (
    offerSdp: string,
    credentials: VoiceSessionCredentials
  ) => Promise<string>;
}

export interface OpenAIRealtimeClientOptions {
  deps?: RealtimeClientDeps;
}

export class OpenAIRealtimeClient implements VoiceProvider {
  readonly id = 'openai-realtime' as const;

  private listeners = createListeners();
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private mic: MediaStream | null = null;
  private remote: HTMLAudioElement | null = null;
  private connected = false;
  private deps: Required<RealtimeClientDeps>;

  constructor(options: OpenAIRealtimeClientOptions = {}) {
    this.deps = {
      getMicStream:
        options.deps?.getMicStream ?? defaultGetMicStream,
      createPeerConnection:
        options.deps?.createPeerConnection ?? defaultCreatePeerConnection,
      fetchSession: options.deps?.fetchSession ?? defaultFetchSession,
      sdpExchange: options.deps?.sdpExchange ?? defaultSdpExchange,
    };
  }

  async connect(options: VoiceConnectOptions = {}): Promise<void> {
    if (this.connected) return;
    const endpoint = options.sessionEndpoint ?? '/api/voice/session';
    const credentials =
      options.credentials ?? (await this.deps.fetchSession(endpoint));

    if (options.signal?.aborted) {
      throw new DOMException('voice connect aborted', 'AbortError');
    }

    const pc = this.deps.createPeerConnection();
    this.pc = pc;

    const dc = pc.createDataChannel('oai-events');
    this.dc = dc;
    dc.addEventListener('message', (event) =>
      this.handleDataChannelMessage(event.data)
    );
    dc.addEventListener('open', () => {
      this.sendSessionUpdate();
      this.emitState('idle');
    });
    dc.addEventListener('error', (event) => {
      const err = (event as RTCErrorEvent).error ?? new Error('data channel error');
      this.emitError(err instanceof Error ? err : new Error(String(err)));
    });

    const mic = await this.deps.getMicStream();
    this.mic = mic;
    for (const track of mic.getAudioTracks()) pc.addTrack(track, mic);

    pc.addEventListener('track', (event) => {
      if (!this.remote) {
        this.remote = new Audio();
        this.remote.autoplay = true;
      }
      this.remote.srcObject = event.streams[0] ?? null;
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    if (!offer.sdp) throw new Error('voice: local description missing SDP');

    const answerSdp = await this.deps.sdpExchange(offer.sdp, credentials);
    await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

    this.connected = true;
  }

  disconnect(): void {
    this.connected = false;
    try {
      this.dc?.close();
    } catch {
      // ignore
    }
    try {
      this.pc?.close();
    } catch {
      // ignore
    }
    this.mic?.getTracks().forEach((t) => t.stop());
    this.dc = null;
    this.pc = null;
    this.mic = null;
    this.remote = null;
  }

  isConnected(): boolean {
    return this.connected;
  }

  sendText(text: string): void {
    this.sendEvent({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }],
      },
    });
    this.sendEvent({ type: 'response.create' });
  }

  sendFunctionResult(result: VoiceFunctionResult): void {
    this.sendEvent({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: result.callId,
        output: JSON.stringify(result.output ?? {}),
      },
    });
    this.sendEvent({ type: 'response.create' });
  }

  onTranscript(listener: (event: VoiceTranscriptEvent) => void): () => void {
    return subscribe(this.listeners.transcript, listener);
  }

  onFunctionCall(listener: (event: VoiceFunctionCallEvent) => void): () => void {
    return subscribe(this.listeners.fn, listener);
  }

  onStateChange(listener: (event: VoiceOrbStateEvent) => void): () => void {
    return subscribe(this.listeners.state, listener);
  }

  onError(listener: (error: Error) => void): () => void {
    return subscribe(this.listeners.error, listener);
  }

  /** Test hook: feed a raw realtime event as if the data channel received it. */
  __injectEventForTests(raw: string | Record<string, unknown>): void {
    this.handleDataChannelMessage(
      typeof raw === 'string' ? raw : JSON.stringify(raw)
    );
  }

  private sendEvent(event: Record<string, unknown>): void {
    if (!this.dc || this.dc.readyState !== 'open') return;
    this.dc.send(JSON.stringify(event));
  }

  private sendSessionUpdate(): void {
    this.sendEvent({
      type: 'session.update',
      session: {
        modalities: ['audio', 'text'],
        instructions:
          "You are aether's voice companion. Keep replies brief and call tools eagerly rather than narrating.",
        turn_detection: { type: 'server_vad' },
        input_audio_transcription: { model: 'whisper-1' },
        tools: VOICE_TOOL_DEFINITIONS.map((t) => ({
          type: 'function',
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
        tool_choice: 'auto',
      },
    });
  }

  private handleDataChannelMessage(raw: unknown): void {
    if (typeof raw !== 'string') return;
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(raw) as Record<string, unknown>;
    } catch (err) {
      this.emitError(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    const type = typeof payload.type === 'string' ? payload.type : '';
    const now = Date.now();

    switch (type) {
      case 'input_audio_buffer.speech_started':
        this.emitState('listening');
        return;
      case 'input_audio_buffer.speech_stopped':
      case 'response.created':
        this.emitState('thinking');
        return;
      case 'response.audio.delta':
      case 'response.output_audio.delta':
        this.emitState('speaking');
        return;
      case 'response.done':
      case 'response.output_audio.done':
        this.emitState('idle');
        return;

      case 'conversation.item.input_audio_transcription.completed':
      case 'response.audio_transcript.delta':
      case 'response.audio_transcript.done':
      case 'response.output_text.delta':
      case 'response.output_text.done': {
        const text =
          typeof payload.transcript === 'string'
            ? payload.transcript
            : typeof payload.delta === 'string'
            ? payload.delta
            : typeof payload.text === 'string'
            ? payload.text
            : '';
        if (!text) return;
        const speaker: VoiceTranscriptEvent['speaker'] = type.startsWith(
          'response.'
        )
          ? 'assistant'
          : 'user';
        const kind: VoiceTranscriptEvent['kind'] = type.endsWith('.done')
          ? 'final'
          : type.endsWith('.completed')
          ? 'final'
          : 'partial';
        this.emitTranscript({ kind, speaker, text, at: now });
        return;
      }

      case 'response.function_call_arguments.done': {
        const name = typeof payload.name === 'string' ? payload.name : '';
        const callId =
          typeof payload.call_id === 'string' ? payload.call_id : '';
        let args: Record<string, unknown> = {};
        if (typeof payload.arguments === 'string') {
          try {
            args = JSON.parse(payload.arguments) as Record<string, unknown>;
          } catch (err) {
            this.emitError(
              err instanceof Error
                ? err
                : new Error('voice: failed to parse function arguments')
            );
            return;
          }
        }
        if (!name || !callId) return;
        this.emitFn({ callId, name, arguments: args, at: now });
        return;
      }

      case 'error': {
        const message =
          typeof (payload.error as { message?: string } | undefined)?.message ===
          'string'
            ? (payload.error as { message: string }).message
            : 'realtime error';
        this.emitError(new Error(message));
        return;
      }
    }
  }

  private emitTranscript(event: VoiceTranscriptEvent): void {
    for (const listener of this.listeners.transcript) safeCall(() => listener(event));
  }

  private emitFn(event: VoiceFunctionCallEvent): void {
    for (const listener of this.listeners.fn) safeCall(() => listener(event));
  }

  private emitState(state: VoiceOrbStateEvent['state']): void {
    const event: VoiceOrbStateEvent = { state, at: Date.now() };
    for (const listener of this.listeners.state) safeCall(() => listener(event));
  }

  private emitError(err: Error): void {
    for (const listener of this.listeners.error) safeCall(() => listener(err));
  }
}

function subscribe<T>(set: Set<T>, listener: T): () => void {
  set.add(listener);
  return () => {
    set.delete(listener);
  };
}

function safeCall(fn: () => void): void {
  try {
    fn();
  } catch (err) {
    if (typeof console !== 'undefined') console.error('[voice] listener threw:', err);
  }
}

async function defaultGetMicStream(): Promise<MediaStream> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
    throw new Error('voice: mediaDevices unavailable in this environment');
  }
  return navigator.mediaDevices.getUserMedia({ audio: true });
}

function defaultCreatePeerConnection(): RTCPeerConnection {
  if (typeof RTCPeerConnection === 'undefined') {
    throw new Error('voice: RTCPeerConnection unavailable in this environment');
  }
  return new RTCPeerConnection();
}

async function defaultFetchSession(
  endpoint: string
): Promise<VoiceSessionCredentials> {
  const res = await fetch(endpoint, { method: 'POST' });
  if (!res.ok) {
    throw new Error(`voice: session endpoint returned ${res.status}`);
  }
  const json = (await res.json()) as { ok?: boolean; session?: VoiceSessionCredentials; error?: string };
  if (!json.ok || !json.session) {
    throw new Error(json.error ?? 'voice: session endpoint returned no session');
  }
  return json.session;
}

async function defaultSdpExchange(
  offerSdp: string,
  credentials: VoiceSessionCredentials
): Promise<string> {
  const url = `${OPENAI_REALTIME_SDP_URL}?model=${encodeURIComponent(
    credentials.model
  )}`;
  const res = await fetch(url, {
    method: 'POST',
    body: offerSdp,
    headers: {
      Authorization: `Bearer ${credentials.clientSecret}`,
      'Content-Type': 'application/sdp',
    },
  });
  if (!res.ok) {
    throw new Error(`voice: SDP exchange failed (${res.status})`);
  }
  return res.text();
}

/**
 * Resolve the right voice provider given the current env config. Gemini Live
 * is a planned sibling — add it here when the adapter lands.
 */
export function createVoiceProvider(
  providerId: string = 'openai-realtime',
  options: OpenAIRealtimeClientOptions = {}
): VoiceProvider {
  if (providerId === 'openai-realtime') return new OpenAIRealtimeClient(options);
  throw new Error(`voice: unsupported provider "${providerId}"`);
}

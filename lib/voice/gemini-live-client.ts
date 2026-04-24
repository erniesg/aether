import type {
  FunctionDeclaration,
  LiveCallbacks,
  LiveServerMessage,
  Modality,
  Schema,
} from '@google/genai/web';
import { VOICE_TOOL_DEFINITIONS } from './tools';
import { fetchVoiceSession } from './session-client';
import type {
  VoiceConnectOptions,
  VoiceFunctionCallEvent,
  VoiceFunctionResult,
  VoiceOrbStateEvent,
  VoiceProvider,
  VoiceToolProperty,
  VoiceToolSchema,
  VoiceSessionCredentials,
  VoiceTranscriptEvent,
} from './types';

interface Listeners {
  transcript: Set<(event: VoiceTranscriptEvent) => void>;
  fn: Set<(event: VoiceFunctionCallEvent) => void>;
  state: Set<(event: VoiceOrbStateEvent) => void>;
  error: Set<(error: Error) => void>;
}

interface RecorderChunk {
  mimeType: string;
  data: string;
}

type GeminiLiveMessage = Pick<
  LiveServerMessage,
  'setupComplete' | 'serverContent' | 'toolCall' | 'toolCallCancellation'
>;

interface GeminiLiveSessionLike {
  close(): void;
  sendClientContent(params: {
    turns?: Array<{ role: 'user'; parts: Array<{ text: string }> }>;
    turnComplete?: boolean;
  }): void;
  sendRealtimeInput(params: {
    audio?: { data?: string; mimeType?: string };
    audioStreamEnd?: boolean;
    text?: string;
  }): void;
  sendToolResponse(params: {
    functionResponses: Array<{
      id?: string;
      name?: string;
      response?: Record<string, unknown>;
    }>;
  }): void;
}

interface GeminiAudioRecorder {
  start(): Promise<void>;
  stop(): void;
}

interface GeminiAudioPlayer {
  onComplete: () => void;
  resume(): Promise<void>;
  enqueuePcm16(buffer: ArrayBuffer): void;
  stop(): void;
  complete(): void;
}

export interface GeminiLiveClientDeps {
  fetchSession?: (endpoint: string) => Promise<VoiceSessionCredentials>;
  connectLiveSession?: (
    credentials: VoiceSessionCredentials,
    callbacks: LiveCallbacks
  ) => Promise<GeminiLiveSessionLike>;
  createRecorder?: (onChunk: (chunk: RecorderChunk) => void) => GeminiAudioRecorder;
  createPlayer?: () => GeminiAudioPlayer;
}

export interface GeminiLiveClientOptions {
  deps?: GeminiLiveClientDeps;
}

function createListeners(): Listeners {
  return {
    transcript: new Set(),
    fn: new Set(),
    state: new Set(),
    error: new Set(),
  };
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

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function float32ToPcm16Base64(chunk: Float32Array): string {
  const out = new Int16Array(chunk.length);
  for (let i = 0; i < chunk.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, chunk[i] ?? 0));
    out[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return arrayBufferToBase64(out.buffer);
}

function pcm16ToFloat32(buffer: ArrayBuffer): Float32Array {
  const view = new DataView(buffer);
  const out = new Float32Array(buffer.byteLength / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = view.getInt16(i * 2, true) / 0x8000;
  }
  return out;
}

function normalizeToolResponse(output: unknown): Record<string, unknown> {
  if (output && typeof output === 'object' && !Array.isArray(output)) {
    return output as Record<string, unknown>;
  }
  return { output };
}

function toGeminiScalarType(type: VoiceToolProperty['type']): Schema['type'] {
  switch (type) {
    case 'string':
      return 'STRING' as Schema['type'];
    case 'number':
      return 'NUMBER' as Schema['type'];
    case 'boolean':
      return 'BOOLEAN' as Schema['type'];
  }
}

function toGeminiSchema(schema: VoiceToolSchema): Schema {
  return {
    type: 'OBJECT' as Schema['type'],
    properties: Object.fromEntries(
      Object.entries(schema.properties).map(([name, property]) => [
        name,
        {
          type: toGeminiScalarType(property.type),
          description: property.description,
          ...(property.enum
            ? {
                format: 'enum',
                enum: [...property.enum],
              }
            : {}),
        } satisfies Schema,
      ])
    ),
    ...(schema.required?.length ? { required: [...schema.required] } : {}),
  };
}

function toGeminiFunctionDeclaration(tool: {
  name: string;
  description: string;
  parameters: VoiceToolSchema;
}): FunctionDeclaration {
  return {
    name: tool.name,
    description: tool.description,
    parameters: toGeminiSchema(tool.parameters),
  };
}

class BrowserPcmRecorder implements GeminiAudioRecorder {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private sink: GainNode | null = null;

  constructor(private readonly onChunk: (chunk: RecorderChunk) => void) {}

  async start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('voice: mediaDevices unavailable in this environment');
    }
    if (typeof AudioContext === 'undefined') {
      throw new Error('voice: AudioContext unavailable in this environment');
    }

    if (this.context) {
      await this.context.resume();
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Gemini Live expects 16kHz PCM input. Default AudioContext on most
    // machines (48kHz on Mac) produces audio Gemini transcribes as silence —
    // the user never sees a transcript despite the mic being active. Pin
    // the graph to 16kHz so the processor callback hands us correctly-rated
    // samples and our outgoing mimeType matches what Live expects.
    const context = new AudioContext({ sampleRate: 16000 });
    await context.resume();

    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(2048, 1, 1);
    const sink = context.createGain();
    sink.gain.value = 0;

    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      if (!input.length) return;
      this.onChunk({
        mimeType: `audio/pcm;rate=${context.sampleRate}`,
        data: float32ToPcm16Base64(input),
      });
    };

    source.connect(processor);
    processor.connect(sink);
    sink.connect(context.destination);

    this.stream = stream;
    this.context = context;
    this.source = source;
    this.processor = processor;
    this.sink = sink;
  }

  stop(): void {
    this.processor?.disconnect();
    this.source?.disconnect();
    this.sink?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    if (this.context) {
      void this.context.close().catch(() => {
        // ignore
      });
    }
    this.stream = null;
    this.context = null;
    this.source = null;
    this.processor = null;
    this.sink = null;
  }
}

class BrowserPcmPlayer implements GeminiAudioPlayer {
  onComplete = () => {};

  private context: AudioContext;
  private gain: GainNode;
  private queue: Float32Array[] = [];
  private scheduledTime = 0;
  private playing = false;
  private streamComplete = false;
  private scheduleTimer: ReturnType<typeof setTimeout> | null = null;
  private activeSources = new Set<AudioBufferSourceNode>();

  constructor() {
    if (typeof AudioContext === 'undefined') {
      throw new Error('voice: AudioContext unavailable in this environment');
    }
    this.context = new AudioContext({ sampleRate: 24000 });
    this.gain = this.context.createGain();
    this.gain.connect(this.context.destination);
  }

  async resume(): Promise<void> {
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
    this.gain.gain.setValueAtTime(1, this.context.currentTime);
  }

  enqueuePcm16(buffer: ArrayBuffer): void {
    this.streamComplete = false;
    this.queue.push(pcm16ToFloat32(buffer));
    if (!this.playing) {
      this.playing = true;
      this.scheduledTime = Math.max(
        this.context.currentTime + 0.08,
        this.context.currentTime
      );
    }
    this.schedule();
  }

  complete(): void {
    this.streamComplete = true;
    if (!this.queue.length && !this.activeSources.size) {
      this.finish();
    }
  }

  stop(): void {
    this.queue = [];
    this.streamComplete = true;
    this.playing = false;
    this.scheduledTime = this.context.currentTime;
    if (this.scheduleTimer) {
      clearTimeout(this.scheduleTimer);
      this.scheduleTimer = null;
    }
    for (const source of this.activeSources) {
      try {
        source.stop();
      } catch {
        // ignore
      }
      source.disconnect();
    }
    this.activeSources.clear();
    this.gain.gain.cancelScheduledValues(this.context.currentTime);
    this.gain.gain.setValueAtTime(0, this.context.currentTime);
  }

  private schedule(): void {
    const scheduleAhead = 0.2;
    while (
      this.queue.length > 0 &&
      this.scheduledTime < this.context.currentTime + scheduleAhead
    ) {
      const chunk = this.queue.shift()!;
      const buffer = this.context.createBuffer(1, chunk.length, 24000);
      buffer.getChannelData(0).set(chunk);

      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.gain);
      source.onended = () => {
        this.activeSources.delete(source);
        source.disconnect();
        if (this.streamComplete && !this.queue.length && !this.activeSources.size) {
          this.finish();
        }
      };

      const startAt = Math.max(this.scheduledTime, this.context.currentTime);
      this.activeSources.add(source);
      source.start(startAt);
      this.scheduledTime = startAt + buffer.duration;
    }

    if (this.queue.length > 0) {
      if (this.scheduleTimer) clearTimeout(this.scheduleTimer);
      const nextDelayMs = Math.max(
        16,
        (this.scheduledTime - this.context.currentTime - 0.05) * 1000
      );
      this.scheduleTimer = setTimeout(() => this.schedule(), nextDelayMs);
      return;
    }

    if (this.streamComplete && !this.activeSources.size) {
      this.finish();
    }
  }

  private finish(): void {
    if (!this.playing) return;
    this.playing = false;
    if (this.scheduleTimer) {
      clearTimeout(this.scheduleTimer);
      this.scheduleTimer = null;
    }
    this.onComplete();
  }
}

async function defaultConnectLiveSession(
  credentials: VoiceSessionCredentials,
  callbacks: LiveCallbacks
): Promise<GeminiLiveSessionLike> {
  const { GoogleGenAI } = await import('@google/genai/web');
  const client = new GoogleGenAI({
    apiKey: credentials.clientSecret,
    apiVersion: 'v1alpha',
  });
  return client.live.connect({
    model: credentials.model,
    config: {
      responseModalities: ['AUDIO' as Modality],
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: credentials.voice,
          },
        },
      },
      systemInstruction: {
        parts: [
          {
            text: "You are aether's voice companion. Keep replies brief and call tools eagerly rather than narrating.",
          },
        ],
      },
      tools: [
        {
          functionDeclarations: VOICE_TOOL_DEFINITIONS.map(
            toGeminiFunctionDeclaration
          ),
        },
      ],
    },
    callbacks,
  }) as Promise<GeminiLiveSessionLike>;
}

export class GeminiLiveClient implements VoiceProvider {
  readonly id = 'gemini-live' as const;

  private listeners = createListeners();
  private connected = false;
  private session: GeminiLiveSessionLike | null = null;
  private recorder: GeminiAudioRecorder | null = null;
  private player: GeminiAudioPlayer | null = null;
  private callNames = new Map<string, string>();
  private deps: Required<GeminiLiveClientDeps>;

  constructor(options: GeminiLiveClientOptions = {}) {
    this.deps = {
      fetchSession: options.deps?.fetchSession ?? fetchVoiceSession,
      connectLiveSession:
        options.deps?.connectLiveSession ?? defaultConnectLiveSession,
      createRecorder:
        options.deps?.createRecorder ??
        ((onChunk) => new BrowserPcmRecorder(onChunk)),
      createPlayer:
        options.deps?.createPlayer ?? (() => new BrowserPcmPlayer()),
    };
  }

  async connect(options: VoiceConnectOptions = {}): Promise<void> {
    if (this.connected) return;
    const endpoint = options.sessionEndpoint ?? '/api/voice/session';
    const credentials =
      options.credentials ?? (await this.deps.fetchSession(endpoint));

    if (credentials.provider !== 'gemini-live') {
      throw new Error(
        `voice: Gemini adapter received ${credentials.provider} credentials`
      );
    }

    if (options.signal?.aborted) {
      throw new DOMException('voice connect aborted', 'AbortError');
    }

    const player = this.deps.createPlayer();
    player.onComplete = () => {
      if (this.connected) this.emitState('idle');
    };

    try {
      await player.resume();
      const session = await this.deps.connectLiveSession(credentials, {
        onopen: () => {
          // wait for setupComplete before marking idle
        },
        onmessage: (message) => this.handleMessage(message),
        onerror: (event) => {
          const message =
            typeof event?.message === 'string' && event.message
              ? event.message
              : 'gemini live error';
          this.emitError(new Error(message));
        },
        onclose: () => {
          this.connected = false;
          this.emitState('idle');
        },
      });

      const recorder = this.deps.createRecorder((chunk) => {
        session.sendRealtimeInput({ audio: chunk });
        this.emitState('listening');
      });
      await recorder.start();

      this.player = player;
      this.session = session;
      this.recorder = recorder;
      this.connected = true;
    } catch (err) {
      player.stop();
      this.session?.close();
      this.session = null;
      this.player = null;
      this.recorder?.stop();
      this.recorder = null;
      throw err;
    }
  }

  disconnect(): void {
    this.connected = false;
    try {
      this.session?.sendRealtimeInput({ audioStreamEnd: true });
    } catch {
      // ignore
    }
    try {
      this.session?.close();
    } catch {
      // ignore
    }
    this.recorder?.stop();
    this.player?.stop();
    this.session = null;
    this.recorder = null;
    this.player = null;
    this.callNames.clear();
  }

  isConnected(): boolean {
    return this.connected;
  }

  sendText(text: string): void {
    if (!this.session) return;
    this.session.sendClientContent({
      turns: [
        {
          role: 'user',
          parts: [{ text }],
        },
      ],
      turnComplete: true,
    });
    this.emitState('thinking');
  }

  sendFunctionResult(result: VoiceFunctionResult): void {
    if (!this.session) return;
    const name = this.callNames.get(result.callId);
    this.session.sendToolResponse({
      functionResponses: [
        {
          id: result.callId,
          ...(name ? { name } : {}),
          response: normalizeToolResponse(result.output),
        },
      ],
    });
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

  /** Test hook: feed a raw Gemini live message without opening a websocket. */
  __injectMessageForTests(message: GeminiLiveMessage): void {
    this.handleMessage(message);
  }

  private handleMessage(message: GeminiLiveMessage): void {
    const now = Date.now();

    if (message.setupComplete) {
      this.emitState('idle');
      return;
    }

    if (message.toolCall?.functionCalls?.length) {
      for (const call of message.toolCall.functionCalls) {
        if (!call.id || !call.name) continue;
        this.callNames.set(call.id, call.name);
        this.emitFn({
          callId: call.id,
          name: call.name,
          arguments: call.args ?? {},
          at: now,
        });
      }
      this.emitState('thinking');
      return;
    }

    if (message.toolCallCancellation?.ids?.length) {
      for (const id of message.toolCallCancellation.ids) {
        this.callNames.delete(id);
      }
      return;
    }

    const serverContent = message.serverContent;
    if (!serverContent) return;

    if (serverContent.interrupted) {
      this.player?.stop();
      this.emitState('idle');
      return;
    }

    if (serverContent.inputTranscription?.text) {
      this.emitTranscript({
        kind: 'final',
        speaker: 'user',
        text: serverContent.inputTranscription.text,
        at: now,
      });
      this.emitState('thinking');
    }

    if (serverContent.outputTranscription?.text) {
      this.emitTranscript({
        kind: serverContent.turnComplete ? 'final' : 'partial',
        speaker: 'assistant',
        text: serverContent.outputTranscription.text,
        at: now,
      });
    }

    let sawAudio = false;
    for (const part of serverContent.modelTurn?.parts ?? []) {
      if (part.inlineData?.mimeType?.startsWith('audio/pcm') && part.inlineData.data) {
        this.player?.enqueuePcm16(base64ToArrayBuffer(part.inlineData.data));
        sawAudio = true;
        this.emitState('speaking');
        continue;
      }

      if (part.text) {
        this.emitTranscript({
          kind: serverContent.turnComplete ? 'final' : 'partial',
          speaker: 'assistant',
          text: part.text,
          at: now,
        });
      }
    }

    if (serverContent.turnComplete) {
      if (sawAudio) {
        this.player?.complete();
      } else {
        this.emitState('idle');
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

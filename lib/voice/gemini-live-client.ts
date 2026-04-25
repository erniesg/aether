import type {
  FunctionDeclaration,
  LiveCallbacks,
  LiveConnectConfig,
  LiveServerMessage,
  Modality,
  Schema,
  StartSensitivity,
  EndSensitivity,
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

export const GEMINI_INPUT_SAMPLE_RATE = 16_000;
const GEMINI_OUTPUT_SAMPLE_RATE = 24_000;
export const GEMINI_GREETING_TEXT = "I'm ready to create with you";

const GEMINI_SYSTEM_INSTRUCTION = [
  "You are aether's voice companion for a creator-first canvas tool.",
  'Keep spoken replies brief.',
  'Call tools eagerly instead of narrating when the creator asks for an available canvas action.',
  "When the creator says they want to draw, write their name, start their name, or write their Chinese name, call start_air_brush. For the demo Chinese name, use mode blind_signature and targetText 陈恩娇.",
  "When the creator says they are done drawing, calls it done, says 'send this', or similar, call end_air_brush.",
  'When the creator asks to generate or introduce something, call run_generate with the creator prompt exactly as spoken and scope single unless they explicitly ask for all formats.',
].join(' ');

export interface RecorderChunk {
  mimeType: string;
  data: string;
}

type VoiceDebugStage =
  | 'open'
  | 'setup-complete'
  | 'incoming-message'
  | 'outgoing-audio'
  | 'outgoing-text'
  | 'activity'
  | 'tool-response'
  | 'error'
  | 'close'
  | 'greeting';

interface VoiceDebugEvent {
  at: string;
  stage: VoiceDebugStage;
  detail?: Record<string, unknown>;
}

interface VoiceDebugSnapshot {
  lastStage?: VoiceDebugStage;
  lastError?: string;
  events: VoiceDebugEvent[];
}

declare global {
  interface Window {
    __AETHER_VOICE_DEBUG__?: VoiceDebugSnapshot;
  }
}

const MAX_VOICE_DEBUG_EVENTS = 100;

type GeminiLiveMessage = Pick<
  LiveServerMessage,
  | 'setupComplete'
  | 'serverContent'
  | 'toolCall'
  | 'toolCallCancellation'
  | 'goAway'
  | 'voiceActivity'
  | 'voiceActivityDetectionSignal'
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
    activityStart?: Record<string, never>;
    activityEnd?: Record<string, never>;
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
    callbacks: LiveCallbacks,
  ) => Promise<GeminiLiveSessionLike>;
  createRecorder?: (
    onChunk: (chunk: RecorderChunk) => void,
  ) => GeminiAudioRecorder;
  createPlayer?: () => GeminiAudioPlayer;
  playGreeting?: (text: string) => void;
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
    if (typeof console !== 'undefined')
      console.error('[voice] listener threw:', err);
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

function concatFloat32(
  a: Float32Array<ArrayBufferLike>,
  b: Float32Array<ArrayBufferLike>,
): Float32Array<ArrayBufferLike> {
  if (a.length === 0) return b.slice();
  if (b.length === 0) return a.slice();
  const out = new Float32Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

export class GeminiPcm16Encoder {
  private readonly ratio: number;
  private carry: Float32Array<ArrayBufferLike> = new Float32Array(0);
  private nextSourceOffset = 0;

  constructor(
    private readonly sourceSampleRate: number,
    private readonly targetSampleRate = GEMINI_INPUT_SAMPLE_RATE,
  ) {
    this.ratio =
      sourceSampleRate > 0 && targetSampleRate > 0
        ? sourceSampleRate / targetSampleRate
        : 1;
  }

  encode(input: Float32Array<ArrayBufferLike>): RecorderChunk {
    if (
      this.sourceSampleRate === this.targetSampleRate ||
      !Number.isFinite(this.ratio) ||
      this.ratio <= 0
    ) {
      return {
        mimeType: `audio/pcm;rate=${this.targetSampleRate}`,
        data: float32ToPcm16Base64(input),
      };
    }

    const buffer = concatFloat32(this.carry, input);
    if (buffer.length < 2) {
      this.carry = buffer;
      return {
        mimeType: `audio/pcm;rate=${this.targetSampleRate}`,
        data: '',
      };
    }

    const samples: number[] = [];
    let position = this.nextSourceOffset;
    while (position + 1 < buffer.length) {
      const left = Math.floor(position);
      const right = Math.min(left + 1, buffer.length - 1);
      const mix = position - left;
      const sample =
        (buffer[left] ?? 0) * (1 - mix) + (buffer[right] ?? 0) * mix;
      samples.push(sample);
      position += this.ratio;
    }

    const keepStart = Math.min(
      buffer.length,
      Math.max(0, Math.floor(position) - 1),
    );
    this.carry = buffer.slice(keepStart);
    this.nextSourceOffset = position - keepStart;

    return {
      mimeType: `audio/pcm;rate=${this.targetSampleRate}`,
      data: float32ToPcm16Base64(Float32Array.from(samples)),
    };
  }
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

function isVoiceDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  if (process.env.NODE_ENV === 'production') return false;
  try {
    return (
      new URLSearchParams(window.location.search).get('voice-debug') === '1'
    );
  } catch {
    return false;
  }
}

function byteLengthFromBase64(data: string): number {
  if (!data) return 0;
  try {
    return atob(data).length;
  } catch {
    const trimmed = data.replace(/=+$/, '');
    return Math.floor((trimmed.length * 3) / 4);
  }
}

function recordVoiceDebugEvent(
  stage: VoiceDebugStage,
  detail: Record<string, unknown> = {},
  patch: Partial<Omit<VoiceDebugSnapshot, 'events'>> = {},
): void {
  if (!isVoiceDebugEnabled()) return;
  const previous = window.__AETHER_VOICE_DEBUG__ ?? { events: [] };
  const error =
    typeof detail.error === 'string' && detail.error.length > 0
      ? detail.error
      : previous.lastError;
  const event: VoiceDebugEvent = {
    at: new Date().toISOString(),
    stage,
    detail,
  };
  const next: VoiceDebugSnapshot = {
    ...previous,
    ...patch,
    lastStage: stage,
    lastError: error,
    events: [...previous.events, event].slice(-MAX_VOICE_DEBUG_EVENTS),
  };
  window.__AETHER_VOICE_DEBUG__ = next;

  if (typeof console !== 'undefined') {
    console.info(`[voice] ${stage} ${stringifyVoiceDebugDetail(detail)}`);
  }
}

function stringifyVoiceDebugDetail(detail: Record<string, unknown>): string {
  try {
    return JSON.stringify(detail);
  } catch {
    return '[unserializable]';
  }
}

function liveCloseEventDetail(event: unknown): Record<string, unknown> {
  const source = event as Partial<CloseEvent> | undefined;
  const detail: Record<string, unknown> = {};
  if (typeof source?.code === 'number') detail.code = source.code;
  if (typeof source?.reason === 'string') detail.reason = source.reason;
  if (typeof source?.wasClean === 'boolean') detail.wasClean = source.wasClean;
  if (typeof source?.type === 'string') detail.type = source.type;
  return detail;
}

function liveErrorEventDetail(event: unknown): Record<string, unknown> {
  const source = event as Partial<ErrorEvent> | undefined;
  const detail: Record<string, unknown> = {};
  if (typeof source?.message === 'string' && source.message) {
    detail.message = source.message;
  }
  if (typeof source?.type === 'string') detail.type = source.type;
  const error = source?.error;
  if (error instanceof Error) {
    detail.errorName = error.name;
    detail.errorMessage = error.message;
  } else if (typeof error === 'string' && error) {
    detail.errorMessage = error;
  }
  return detail;
}

function defaultPlayGreeting(text: string): void {
  if (typeof window === 'undefined') return;
  if (typeof window.speechSynthesis === 'undefined') return;
  if (typeof SpeechSynthesisUtterance === 'undefined') return;

  try {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  } catch {
    // The greeting is a local readiness cue. Lack of platform TTS should not
    // block the actual Gemini Live session.
  }
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
      ]),
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
  private encoder: GeminiPcm16Encoder | null = null;

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
    const context = new AudioContext();
    await context.resume();
    const encoder = new GeminiPcm16Encoder(context.sampleRate);

    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(2048, 1, 1);
    const sink = context.createGain();
    sink.gain.value = 0;

    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      if (!input.length) return;
      const chunk = encoder.encode(input);
      if (!chunk.data) return;
      this.onChunk(chunk);
    };

    source.connect(processor);
    processor.connect(sink);
    sink.connect(context.destination);

    this.stream = stream;
    this.context = context;
    this.source = source;
    this.processor = processor;
    this.sink = sink;
    this.encoder = encoder;
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
    this.encoder = null;
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
        this.context.currentTime,
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
      const buffer = this.context.createBuffer(
        1,
        chunk.length,
        GEMINI_OUTPUT_SAMPLE_RATE,
      );
      buffer.getChannelData(0).set(chunk);

      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.gain);
      source.onended = () => {
        this.activeSources.delete(source);
        source.disconnect();
        if (
          this.streamComplete &&
          !this.queue.length &&
          !this.activeSources.size
        ) {
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
        (this.scheduledTime - this.context.currentTime - 0.05) * 1000,
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

export function buildGeminiLiveConfig(
  credentials: VoiceSessionCredentials,
): LiveConnectConfig {
  return {
    responseModalities: ['AUDIO' as Modality],
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    realtimeInputConfig: {
      automaticActivityDetection: {
        disabled: false,
        startOfSpeechSensitivity: 'START_SENSITIVITY_LOW' as StartSensitivity,
        endOfSpeechSensitivity: 'END_SENSITIVITY_LOW' as EndSensitivity,
        prefixPaddingMs: 20,
        silenceDurationMs: 100,
      },
    },
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
          text: GEMINI_SYSTEM_INSTRUCTION,
        },
      ],
    },
    tools: [
      {
        functionDeclarations: VOICE_TOOL_DEFINITIONS.map(
          toGeminiFunctionDeclaration,
        ),
      },
    ],
  };
}

async function defaultConnectLiveSession(
  credentials: VoiceSessionCredentials,
  callbacks: LiveCallbacks,
): Promise<GeminiLiveSessionLike> {
  const { GoogleGenAI } = await import('@google/genai/web');
  const client = new GoogleGenAI({
    apiKey: credentials.clientSecret,
    httpOptions: { apiVersion: 'v1alpha' },
  });
  return client.live.connect({
    model: credentials.model,
    config: buildGeminiLiveConfig(credentials),
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
  private closingIntentionally = false;
  private reportedConnectionLoss = false;
  private greetingPlayed = false;

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
      playGreeting: options.deps?.playGreeting ?? defaultPlayGreeting,
    };
  }

  async connect(options: VoiceConnectOptions = {}): Promise<void> {
    if (this.connected) return;
    const endpoint = options.sessionEndpoint ?? '/api/voice/session';
    const credentials =
      options.credentials ?? (await this.deps.fetchSession(endpoint));

    if (credentials.provider !== 'gemini-live') {
      throw new Error(
        `voice: Gemini adapter received ${credentials.provider} credentials`,
      );
    }

    if (options.signal?.aborted) {
      throw new DOMException('voice connect aborted', 'AbortError');
    }

    const player = this.deps.createPlayer();
    player.onComplete = () => {
      if (this.connected) this.emitState('idle');
    };

    let session: GeminiLiveSessionLike | null = null;
    this.closingIntentionally = false;
    this.reportedConnectionLoss = false;
    this.greetingPlayed = false;

    try {
      await player.resume();
      session = await this.deps.connectLiveSession(credentials, {
        onopen: () => {
          recordVoiceDebugEvent('open');
          // wait for setupComplete before marking idle
        },
        onmessage: (message) => this.handleMessage(message),
        onerror: (event) => {
          const detail = liveErrorEventDetail(event);
          recordVoiceDebugEvent('error', detail);
          const message =
            typeof detail.message === 'string' && detail.message
              ? detail.message
              : typeof detail.errorMessage === 'string' && detail.errorMessage
              ? detail.errorMessage
              : 'gemini live error';
          this.handleConnectionLoss(new Error(message));
        },
        onclose: (event) => {
          if (this.closingIntentionally) {
            this.connected = false;
            this.emitState('idle');
            recordVoiceDebugEvent('close', { expected: true });
            return;
          }
          const detail = liveCloseEventDetail(event);
          recordVoiceDebugEvent('close', { expected: false, ...detail });
          const reason =
            typeof detail.reason === 'string' && detail.reason
              ? detail.reason
              : 'Gemini Live connection closed';
          this.handleConnectionLoss(new Error(`voice: ${reason}`));
        },
      });

      const recorder = this.deps.createRecorder((chunk) => {
        recordVoiceDebugEvent('outgoing-audio', {
          mimeType: chunk.mimeType,
          byteLength: byteLengthFromBase64(chunk.data),
          base64Length: chunk.data.length,
        });
        session?.sendRealtimeInput({ audio: chunk });
        this.emitState('listening');
      });
      await recorder.start();

      this.player = player;
      this.session = session;
      this.recorder = recorder;
      this.connected = true;
    } catch (err) {
      player.stop();
      session?.close();
      this.session = null;
      this.player = null;
      this.recorder?.stop();
      this.recorder = null;
      throw err;
    }
  }

  disconnect(): void {
    this.connected = false;
    this.closingIntentionally = true;
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
    this.greetingPlayed = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  sendText(text: string): void {
    if (!this.session) return;
    recordVoiceDebugEvent('outgoing-text', {
      textLength: text.length,
    });
    this.session.sendRealtimeInput({ text });
    this.emitState('thinking');
  }

  sendFunctionResult(result: VoiceFunctionResult): void {
    if (!this.session) return;
    const name = this.callNames.get(result.callId);
    recordVoiceDebugEvent('tool-response', {
      callId: result.callId,
      name,
    });
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

  onFunctionCall(
    listener: (event: VoiceFunctionCallEvent) => void,
  ): () => void {
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
    recordVoiceDebugEvent('incoming-message', { message });

    const voiceActivityType = message.voiceActivity?.voiceActivityType;
    const vadSignalType = message.voiceActivityDetectionSignal?.vadSignalType;
    if (voiceActivityType || vadSignalType) {
      recordVoiceDebugEvent('activity', {
        voiceActivityType,
        vadSignalType,
      });
    }
    if (
      voiceActivityType === 'ACTIVITY_START' ||
      vadSignalType === 'VAD_SIGNAL_TYPE_SOS'
    ) {
      this.emitState('listening');
    } else if (
      voiceActivityType === 'ACTIVITY_END' ||
      vadSignalType === 'VAD_SIGNAL_TYPE_EOS'
    ) {
      this.emitState('thinking');
    }

    if (message.setupComplete) {
      recordVoiceDebugEvent('setup-complete', {
        sessionId: message.setupComplete.sessionId,
      });
      if (!this.greetingPlayed) {
        this.greetingPlayed = true;
        this.deps.playGreeting(GEMINI_GREETING_TEXT);
        recordVoiceDebugEvent('greeting', { text: GEMINI_GREETING_TEXT });
      }
      this.emitState('idle');
      return;
    }

    if (message.goAway?.timeLeft) {
      recordVoiceDebugEvent('close', {
        expected: false,
        timeLeft: message.goAway.timeLeft,
      });
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
        kind:
          serverContent.inputTranscription.finished === false
            ? 'partial'
            : 'final',
        speaker: 'user',
        text: serverContent.inputTranscription.text,
        at: now,
      });
      this.emitState('thinking');
    }

    if (serverContent.outputTranscription?.text) {
      const outputTranscriptionFinished =
        serverContent.outputTranscription.finished ??
        serverContent.turnComplete;
      this.emitTranscript({
        kind: outputTranscriptionFinished ? 'final' : 'partial',
        speaker: 'assistant',
        text: serverContent.outputTranscription.text,
        at: now,
      });
    }

    let sawAudio = false;
    for (const part of serverContent.modelTurn?.parts ?? []) {
      if (
        part.inlineData?.mimeType?.startsWith('audio/pcm') &&
        part.inlineData.data
      ) {
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
    for (const listener of this.listeners.transcript)
      safeCall(() => listener(event));
  }

  private emitFn(event: VoiceFunctionCallEvent): void {
    for (const listener of this.listeners.fn) safeCall(() => listener(event));
  }

  private emitState(state: VoiceOrbStateEvent['state']): void {
    const event: VoiceOrbStateEvent = { state, at: Date.now() };
    for (const listener of this.listeners.state)
      safeCall(() => listener(event));
  }

  private emitError(err: Error): void {
    for (const listener of this.listeners.error) safeCall(() => listener(err));
  }

  private handleConnectionLoss(err: Error): void {
    if (this.closingIntentionally || this.reportedConnectionLoss) return;
    this.reportedConnectionLoss = true;
    this.connected = false;
    recordVoiceDebugEvent('error', { error: err.message });
    this.recorder?.stop();
    this.player?.stop();
    this.session = null;
    this.recorder = null;
    this.player = null;
    this.callNames.clear();
    this.emitState('idle');
    this.emitError(err);
  }
}

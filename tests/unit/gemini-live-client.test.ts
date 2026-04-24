import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildGeminiLiveConfig,
  GEMINI_GREETING_TEXT,
  GEMINI_INPUT_SAMPLE_RATE,
  GeminiLiveClient,
  GeminiPcm16Encoder,
} from '@/lib/voice/gemini-live-client';
import type {
  VoiceFunctionCallEvent,
  VoiceOrbStateEvent,
  VoiceSessionCredentials,
  VoiceTranscriptEvent,
} from '@/lib/voice/types';

function makeCredentials(): VoiceSessionCredentials {
  return {
    sessionId: 'tokens/gemini-session',
    clientSecret: 'tokens/gemini-session',
    expiresAt: Date.now() + 60_000,
    model: 'gemini-2.5-flash-native-audio-preview-12-2025',
    voice: 'Kore',
    provider: 'gemini-live',
  };
}

function createHarness() {
  const credentials = makeCredentials();
  let emitChunk: ((chunk: { mimeType: string; data: string }) => void) | null =
    null;
  let callbacks: {
    onopen?: () => void;
    onmessage?: (message: unknown) => void;
    onerror?: (event: { message?: string; type?: string }) => void;
    onclose?: (event?: { code?: number; reason?: string; wasClean?: boolean }) => void;
  } | null = null;

  const session = {
    close: vi.fn(),
    sendClientContent: vi.fn(),
    sendRealtimeInput: vi.fn(),
    sendToolResponse: vi.fn(),
  };
  const recorder = {
    start: vi.fn(async () => {}),
    stop: vi.fn(),
  };
  const player = {
    onComplete: () => {},
    resume: vi.fn(async () => {}),
    enqueuePcm16: vi.fn(),
    stop: vi.fn(),
    complete: vi.fn(() => {
      player.onComplete();
    }),
  };

  return {
    credentials,
    session,
    recorder,
    player,
    fetchSession: vi.fn(async () => credentials),
    connectLiveSession: vi.fn(async (_credentials, liveCallbacks) => {
      callbacks = liveCallbacks as typeof callbacks;
      return session;
    }),
    createRecorder: vi.fn(
      (onChunk: (chunk: { mimeType: string; data: string }) => void) => {
        emitChunk = onChunk;
        return recorder;
      },
    ),
    createPlayer: vi.fn(() => player),
    playGreeting: vi.fn(),
    getCallbacks() {
      if (!callbacks) throw new Error('callbacks not attached');
      return callbacks;
    },
    emitMicChunk(chunk = { mimeType: 'audio/pcm;rate=16000', data: 'AAA=' }) {
      if (!emitChunk) throw new Error('recorder callback not attached');
      emitChunk(chunk);
    },
  };
}

describe('GeminiLiveClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, '', '/');
    delete window.__AETHER_VOICE_DEBUG__;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, '', '/');
    delete window.__AETHER_VOICE_DEBUG__;
  });

  it('encodes recorder chunks as Gemini-native 16kHz PCM without requiring a 16kHz AudioContext', () => {
    const encoder = new GeminiPcm16Encoder(48_000);
    const oneSecond = new Float32Array(48_000);
    oneSecond.fill(0.25);

    const chunk = encoder.encode(oneSecond);
    const bytes = Buffer.from(chunk.data, 'base64');

    expect(chunk.mimeType).toBe(`audio/pcm;rate=${GEMINI_INPUT_SAMPLE_RATE}`);
    expect(bytes.byteLength).toBe(GEMINI_INPUT_SAMPLE_RATE * 2);
  });

  it('builds the Live config with audio transcription, tools, and explicit automatic VAD', () => {
    const config = buildGeminiLiveConfig(makeCredentials());

    expect(config.responseModalities).toEqual(['AUDIO']);
    expect(config.inputAudioTranscription).toEqual({});
    expect(config.outputAudioTranscription).toEqual({});
    expect(
      config.realtimeInputConfig?.automaticActivityDetection,
    ).toMatchObject({
      disabled: false,
    });
    const tools = config.tools as Array<{
      functionDeclarations?: Array<{ name?: string }>;
    }>;
    expect(
      tools[0]?.functionDeclarations?.map((tool) => tool.name),
    ).toContain('run_generate');
  });

  it('fetches a Gemini session, opens the live transport, and streams mic audio', async () => {
    const harness = createHarness();
    const client = new GeminiLiveClient({
      deps: {
        fetchSession: harness.fetchSession,
        connectLiveSession: harness.connectLiveSession,
        createRecorder: harness.createRecorder,
        createPlayer: harness.createPlayer,
        playGreeting: harness.playGreeting,
      },
    });
    const states: VoiceOrbStateEvent['state'][] = [];
    client.onStateChange((event) => states.push(event.state));

    await client.connect();
    client.__injectMessageForTests({ setupComplete: {} });
    harness.emitMicChunk();

    expect(harness.fetchSession).toHaveBeenCalledWith('/api/voice/session');
    expect(harness.connectLiveSession).toHaveBeenCalledWith(
      harness.credentials,
      expect.objectContaining({
        onmessage: expect.any(Function),
      }),
    );
    expect(harness.createRecorder).toHaveBeenCalledTimes(1);
    expect(harness.recorder.start).toHaveBeenCalledTimes(1);
    expect(harness.session.sendRealtimeInput).toHaveBeenCalledWith({
      audio: { mimeType: 'audio/pcm;rate=16000', data: 'AAA=' },
    });
    expect(states).toEqual(['idle', 'listening']);
    expect(client.isConnected()).toBe(true);
  });

  it('plays a short ready cue when Live setup completes', async () => {
    const harness = createHarness();
    const client = new GeminiLiveClient({
      deps: {
        fetchSession: harness.fetchSession,
        connectLiveSession: harness.connectLiveSession,
        createRecorder: harness.createRecorder,
        createPlayer: harness.createPlayer,
        playGreeting: harness.playGreeting,
      },
    });

    await client.connect({ credentials: harness.credentials });
    client.__injectMessageForTests({ setupComplete: {} });

    expect(harness.playGreeting).toHaveBeenCalledWith(GEMINI_GREETING_TEXT);
  });

  it('records raw incoming messages and outgoing audio chunks only in ?voice-debug=1 mode', async () => {
    window.history.replaceState({}, '', '/workspace/demo-ws?voice-debug=1');
    const harness = createHarness();
    const client = new GeminiLiveClient({
      deps: {
        fetchSession: harness.fetchSession,
        connectLiveSession: harness.connectLiveSession,
        createRecorder: harness.createRecorder,
        createPlayer: harness.createPlayer,
        playGreeting: harness.playGreeting,
      },
    });

    await client.connect({ credentials: harness.credentials });
    client.__injectMessageForTests({ setupComplete: { sessionId: 'live_1' } });
    harness.emitMicChunk({ mimeType: 'audio/pcm;rate=16000', data: 'AAAA' });

    expect(window.__AETHER_VOICE_DEBUG__).toMatchObject({
      lastStage: 'outgoing-audio',
    });
    expect(
      window.__AETHER_VOICE_DEBUG__?.events.some(
        (event) => event.stage === 'incoming-message',
      ),
    ).toBe(true);
    expect(
      window.__AETHER_VOICE_DEBUG__?.events.some(
        (event) =>
          event.stage === 'outgoing-audio' &&
          event.detail?.mimeType === 'audio/pcm;rate=16000' &&
          event.detail?.byteLength === 3,
      ),
    ).toBe(true);
  });

  it('records Live close diagnostics in debug mode', async () => {
    window.history.replaceState({}, '', '/workspace/demo-ws?voice-debug=1');
    const harness = createHarness();
    const client = new GeminiLiveClient({
      deps: {
        fetchSession: harness.fetchSession,
        connectLiveSession: harness.connectLiveSession,
        createRecorder: harness.createRecorder,
        createPlayer: harness.createPlayer,
        playGreeting: harness.playGreeting,
      },
    });

    await client.connect({ credentials: harness.credentials });
    harness.getCallbacks().onclose?.({
      code: 1008,
      reason: 'model rejected setup',
      wasClean: false,
    });

    expect(window.__AETHER_VOICE_DEBUG__?.lastStage).toBe('error');
    expect(window.__AETHER_VOICE_DEBUG__?.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: 'close',
          detail: expect.objectContaining({
            code: 1008,
            reason: 'model rejected setup',
            wasClean: false,
          }),
        }),
      ]),
    );
  });

  it('sends typed creator turns through realtime input for Live responsiveness', async () => {
    const harness = createHarness();
    const client = new GeminiLiveClient({
      deps: {
        fetchSession: harness.fetchSession,
        connectLiveSession: harness.connectLiveSession,
        createRecorder: harness.createRecorder,
        createPlayer: harness.createPlayer,
      },
    });
    const states: VoiceOrbStateEvent['state'][] = [];
    client.onStateChange((event) => states.push(event.state));

    await client.connect({ credentials: harness.credentials });
    client.sendText('make it warmer');

    expect(harness.session.sendRealtimeInput).toHaveBeenCalledWith({
      text: 'make it warmer',
    });
    expect(harness.session.sendClientContent).not.toHaveBeenCalled();
    expect(states).toContain('thinking');
  });

  it('emits tool calls and returns tool results with the same call id', async () => {
    const harness = createHarness();
    const client = new GeminiLiveClient({
      deps: {
        fetchSession: harness.fetchSession,
        connectLiveSession: harness.connectLiveSession,
        createRecorder: harness.createRecorder,
        createPlayer: harness.createPlayer,
      },
    });
    const calls: VoiceFunctionCallEvent[] = [];
    client.onFunctionCall((event) => calls.push(event));

    await client.connect({ credentials: harness.credentials });
    client.__injectMessageForTests({
      toolCall: {
        functionCalls: [
          {
            id: 'call_123',
            name: 'run_generate',
            args: { prompt: 'turn this into a poster', scope: 'all' },
          },
        ],
      },
    });
    client.sendFunctionResult({
      callId: 'call_123',
      output: { ok: true, detail: 'queued' },
    });

    expect(calls).toEqual([
      expect.objectContaining({
        callId: 'call_123',
        name: 'run_generate',
        arguments: { prompt: 'turn this into a poster', scope: 'all' },
      }),
    ]);
    expect(harness.session.sendToolResponse).toHaveBeenCalledWith({
      functionResponses: [
        {
          id: 'call_123',
          name: 'run_generate',
          response: { ok: true, detail: 'queued' },
        },
      ],
    });
  });

  it('converts server messages into transcript and speaking state events', async () => {
    const harness = createHarness();
    const client = new GeminiLiveClient({
      deps: {
        fetchSession: harness.fetchSession,
        connectLiveSession: harness.connectLiveSession,
        createRecorder: harness.createRecorder,
        createPlayer: harness.createPlayer,
      },
    });
    const transcripts: VoiceTranscriptEvent[] = [];
    const states: VoiceOrbStateEvent['state'][] = [];
    client.onTranscript((event) => transcripts.push(event));
    client.onStateChange((event) => states.push(event.state));

    await client.connect({ credentials: harness.credentials });
    client.__injectMessageForTests({ setupComplete: {} });
    client.__injectMessageForTests({
      serverContent: {
        inputTranscription: { text: 'remove the background' },
      },
    });
    client.__injectMessageForTests({
      serverContent: {
        outputTranscription: { text: 'Done.' },
        modelTurn: {
          parts: [
            {
              inlineData: {
                mimeType: 'audio/pcm;rate=24000',
                data: 'AAA=',
              },
            },
          ],
        },
        turnComplete: true,
      },
    });

    expect(transcripts).toEqual([
      expect.objectContaining({
        speaker: 'user',
        kind: 'final',
        text: 'remove the background',
      }),
      expect.objectContaining({
        speaker: 'assistant',
        kind: 'final',
        text: 'Done.',
      }),
    ]);
    expect(harness.player.enqueuePcm16).toHaveBeenCalledTimes(1);
    expect(harness.player.complete).toHaveBeenCalledTimes(1);
    expect(states).toEqual(['idle', 'thinking', 'speaking', 'idle']);
  });

  it('surfaces unexpected Live socket drops as errors and returns to idle', async () => {
    const harness = createHarness();
    const client = new GeminiLiveClient({
      deps: {
        fetchSession: harness.fetchSession,
        connectLiveSession: harness.connectLiveSession,
        createRecorder: harness.createRecorder,
        createPlayer: harness.createPlayer,
        playGreeting: harness.playGreeting,
      },
    });
    const errors: string[] = [];
    const states: VoiceOrbStateEvent['state'][] = [];
    client.onError((error) => errors.push(error.message));
    client.onStateChange((event) => states.push(event.state));

    await client.connect({ credentials: harness.credentials });
    harness.getCallbacks().onclose?.({ reason: 'network lost' });

    expect(client.isConnected()).toBe(false);
    expect(states).toContain('idle');
    expect(errors.at(-1)).toMatch(/network lost/);
  });
});

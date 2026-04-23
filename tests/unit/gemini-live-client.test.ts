import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GeminiLiveClient } from '@/lib/voice/gemini-live-client';
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
    model: 'gemini-live-2.5-flash-native-audio',
    voice: 'Kore',
    provider: 'gemini-live',
  };
}

function createHarness() {
  const credentials = makeCredentials();
  let emitChunk:
    | ((chunk: { mimeType: string; data: string }) => void)
    | null = null;

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
    connectLiveSession: vi.fn(async () => session),
    createRecorder: vi.fn(
      (onChunk: (chunk: { mimeType: string; data: string }) => void) => {
        emitChunk = onChunk;
        return recorder;
      }
    ),
    createPlayer: vi.fn(() => player),
    emitMicChunk(chunk = { mimeType: 'audio/pcm;rate=16000', data: 'AAA=' }) {
      if (!emitChunk) throw new Error('recorder callback not attached');
      emitChunk(chunk);
    },
  };
}

describe('GeminiLiveClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches a Gemini session, opens the live transport, and streams mic audio', async () => {
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

    await client.connect();
    client.__injectMessageForTests({ setupComplete: {} });
    harness.emitMicChunk();

    expect(harness.fetchSession).toHaveBeenCalledWith('/api/voice/session');
    expect(harness.connectLiveSession).toHaveBeenCalledWith(
      harness.credentials,
      expect.objectContaining({
        onmessage: expect.any(Function),
      })
    );
    expect(harness.createRecorder).toHaveBeenCalledTimes(1);
    expect(harness.recorder.start).toHaveBeenCalledTimes(1);
    expect(harness.session.sendRealtimeInput).toHaveBeenCalledWith({
      audio: { mimeType: 'audio/pcm;rate=16000', data: 'AAA=' },
    });
    expect(states).toEqual(['idle', 'listening']);
    expect(client.isConnected()).toBe(true);
  });

  it('sends typed creator turns through sendClientContent', async () => {
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

    expect(harness.session.sendClientContent).toHaveBeenCalledWith({
      turns: [
        {
          role: 'user',
          parts: [{ text: 'make it warmer' }],
        },
      ],
      turnComplete: true,
    });
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
});

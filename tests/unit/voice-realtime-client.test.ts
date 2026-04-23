import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { OpenAIRealtimeClient } from '@/lib/voice/realtime-client';
import type {
  VoiceFunctionCallEvent,
  VoiceOrbStateEvent,
  VoiceSessionCredentials,
  VoiceTranscriptEvent,
} from '@/lib/voice/types';

class FakeDataChannel extends EventTarget {
  readyState: 'connecting' | 'open' | 'closing' | 'closed' = 'connecting';
  sent: string[] = [];

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 'closed';
  }

  open(): void {
    this.readyState = 'open';
    this.dispatchEvent(new Event('open'));
  }

  emitMessage(raw: unknown): void {
    const data = typeof raw === 'string' ? raw : JSON.stringify(raw);
    this.dispatchEvent(new MessageEvent('message', { data }));
  }
}

class FakePeerConnection extends EventTarget {
  dc: FakeDataChannel | null = null;
  tracks: Array<{ track: unknown; stream: MediaStream }> = [];
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;

  createDataChannel(_label: string): FakeDataChannel {
    this.dc = new FakeDataChannel();
    return this.dc;
  }

  addTrack(track: MediaStreamTrack, stream: MediaStream): void {
    this.tracks.push({ track, stream });
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'offer', sdp: 'v=0\r\n' };
  }

  async setLocalDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = desc;
  }

  async setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = desc;
  }

  close(): void {
    // noop
  }
}

function makeFakeMicStream(): MediaStream {
  return {
    getAudioTracks: () => [
      {
        stop: () => {},
      } as unknown as MediaStreamTrack,
    ],
    getTracks: () => [
      {
        stop: () => {},
      } as unknown as MediaStreamTrack,
    ],
  } as unknown as MediaStream;
}

describe('OpenAIRealtimeClient', () => {
  let pc: FakePeerConnection;
  // Type the mocks against the dep signatures so `vi.fn()` assignment narrows to
  // the optional function slots on RealtimeClientDeps. Without the generic the
  // inferred Mock<Procedure | Constructable> can't satisfy the call signature.
  let sdpExchange: Mock<
    (offerSdp: string, credentials: VoiceSessionCredentials) => Promise<string>
  >;
  let fetchSession: Mock<(endpoint: string) => Promise<VoiceSessionCredentials>>;

  beforeEach(() => {
    pc = new FakePeerConnection();
    sdpExchange = vi.fn().mockResolvedValue('v=0\r\n answer');
    fetchSession = vi.fn().mockResolvedValue({
      sessionId: 'sess_1',
      clientSecret: 'ek_client',
      expiresAt: Date.now() + 60_000,
      model: 'gpt-4o-realtime-preview',
      voice: 'alloy',
      provider: 'openai-realtime',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches an ephemeral session and hands its client_secret to the SDP exchange — never a primary key', async () => {
    const client = new OpenAIRealtimeClient({
      deps: {
        createPeerConnection: () => pc as unknown as RTCPeerConnection,
        getMicStream: async () => makeFakeMicStream(),
        sdpExchange,
        fetchSession,
      },
    });

    await client.connect();
    expect(fetchSession).toHaveBeenCalledWith('/api/voice/session');
    expect(sdpExchange).toHaveBeenCalledTimes(1);
    const [, credentials] = sdpExchange.mock.calls[0];
    expect(credentials.clientSecret).toBe('ek_client');
    expect(credentials.clientSecret).not.toMatch(/^sk-/);
    expect(pc.remoteDescription?.sdp).toBe('v=0\r\n answer');
    expect(client.isConnected()).toBe(true);
  });

  it('declares tools via session.update once the data channel opens', async () => {
    const client = new OpenAIRealtimeClient({
      deps: {
        createPeerConnection: () => pc as unknown as RTCPeerConnection,
        getMicStream: async () => makeFakeMicStream(),
        sdpExchange,
        fetchSession,
      },
    });

    await client.connect();
    pc.dc!.open();

    expect(pc.dc!.sent.length).toBeGreaterThan(0);
    const sessionUpdate = JSON.parse(pc.dc!.sent[0]);
    expect(sessionUpdate.type).toBe('session.update');
    expect(sessionUpdate.session.tools.map((t: { name: string }) => t.name)).toEqual([
      'focus_format',
      'pan_zoom',
      'remove_background',
      'select_tool',
      'set_brush_color',
      'set_brush_size',
      'clear_sketch',
      'confirm_sketch',
      'run_capability',
      'run_generate',
    ]);
  });

  it('emits function-call events whose shape matches the dispatcher signature', async () => {
    const client = new OpenAIRealtimeClient({
      deps: {
        createPeerConnection: () => pc as unknown as RTCPeerConnection,
        getMicStream: async () => makeFakeMicStream(),
        sdpExchange,
        fetchSession,
      },
    });
    const received: VoiceFunctionCallEvent[] = [];
    client.onFunctionCall((event) => received.push(event));

    await client.connect();
    pc.dc!.open();

    client.__injectEventForTests({
      type: 'response.function_call_arguments.done',
      name: 'remove_background',
      call_id: 'call_123',
      arguments: '{}',
    });
    client.__injectEventForTests({
      type: 'response.function_call_arguments.done',
      name: 'run_generate',
      call_id: 'call_456',
      arguments: JSON.stringify({ prompt: 'sharpen it', scope: 'all' }),
    });

    expect(received).toHaveLength(2);
    expect(received[0]).toMatchObject({
      name: 'remove_background',
      callId: 'call_123',
      arguments: {},
    });
    expect(received[1]).toMatchObject({
      name: 'run_generate',
      callId: 'call_456',
      arguments: { prompt: 'sharpen it', scope: 'all' },
    });
  });

  it('transitions the orb through listening → thinking → speaking → idle', async () => {
    const client = new OpenAIRealtimeClient({
      deps: {
        createPeerConnection: () => pc as unknown as RTCPeerConnection,
        getMicStream: async () => makeFakeMicStream(),
        sdpExchange,
        fetchSession,
      },
    });
    const states: VoiceOrbStateEvent['state'][] = [];
    client.onStateChange((event) => states.push(event.state));

    await client.connect();
    pc.dc!.open();
    // session.update just fired with state=idle
    client.__injectEventForTests({ type: 'input_audio_buffer.speech_started' });
    client.__injectEventForTests({ type: 'input_audio_buffer.speech_stopped' });
    client.__injectEventForTests({ type: 'response.audio.delta' });
    client.__injectEventForTests({ type: 'response.done' });

    expect(states).toEqual(['idle', 'listening', 'thinking', 'speaking', 'idle']);
  });

  it('streams partial + final transcripts with the right speaker attribution', async () => {
    const client = new OpenAIRealtimeClient({
      deps: {
        createPeerConnection: () => pc as unknown as RTCPeerConnection,
        getMicStream: async () => makeFakeMicStream(),
        sdpExchange,
        fetchSession,
      },
    });
    const transcripts: VoiceTranscriptEvent[] = [];
    client.onTranscript((event) => transcripts.push(event));

    await client.connect();
    pc.dc!.open();

    client.__injectEventForTests({
      type: 'conversation.item.input_audio_transcription.completed',
      transcript: 'remove the background',
    });
    client.__injectEventForTests({
      type: 'response.audio_transcript.delta',
      delta: 'done',
    });

    expect(transcripts[0]).toMatchObject({
      speaker: 'user',
      kind: 'final',
      text: 'remove the background',
    });
    expect(transcripts[1]).toMatchObject({
      speaker: 'assistant',
      kind: 'partial',
      text: 'done',
    });
  });

  it('returns function-call results to the realtime model after dispatch', async () => {
    const client = new OpenAIRealtimeClient({
      deps: {
        createPeerConnection: () => pc as unknown as RTCPeerConnection,
        getMicStream: async () => makeFakeMicStream(),
        sdpExchange,
        fetchSession,
      },
    });

    await client.connect();
    pc.dc!.open();
    pc.dc!.sent.length = 0;

    client.sendFunctionResult({ callId: 'call_x', output: { ok: true } });
    const parsed = pc.dc!.sent.map((s) => JSON.parse(s));
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: 'call_x',
      },
    });
    expect(parsed[1]).toEqual({ type: 'response.create' });
  });

  it('sendText pushes a user turn through the data channel for test/keyboard fallback', async () => {
    const client = new OpenAIRealtimeClient({
      deps: {
        createPeerConnection: () => pc as unknown as RTCPeerConnection,
        getMicStream: async () => makeFakeMicStream(),
        sdpExchange,
        fetchSession,
      },
    });

    await client.connect();
    pc.dc!.open();
    pc.dc!.sent.length = 0;

    client.sendText('remove background');
    const parsed = pc.dc!.sent.map((s) => JSON.parse(s));
    expect(parsed[0].item.content[0]).toEqual({
      type: 'input_text',
      text: 'remove background',
    });
    expect(parsed[1]).toEqual({ type: 'response.create' });
  });
});

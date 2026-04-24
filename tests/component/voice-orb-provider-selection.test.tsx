import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { VoiceProvider, VoiceSessionCredentials } from '@/lib/voice/types';

const { fetchVoiceSession, createVoiceProvider } = vi.hoisted(() => ({
  fetchVoiceSession: vi.fn(),
  createVoiceProvider: vi.fn(),
}));

vi.mock('@/lib/voice/session-client', () => ({
  fetchVoiceSession,
}));

vi.mock('@/lib/voice/realtime-client', () => ({
  createVoiceProvider,
}));

import { VoiceOrb } from '@/components/canvas/VoiceOrb';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function createStubProvider(): {
  provider: VoiceProvider;
  connect: ReturnType<typeof vi.fn>;
} {
  let connected = false;
  const connect = vi.fn(async () => {
    connected = true;
  });
  const provider: VoiceProvider = {
    id: 'gemini-live',
    connect,
    disconnect: vi.fn(() => {
      connected = false;
    }),
    isConnected: () => connected,
    sendText: vi.fn(),
    sendFunctionResult: vi.fn(),
    onTranscript: () => () => {},
    onFunctionCall: () => () => {},
    onStateChange: () => () => {},
    onError: () => () => {},
  };

  return { provider, connect };
}

describe('VoiceOrb provider selection', () => {
  it('mints a session first and creates the matching realtime provider', async () => {
    const credentials: VoiceSessionCredentials = {
      sessionId: 'tokens/gemini-session',
      clientSecret: 'tokens/gemini-session',
      expiresAt: Date.now() + 60_000,
      model: 'gemini-3.1-flash-live-preview',
      voice: 'Kore',
      provider: 'gemini-live',
    };
    const stub = createStubProvider();
    fetchVoiceSession.mockResolvedValue(credentials);
    createVoiceProvider.mockReturnValue(stub.provider);

    render(
      <VoiceOrb
        dispatchers={{
          focus_format: vi.fn(),
          pan_zoom: vi.fn(),
          remove_background: vi.fn(),
          run_capability: vi.fn(),
          run_generate: vi.fn(),
        }}
        sessionEndpoint="/api/voice/session"
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: /voice · idle · click to talk/i }),
    );

    await waitFor(() => {
      expect(fetchVoiceSession).toHaveBeenCalledWith('/api/voice/session');
      expect(createVoiceProvider).toHaveBeenCalledWith('gemini-live');
      expect(stub.connect).toHaveBeenCalledWith({
        sessionEndpoint: '/api/voice/session',
        credentials,
      });
    });
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VoiceOrb } from '@/components/canvas/VoiceOrb';
import type {
  VoiceFunctionCallEvent,
  VoiceOrbStateEvent,
  VoiceProvider,
  VoiceTranscriptEvent,
} from '@/lib/voice/types';

afterEach(cleanup);

function createStubProvider() {
  let connected = false;
  const listeners = {
    state: new Set<(e: VoiceOrbStateEvent) => void>(),
    transcript: new Set<(e: VoiceTranscriptEvent) => void>(),
    fn: new Set<(e: VoiceFunctionCallEvent) => void>(),
    error: new Set<(e: Error) => void>(),
  };
  const fnResults: Array<{ callId: string; output: unknown }> = [];
  const connect = vi.fn(async () => {
    connected = true;
  });
  const disconnect = vi.fn(() => {
    connected = false;
  });
  const provider: VoiceProvider = {
    id: 'openai-realtime',
    connect,
    disconnect,
    isConnected: () => connected,
    sendText: vi.fn(),
    sendFunctionResult: (result) => {
      fnResults.push(result);
    },
    onTranscript: (l) => {
      listeners.transcript.add(l);
      return () => listeners.transcript.delete(l);
    },
    onFunctionCall: (l) => {
      listeners.fn.add(l);
      return () => listeners.fn.delete(l);
    },
    onStateChange: (l) => {
      listeners.state.add(l);
      return () => listeners.state.delete(l);
    },
    onError: (l) => {
      listeners.error.add(l);
      return () => listeners.error.delete(l);
    },
  };

  return {
    provider,
    connect,
    disconnect,
    fnResults,
    emitState(state: VoiceOrbStateEvent['state']) {
      const event = { state, at: Date.now() };
      listeners.state.forEach((l) => l(event));
    },
    emitTranscript(event: VoiceTranscriptEvent) {
      listeners.transcript.forEach((l) => l(event));
    },
    emitFunctionCall(event: VoiceFunctionCallEvent) {
      listeners.fn.forEach((l) => l(event));
    },
    emitError(err: Error) {
      listeners.error.forEach((l) => l(err));
    },
  };
}

describe('VoiceOrb', () => {
  it('exposes the mic chip as a FloatingToolbar `tool`-taxonomy IconButton', () => {
    const stub = createStubProvider();
    const dispatchers = {
      focus_format: vi.fn(),
      pan_zoom: vi.fn(),
      remove_background: vi.fn(),
      run_capability: vi.fn(),
      run_generate: vi.fn(),
    };
    render(<VoiceOrb dispatchers={dispatchers} provider={stub.provider} />);

    expect(
      screen.getByRole('button', { name: /voice · idle · click to talk/i })
    ).toBeInTheDocument();
  });

  it('cycles through idle → listening → thinking → speaking labels as the provider emits states', async () => {
    const stub = createStubProvider();
    const dispatchers = {
      focus_format: vi.fn(),
      pan_zoom: vi.fn(),
      remove_background: vi.fn(),
      run_capability: vi.fn(),
      run_generate: vi.fn(),
    };
    render(<VoiceOrb dispatchers={dispatchers} provider={stub.provider} />);

    stub.emitState('listening');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /voice · listening/i })).toBeInTheDocument()
    );

    stub.emitState('thinking');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /voice · thinking/i })).toBeInTheDocument()
    );

    stub.emitState('speaking');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /voice · speaking/i })).toBeInTheDocument()
    );
  });

  it('dispatches remove_background when the realtime model emits the matching function-call', async () => {
    const stub = createStubProvider();
    const dispatchers = {
      focus_format: vi.fn(),
      pan_zoom: vi.fn(),
      remove_background: vi.fn(),
      run_capability: vi.fn(),
      run_generate: vi.fn(),
    };

    render(<VoiceOrb dispatchers={dispatchers} provider={stub.provider} />);

    stub.emitFunctionCall({
      callId: 'call_rb',
      name: 'remove_background',
      arguments: {},
      at: Date.now(),
    });

    await waitFor(() => {
      expect(dispatchers.remove_background).toHaveBeenCalledTimes(1);
    });
    // Outcome is returned to the realtime model so it can continue the turn
    await waitFor(() => expect(stub.fnResults).toHaveLength(1));
    expect(stub.fnResults[0]).toMatchObject({
      callId: 'call_rb',
      output: { ok: true },
    });
  });

  it('surfaces a connect error via the caption callback and renders an error-state label', async () => {
    const stub = createStubProvider();
    stub.connect.mockRejectedValueOnce(new Error('mic denied'));
    const captions: unknown[] = [];
    const dispatchers = {
      focus_format: vi.fn(),
      pan_zoom: vi.fn(),
      remove_background: vi.fn(),
      run_capability: vi.fn(),
      run_generate: vi.fn(),
    };

    render(
      <VoiceOrb
        dispatchers={dispatchers}
        provider={stub.provider}
        onCaption={(event) => captions.push(event)}
      />
    );

    await userEvent.click(
      screen.getByRole('button', { name: /voice · idle · click to talk/i })
    );

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /voice · error · mic denied/i })
      ).toBeInTheDocument()
    );
    expect(captions).toContainEqual(
      expect.objectContaining({ type: 'error', message: 'mic denied' })
    );
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EyesClosedHandle } from '@/components/canvas/EyesClosedHandle';
import { resetEyesClosedCaptureForTests } from '@/lib/voice/eyes-closed-store';
import type {
  VoiceFunctionCallEvent,
  VoiceOrbStateEvent,
  VoiceProvider,
  VoiceTranscriptEvent,
} from '@/lib/voice/types';

afterEach(() => {
  cleanup();
  resetEyesClosedCaptureForTests();
});

beforeEach(() => {
  resetEyesClosedCaptureForTests();
});

interface StubProvider {
  provider: VoiceProvider;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  emitTranscript(event: VoiceTranscriptEvent): void;
  emitState(state: VoiceOrbStateEvent['state']): void;
}

function createStubProvider(): StubProvider {
  let connected = false;
  const listeners = {
    state: new Set<(e: VoiceOrbStateEvent) => void>(),
    transcript: new Set<(e: VoiceTranscriptEvent) => void>(),
    fn: new Set<(e: VoiceFunctionCallEvent) => void>(),
    error: new Set<(e: Error) => void>(),
  };
  const connect = vi.fn(async () => {
    connected = true;
  });
  const disconnect = vi.fn(() => {
    connected = false;
  });
  const provider: VoiceProvider = {
    id: 'gemini-live',
    connect,
    disconnect,
    isConnected: () => connected,
    sendText: vi.fn(),
    sendFunctionResult: vi.fn(),
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
    emitTranscript(event) {
      listeners.transcript.forEach((l) => l(event));
    },
    emitState(state) {
      listeners.state.forEach((l) => l({ state, at: Date.now() }));
    },
  };
}

describe('EyesClosedHandle', () => {
  it('renders the eyes-closed chip in idle state with the correct accessible label', () => {
    render(
      <EyesClosedHandle
        provider={createStubProvider().provider}
        getSketchSnapshot={async () => ''}
        onCapture={vi.fn()}
      />
    );

    expect(
      screen.getByRole('button', { name: /eyes-closed · hold to sketch \+ speak/i })
    ).toBeInTheDocument();
  });

  it('connects on pointer-down, disconnects on pointer-up, and emits a capture with the joined transcript + sketch', async () => {
    const stub = createStubProvider();
    const onCapture = vi.fn();
    const sketch = 'data:image/png;base64,IIIII';

    render(
      <EyesClosedHandle
        provider={stub.provider}
        getSketchSnapshot={async () => sketch}
        onCapture={onCapture}
      />
    );

    const orb = screen.getByRole('button', {
      name: /eyes-closed · hold to sketch \+ speak/i,
    });

    // Pointer-down → connect, label flips to "recording".
    await act(async () => {
      fireEvent.pointerDown(orb, { pointerId: 1 });
    });
    await waitFor(() => expect(stub.connect).toHaveBeenCalledTimes(1));

    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: /eyes-closed · recording · release to dispatch/i,
        })
      ).toBeInTheDocument()
    );

    // Two final user transcripts arrive while the creator is sketching.
    act(() => {
      stub.emitTranscript({
        kind: 'final',
        speaker: 'user',
        text: 'make me a rainy moody product hero',
        at: Date.now(),
      });
      stub.emitTranscript({
        kind: 'final',
        speaker: 'user',
        text: 'with a hand holding the umbrella',
        at: Date.now(),
      });
      // Assistant chatter must be ignored — we only care about creator intent.
      stub.emitTranscript({
        kind: 'final',
        speaker: 'assistant',
        text: 'sure thing',
        at: Date.now(),
      });
    });

    // Pointer-up → disconnect, capture fires with full joined transcript.
    await act(async () => {
      fireEvent.pointerUp(orb, { pointerId: 1 });
    });

    await waitFor(() => expect(onCapture).toHaveBeenCalledTimes(1));
    expect(onCapture).toHaveBeenCalledWith({
      transcript:
        'make me a rainy moody product hero with a hand holding the umbrella',
      sketchImageUrl: sketch,
    });
    expect(stub.disconnect).toHaveBeenCalledTimes(1);
  });

  it('captures on spacebar hold + release while the canvas is the active surface', async () => {
    const stub = createStubProvider();
    const onCapture = vi.fn();

    render(
      <EyesClosedHandle
        provider={stub.provider}
        getSketchSnapshot={async () => 'data:image/png;base64,SKETCH'}
        onCapture={onCapture}
        hotkeyTarget="window"
      />
    );

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { code: 'Space', key: ' ' })
      );
    });
    await waitFor(() => expect(stub.connect).toHaveBeenCalledTimes(1));

    act(() => {
      stub.emitTranscript({
        kind: 'final',
        speaker: 'user',
        text: 'cinematic poster',
        at: Date.now(),
      });
    });

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keyup', { code: 'Space', key: ' ' })
      );
    });

    await waitFor(() => expect(onCapture).toHaveBeenCalledTimes(1));
    expect(onCapture.mock.calls[0][0]).toMatchObject({
      transcript: 'cinematic poster',
      sketchImageUrl: 'data:image/png;base64,SKETCH',
    });
  });

  it('does not double-fire when the spacebar key autorepeats', async () => {
    const stub = createStubProvider();
    const onCapture = vi.fn();

    render(
      <EyesClosedHandle
        provider={stub.provider}
        getSketchSnapshot={async () => ''}
        onCapture={onCapture}
        hotkeyTarget="window"
      />
    );

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { code: 'Space', key: ' ', repeat: false })
      );
    });
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { code: 'Space', key: ' ', repeat: true })
      );
    });
    await waitFor(() => expect(stub.connect).toHaveBeenCalledTimes(1));
  });

  it('does not capture when neither voice transcript nor sketch is available', async () => {
    const stub = createStubProvider();
    const onCapture = vi.fn();

    render(
      <EyesClosedHandle
        provider={stub.provider}
        getSketchSnapshot={async () => ''}
        onCapture={onCapture}
      />
    );

    const orb = screen.getByRole('button', {
      name: /eyes-closed · hold to sketch \+ speak/i,
    });

    await act(async () => {
      fireEvent.pointerDown(orb, { pointerId: 1 });
    });
    await act(async () => {
      fireEvent.pointerUp(orb, { pointerId: 1 });
    });

    // Empty hold — no transcript, no sketch — should not call onCapture.
    await new Promise((r) => setTimeout(r, 10));
    expect(onCapture).not.toHaveBeenCalled();
  });
});

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, Loader2 } from 'lucide-react';
import { IconButton } from '@/components/ui/IconButton';
import { fetchVoiceSession } from '@/lib/voice/session-client';
import { createVoiceProvider } from '@/lib/voice/realtime-client';
import type {
  VoiceProvider,
  VoiceSessionCredentials,
  VoiceTranscriptEvent,
} from '@/lib/voice/types';
import { cn } from '@/lib/utils/cn';

/**
 * Eyes-closed sketch + voice capture (issue #128 / Q7).
 *
 * Hold-to-record affordance: the creator presses + holds (pointer or
 * spacebar), narrates intent while sketching on the canvas, and on release
 * the handle bundles the captured user transcript with a sketch snapshot
 * and hands the pair to a parent-supplied dispatcher.
 *
 * Voice transport is provider-agnostic — `provider` is a DI seam so tests
 * inject a stub. The default path lazy-mints a session via
 * `/api/voice/session` (Gemini Live by env config) and instantiates the
 * matching adapter.
 *
 * Sketch capture is owned by the parent: we ask `getSketchSnapshot()` on
 * release because only the parent knows which strokes belong to *this* hold
 * (e.g. shapes added between pointer-down and pointer-up). Returning an
 * empty string means "nothing was sketched" — combined with an empty
 * transcript, the handle skips the dispatch (no work to do).
 */
export interface EyesClosedCaptureRequest {
  transcript: string;
  sketchImageUrl: string;
}

export interface EyesClosedHandleProps {
  /** DI seam: tests pass a stub VoiceProvider. */
  provider?: VoiceProvider;
  /** Override the session endpoint when not using the default. */
  sessionEndpoint?: string;
  /**
   * Called on release with the joined creator transcript + sketch snapshot.
   * Skipped when both are empty.
   */
  onCapture: (capture: EyesClosedCaptureRequest) => void | Promise<void>;
  /**
   * Returns the current sketch as a PNG data URL. Called once per release,
   * after the voice session has stopped. Empty string == no sketch.
   */
  getSketchSnapshot: () => Promise<string> | string;
  /** Optional caption hook — useful for test instrumentation. */
  onTranscript?: (event: VoiceTranscriptEvent) => void;
  /** Hotkey scope. 'window' is the eyes-closed default; 'none' disables it. */
  hotkeyTarget?: 'window' | 'none';
  /** Hotkey code (KeyboardEvent.code). Default: Space. */
  hotkeyCode?: string;
  className?: string;
}

const IDLE_LABEL = 'eyes-closed · hold to sketch + speak';
const RECORDING_LABEL = 'eyes-closed · recording · release to dispatch';
const PROCESSING_LABEL = 'eyes-closed · dispatching capture';

export function EyesClosedHandle({
  provider,
  sessionEndpoint,
  onCapture,
  getSketchSnapshot,
  onTranscript,
  hotkeyTarget = 'window',
  hotkeyCode = 'Space',
  className,
}: EyesClosedHandleProps) {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Provider lives in state so the subscription effect can re-attach when
  // it's lazily created.
  const [activeProvider, setActiveProvider] = useState<VoiceProvider | null>(
    provider ?? null
  );
  // Captured creator transcripts for the current hold. `final`-only so partial
  // streams don't pollute the dispatch payload. Reset on each hold start.
  const transcriptsRef = useRef<string[]>([]);
  // Avoid re-firing on spacebar autorepeat — keydown fires repeatedly while
  // the key is held so we gate with this flag.
  const hotkeyDownRef = useRef(false);

  useEffect(() => {
    if (provider && provider !== activeProvider) setActiveProvider(provider);
  }, [provider, activeProvider]);

  const ensureProvider = useCallback(async (): Promise<{
    provider: VoiceProvider;
    credentials?: VoiceSessionCredentials;
  }> => {
    if (activeProvider) return { provider: activeProvider };
    if (provider) {
      setActiveProvider(provider);
      return { provider };
    }
    const endpoint = sessionEndpoint ?? '/api/voice/session';
    const credentials = await fetchVoiceSession(endpoint);
    const next = createVoiceProvider(credentials.provider);
    setActiveProvider(next);
    return { provider: next, credentials };
  }, [activeProvider, provider, sessionEndpoint]);

  const transcriptCb = useRef(onTranscript);
  transcriptCb.current = onTranscript;

  // Subscribe to transcripts (creator only — `user` speaker) and errors. The
  // subscription survives across holds; only the buffer resets per hold.
  useEffect(() => {
    const active = activeProvider;
    if (!active) return;
    const offTranscript = active.onTranscript((event) => {
      transcriptCb.current?.(event);
      if (event.kind !== 'final' || event.speaker !== 'user') return;
      const text = event.text.trim();
      if (!text) return;
      transcriptsRef.current.push(text);
    });
    const offError = active.onError((err) => {
      setError(err.message);
    });
    return () => {
      offTranscript();
      offError();
    };
  }, [activeProvider]);

  // Disconnect on unmount so a held session doesn't leak past navigation.
  useEffect(() => {
    return () => {
      try {
        activeProvider?.disconnect();
      } catch {
        // ignore
      }
    };
  }, [activeProvider]);

  const startCapture = useCallback(async () => {
    if (recording || processing) return;
    setError(null);
    transcriptsRef.current = [];
    setRecording(true);
    try {
      const { provider: active, credentials } = await ensureProvider();
      if (!active.isConnected()) {
        await active.connect({ sessionEndpoint, credentials });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setRecording(false);
    }
  }, [ensureProvider, processing, recording, sessionEndpoint]);

  const finishCapture = useCallback(async () => {
    if (!recording) return;
    setRecording(false);
    setProcessing(true);
    const transcript = transcriptsRef.current.join(' ').trim();
    transcriptsRef.current = [];

    let sketchImageUrl = '';
    try {
      sketchImageUrl = (await getSketchSnapshot()) || '';
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }

    try {
      activeProvider?.disconnect();
    } catch {
      // ignore — disconnect is best-effort
    }

    if (transcript || sketchImageUrl) {
      try {
        await onCapture({ transcript, sketchImageUrl });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }

    setProcessing(false);
  }, [activeProvider, getSketchSnapshot, onCapture, recording]);

  const handlePointerDown = useCallback(() => {
    void startCapture();
  }, [startCapture]);

  const handlePointerUp = useCallback(() => {
    void finishCapture();
  }, [finishCapture]);

  // Spacebar hold = same as pointer hold. Skipped when `hotkeyTarget='none'`,
  // when an editable element is focused (input, textarea, contenteditable),
  // or when a modifier is pressed (Cmd+Space etc. is OS-level, not ours).
  useEffect(() => {
    if (hotkeyTarget === 'none') return;
    const target: Window | Document = window;

    const isEditable = (el: Element | null): boolean => {
      if (!el) return false;
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      const editable = (el as HTMLElement).isContentEditable;
      return Boolean(editable);
    };

    const onKeyDown = (event: Event) => {
      const e = event as KeyboardEvent;
      if (e.code !== hotkeyCode) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.repeat) return;
      if (isEditable(document.activeElement)) return;
      if (hotkeyDownRef.current) return;
      hotkeyDownRef.current = true;
      e.preventDefault();
      void startCapture();
    };
    const onKeyUp = (event: Event) => {
      const e = event as KeyboardEvent;
      if (e.code !== hotkeyCode) return;
      if (!hotkeyDownRef.current) return;
      hotkeyDownRef.current = false;
      e.preventDefault();
      void finishCapture();
    };

    target.addEventListener('keydown', onKeyDown);
    target.addEventListener('keyup', onKeyUp);
    return () => {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
    };
  }, [finishCapture, hotkeyCode, hotkeyTarget, startCapture]);

  const label = useMemo(() => {
    if (error) return `eyes-closed · error · ${error}`;
    if (processing) return PROCESSING_LABEL;
    if (recording) return RECORDING_LABEL;
    return IDLE_LABEL;
  }, [error, processing, recording]);

  const icon = useMemo(() => {
    if (processing) {
      return <Loader2 size={14} strokeWidth={1.75} className="animate-spin" />;
    }
    return <Eye size={14} strokeWidth={1.75} />;
  }, [processing]);

  return (
    <IconButton
      label={label}
      icon={icon}
      active={recording}
      variant={recording ? 'outline' : 'ghost'}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      data-eyes-closed-state={recording ? 'recording' : processing ? 'processing' : 'idle'}
      className={cn(
        recording && 'animate-pulse border-accent text-accent',
        className
      )}
    />
  );
}

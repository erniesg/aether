'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Mic, MicOff, Radio, Volume2 } from 'lucide-react';
import { IconButton } from '@/components/ui/IconButton';
import { fetchVoiceSession } from '@/lib/voice/session-client';
import type {
  VoiceFunctionCallEvent,
  VoiceOrbState,
  VoiceProvider,
  VoiceSessionCredentials,
  VoiceTranscriptEvent,
} from '@/lib/voice/types';
import { createVoiceProvider } from '@/lib/voice/realtime-client';
import {
  dispatchVoiceFunctionCall,
  type VoiceDispatchers,
} from '@/lib/voice/tools';
import { cn } from '@/lib/utils/cn';

export type VoiceCaptionEvent =
  | { type: 'transcript'; speaker: 'user' | 'assistant'; text: string; at: number }
  | { type: 'state'; state: VoiceOrbState; at: number }
  | { type: 'function'; name: string; ok: boolean; detail?: string; at: number }
  | { type: 'error'; message: string; at: number };

export interface VoiceOrbProps {
  dispatchers: VoiceDispatchers;
  onCaption?: (event: VoiceCaptionEvent) => void;
  /** Dependency-injection seam: tests pass a stub implementation. */
  provider?: VoiceProvider;
  /** Override the session endpoint (tests / e2e with a mocked route). */
  sessionEndpoint?: string;
  className?: string;
  /** Long-press threshold in ms before the orb switches to continuous mode. */
  longPressMs?: number;
}

const STATE_LABELS: Record<VoiceOrbState, string> = {
  idle: 'voice · idle · click to talk',
  listening: 'voice · listening',
  thinking: 'voice · thinking',
  speaking: 'voice · speaking',
};

export function VoiceOrb({
  dispatchers,
  onCaption,
  provider,
  sessionEndpoint,
  className,
  longPressMs = 400,
}: VoiceOrbProps) {
  const [state, setState] = useState<VoiceOrbState>('idle');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [continuous, setContinuous] = useState(false);
  // Keep provider in state (not a ref) so that when it's lazily constructed
  // the subscription effect re-fires and attaches its listeners.
  const [activeProvider, setActiveProvider] = useState<VoiceProvider | null>(
    provider ?? null
  );
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  useEffect(() => {
    return () => {
      try {
        activeProvider?.disconnect();
      } catch {
        // ignore
      }
    };
  }, [activeProvider]);

  // `onCaption` / `dispatchers` may change between renders, but the
  // subscription itself should attach once per provider.
  const dispatchersRef = useRef(dispatchers);
  const captionRef = useRef(onCaption);
  dispatchersRef.current = dispatchers;
  captionRef.current = onCaption;

  useEffect(() => {
    const active = activeProvider;
    if (!active) return;

    const offState = active.onStateChange((event) => {
      setState(event.state);
      captionRef.current?.({ type: 'state', state: event.state, at: event.at });
    });
    const offTranscript = active.onTranscript((event: VoiceTranscriptEvent) => {
      captionRef.current?.({
        type: 'transcript',
        speaker: event.speaker,
        text: event.text,
        at: event.at,
      });
    });
    const offFn = active.onFunctionCall(async (event: VoiceFunctionCallEvent) => {
      const outcome = await dispatchVoiceFunctionCall(
        event.name,
        event.arguments,
        dispatchersRef.current
      );
      captionRef.current?.({
        type: 'function',
        name: event.name,
        ok: outcome.ok,
        detail: outcome.ok ? outcome.detail : outcome.error,
        at: event.at,
      });
      active.sendFunctionResult({ callId: event.callId, output: outcome });
    });
    const offError = active.onError((err) => {
      setError(err.message);
      captionRef.current?.({
        type: 'error',
        message: err.message,
        at: Date.now(),
      });
    });
    return () => {
      offState();
      offTranscript();
      offFn();
      offError();
    };
  }, [activeProvider]);

  const connectIfNeeded = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const { provider: active, credentials } = await ensureProvider();
      if (active.isConnected()) return active;
      await active.connect({ sessionEndpoint, credentials });
      return active;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      onCaption?.({ type: 'error', message, at: Date.now() });
      throw err;
    } finally {
      setConnecting(false);
    }
  }, [ensureProvider, onCaption, sessionEndpoint]);

  const handleToggle = useCallback(async () => {
    const active = activeProvider ?? provider;
    if (continuous) {
      setContinuous(false);
      active?.disconnect();
      setState('idle');
      return;
    }
    if (active?.isConnected()) {
      active.disconnect();
      setState('idle');
      return;
    }
    try {
      await connectIfNeeded();
    } catch {
      // connectIfNeeded already surfaced the error
    }
  }, [activeProvider, connectIfNeeded, continuous, provider]);

  const handlePointerDown = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      setContinuous(true);
      void connectIfNeeded();
    }, longPressMs);
  }, [connectIfNeeded, longPressMs]);

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const icon = useMemo(() => {
    if (connecting) return <Loader2 size={14} strokeWidth={1.75} className="animate-spin" />;
    if (error) return <MicOff size={14} strokeWidth={1.75} />;
    if (state === 'speaking') return <Volume2 size={14} strokeWidth={1.75} />;
    if (state === 'thinking') return <Loader2 size={14} strokeWidth={1.75} className="animate-spin" />;
    if (state === 'listening' || continuous) return <Radio size={14} strokeWidth={1.75} />;
    return <Mic size={14} strokeWidth={1.75} />;
  }, [connecting, continuous, error, state]);

  const label = error
    ? `voice · error · ${error}`
    : connecting
    ? 'voice · connecting…'
    : continuous
    ? 'voice · continuous · click to stop'
    : STATE_LABELS[state];

  return (
    <IconButton
      label={label}
      icon={icon}
      active={state !== 'idle' || continuous}
      variant={continuous ? 'outline' : 'ghost'}
      onClick={handleToggle}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      data-voice-state={state}
      data-voice-continuous={continuous ? 'true' : undefined}
      className={cn(className)}
    />
  );
}

'use client';

import { useSyncExternalStore } from 'react';
import type { VoiceOrbState } from './types';

/**
 * Tiny global store for the voice caption line. ComposerStatus reads this
 * to render the active transcript / tool-call beneath the prompt composer.
 *
 * The store is intentionally one-deep: we only care about the most recent
 * caption the creator can act on. Historical transcripts belong on the
 * canvas or in run activity — not in this status strip.
 */

export interface VoiceCaption {
  state: VoiceOrbState;
  transcript: { speaker: 'user' | 'assistant'; text: string } | null;
  lastToolCall: { name: string; ok: boolean; detail?: string } | null;
  error: string | null;
  updatedAt: number;
}

const EMPTY: VoiceCaption = {
  state: 'idle',
  transcript: null,
  lastToolCall: null,
  error: null,
  updatedAt: 0,
};

let current: VoiceCaption = EMPTY;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // ignore
    }
  }
}

function set(next: VoiceCaption): void {
  current = next;
  notify();
}

export function getVoiceCaption(): VoiceCaption {
  return current;
}

export function setVoiceState(state: VoiceOrbState): void {
  set({ ...current, state, error: null, updatedAt: Date.now() });
}

export function setVoiceTranscript(
  speaker: 'user' | 'assistant',
  text: string
): void {
  set({
    ...current,
    transcript: text ? { speaker, text } : current.transcript,
    updatedAt: Date.now(),
  });
}

export function setVoiceToolCall(
  name: string,
  ok: boolean,
  detail?: string
): void {
  set({
    ...current,
    lastToolCall: { name, ok, detail },
    updatedAt: Date.now(),
  });
}

export function setVoiceError(message: string | null): void {
  set({ ...current, error: message, updatedAt: Date.now() });
}

export function resetVoiceCaptionForTests(): void {
  current = EMPTY;
  notify();
}

export function useVoiceCaption(): VoiceCaption {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => current,
    () => EMPTY
  );
}

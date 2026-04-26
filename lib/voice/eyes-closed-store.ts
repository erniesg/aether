'use client';

import { useSyncExternalStore } from 'react';
import type { SemanticCreativeComponent } from '@/lib/types/semantic-component';

/**
 * Latest "eyes-closed" capture — voice transcript + sketch snapshot + the
 * planner output that was synthesized from them. Right-rail "this focus"
 * subscribes via `useEyesClosedCapture`.
 *
 * One-deep on purpose: provenance for the most recent capture is what the
 * creator can act on. Earlier captures live in run activity, not here.
 */
export interface EyesClosedCapture {
  /** Stable id so the right rail can key off changes. */
  id: string;
  transcript: string;
  /** PNG data URL of the captured sketch (may be empty when no strokes). */
  sketchImageUrl: string;
  component: SemanticCreativeComponent | null;
  plannerMode: 'anthropic' | 'fallback' | 'pending' | 'error';
  plannerError?: string;
  capturedAt: number;
}

let current: EyesClosedCapture | null = null;
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

export function getEyesClosedCapture(): EyesClosedCapture | null {
  return current;
}

export function setEyesClosedCapture(next: EyesClosedCapture | null): void {
  current = next;
  notify();
}

export function patchEyesClosedCapture(
  patch: Partial<EyesClosedCapture>
): void {
  if (!current) return;
  current = { ...current, ...patch };
  notify();
}

export function resetEyesClosedCaptureForTests(): void {
  current = null;
  notify();
}

export function useEyesClosedCapture(): EyesClosedCapture | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => current,
    () => null
  );
}

'use client';

import { useSyncExternalStore } from 'react';
import type { AgentMotionStartResult } from './start';

const DEFAULT_WORKSPACE_ID = 'demo-ws';

type Listener = () => void;
type MotionStartByWorkspace = Record<string, AgentMotionStartResult | undefined>;

const listeners = new Set<Listener>();
let state: MotionStartByWorkspace = {};

function workspaceKey(workspaceId?: string): string {
  return workspaceId?.trim() || DEFAULT_WORKSPACE_ID;
}

function notify(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): MotionStartByWorkspace {
  return state;
}

function getServerSnapshot(): MotionStartByWorkspace {
  return {};
}

export function setMotionStartResult(
  workspaceId: string | undefined,
  result: AgentMotionStartResult
): void {
  state = {
    ...state,
    [workspaceKey(workspaceId)]: result,
  };
  notify();
}

export function getMotionStartResult(
  workspaceId?: string
): AgentMotionStartResult | undefined {
  return state[workspaceKey(workspaceId)];
}

export function useMotionStartResult(
  workspaceId?: string
): AgentMotionStartResult | undefined {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return snapshot[workspaceKey(workspaceId)];
}

export function motionStartSummary(result: AgentMotionStartResult | undefined): string {
  if (!result) return 'start';
  if (result.status === 'ready') {
    const appName = result.project?.brief.appProfile.name;
    return appName ? `${appName} video` : 'video ready';
  }
  if (result.status === 'needs-evidence') return 'needs PR';
  if (result.status === 'needs-source') return 'needs source';
  return 'planned';
}

export function resetMotionStartResultsForTests(): void {
  state = {};
  notify();
}

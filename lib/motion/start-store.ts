'use client';

import { useSyncExternalStore } from 'react';
import type { AgentMotionStartResult } from './start';
import { buildAgentMotionCapturePlan } from './capturePlan';
import { buildMotionAgentExecutionHandoff } from './agentHandoff';
import { buildMotionPreviewPlan } from './previewPlan';
import { buildMotionReviewPlan } from './reviewPlan';
import { listMotionWorkflowExamples } from './workflowExamples';

const DEFAULT_WORKSPACE_ID = 'demo-ws';
const STORAGE_KEY = 'aether.motion.startResults.v1';

type Listener = () => void;
type MotionStartByWorkspace = Record<string, AgentMotionStartResult | undefined>;

const EMPTY_STATE: MotionStartByWorkspace = {};
const listeners = new Set<Listener>();
let state: MotionStartByWorkspace = EMPTY_STATE;
let hydrated = false;

function workspaceKey(workspaceId?: string): string {
  return workspaceId?.trim() || DEFAULT_WORKSPACE_ID;
}

function notify(): void {
  for (const listener of listeners) listener();
}

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

function readStoredState(): MotionStartByWorkspace {
  if (!canUseLocalStorage()) return {};

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as MotionStartByWorkspace).map(([workspaceId, result]) => [
        workspaceId,
        result ? rehydrateMotionStartResult(result) : undefined,
      ])
    );
  } catch {
    return {};
  }
}

function writeStoredState(nextState: MotionStartByWorkspace): void {
  if (!canUseLocalStorage()) return;

  try {
    const compactState = Object.fromEntries(
      Object.entries(nextState)
        .filter((entry): entry is [string, AgentMotionStartResult] => Boolean(entry[1]))
        .map(([workspaceId, result]) => [workspaceId, compactMotionStartResult(result)])
    );
    if (Object.keys(compactState).length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(compactState));
  } catch {
    // Storage quota or privacy-mode failures should not break the creator loop.
  }
}

function hydrateFromStorage(): void {
  if (hydrated) return;
  hydrated = true;
  state = {
    ...readStoredState(),
    ...state,
  };
}

function compactMotionStartResult(result: AgentMotionStartResult): AgentMotionStartResult {
  if (!result.project || !result.previewPlan) return result;

  return {
    status: result.status,
    workflow: result.workflow,
    project: result.project,
    reviewPlan: null,
    previewPlan: null,
    capturePlan: null,
    agentHandoff: null,
    examples: [],
    requestedInputs: result.requestedInputs,
  };
}

function rehydrateMotionStartResult(result: AgentMotionStartResult): AgentMotionStartResult {
  if (!result.project || result.previewPlan) return result;

  try {
    const capturePlan = buildAgentMotionCapturePlan(result.project);
    return {
      ...result,
      reviewPlan: buildMotionReviewPlan(result.project),
      previewPlan: buildMotionPreviewPlan(result.project, {
        engines: result.workflow.plan.engines,
        workflowRunPlan: result.workflow.plan.runPlan,
        requestedAt: result.project.updatedAt,
      }),
      capturePlan: capturePlan.status === 'not-needed' ? null : capturePlan,
      agentHandoff: buildMotionAgentExecutionHandoff({
        workflow: result.workflow,
        project: result.project,
        capturePlan: capturePlan.status === 'not-needed' ? null : capturePlan,
      }),
      examples: listMotionWorkflowExamples(),
    };
  } catch {
    return result;
  }
}

function subscribe(listener: Listener): () => void {
  hydrateFromStorage();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): MotionStartByWorkspace {
  hydrateFromStorage();
  return state;
}

function getServerSnapshot(): MotionStartByWorkspace {
  return EMPTY_STATE;
}

export function setMotionStartResult(
  workspaceId: string | undefined,
  result: AgentMotionStartResult
): void {
  hydrateFromStorage();
  state = {
    ...state,
    [workspaceKey(workspaceId)]: result,
  };
  writeStoredState(state);
  notify();
}

export function getMotionStartResult(
  workspaceId?: string
): AgentMotionStartResult | undefined {
  hydrateFromStorage();
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
  state = EMPTY_STATE;
  hydrated = true;
  if (canUseLocalStorage()) window.localStorage.removeItem(STORAGE_KEY);
  notify();
}

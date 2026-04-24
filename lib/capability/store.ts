'use client';

import { useSyncExternalStore } from 'react';
import type {
  CapabilityDefinitionInit,
  CapabilityDefinitionRecord,
} from './types';
import { resolveCapabilityDefinitionEntryRef } from './types';

export type { CapabilityDefinitionRecord, CapabilityDefinitionInit } from './types';

/**
 * In-memory capability-definition registry. Same pattern as
 * `lib/store/runs.ts` — swap-in to Convex (`capabilityDefinition` table) is a
 * one-file change once the project is provisioned.
 */

type Listener = () => void;

const state = {
  defs: [] as CapabilityDefinitionRecord[],
};
const listeners = new Set<Listener>();

function notify() {
  for (const l of listeners) l();
}

function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function getSnapshot(): CapabilityDefinitionRecord[] {
  return state.defs;
}

const SERVER_SNAPSHOT: CapabilityDefinitionRecord[] = [];
function getServerSnapshot(): CapabilityDefinitionRecord[] {
  return SERVER_SNAPSHOT;
}

export function useCapabilityDefinitions(): CapabilityDefinitionRecord[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function genId(): string {
  return `cap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function addDefinition(init: CapabilityDefinitionInit): CapabilityDefinitionRecord {
  const record: CapabilityDefinitionRecord = {
    ...init,
    entryRef: resolveCapabilityDefinitionEntryRef(init),
    scope: init.scope ?? 'workspace',
    status: init.status ?? 'published',
    id: genId(),
    version: 1,
    createdAt: Date.now(),
  };
  state.defs = [record, ...state.defs];
  notify();
  return record;
}

export function updateDefinition(
  id: string,
  patch: Partial<Omit<CapabilityDefinitionRecord, 'id' | 'createdAt' | 'version'>>
): CapabilityDefinitionRecord | undefined {
  let next: CapabilityDefinitionRecord | undefined;
  state.defs = state.defs.map((d) => {
    if (d.id !== id) return d;
    next = { ...d, ...patch, version: d.version + 1 };
    return next;
  });
  if (next) notify();
  return next;
}

export function removeDefinition(id: string): void {
  const before = state.defs.length;
  state.defs = state.defs.filter((d) => d.id !== id);
  if (state.defs.length !== before) notify();
}

export function getDefinitionById(id: string): CapabilityDefinitionRecord | undefined {
  return state.defs.find((d) => d.id === id);
}

export function listDefinitions(): CapabilityDefinitionRecord[] {
  return state.defs;
}

export function clearDefinitions(): void {
  state.defs = [];
  notify();
}

'use client';

import { useSyncExternalStore } from 'react';
import type { CampaignPick } from './types';

/**
 * Minimal in-memory store for the current workspace campaign pick and the
 * open/closed state of the picker dialog. Swap-in to Convex (new
 * `campaignPick` table) is a one-file change once schema is provisioned; for
 * the hackathon the pick lives in module-local state so the left-rail
 * Campaign section and the canvas can read the same truth without
 * prop-drilling through WorkspaceShell.
 */

type Listener = () => void;

const state = {
  current: null as CampaignPick | null,
  pickerOpen: false,
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

function getPickSnapshot(): CampaignPick | null {
  return state.current;
}

function getServerPickSnapshot(): CampaignPick | null {
  return null;
}

function getOpenSnapshot(): boolean {
  return state.pickerOpen;
}

function getServerOpenSnapshot(): boolean {
  return false;
}

export function useCampaignPick(): CampaignPick | null {
  return useSyncExternalStore(subscribe, getPickSnapshot, getServerPickSnapshot);
}

export function useCampaignPickerOpen(): boolean {
  return useSyncExternalStore(subscribe, getOpenSnapshot, getServerOpenSnapshot);
}

export function setCampaignPick(
  pick: Omit<CampaignPick, 'pickedAt'> & { pickedAt?: number }
): CampaignPick {
  const next: CampaignPick = { ...pick, pickedAt: pick.pickedAt ?? Date.now() };
  state.current = next;
  notify();
  return next;
}

export function clearCampaignPick(): void {
  if (state.current === null) return;
  state.current = null;
  notify();
}

export function getCampaignPick(): CampaignPick | null {
  return state.current;
}

export function openCampaignPicker(): void {
  if (state.pickerOpen) return;
  state.pickerOpen = true;
  notify();
}

export function closeCampaignPicker(): void {
  if (!state.pickerOpen) return;
  state.pickerOpen = false;
  notify();
}

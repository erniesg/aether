'use client';

import type { CapabilityRunRecord } from '@/lib/store/runs.types';
import type { RunDetailsRecord, RunFrameRecord } from '@/lib/store/runDetails';

export interface ExportArtboardSpec {
  id: string;
  label: string;
  aspectRatio: string;
}

export interface ExportRequestPayload {
  workspaceId: string;
  artboards: ExportArtboardSpec[];
  runs: CapabilityRunRecord[];
  runDetails: RunDetailsRecord[];
  pinnedSkills: Array<{ definitionId: string; name: string }>;
  brandTokens?: { palette: string[]; typography: string[] };
}

interface ResolvedArtboardPayload {
  id: string;
  label: string;
  aspectRatio: string;
  prompt: string;
  capabilityRunIds: string[];
  provider: string;
  model: string;
  pngBase64: string;
}

export interface BuildExportRequestBodyResult {
  /** The POST body to send to `/api/export` — empty artboards if nothing was resolvable. */
  body: Record<string, unknown>;
  /** Artboard ids that had no completed generation to export. */
  skipped: string[];
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function fetchAsBase64(url: string): Promise<string | null> {
  if (url.startsWith('data:')) {
    const comma = url.indexOf(',');
    return comma >= 0 ? url.slice(comma + 1) : null;
  }
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    return toBase64(buf);
  } catch {
    return null;
  }
}

function runsByIdMap(runs: CapabilityRunRecord[]): Map<string, CapabilityRunRecord> {
  return new Map(runs.map((r) => [r.id, r]));
}

function detailsByIdMap(
  details: RunDetailsRecord[]
): Map<string, RunDetailsRecord> {
  return new Map(details.map((d) => [d.runId, d]));
}

function latestFrameFor(
  runs: CapabilityRunRecord[],
  detailsIndex: Map<string, RunDetailsRecord>,
  artboardId: string
): { run: CapabilityRunRecord; frame: RunFrameRecord } | null {
  const sorted = [...runs].sort(
    (a, b) => (b.finishedAt ?? b.startedAt) - (a.finishedAt ?? a.startedAt)
  );
  for (const run of sorted) {
    const details = detailsIndex.get(run.id);
    if (!details) continue;
    const frame = details.frames.find(
      (f) => f.id === artboardId && typeof f.imageUrl === 'string' && f.imageUrl
    );
    if (frame) return { run, frame };
  }
  return null;
}

function allRunIdsFor(
  runs: CapabilityRunRecord[],
  detailsIndex: Map<string, RunDetailsRecord>,
  artboardId: string
): string[] {
  const ids: string[] = [];
  for (const run of runs) {
    const details = detailsIndex.get(run.id);
    if (!details) continue;
    if (details.frames.some((f) => f.id === artboardId)) ids.push(run.id);
  }
  return ids;
}

/**
 * Collect the latest PNG for each artboard and shape the POST body for
 * `/api/export`. Artboards with no completed run are reported via `skipped`
 * rather than blocking the whole export — a partial pack is still useful.
 */
export async function buildExportRequestBody(
  args: ExportRequestPayload
): Promise<BuildExportRequestBodyResult> {
  const detailsIndex = detailsByIdMap(args.runDetails);
  const resolved: ResolvedArtboardPayload[] = [];
  const skipped: string[] = [];

  // Preserve the caller's artboard order so the manifest reads top-to-bottom
  // like the canvas: IG post, Story, Reel cover, LinkedIn.
  for (const board of args.artboards) {
    const match = latestFrameFor(args.runs, detailsIndex, board.id);
    if (!match) {
      skipped.push(board.id);
      continue;
    }
    const pngBase64 = await fetchAsBase64(match.frame.imageUrl!);
    if (!pngBase64) {
      skipped.push(board.id);
      continue;
    }
    resolved.push({
      id: board.id,
      label: board.label,
      aspectRatio: board.aspectRatio,
      prompt: match.run.rewrittenPrompt ?? match.run.prompt,
      capabilityRunIds: allRunIdsFor(args.runs, detailsIndex, board.id),
      provider: match.run.provider,
      model: match.run.model,
      pngBase64,
    });
  }

  return {
    body: {
      workspaceId: args.workspaceId,
      artboardIds: resolved.map((r) => r.id),
      artboards: resolved,
      pinnedSkills: args.pinnedSkills,
      brandTokens: args.brandTokens ?? { palette: [], typography: [] },
    },
    skipped,
  };
}

/**
 * Trigger an actual browser download of `/api/export`'s zip response. Uses a
 * hidden anchor + revokes the object URL on the next microtask — standard
 * "download a blob" dance.
 */
export async function downloadExportPack(
  workspaceId: string,
  body: Record<string, unknown>
): Promise<void> {
  const res = await fetch('/api/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let message = `export failed · http ${res.status}`;
    try {
      const json = (await res.json()) as { error?: string };
      if (json.error) message = json.error;
    } catch {
      // ignore parse errors — fall back to status line.
    }
    throw new Error(message);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `aether-${workspaceId}.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke after the current task so the download actually starts.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// Re-export so we don't pull a second copy of the types from a deep path
// in WorkspaceShell — and _runs.types export surface stays stable. Used by tests
// to exercise the builder without touching the DOM.
export type { RunDetailsRecord, RunFrameRecord, CapabilityRunRecord };

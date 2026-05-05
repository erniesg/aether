'use client';

import type { CapabilityRunRecord } from '@/lib/store/runs.types';
import type { RunDetailsRecord, RunFrameRecord } from '@/lib/store/runDetails';

export interface ExportArtboardSpec {
  id: string;
  label: string;
  aspectRatio: string;
  format?: string;
  platform?: string;
  platforms?: string[];
}

export interface ExportTextLayerMetadata {
  role: string;
  locale: string;
  text: string;
  format?: string;
  heroDirectionId?: string;
  scope?: string;
  sourceLocale?: string;
  localOverride?: boolean;
  localOverridesByLocale?: Record<string, boolean>;
  translatedFrom?: Record<string, string>;
}

export interface ExportRequestPayload {
  workspaceId: string;
  artboards: ExportArtboardSpec[];
  runs: CapabilityRunRecord[];
  runDetails: RunDetailsRecord[];
  pinnedSkills: Array<{ definitionId: string; name: string }>;
  brandTokens?: { palette: string[]; typography: string[] };
  /**
   * Optional live-canvas renderer. When present, export uses the current
   * artboard raster instead of the provider's last raw image URL, so edits
   * made on canvas are present in the final pack.
   */
  renderArtboardPngBase64?: (
    artboard: ExportArtboardSpec
  ) => Promise<string | null>;
  renderArtboardJpegBase64?: (
    artboard: ExportArtboardSpec
  ) => Promise<string | null>;
  renderArtboardSvg?: (
    artboard: ExportArtboardSpec
  ) => Promise<{ svg: string; width?: number; height?: number } | null>;
  collectTextLayers?: (
    artboard: ExportArtboardSpec
  ) => ExportTextLayerMetadata[];
  locale?: string;
  locales?: string[];
  languageMode?: 'single' | 'multilingual';
}

interface ResolvedArtboardPayload {
  id: string;
  label: string;
  aspectRatio: string;
  format?: string;
  locale?: string;
  locales?: string[];
  languageMode?: 'single' | 'multilingual';
  platform?: string;
  platforms?: string[];
  prompt: string;
  capabilityRunIds: string[];
  provider: string;
  model: string;
  pngBase64: string;
  jpegBase64?: string;
  svg?: string;
  width?: number;
  height?: number;
  textLayers?: ExportTextLayerMetadata[];
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
    let canvasPngBase64: string | null = null;
    try {
      canvasPngBase64 = (await args.renderArtboardPngBase64?.(board)) ?? null;
    } catch {
      canvasPngBase64 = null;
    }
    const pngBase64 = canvasPngBase64 ?? (await fetchAsBase64(match.frame.imageUrl!));
    if (!pngBase64) {
      skipped.push(board.id);
      continue;
    }
    let jpegBase64: string | null = null;
    let svgExport: { svg: string; width?: number; height?: number } | null = null;
    try {
      jpegBase64 = (await args.renderArtboardJpegBase64?.(board)) ?? null;
    } catch {
      jpegBase64 = null;
    }
    try {
      svgExport = (await args.renderArtboardSvg?.(board)) ?? null;
    } catch {
      svgExport = null;
    }
    resolved.push({
      id: board.id,
      label: board.label,
      aspectRatio: board.aspectRatio,
      format: board.format ?? formatFromAspectRatio(board.aspectRatio),
      locale: args.languageMode === 'multilingual' ? 'multilingual' : args.locale,
      locales:
        args.languageMode === 'multilingual'
          ? args.locales
          : args.locale
            ? [args.locale]
            : undefined,
      languageMode: args.languageMode,
      platform: board.platform,
      platforms: board.platforms ?? platformsFromAspectRatio(board.aspectRatio),
      prompt: match.run.rewrittenPrompt ?? match.run.prompt,
      capabilityRunIds: allRunIdsFor(args.runs, detailsIndex, board.id),
      provider: match.run.provider,
      model: match.run.model,
      pngBase64,
      jpegBase64: jpegBase64 ?? undefined,
      svg: svgExport?.svg,
      width: svgExport?.width,
      height: svgExport?.height,
      textLayers: args.collectTextLayers?.(board),
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

function formatFromAspectRatio(aspectRatio: string): string {
  switch (aspectRatio) {
    case '4:5':
      return '4x5';
    case '9:16':
      return '9x16';
    case '16:9':
      return '16x9';
    default:
      return '1x1';
  }
}

function platformsFromAspectRatio(aspectRatio: string): string[] {
  switch (aspectRatio) {
    case '4:5':
      return ['instagram', 'pinterest'];
    case '9:16':
      return ['tiktok', 'youtube-shorts', 'douyin', 'kuaishou'];
    case '16:9':
      return ['linkedin', 'x', 'bilibili'];
    default:
      return ['instagram'];
  }
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

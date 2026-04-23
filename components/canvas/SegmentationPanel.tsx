'use client';

import { X } from 'lucide-react';
import type { BackgroundFillSpec } from '@/lib/canvas/backgroundFill';
import {
  KNOWN_SEGMENTATION_PROVIDER_IDS,
  type SegmentationProviderId,
  type SegmentationRefinementMode,
  type SegmentationProviderStatus,
} from '@/lib/providers/segmentation/types';

export interface SegmentationPreviewPayload {
  sourceDataUrl: string;
  maskDataUrl: string;
  cutoutDataUrl: string;
  width: number;
  height: number;
  bbox?: { x: number; y: number; w: number; h: number };
  invertMask?: boolean;
  regions?: Array<{
    id?: string;
    label?: string;
    maskDataUrl: string;
    cutoutDataUrl: string;
    bbox?: { x: number; y: number; w: number; h: number };
    score?: number;
  }>;
  backgroundPlateDataUrl?: string;
}

export interface SegmentationPanelProps {
  open: boolean;
  verb: 'cutout' | 'removebg' | 'unmask';
  providerId: SegmentationProviderId;
  providers: ReadonlyArray<SegmentationProviderStatus>;
  providerStatusLoading?: boolean;
  prompt: string;
  pointCount: number;
  hasBox: boolean;
  refinementMode: SegmentationRefinementMode | null;
  loading?: boolean;
  approved?: boolean;
  error?: string;
  previewVisible?: boolean;
  backgroundFill: BackgroundFillSpec;
  onPromptChange: (value: string) => void;
  onProviderChange: (value: SegmentationProviderId) => void;
  onRefinementModeChange: (value: SegmentationRefinementMode | null) => void;
  onClearRefinement: () => void;
  onPreview: () => void;
  onPreviewVisibilityChange: (visible: boolean) => void;
  onApprove: () => void;
  onReject: () => void;
  onClose: () => void;
  onBackgroundModeChange: (value: BackgroundFillSpec['mode']) => void;
  onBackgroundColorAChange: (value: string) => void;
  onBackgroundColorBChange: (value: string) => void;
  onBackgroundOpacityChange: (value: number) => void;
  onApplyBackground: () => void;
  onApplyBackgroundPlate?: () => void;
  onUndo: () => void;
  onRedo: () => void;
  preview?: SegmentationPreviewPayload;
}

function labelForVerb(verb: 'cutout' | 'removebg' | 'unmask'): string {
  switch (verb) {
    case 'removebg':
      return 'remove background';
    case 'unmask':
      return 'unmask';
    default:
      return 'cutout';
  }
}

export function SegmentationPanel({
  open,
  verb,
  providerId,
  providers,
  providerStatusLoading = false,
  prompt,
  pointCount,
  hasBox,
  refinementMode,
  loading = false,
  approved = false,
  error,
  previewVisible = false,
  backgroundFill,
  onPromptChange,
  onProviderChange,
  onRefinementModeChange,
  onClearRefinement,
  onPreview,
  onPreviewVisibilityChange,
  onApprove,
  onReject,
  onClose,
  onBackgroundModeChange,
  onBackgroundColorAChange,
  onBackgroundColorBChange,
  onBackgroundOpacityChange,
  onApplyBackground,
  onApplyBackgroundPlate,
  onUndo,
  onRedo,
  preview,
}: SegmentationPanelProps) {
  if (!open) return null;

  const providerById = new Map(providers.map((provider) => [provider.id, provider]));
  const activeProvider = providerById.get(providerId);
  const activeProviderSupportsTextPrompt = activeProvider?.supportsTextPrompt ?? true;
  const activeProviderSupportsRefinement =
    activeProvider?.supportsPointPrompt || activeProvider?.supportsBoxPrompt;
  const hasAvailableProvider = providers.some((provider) => provider.available);
  const previewDisabled =
    loading ||
    providerStatusLoading ||
    !hasAvailableProvider ||
    activeProvider?.available === false;

  return (
    <aside className="pointer-events-auto absolute bottom-6 left-6 z-20 w-80 rounded-md border border-border bg-surface-panel p-3 shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="font-caption text-ink-dim">segmentation</span>
          <span className="font-caption text-sm text-ink">{labelForVerb(verb)}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xs p-1 text-ink-dim transition-colors hover:bg-surface-panel-muted hover:text-ink"
          aria-label="close segmentation panel"
        >
          <X size={14} strokeWidth={1.75} />
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-3">
        <div className="flex items-center gap-1">
          {KNOWN_SEGMENTATION_PROVIDER_IDS.map((id) => {
            const active = providerId === id;
            const provider = providerById.get(id);
            const disabled = providerStatusLoading || provider?.available === false;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onProviderChange(id)}
                disabled={disabled}
                title={provider?.unavailableReason}
                className={`rounded-pill border px-2 py-0.5 font-mono text-2xs uppercase tracking-wide transition-colors ${
                  active
                    ? 'border-accent bg-accent/10 text-accent'
                    : disabled
                      ? 'cursor-not-allowed border-border-soft bg-surface-panel-muted text-ink-faint opacity-60'
                      : 'border-border-soft bg-surface-panel-muted text-ink-dim hover:text-ink'
                }`}
              >
                {id}
              </button>
            );
          })}
        </div>

        {providerStatusLoading ? (
          <p className="font-caption text-2xs text-ink-dim">checking cutout providers…</p>
        ) : null}

        {!providerStatusLoading && activeProvider && !activeProviderSupportsTextPrompt ? (
          <p className="font-caption text-2xs text-ink-dim">
            {providerId} uses automatic masks. text prompt support lives on sam3.
          </p>
        ) : null}

        <div className="flex flex-col gap-1">
          <span className="font-caption text-ink-dim">refine</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() =>
                onRefinementModeChange(
                  refinementMode === 'point-fg' ? null : 'point-fg'
                )
              }
              disabled={!activeProviderSupportsRefinement}
              className={`rounded-pill border px-2 py-0.5 font-mono text-2xs uppercase tracking-wide transition-colors ${
                refinementMode === 'point-fg'
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border-soft bg-surface-panel-muted text-ink-dim hover:text-ink disabled:cursor-not-allowed disabled:text-ink-faint'
              }`}
            >
              fg point
            </button>
            <button
              type="button"
              onClick={() =>
                onRefinementModeChange(
                  refinementMode === 'point-bg' ? null : 'point-bg'
                )
              }
              disabled={!activeProviderSupportsRefinement}
              className={`rounded-pill border px-2 py-0.5 font-mono text-2xs uppercase tracking-wide transition-colors ${
                refinementMode === 'point-bg'
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border-soft bg-surface-panel-muted text-ink-dim hover:text-ink disabled:cursor-not-allowed disabled:text-ink-faint'
              }`}
            >
              bg point
            </button>
            <button
              type="button"
              onClick={() =>
                onRefinementModeChange(refinementMode === 'box' ? null : 'box')
              }
              disabled={!activeProviderSupportsRefinement}
              className={`rounded-pill border px-2 py-0.5 font-mono text-2xs uppercase tracking-wide transition-colors ${
                refinementMode === 'box'
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border-soft bg-surface-panel-muted text-ink-dim hover:text-ink disabled:cursor-not-allowed disabled:text-ink-faint'
              }`}
            >
              box
            </button>
            <button
              type="button"
              onClick={onClearRefinement}
              disabled={pointCount === 0 && !hasBox}
              className="rounded-sm border border-border-soft px-2 py-1 font-caption text-2xs text-ink transition-colors hover:bg-surface-panel-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              clear hints
            </button>
          </div>
          {activeProviderSupportsRefinement ? (
            <p className="font-caption text-2xs text-ink-dim">
              click the canvas for fg/bg points or drag a box. {pointCount} point
              {pointCount === 1 ? '' : 's'}
              {hasBox ? ' + box' : ''}
            </p>
          ) : (
            <p className="font-caption text-2xs text-ink-dim">
              interactive refinement lives on sam3.
            </p>
          )}
        </div>

        <label className="flex flex-col gap-1">
          <span className="font-caption text-ink-dim">prompt</span>
          <input
            aria-label="prompt"
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            disabled={!activeProviderSupportsTextPrompt}
            placeholder={
              activeProviderSupportsTextPrompt
                ? verb === 'removebg'
                  ? 'main subject'
                  : 'person holding the product'
                : 'automatic masks only'
            }
            className="rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1.5 font-caption text-xs text-ink outline-none transition-colors focus:border-accent"
          />
        </label>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPreview}
            disabled={previewDisabled}
            className="rounded-sm bg-accent px-3 py-1.5 font-caption text-xs text-ink-on-accent transition-opacity disabled:opacity-60"
          >
            {providerStatusLoading
              ? 'checking providers…'
              : loading
                ? 'previewing…'
                : 'preview cutout'}
          </button>
          <button
            type="button"
            onClick={onUndo}
            className="rounded-sm border border-border-soft px-2 py-1.5 font-caption text-xs text-ink transition-colors hover:bg-surface-panel-muted"
          >
            undo
          </button>
          <button
            type="button"
            onClick={onRedo}
            className="rounded-sm border border-border-soft px-2 py-1.5 font-caption text-xs text-ink transition-colors hover:bg-surface-panel-muted"
          >
            redo
          </button>
        </div>

        {error ? (
          <p className="rounded-sm border border-red-500/20 bg-red-500/5 px-2 py-1.5 font-caption text-xs text-red-300">
            {error}
          </p>
        ) : null}

        {preview ? (
          <div className="rounded-sm border border-border-soft bg-surface-panel-muted p-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onApprove}
                className="rounded-sm bg-accent px-3 py-1.5 font-caption text-xs text-ink-on-accent"
              >
                approve
              </button>
              <button
                type="button"
                onClick={() => onPreviewVisibilityChange(!previewVisible)}
                className="rounded-sm border border-border-soft px-3 py-1.5 font-caption text-xs text-ink transition-colors hover:bg-surface-panel"
              >
                {previewVisible ? 'hide preview' : 'show preview'}
              </button>
              <button
                type="button"
                onClick={onReject}
                className="rounded-sm border border-border-soft px-3 py-1.5 font-caption text-xs text-ink transition-colors hover:bg-surface-panel"
              >
                reject
              </button>
            </div>
            <p className="mt-2 font-caption text-2xs text-ink-dim">
              {approved
                ? 'cutout applied. paint a background behind it or undo.'
                : 'preview is on canvas. toggle it or approve to replace the selected image with the cutout.'}
            </p>
            {preview.regions && preview.regions.length > 1 ? (
              <p className="mt-1 font-caption text-2xs text-ink-dim">
                detected {preview.regions.length} separate regions from the mask.
              </p>
            ) : null}
            {preview.backgroundPlateDataUrl ? (
              <p className="mt-1 font-caption text-2xs text-ink-dim">
                a generated background plate is available for the removed area.
              </p>
            ) : null}
          </div>
        ) : null}

        {approved ? (
          <div className="flex flex-col gap-2 rounded-sm border border-border-soft bg-surface-panel-muted p-2">
            <span className="font-caption text-ink-dim">background</span>
            {preview?.backgroundPlateDataUrl ? (
              <button
                type="button"
                onClick={onApplyBackgroundPlate}
                className="rounded-sm border border-border-soft px-3 py-1.5 font-caption text-xs text-ink transition-colors hover:bg-surface-panel"
              >
                apply generated plate
              </button>
            ) : null}
            <div className="flex items-center gap-1">
              {(['solid', 'gradient'] as const).map((mode) => {
                const active = backgroundFill.mode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onBackgroundModeChange(mode)}
                    className={`rounded-pill border px-2 py-0.5 font-mono text-2xs uppercase tracking-wide transition-colors ${
                      active
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border-soft bg-surface-panel text-ink-dim hover:text-ink'
                    }`}
                  >
                    {mode}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 font-caption text-2xs text-ink-dim">
                A
                <input
                  type="color"
                  value={backgroundFill.colorA}
                  onChange={(event) => onBackgroundColorAChange(event.target.value)}
                  className="h-7 w-8 rounded-xs border border-border-soft bg-transparent p-0"
                />
              </label>
              {backgroundFill.mode === 'gradient' ? (
                <label className="flex items-center gap-1 font-caption text-2xs text-ink-dim">
                  B
                  <input
                    type="color"
                    value={backgroundFill.colorB}
                    onChange={(event) => onBackgroundColorBChange(event.target.value)}
                    className="h-7 w-8 rounded-xs border border-border-soft bg-transparent p-0"
                  />
                </label>
              ) : null}
            </div>

            <label className="flex flex-col gap-1">
              <span className="font-caption text-2xs text-ink-dim">
                opacity · {Math.round(backgroundFill.opacity * 100)}%
              </span>
              <input
                type="range"
                min="10"
                max="100"
                step="5"
                value={Math.round(backgroundFill.opacity * 100)}
                onChange={(event) =>
                  onBackgroundOpacityChange(Number(event.target.value) / 100)
                }
              />
            </label>

            <button
              type="button"
              onClick={onApplyBackground}
              className="rounded-sm border border-border-soft px-3 py-1.5 font-caption text-xs text-ink transition-colors hover:bg-surface-panel"
            >
              apply background fill
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

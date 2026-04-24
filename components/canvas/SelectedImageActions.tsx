'use client';

import { Download, Eye, EyeOff, Eraser, Scissors, Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export interface SelectedImageActionsProps {
  rect: { x: number; y: number; w: number; h: number };
  hasPreview?: boolean;
  previewVisible?: boolean;
  disabled?: boolean;
  onRemoveBg: () => void;
  onCutout: () => void;
  onEditRegion?: () => void;
  onDownloadOriginal?: () => void;
  onPreviewVisibilityChange?: (visible: boolean) => void;
}

export function SelectedImageActions({
  rect,
  hasPreview = false,
  previewVisible = false,
  disabled = false,
  onRemoveBg,
  onCutout,
  onEditRegion,
  onDownloadOriginal,
  onPreviewVisibilityChange,
}: SelectedImageActionsProps) {
  return (
    <div
      role="toolbar"
      aria-label="selected image actions"
      className="pointer-events-auto absolute z-[18] flex max-w-[calc(100%-16px)] items-center gap-1 rounded-md border border-border bg-surface-panel p-1 shadow-sm"
      style={{
        left: Math.max(8, rect.x + 8),
        top: Math.max(8, rect.y + 8),
      }}
    >
      <button
        type="button"
        onClick={onRemoveBg}
        disabled={disabled}
        className={cn(
          'inline-flex items-center gap-1 rounded-sm border px-2 py-1 font-caption text-xs transition-colors',
          'border-accent bg-accent/10 text-accent hover:bg-accent/15',
          'disabled:cursor-not-allowed disabled:opacity-50'
        )}
      >
        <Eraser size={13} strokeWidth={1.75} />
        remove bg
      </button>

      <button
        type="button"
        onClick={onCutout}
        disabled={disabled}
        className={cn(
          'inline-flex items-center gap-1 rounded-sm border px-2 py-1 font-caption text-xs transition-colors',
          'border-border-soft bg-surface-panel text-ink-dim hover:bg-surface-panel-muted hover:text-ink',
          'disabled:cursor-not-allowed disabled:opacity-50'
        )}
      >
        <Scissors size={13} strokeWidth={1.75} />
        segment
      </button>

      {onEditRegion ? (
        <button
          type="button"
          onClick={onEditRegion}
          disabled={disabled}
          className={cn(
            'inline-flex items-center gap-1 rounded-sm border px-2 py-1 font-caption text-xs transition-colors',
            'border-border-soft bg-surface-panel text-ink-dim hover:bg-surface-panel-muted hover:text-ink',
            'disabled:cursor-not-allowed disabled:opacity-50'
          )}
        >
          <Wand2 size={13} strokeWidth={1.75} />
          edit region
        </button>
      ) : null}

      {onDownloadOriginal ? (
        <button
          type="button"
          onClick={onDownloadOriginal}
          disabled={disabled}
          title="download original"
          aria-label="download original"
          className={cn(
            'inline-flex h-7 w-7 items-center justify-center rounded-sm border transition-colors',
            'border-border-soft bg-surface-panel text-ink-dim hover:bg-surface-panel-muted hover:text-ink',
            'disabled:cursor-not-allowed disabled:opacity-50'
          )}
        >
          <Download size={14} strokeWidth={1.75} />
        </button>
      ) : null}

      {hasPreview ? (
        <button
          type="button"
          onClick={() => onPreviewVisibilityChange?.(!previewVisible)}
          className="inline-flex items-center gap-1 rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink-dim transition-colors hover:bg-surface-panel-muted hover:text-ink"
        >
          {previewVisible ? <EyeOff size={13} strokeWidth={1.75} /> : <Eye size={13} strokeWidth={1.75} />}
          {previewVisible ? 'hide preview' : 'show preview'}
        </button>
      ) : null}
    </div>
  );
}

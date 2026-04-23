'use client';

import type { ChangeEvent } from 'react';
import {
  AlignCenter,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  AlignVerticalJustifyCenter,
  BringToFront,
  ChevronsDown,
  ChevronsUp,
  Eraser,
  Eye,
  EyeOff,
  Scissors,
  SendToBack,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export type OrderAction =
  | 'bring-forward'
  | 'bring-to-front'
  | 'send-backward'
  | 'send-to-back';

export type AlignAction =
  | 'left'
  | 'center-horizontal'
  | 'right'
  | 'top'
  | 'center-vertical'
  | 'bottom';

export type DistributeAction = 'horizontal' | 'vertical';

export interface SelectedImageActionsProps {
  rect: { x: number; y: number; w: number; h: number };
  /** Number of shapes in the current selection. Defaults to 1. */
  selectionCount?: number;
  /** Whether the sole selection is an image shape. Gates segmentation + opacity. */
  isSingleImage?: boolean;
  /** Current opacity (0–1). When combined with onOpacityChange, renders a slider. */
  opacity?: number;
  hasPreview?: boolean;
  previewVisible?: boolean;
  disabled?: boolean;
  onRemoveBg: () => void;
  onCutout: () => void;
  onPreviewVisibilityChange?: (visible: boolean) => void;
  onOpacityChange?: (opacity: number) => void;
  onOrder?: (action: OrderAction) => void;
  onAlign?: (action: AlignAction) => void;
  onDistribute?: (action: DistributeAction) => void;
}

const chipBase =
  'inline-flex items-center gap-1 rounded-sm border px-2 py-1 font-caption text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50';

const neutralChip = cn(
  chipBase,
  'border-border-soft bg-surface-panel text-ink-dim hover:bg-surface-panel-muted hover:text-ink'
);

const iconChip =
  'inline-flex h-7 w-7 items-center justify-center rounded-sm border border-border-soft bg-surface-panel text-ink-dim transition-colors hover:bg-surface-panel-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-50';

export function SelectedImageActions({
  rect,
  selectionCount = 1,
  isSingleImage = true,
  opacity,
  hasPreview = false,
  previewVisible = false,
  disabled = false,
  onRemoveBg,
  onCutout,
  onPreviewVisibilityChange,
  onOpacityChange,
  onOrder,
  onAlign,
  onDistribute,
}: SelectedImageActionsProps) {
  const showSegmentation = isSingleImage;
  const showOpacity =
    isSingleImage &&
    typeof opacity === 'number' &&
    typeof onOpacityChange === 'function';
  const showAlign = selectionCount >= 2 && (onAlign || onDistribute);
  const showOrder = Boolean(onOrder);

  const opacityPct = showOpacity ? Math.round((opacity as number) * 100) : 100;

  const handleOpacity = (event: ChangeEvent<HTMLInputElement>) => {
    if (!onOpacityChange) return;
    const pct = Number(event.target.value);
    const next = Number.isFinite(pct) ? pct / 100 : 1;
    onOpacityChange(next);
  };

  return (
    <div
      role="toolbar"
      aria-label="selected image actions"
      data-taxonomy="tool"
      className="pointer-events-auto absolute z-[18] flex max-w-[calc(100%-16px)] flex-wrap items-center gap-1 rounded-md border border-border bg-surface-panel p-1 shadow-sm"
      style={{
        left: Math.max(8, rect.x + 8),
        top: Math.max(8, rect.y - 44),
      }}
    >
      {showSegmentation ? (
        <>
          <button
            type="button"
            onClick={onRemoveBg}
            disabled={disabled}
            className={cn(
              chipBase,
              'border-accent bg-accent/10 text-accent hover:bg-accent/15'
            )}
          >
            <Eraser size={13} strokeWidth={1.75} />
            remove bg
          </button>

          <button
            type="button"
            onClick={onCutout}
            disabled={disabled}
            className={neutralChip}
          >
            <Scissors size={13} strokeWidth={1.75} />
            segment
          </button>

          {hasPreview ? (
            <button
              type="button"
              onClick={() => onPreviewVisibilityChange?.(!previewVisible)}
              className={neutralChip}
            >
              {previewVisible ? (
                <EyeOff size={13} strokeWidth={1.75} />
              ) : (
                <Eye size={13} strokeWidth={1.75} />
              )}
              {previewVisible ? 'hide preview' : 'show preview'}
            </button>
          ) : null}
        </>
      ) : null}

      {showOpacity ? (
        <>
          {showSegmentation ? (
            <span className="mx-0.5 h-5 w-px bg-border-soft" aria-hidden />
          ) : null}
          <div className="inline-flex items-center gap-1.5 px-1">
            <span className="font-caption text-2xs text-ink-faint">opacity</span>
            <input
              type="range"
              role="slider"
              aria-label="opacity"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={opacityPct}
              min={0}
              max={100}
              step={1}
              value={opacityPct}
              onChange={handleOpacity}
              disabled={disabled}
              className="h-1 w-20 cursor-pointer accent-accent"
            />
            <span className="min-w-[2.25rem] text-right font-mono text-2xs tabular-nums text-ink-dim">
              {opacityPct}%
            </span>
          </div>
        </>
      ) : null}

      {showOrder ? (
        <>
          {(showSegmentation || showOpacity) ? (
            <span className="mx-0.5 h-5 w-px bg-border-soft" aria-hidden />
          ) : null}
          <button
            type="button"
            aria-label="bring forward"
            onClick={() => onOrder?.('bring-forward')}
            disabled={disabled}
            className={iconChip}
          >
            <ChevronsUp size={13} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            aria-label="bring to front"
            onClick={() => onOrder?.('bring-to-front')}
            disabled={disabled}
            className={iconChip}
          >
            <BringToFront size={13} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            aria-label="send backward"
            onClick={() => onOrder?.('send-backward')}
            disabled={disabled}
            className={iconChip}
          >
            <ChevronsDown size={13} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            aria-label="send to back"
            onClick={() => onOrder?.('send-to-back')}
            disabled={disabled}
            className={iconChip}
          >
            <SendToBack size={13} strokeWidth={1.75} />
          </button>
        </>
      ) : null}

      {showAlign ? (
        <>
          <span className="mx-0.5 h-5 w-px bg-border-soft" aria-hidden />
          <button
            type="button"
            aria-label="align left"
            onClick={() => onAlign?.('left')}
            disabled={disabled}
            className={iconChip}
          >
            <AlignStartVertical size={13} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            aria-label="align center-horizontal"
            onClick={() => onAlign?.('center-horizontal')}
            disabled={disabled}
            className={iconChip}
          >
            <AlignCenter size={13} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            aria-label="align right"
            onClick={() => onAlign?.('right')}
            disabled={disabled}
            className={iconChip}
          >
            <AlignEndVertical size={13} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            aria-label="align top"
            onClick={() => onAlign?.('top')}
            disabled={disabled}
            className={iconChip}
          >
            <AlignStartHorizontal size={13} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            aria-label="align center-vertical"
            onClick={() => onAlign?.('center-vertical')}
            disabled={disabled}
            className={iconChip}
          >
            <AlignVerticalJustifyCenter size={13} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            aria-label="align bottom"
            onClick={() => onAlign?.('bottom')}
            disabled={disabled}
            className={iconChip}
          >
            <AlignEndHorizontal size={13} strokeWidth={1.75} />
          </button>
          <span className="mx-0.5 h-5 w-px bg-border-soft" aria-hidden />
          <button
            type="button"
            aria-label="distribute horizontal"
            onClick={() => onDistribute?.('horizontal')}
            disabled={disabled}
            className={iconChip}
          >
            <AlignHorizontalDistributeCenter size={13} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            aria-label="distribute vertical"
            onClick={() => onDistribute?.('vertical')}
            disabled={disabled}
            className={iconChip}
          >
            <AlignVerticalDistributeCenter size={13} strokeWidth={1.75} />
          </button>
        </>
      ) : null}
    </div>
  );
}

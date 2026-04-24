'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Check, Eraser, Undo2, X } from 'lucide-react';
import type { MaskStroke } from '@/lib/canvas/maskRaster';
import { cn } from '@/lib/utils/cn';

export interface MaskBrushCommit {
  prompt: string;
  strokes: ReadonlyArray<MaskStroke>;
}

export interface MaskBrushOverlayProps {
  /** Screen-space bounds of the target image. Overlay aligns exactly to this. */
  rect: { x: number; y: number; w: number; h: number };
  /** Intrinsic pixel dims of the source image. */
  imageSize: { width: number; height: number };
  /** Optional hint shown in the prompt placeholder (e.g. "replace shirt"). */
  promptHint?: string;
  /** Human-readable preset label surfaced below the prompt row. */
  presetHint?: string;
  busy?: boolean;
  errorMessage?: string | null;
  onCancel: () => void;
  onApply: (commit: MaskBrushCommit) => void;
}

const DEFAULT_RADIUS_NORM = 0.04;
const MIN_RADIUS_NORM = 0.01;
const MAX_RADIUS_NORM = 0.18;

function clientPointToNorm(
  e: ReactPointerEvent<HTMLCanvasElement>,
  rect: DOMRect
): { x: number; y: number } {
  return {
    x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
  };
}

/**
 * A lightweight mask-brush surface anchored to a selected image. Records
 * polyline strokes in normalized image coordinates, paints a live preview,
 * and fires onApply({prompt, strokes}) when the creator commits. The caller
 * is responsible for rasterizing the strokes (via `buildMaskPixels`) and
 * posting to /api/generate/edit.
 */
export function MaskBrushOverlay({
  rect,
  imageSize,
  promptHint,
  presetHint,
  busy = false,
  errorMessage,
  onCancel,
  onApply,
}: MaskBrushOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [strokes, setStrokes] = useState<MaskStroke[]>([]);
  const [current, setCurrent] = useState<MaskStroke | null>(null);
  const [radiusNorm, setRadiusNorm] = useState(DEFAULT_RADIUS_NORM);
  const [prompt, setPrompt] = useState('');

  const canApply = prompt.trim().length > 0 && strokes.length > 0 && !busy;
  const shortPx = Math.min(rect.w, rect.h);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (canvas.width !== Math.round(rect.w)) canvas.width = Math.round(rect.w);
    if (canvas.height !== Math.round(rect.h)) canvas.height = Math.round(rect.h);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(244, 114, 182, 0.38)';

    const drawStroke = (s: MaskStroke) => {
      const r = s.radius * shortPx;
      ctx.beginPath();
      for (const p of s.points) {
        const px = p.x * canvas.width;
        const py = p.y * canvas.height;
        ctx.moveTo(px + r, py);
        ctx.arc(px, py, r, 0, Math.PI * 2);
      }
      ctx.fill();
    };

    for (const s of strokes) drawStroke(s);
    if (current) drawStroke(current);
  }, [strokes, current, rect.w, rect.h, shortPx]);

  useEffect(() => {
    paint();
  }, [paint]);

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (busy) return;
      e.preventDefault();
      e.stopPropagation();
      const domRect = e.currentTarget.getBoundingClientRect();
      const point = clientPointToNorm(e, domRect);
      drawingRef.current = true;
      setCurrent({ points: [point], radius: radiusNorm });
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [busy, radiusNorm]
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      const domRect = e.currentTarget.getBoundingClientRect();
      const point = clientPointToNorm(e, domRect);
      setCurrent((prev) =>
        prev ? { ...prev, points: [...prev.points, point] } : prev
      );
    },
    []
  );

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      drawingRef.current = false;
      setCurrent((pending) => {
        if (pending && pending.points.length > 0) {
          setStrokes((prev) => [...prev, pending]);
        }
        return null;
      });
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // releasing a never-captured pointer is harmless
      }
    },
    []
  );

  const undo = () => {
    if (busy) return;
    setStrokes((prev) => prev.slice(0, -1));
  };

  const clear = () => {
    if (busy) return;
    setStrokes([]);
    setCurrent(null);
  };

  const apply = () => {
    if (!canApply) return;
    onApply({ prompt: prompt.trim(), strokes });
  };

  const sizePercent = useMemo(() => Math.round(radiusNorm * 100), [radiusNorm]);

  return (
    <div
      role="dialog"
      aria-label="mask brush editor"
      data-testid="mask-brush-overlay"
      className="pointer-events-auto absolute z-[22]"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    >
      <canvas
        ref={canvasRef}
        aria-label="mask brush surface"
        className={cn(
          'absolute inset-0 touch-none cursor-crosshair',
          busy && 'cursor-progress opacity-70'
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />

      <div className="pointer-events-auto absolute left-2 right-2 top-2 flex items-center justify-between gap-2 rounded-md border border-border bg-surface-panel/95 p-1.5 shadow-sm backdrop-blur">
        <div className="flex items-center gap-1.5 font-caption text-xs text-ink-dim">
          <span className="rounded-sm border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-accent">
            mask
          </span>
          <span>{imageSize.width}×{imageSize.height}</span>
          {presetHint ? <span>· {presetHint}</span> : null}
        </div>
        <div className="flex items-center gap-1">
          <label className="flex items-center gap-1 font-caption text-xs text-ink-dim">
            size
            <input
              type="range"
              min={Math.round(MIN_RADIUS_NORM * 100)}
              max={Math.round(MAX_RADIUS_NORM * 100)}
              value={sizePercent}
              onChange={(e) => setRadiusNorm(Number(e.target.value) / 100)}
              aria-label="brush size"
              className="h-1 w-20 accent-accent"
            />
          </label>
          <button
            type="button"
            onClick={undo}
            disabled={busy || strokes.length === 0}
            aria-label="undo stroke"
            className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-border-soft bg-surface-panel text-ink-dim transition-colors hover:bg-surface-panel-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Undo2 size={13} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={clear}
            disabled={busy || strokes.length === 0}
            aria-label="clear mask"
            className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-border-soft bg-surface-panel text-ink-dim transition-colors hover:bg-surface-panel-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Eraser size={13} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="cancel mask edit"
            className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-border-soft bg-surface-panel text-ink-dim transition-colors hover:bg-surface-panel-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X size={13} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <div className="pointer-events-auto absolute bottom-2 left-2 right-2 flex items-center gap-2 rounded-md border border-border bg-surface-panel/95 p-1.5 shadow-sm backdrop-blur">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={promptHint ?? 'describe the edit…'}
          disabled={busy}
          aria-label="edit prompt"
          className="flex-1 rounded-sm border border-border-soft bg-transparent px-2 py-1 font-caption text-sm text-ink outline-none placeholder:text-ink-dim/60 focus:border-accent disabled:opacity-50"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canApply) apply();
            if (e.key === 'Escape' && !busy) onCancel();
          }}
        />
        <button
          type="button"
          onClick={apply}
          disabled={!canApply}
          aria-label="apply edit"
          className="inline-flex items-center gap-1 rounded-sm border border-accent bg-accent/10 px-2.5 py-1 font-caption text-xs text-accent transition-colors hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Check size={13} strokeWidth={1.75} />
          apply
        </button>
      </div>

      {errorMessage ? (
        <div
          role="alert"
          className="pointer-events-auto absolute bottom-12 left-2 right-2 rounded-sm border border-red-500/50 bg-red-500/10 px-2 py-1 font-caption text-xs text-red-400"
        >
          {errorMessage}
        </div>
      ) : null}
    </div>
  );
}

'use client';

import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import { useRef } from 'react';
import type {
  SegmentationBoxPrompt,
  SegmentationPointPrompt,
  SegmentationRefinementMode,
} from '@/lib/providers/segmentation/types';

export interface SegmentationRefinementOverlayProps {
  rect: { x: number; y: number; w: number; h: number };
  imageSize: { width: number; height: number };
  mode: SegmentationRefinementMode | null;
  points: ReadonlyArray<SegmentationPointPrompt>;
  box?: SegmentationBoxPrompt;
  onAddPoint: (point: SegmentationPointPrompt) => void;
  onBoxChange: (box?: SegmentationBoxPrompt) => void;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function buildBox(
  start: { x: number; y: number },
  end: { x: number; y: number }
): SegmentationBoxPrompt {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const w = Math.max(1, Math.abs(end.x - start.x));
  const h = Math.max(1, Math.abs(end.y - start.y));
  return { x, y, w, h };
}

export function SegmentationRefinementOverlay({
  rect,
  imageSize,
  mode,
  points,
  box,
  onAddPoint,
  onBoxChange,
}: SegmentationRefinementOverlayProps) {
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const dragCurrent = useRef<{ x: number; y: number } | null>(null);
  const interactive = mode !== null;

  const toImagePoint = (
    event:
      | ReactMouseEvent<HTMLDivElement>
      | ReactPointerEvent<HTMLDivElement>
  ) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const relativeX = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
    const relativeY = clamp((event.clientY - bounds.top) / bounds.height, 0, 1);

    return {
      x: Math.round(relativeX * imageSize.width),
      y: Math.round(relativeY * imageSize.height),
    };
  };

  const getDragPoint = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = toImagePoint(event);
    if (Number.isFinite(point.x) && Number.isFinite(point.y)) {
      return point;
    }
    return dragCurrent.current ?? dragStart.current;
  };

  return (
    <div
      data-testid="segmentation-refinement-overlay"
      className={`absolute z-[16] ${interactive ? 'pointer-events-auto cursor-crosshair' : 'pointer-events-none'}`}
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
      }}
      onClick={(event) => {
        if (mode !== 'point-fg' && mode !== 'point-bg') return;
        const point = toImagePoint(event);
        onAddPoint({
          ...point,
          label: mode === 'point-fg' ? 'fg' : 'bg',
        });
      }}
      onPointerDown={(event) => {
        if (mode !== 'box') return;
        const point = toImagePoint(event);
        dragStart.current = point;
        dragCurrent.current = point;
        event.currentTarget.setPointerCapture(event.pointerId);
        onBoxChange({ x: point.x, y: point.y, w: 1, h: 1 });
      }}
      onPointerMove={(event) => {
        if (mode !== 'box' || !dragStart.current) return;
        const point = getDragPoint(event);
        if (!point) return;
        dragCurrent.current = point;
        onBoxChange(buildBox(dragStart.current, point));
      }}
      onPointerUp={(event) => {
        if (mode !== 'box' || !dragStart.current) return;
        const point = getDragPoint(event);
        if (point) {
          onBoxChange(buildBox(dragStart.current, point));
        }
        dragCurrent.current = null;
        dragStart.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
    >
      {points.map((point, index) => (
        <div
          key={`${point.label}-${point.x}-${point.y}-${index}`}
          className={`absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80 ${
            point.label === 'fg' ? 'bg-emerald-400' : 'bg-rose-400'
          }`}
          style={{
            left: `${(point.x / imageSize.width) * 100}%`,
            top: `${(point.y / imageSize.height) * 100}%`,
          }}
        />
      ))}

      {box ? (
        <div
          className="absolute border border-dashed border-amber-300/90 bg-amber-200/10"
          style={{
            left: `${(box.x / imageSize.width) * 100}%`,
            top: `${(box.y / imageSize.height) * 100}%`,
            width: `${(box.w / imageSize.width) * 100}%`,
            height: `${(box.h / imageSize.height) * 100}%`,
          }}
        />
      ) : null}
    </div>
  );
}

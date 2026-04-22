'use client';

import type { SegmentationPreviewPayload } from './SegmentationPanel';

export interface SegmentationPreviewOverlayProps {
  preview: SegmentationPreviewPayload;
  rect: { x: number; y: number; w: number; h: number };
}

function maskedStyle(maskUrl: string, tint: string, opacity: number, transform?: string) {
  return {
    position: 'absolute' as const,
    inset: 0,
    background: tint,
    opacity,
    transform,
    WebkitMaskImage: `url(${maskUrl})`,
    WebkitMaskSize: '100% 100%',
    WebkitMaskRepeat: 'no-repeat',
    maskImage: `url(${maskUrl})`,
    maskSize: '100% 100%',
    maskRepeat: 'no-repeat',
  };
}

export function SegmentationPreviewOverlay({
  preview,
  rect,
}: SegmentationPreviewOverlayProps) {
  const bbox = preview.bbox
    ? {
        left: (preview.bbox.x / preview.width) * rect.w,
        top: (preview.bbox.y / preview.height) * rect.h,
        width: (preview.bbox.w / preview.width) * rect.w,
        height: (preview.bbox.h / preview.height) * rect.h,
      }
    : null;

  return (
    <div
      className="pointer-events-none absolute z-[15]"
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
      }}
    >
      <div style={maskedStyle(preview.maskDataUrl, 'rgba(56, 189, 248, 0.95)', 1, 'translate(-1px, 0)')} />
      <div style={maskedStyle(preview.maskDataUrl, 'rgba(56, 189, 248, 0.95)', 1, 'translate(1px, 0)')} />
      <div style={maskedStyle(preview.maskDataUrl, 'rgba(56, 189, 248, 0.95)', 1, 'translate(0, -1px)')} />
      <div style={maskedStyle(preview.maskDataUrl, 'rgba(56, 189, 248, 0.95)', 1, 'translate(0, 1px)')} />
      <div style={maskedStyle(preview.maskDataUrl, 'rgba(56, 189, 248, 0.28)', 1)} />
      {bbox ? (
        <div
          className="absolute border border-dashed border-sky-300/80"
          style={{
            left: bbox.left,
            top: bbox.top,
            width: bbox.width,
            height: bbox.height,
          }}
        />
      ) : null}
    </div>
  );
}

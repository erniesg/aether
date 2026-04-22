'use client';

import type { SegmentationPreviewPayload } from './SegmentationPanel';

export interface SegmentationPreviewOverlayProps {
  preview: SegmentationPreviewPayload;
  rect: { x: number; y: number; w: number; h: number };
}

function maskedStyle(maskUrl: string, tint: string, opacity: number) {
  return {
    position: 'absolute' as const,
    inset: 0,
    background: tint,
    opacity,
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
      <div className="absolute inset-0 overflow-hidden rounded-[2px] border border-sky-300/50 bg-[#0f172a]">
        <div
          className="absolute inset-0 opacity-90"
          style={{
            backgroundImage:
              'linear-gradient(45deg, rgba(148,163,184,0.16) 25%, transparent 25%, transparent 75%, rgba(148,163,184,0.16) 75%), linear-gradient(45deg, rgba(148,163,184,0.16) 25%, transparent 25%, transparent 75%, rgba(148,163,184,0.16) 75%)',
            backgroundPosition: '0 0, 8px 8px',
            backgroundSize: '16px 16px',
          }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={preview.cutoutDataUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-fill"
        />
        <div style={maskedStyle(preview.maskDataUrl, 'rgba(56, 189, 248, 0.22)', 1)} />
      </div>
    </div>
  );
}

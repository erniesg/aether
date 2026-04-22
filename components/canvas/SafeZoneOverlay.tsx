'use client';

import type { CSSProperties } from 'react';
import { useEditor, useValue, type Editor } from 'tldraw';
import { getFrameShapes } from '@/lib/canvas/focusFrame';
import {
  getSafeZoneRect,
  hasVisibleSafeZone,
  resolveSafeZonePreset,
  type SafeZoneRect,
} from '@/lib/canvas/safeZones';

interface SafeZoneOverlayProps {
  visible: boolean;
}

interface OverlaySpec {
  id: string;
  frame: SafeZoneRect;
  safe: SafeZoneRect;
}

function buildOverlaySpecs(editor: Editor): OverlaySpec[] {
  const viewport = editor.getViewportScreenBounds();
  const zoom = editor.getZoomLevel();

  return getFrameShapes(editor).flatMap((shape) => {
    const preset = resolveSafeZonePreset(shape as {
      props?: { name?: string; w?: number; h?: number };
      meta?: Record<string, unknown>;
    });
    const bounds = editor.getShapePageBounds(shape.id);
    if (!preset || !hasVisibleSafeZone(preset) || !bounds) return [];

    const topLeft = editor.pageToScreen(bounds.point);
    const frame = {
      x: topLeft.x - viewport.x,
      y: topLeft.y - viewport.y,
      w: bounds.w * zoom,
      h: bounds.h * zoom,
    };
    return [
      {
        id: shape.id,
        frame,
        safe: getSafeZoneRect({ x: 0, y: 0, w: frame.w, h: frame.h }, preset.id),
      },
    ];
  });
}

function ZoneShade({
  style,
}: {
  style: CSSProperties;
}) {
  return <div className="absolute bg-black/10" style={style} />;
}

/**
 * Platform-safe overlays rendered in front of the canvas. They are not shapes:
 * creators shouldn't select them, and they should follow the camera rather
 * than participate in the document graph.
 */
export function SafeZoneOverlay({ visible }: SafeZoneOverlayProps) {
  const editor = useEditor();
  const overlays = useValue(
    'safe-zone-overlays',
    () => (visible ? buildOverlaySpecs(editor) : []),
    [editor, visible]
  );

  if (!visible || overlays.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[2]"
      data-testid="safe-zone-overlays"
      aria-hidden
    >
      {overlays.map((overlay) => {
        const { frame, safe } = overlay;
        const rightInset = Math.max(0, frame.w - (safe.x + safe.w));
        const bottomInset = Math.max(0, frame.h - (safe.y + safe.h));

        return (
          <div
            key={overlay.id}
            className="absolute overflow-hidden rounded-md"
            style={{
              left: frame.x,
              top: frame.y,
              width: frame.w,
              height: frame.h,
            }}
          >
            {safe.y > 0 ? (
              <ZoneShade style={{ left: 0, right: 0, top: 0, height: safe.y }} />
            ) : null}
            {safe.x > 0 ? (
              <ZoneShade style={{ left: 0, top: safe.y, width: safe.x, height: safe.h }} />
            ) : null}
            {rightInset > 0 ? (
              <ZoneShade
                style={{ right: 0, top: safe.y, width: rightInset, height: safe.h }}
              />
            ) : null}
            {bottomInset > 0 ? (
              <ZoneShade style={{ left: 0, right: 0, bottom: 0, height: bottomInset }} />
            ) : null}

            <div
              className="absolute rounded-md border border-accent/40 bg-accent/5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]"
              style={{
                left: safe.x,
                top: safe.y,
                width: safe.w,
                height: safe.h,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

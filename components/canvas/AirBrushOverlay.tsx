'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, MousePointer2, X } from 'lucide-react';
import { IconButton } from '@/components/ui/IconButton';
import {
  resolveAirBrushInputMode,
  translateMediaPipeHandLandmarksToAirBrushPoint,
  type AirBrushInputMode,
  type AirBrushPoint,
} from '@/lib/canvas/airBrush';
import {
  createMediaPipeHandLandmarker,
  type AirBrushHandLandmarker,
  type CreateAirBrushHandLandmarker,
} from '@/lib/canvas/mediaPipeHandLandmarker';
import { cn } from '@/lib/utils/cn';

export interface AirBrushOverlayProps {
  active: boolean;
  onActiveChange?: (active: boolean) => void;
  onPoint?: (point: AirBrushPoint) => void;
  onCapture?: (dataUrl: string) => void;
  createHandLandmarker?: CreateAirBrushHandLandmarker;
  className?: string;
  showInactiveButton?: boolean;
}

type CameraState = 'idle' | 'requesting' | 'ready' | 'error';
type TrackingState = 'idle' | 'loading' | 'ready' | 'error';

function labelForMode(mode: AirBrushInputMode, state: CameraState) {
  if (state === 'requesting') return 'air brush · camera';
  if (mode === 'camera-landmarks') return 'air brush · camera';
  if (mode === 'pointer-fallback') return 'air brush · pointer fallback';
  return 'air brush · unavailable';
}

export function AirBrushOverlay({
  active,
  onActiveChange,
  onPoint,
  onCapture,
  createHandLandmarker = createMediaPipeHandLandmarker,
  className,
  showInactiveButton = true,
}: AirBrushOverlayProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onPointRef = useRef(onPoint);
  const lastCameraPointRef = useRef<AirBrushPoint | null>(null);
  const cameraStrokeActiveRef = useRef(false);
  const [cameraState, setCameraState] = useState<CameraState>('idle');
  const [trackingState, setTrackingState] = useState<TrackingState>('idle');
  const [error, setError] = useState<string | null>(null);

  const captureReference = () => {
    const video = videoRef.current;
    if (!video || cameraState !== 'ready') return;
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    try {
      ctx.drawImage(video, 0, 0, width, height);
      onCapture?.(canvas.toDataURL('image/png'));
    } catch {
      setError('capture unavailable');
    }
  };

  useEffect(() => {
    onPointRef.current = onPoint;
  }, [onPoint]);

  useEffect(() => {
    if (!active) {
      setCameraState('idle');
      setTrackingState('idle');
      setError(null);
      if (cameraStrokeActiveRef.current) {
        const endPoint = translateMediaPipeHandLandmarksToAirBrushPoint({
          frame: null,
          previousPoint: lastCameraPointRef.current,
          activeStroke: true,
        });
        if (endPoint) onPointRef.current?.(endPoint);
      }
      cameraStrokeActiveRef.current = false;
      lastCameraPointRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      return;
    }

    let cancelled = false;
    setCameraState('requesting');
    setError(null);

    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.getUserMedia) {
      setCameraState('error');
      setError('camera unavailable');
      return;
    }

    mediaDevices
      .getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        setCameraState('ready');
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setCameraState('error');
        setError(err instanceof Error ? 'camera unavailable' : 'camera unavailable');
      });

    return () => {
      cancelled = true;
      if (cameraStrokeActiveRef.current) {
        const endPoint = translateMediaPipeHandLandmarksToAirBrushPoint({
          frame: null,
          previousPoint: lastCameraPointRef.current,
          activeStroke: true,
        });
        if (endPoint) onPointRef.current?.(endPoint);
      }
      cameraStrokeActiveRef.current = false;
      lastCameraPointRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [active]);

  useEffect(() => {
    if (!active || cameraState !== 'ready') {
      setTrackingState((current) => (current === 'idle' ? current : 'idle'));
      return;
    }

    let cancelled = false;
    let frameId = 0;
    let landmarker: AirBrushHandLandmarker | null = null;

    const endActiveStroke = () => {
      if (!cameraStrokeActiveRef.current) return;
      const endPoint = translateMediaPipeHandLandmarksToAirBrushPoint({
        frame: null,
        previousPoint: lastCameraPointRef.current,
        activeStroke: true,
      });
      if (endPoint) onPointRef.current?.(endPoint);
      cameraStrokeActiveRef.current = false;
      lastCameraPointRef.current = null;
    };

    const tick = (timestamp: number) => {
      if (cancelled || !landmarker) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2) {
        try {
          const point = translateMediaPipeHandLandmarksToAirBrushPoint({
            frame: landmarker.detectForVideo(video, timestamp),
            previousPoint: lastCameraPointRef.current,
            activeStroke: cameraStrokeActiveRef.current,
          });

          if (point) {
            onPointRef.current?.(point);
            if (point.state === 'end') {
              cameraStrokeActiveRef.current = false;
              lastCameraPointRef.current = null;
            } else {
              cameraStrokeActiveRef.current = true;
              lastCameraPointRef.current = point;
            }
          }
        } catch {
          setTrackingState('error');
          endActiveStroke();
          return;
        }
      }

      frameId = window.requestAnimationFrame(tick);
    };

    setTrackingState('loading');
    createHandLandmarker()
      .then((nextLandmarker) => {
        if (cancelled) {
          nextLandmarker.close?.();
          return;
        }
        landmarker = nextLandmarker;
        setTrackingState('ready');
        frameId = window.requestAnimationFrame(tick);
      })
      .catch(() => {
        if (!cancelled) setTrackingState('error');
      });

    return () => {
      cancelled = true;
      if (frameId) window.cancelAnimationFrame(frameId);
      endActiveStroke();
      landmarker?.close?.();
    };
  }, [active, cameraState, createHandLandmarker]);

  if (!active) {
    if (!showInactiveButton) return null;
    return (
      <button
        type="button"
        onClick={() => onActiveChange?.(true)}
        className={cn(
          'pointer-events-auto absolute left-4 top-4 z-20 inline-flex items-center gap-2 rounded-md border border-border bg-surface-panel px-2.5 py-1.5 font-mono text-2xs uppercase tracking-wide text-ink shadow-sm',
          'transition-colors duration-fast ease-quick hover:border-accent hover:text-accent',
          className
        )}
      >
        <Camera size={13} strokeWidth={1.8} />
        turn on air brush
      </button>
    );
  }

  const mode = resolveAirBrushInputMode({
    cameraReady: cameraState === 'ready',
    landmarksReady: trackingState === 'ready',
    pointerFallbackReady: true,
  });
  const hint =
    error ??
    (trackingState === 'loading'
      ? 'finding finger'
      : trackingState === 'ready'
        ? 'draw with finger'
        : 'draw on canvas');

  return (
    <aside
      aria-label="air brush"
      className={cn(
        'pointer-events-none absolute left-4 bottom-4 z-20 flex w-44 flex-col overflow-hidden rounded-md border border-border bg-surface-panel/95 shadow-sm backdrop-blur',
        className
      )}
    >
      <div className="relative aspect-[4/3] bg-ink">
        <video
          ref={videoRef}
          aria-label="air brush camera preview"
          autoPlay
          muted
          playsInline
          className={cn(
            'h-full w-full object-cover opacity-80',
            cameraState !== 'ready' && 'opacity-20'
          )}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(255,214,102,0.12),rgba(3,7,18,0.58)_70%)]" />
        <div className="absolute left-2 top-2 inline-flex h-6 items-center gap-1 rounded-sm border border-white/15 bg-black/45 px-2 font-mono text-[9px] uppercase tracking-wide text-white/85">
          <Camera size={11} strokeWidth={1.7} />
          live
        </div>
      </div>

      <div className="flex items-center gap-2 px-2 py-1.5">
        <MousePointer2 size={12} strokeWidth={1.8} className="shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-2xs uppercase tracking-wide text-ink">
            {labelForMode(mode, cameraState)}
          </div>
          <div className="truncate font-caption text-ink-dim">{hint}</div>
        </div>
        <div className="pointer-events-auto flex items-center gap-1">
          <IconButton
            label="capture air brush reference"
            icon={<ImagePlus size={12} strokeWidth={1.8} />}
            onClick={captureReference}
          />
          <IconButton
            label="turn off air brush"
            icon={<X size={12} strokeWidth={1.8} />}
            onClick={() => onActiveChange?.(false)}
          />
        </div>
      </div>
    </aside>
  );
}

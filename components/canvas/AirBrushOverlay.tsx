'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Camera, ImagePlus, MousePointer2, X } from 'lucide-react';
import { IconButton } from '@/components/ui/IconButton';
import {
  detectOpenPalm,
  evaluateMediaPipeHandLandmarks,
  getAirBrushVideoDebug,
  messageFromUnknownError,
  normalizeAirBrushPoint,
  recordAirBrushDebugEvent,
  resolveAirBrushInputMode,
  translateMediaPipeHandLandmarksToAirBrushPoint,
  type AirBrushDebugStage,
  type AirBrushCaptureMode,
  type AirBrushHandedness,
  type AirBrushHandLandmark,
  type AirBrushHandLandmarkFrame,
  type AirBrushInputMode,
  type AirBrushLandmarkEvaluation,
  type AirBrushLandmarkMetrics,
  type AirBrushPoint,
  type AirBrushPointIntent,
  type AirBrushRejectionReason,
  type AirBrushVideoDebug,
} from '@/lib/canvas/airBrush';
import {
  airBrushStrokeOptionsFromProfile,
  createAirBrushCalibrationProfile,
  stabilizeAirBrushPoint,
  type AirBrushCalibrationProfile,
} from '@/lib/canvas/airBrushCalibration';
import { AirBrushStrokeMachine } from '@/lib/canvas/airBrushStrokeMachine';
import {
  createMediaPipeHandLandmarker,
  type AirBrushHandLandmarker,
  type CreateAirBrushHandLandmarker,
} from '@/lib/canvas/mediaPipeHandLandmarker';
import { cn } from '@/lib/utils/cn';

export interface AirBrushOverlayProps {
  active: boolean;
  mode?: AirBrushCaptureMode;
  targetText?: string;
  onActiveChange?: (active: boolean) => void;
  onPoint?: (point: AirBrushPoint) => void;
  onCapture?: (dataUrl: string) => void;
  /**
   * Fires when the creator sustains an open-palm "done" gesture long enough to
   * commit the air-brush session. Parents should await their capture flow —
   * the overlay calls this then hands off the active-change to the parent.
   */
  onEndAirBrush?: () => void | Promise<void>;
  openPalmEndEnabled?: boolean;
  drawHand?: AirBrushHandedness;
  eraseHand?: AirBrushHandedness | null;
  createHandLandmarker?: CreateAirBrushHandLandmarker;
  className?: string;
  showInactiveButton?: boolean;
}

// Pen-down debounce: require 2 consecutive pinch-closed frames before
// emitting a tldraw pointer_down. The first frame's thumb-on-index jitter
// moves the index tip landmark by a few pixels; without this, every pinch
// leaves a tiny dot at the start of the stroke.
const PINCH_WARMUP_FRAMES = 2;
const BLIND_SIGNATURE_CALIBRATION_FRAMES = 12;
// Open-palm gesture: sustain for this many frames (~0.33s at 30fps) before
// auto-capturing. Short enough to feel responsive, long enough to avoid
// triggering while the creator is momentarily between strokes.
const OPEN_PALM_HOLD_FRAMES = 10;

type CameraState = 'idle' | 'requesting' | 'ready' | 'error';
type TrackingState = 'idle' | 'loading' | 'ready' | 'error';
type BlindSignaturePreflightState = 'idle' | 'calibrating' | 'ready';
type AcceptedHandIntents = Partial<Record<AirBrushHandedness, AirBrushPointIntent>>;

const HAND_LANDMARK_CONNECTIONS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
] as const;

interface AirBrushRejectionSnapshot {
  reason: AirBrushRejectionReason;
  metrics?: AirBrushLandmarkMetrics;
}

interface AirBrushOverlayDebugInfo {
  frameCount: number;
  skippedFrameCount: number;
  detectErrorCount: number;
  emittedPointCount: number;
  lastStage: AirBrushDebugStage;
  lastError: string | null;
  video: AirBrushVideoDebug | null;
  lastRejection: AirBrushRejectionSnapshot | null;
}

const INITIAL_AIR_BRUSH_DEBUG_INFO: AirBrushOverlayDebugInfo = {
  frameCount: 0,
  skippedFrameCount: 0,
  detectErrorCount: 0,
  emittedPointCount: 0,
  lastStage: 'inactive',
  lastError: null,
  video: null,
  lastRejection: null,
};

// Rank rejection reasons so the most informative one wins when the draw and
// erase evaluations disagree. `handedness-mismatch` is lowest priority because
// it just means "this hand isn't the preferred side" and says nothing about
// why the overall gate is failing.
const REJECTION_REASON_PRIORITY: Record<AirBrushRejectionReason, number> = {
  'index-too-close': 5,
  'palm-too-small': 4,
  'tip-missing': 3,
  'handedness-low': 2,
  'open-palm-reset': 1,
  'pinch-open': 1,
  'no-hand': 0,
  'handedness-mismatch': -1,
};

function pickPrimaryRejection(
  evaluations: ReadonlyArray<AirBrushLandmarkEvaluation>
): AirBrushRejectionSnapshot | null {
  let best: { reason: AirBrushRejectionReason; metrics?: AirBrushLandmarkMetrics } | null = null;
  for (const evaluation of evaluations) {
    if (evaluation.accepted || !evaluation.reason) continue;
    const priority = REJECTION_REASON_PRIORITY[evaluation.reason];
    const bestPriority = best ? REJECTION_REASON_PRIORITY[best.reason] : -1;
    if (priority > bestPriority) {
      best = { reason: evaluation.reason, metrics: evaluation.metrics };
    }
  }
  return best;
}

function formatRejectionReason(reason: AirBrushRejectionReason): string {
  switch (reason) {
    case 'no-hand':
      return 'show hand';
    case 'handedness-mismatch':
      return 'raise both hands';
    case 'handedness-low':
      return 'hand unclear';
    case 'tip-missing':
      return 'tip missing';
    case 'palm-too-small':
      return 'move closer';
    case 'index-too-close':
      return 'extend index';
    case 'open-palm-reset':
      return 'raise index';
    case 'pinch-open':
      return 'pinch thumb + index';
  }
}

function formatRejectionHint(rejection: AirBrushRejectionSnapshot | null): string | null {
  if (!rejection) return null;
  const label = formatRejectionReason(rejection.reason);
  const reach = rejection.metrics?.indexReach;
  const required = rejection.metrics?.requiredReach;
  if (
    rejection.reason === 'index-too-close' &&
    typeof reach === 'number' &&
    typeof required === 'number'
  ) {
    return `${label} · ${reach.toFixed(2)}/${required.toFixed(2)}`;
  }
  const score = rejection.metrics?.score;
  if (rejection.reason === 'handedness-low' && typeof score === 'number') {
    return `${label} · ${score.toFixed(2)}`;
  }
  const palm = rejection.metrics?.palmSpan;
  if (rejection.reason === 'palm-too-small' && typeof palm === 'number') {
    return `${label} · ${palm.toFixed(2)}`;
  }
  const pinchDistance = rejection.metrics?.pinchDistance;
  const pinchThreshold = rejection.metrics?.pinchThreshold;
  if (
    rejection.reason === 'pinch-open' &&
    typeof pinchDistance === 'number' &&
    typeof pinchThreshold === 'number'
  ) {
    return `${label} · ${pinchDistance.toFixed(2)}/${pinchThreshold.toFixed(2)}`;
  }
  return label;
}

function formatDebugTime(value?: number) {
  if (value === undefined) return '-';
  return value.toFixed(2);
}

function roundDebugNumber(value: number) {
  return Number(value.toFixed(3));
}

function normalizeOverlayHandedness(value: unknown): AirBrushHandedness | null {
  if (value === 'Left' || value === 'Right') return value;
  if (typeof value !== 'string') return null;
  const normalized = value.toLowerCase();
  if (normalized === 'left') return 'Left';
  if (normalized === 'right') return 'Right';
  return null;
}

function resolveOverlayHandedness(
  frame: AirBrushHandLandmarkFrame,
  handIndex: number
): AirBrushHandedness | null {
  const category = (frame.handedness ?? frame.handednesses)?.[handIndex]?.[0];
  return (
    normalizeOverlayHandedness(category?.categoryName) ??
    normalizeOverlayHandedness(category?.displayName)
  );
}

function resolvePreviewCanvas(
  canvas: HTMLCanvasElement | null
): { ctx: CanvasRenderingContext2D; width: number; height: number } | null {
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const width = rect.width || canvas.clientWidth || 224;
  const height = rect.height || canvas.clientHeight || 168;
  const dpr =
    typeof window === 'undefined'
      ? 1
      : Math.min(window.devicePixelRatio || 1, 2);
  const bitmapWidth = Math.max(1, Math.round(width * dpr));
  const bitmapHeight = Math.max(1, Math.round(height * dpr));
  if (canvas.width !== bitmapWidth) canvas.width = bitmapWidth;
  if (canvas.height !== bitmapHeight) canvas.height = bitmapHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width, height };
}

function clearHandLandmarkOverlay(canvas: HTMLCanvasElement | null) {
  const surface = resolvePreviewCanvas(canvas);
  if (!surface) return;
  surface.ctx.clearRect(0, 0, surface.width, surface.height);
}

function clearLiveInkCanvas(canvas: HTMLCanvasElement | null) {
  const surface = resolvePreviewCanvas(canvas);
  if (!surface) return;
  surface.ctx.clearRect(0, 0, surface.width, surface.height);
}

function drawLiveInkSegment({
  canvas,
  from,
  to,
}: {
  canvas: HTMLCanvasElement | null;
  from: AirBrushPoint | null;
  to: AirBrushPoint;
}) {
  const surface = resolvePreviewCanvas(canvas);
  if (!surface || !from || to.state === 'start' || to.state === 'end') return;
  const { ctx, width, height } = surface;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle =
    to.intent === 'erase' ? 'rgba(255,255,255,0.78)' : 'rgba(216,112,64,0.92)';
  ctx.lineWidth = to.intent === 'erase' ? 18 : 5;
  ctx.beginPath();
  ctx.moveTo(from.x * width, from.y * height);
  ctx.lineTo(to.x * width, to.y * height);
  ctx.stroke();
  ctx.restore();
}

function mapLandmarkToPreview(
  landmark: AirBrushHandLandmark,
  video: HTMLVideoElement | null,
  width: number,
  height: number
) {
  const videoWidth = video?.videoWidth || width;
  const videoHeight = video?.videoHeight || height;
  const videoAspect = videoWidth / videoHeight;
  const boxAspect = width / height;
  const drawWidth = videoAspect > boxAspect ? height * videoAspect : width;
  const drawHeight = videoAspect > boxAspect ? height : width / videoAspect;
  const offsetX = (width - drawWidth) / 2;
  const offsetY = (height - drawHeight) / 2;
  return {
    x: offsetX + landmark.x * drawWidth,
    y: offsetY + landmark.y * drawHeight,
  };
}

function drawHandLandmarkOverlay({
  canvas,
  video,
  frame,
  acceptedIntents,
}: {
  canvas: HTMLCanvasElement | null;
  video: HTMLVideoElement | null;
  frame: AirBrushHandLandmarkFrame;
  acceptedIntents: AcceptedHandIntents;
}) {
  const surface = resolvePreviewCanvas(canvas);
  if (!surface) return;
  const { ctx, width, height } = surface;
  ctx.clearRect(0, 0, width, height);
  const hands = frame.landmarks ?? [];
  if (!hands.some((hand) => hand.length > 0)) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const [handIndex, hand] of hands.entries()) {
    if (hand.length === 0) continue;
    const handedness = resolveOverlayHandedness(frame, handIndex);
    const acceptedIntent = handedness ? acceptedIntents[handedness] : undefined;
    const lineColor =
      acceptedIntent === 'draw'
        ? 'rgba(94, 234, 212, 0.92)'
        : acceptedIntent === 'erase'
          ? 'rgba(248, 113, 113, 0.94)'
          : 'rgba(251, 146, 60, 0.9)';
    const dotColor =
      acceptedIntent === 'draw'
        ? 'rgba(224, 242, 254, 0.96)'
        : acceptedIntent === 'erase'
          ? 'rgba(254, 226, 226, 0.96)'
          : 'rgba(254, 215, 170, 0.95)';
    const tipColor =
      acceptedIntent === 'draw'
        ? 'rgba(16, 185, 129, 1)'
        : acceptedIntent === 'erase'
          ? 'rgba(239, 68, 68, 1)'
          : 'rgba(251, 191, 36, 1)';
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = acceptedIntent ? 2 : 1.5;
    const points = hand.map((landmark) =>
      mapLandmarkToPreview(landmark, video, width, height)
    );
    for (const [from, to] of HAND_LANDMARK_CONNECTIONS) {
      const start = points[from];
      const end = points[to];
      if (!start || !end) continue;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }

    points.forEach((point, index) => {
      ctx.beginPath();
      ctx.fillStyle = index === 8 ? tipColor : dotColor;
      ctx.arc(point.x, point.y, index === 8 ? 4.5 : 2.8, 0, Math.PI * 2);
      ctx.fill();
    });

    const indexTip = points[8];
    if (indexTip) {
      ctx.beginPath();
      ctx.strokeStyle = tipColor;
      ctx.lineWidth = 1.4;
      ctx.arc(indexTip.x, indexTip.y, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = acceptedIntent ? 2 : 1.5;
    }
  }
  ctx.restore();
}

function labelForMode(
  inputMode: AirBrushInputMode,
  state: CameraState,
  captureMode: AirBrushCaptureMode,
  targetText?: string
) {
  const prefix =
    captureMode === 'blind_signature'
      ? targetText
        ? `blind signature · ${targetText}`
        : 'blind signature'
      : 'air brush';
  if (state === 'requesting') return `${prefix} · camera`;
  if (inputMode === 'camera-landmarks') return `${prefix} · camera`;
  if (inputMode === 'pointer-fallback') return `${prefix} · pointer fallback`;
  return `${prefix} · unavailable`;
}

export function AirBrushOverlay({
  active,
  mode = 'standard',
  targetText,
  onActiveChange,
  onPoint,
  onCapture,
  onEndAirBrush,
  openPalmEndEnabled = false,
  drawHand = 'Right',
  eraseHand = 'Left',
  createHandLandmarker = createMediaPipeHandLandmarker,
  className,
  showInactiveButton = true,
}: AirBrushOverlayProps) {
  const liveInkCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const landmarkCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onPointRef = useRef(onPoint);
  const onEndAirBrushRef = useRef(onEndAirBrush);
  const lastCameraPointRef = useRef<AirBrushPoint | null>(null);
  const lastRawCameraPointRef = useRef<AirBrushPoint | null>(null);
  const lastLiveInkPointRef = useRef<AirBrushPoint | null>(null);
  const cameraStrokeActiveRef = useRef(false);
  const activeCameraIntentRef = useRef<AirBrushPointIntent | null>(null);
  const cameraStrokeMachineRef = useRef(new AirBrushStrokeMachine());
  const pointerStrokeMachineRef = useRef(new AirBrushStrokeMachine());
  const calibrationSamplesRef = useRef<AirBrushPoint[]>([]);
  const calibrationProfileRef = useRef<AirBrushCalibrationProfile | null>(null);
  const pinchWarmupCountRef = useRef<Record<AirBrushPointIntent, number>>({
    draw: 0,
    erase: 0,
  });
  const openPalmHoldFramesRef = useRef(0);
  const endAirBrushFiredRef = useRef(false);
  // The creator's natural starting pose is an open hand, which would fire the
  // done gesture before they ever drew anything. Require at least one camera
  // stroke to have started before the gesture becomes armed.
  const hasStartedCameraStrokeRef = useRef(false);
  const pointerFallbackActiveRef = useRef(false);
  const pointerFallbackIdRef = useRef<number | null>(null);
  const [cameraState, setCameraState] = useState<CameraState>('idle');
  const [trackingState, setTrackingState] = useState<TrackingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [detectionCount, setDetectionCountState] = useState(0);
  const [preflightState, setPreflightState] =
    useState<BlindSignaturePreflightState>('idle');
  const [calibrationSampleCount, setCalibrationSampleCount] = useState(0);
  const [debugVisible, setDebugVisible] = useState(false);
  const [debugInfo, setDebugInfo] = useState<AirBrushOverlayDebugInfo>(
    INITIAL_AIR_BRUSH_DEBUG_INFO
  );
  const debugInfoRef = useRef<AirBrushOverlayDebugInfo>(
    INITIAL_AIR_BRUSH_DEBUG_INFO
  );
  const stateSnapshotRef = useRef({
    active,
    cameraState,
    trackingState,
    detectionCount,
  });

  const publishDebug = useCallback(
    (
      stage: AirBrushDebugStage,
      detail: Record<string, unknown> = {},
      patch: Partial<Omit<AirBrushOverlayDebugInfo, 'lastStage'>> = {},
      options: { log?: boolean } = {}
    ) => {
      const lastError =
        typeof detail.error === 'string' && detail.error.length > 0
          ? detail.error
          : (patch.lastError ?? debugInfoRef.current.lastError);
      const nextInfo: AirBrushOverlayDebugInfo = {
        ...debugInfoRef.current,
        ...patch,
        lastStage: stage,
        lastError,
      };
      debugInfoRef.current = nextInfo;
      setDebugInfo(nextInfo);

      const snapshot = stateSnapshotRef.current;
      recordAirBrushDebugEvent(
        stage,
        detail,
        {
          active: snapshot.active,
          cameraState: snapshot.cameraState,
          trackingState: snapshot.trackingState,
          detectionCount: snapshot.detectionCount,
          frameCount: nextInfo.frameCount,
          skippedFrameCount: nextInfo.skippedFrameCount,
          detectErrorCount: nextInfo.detectErrorCount,
          emittedPointCount: nextInfo.emittedPointCount,
          video: nextInfo.video ?? undefined,
          lastError: nextInfo.lastError ?? undefined,
          lastRejection: nextInfo.lastRejection,
        },
        options
      );
    },
    []
  );

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
      publishDebug('capture', { width, height }, {
        video: getAirBrushVideoDebug(video),
      });
    } catch (err) {
      const message = messageFromUnknownError(err, 'capture unavailable');
      setError('capture unavailable');
      publishDebug('capture', { error: message }, { lastError: message });
    }
  };

  const emitPointerFallbackPoint = useCallback(
    (
      event: ReactPointerEvent<HTMLDivElement>,
      state: AirBrushPoint['state']
    ) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      const point = normalizeAirBrushPoint({
        clientX: event.clientX,
        clientY: event.clientY,
        pressure:
          typeof event.pressure === 'number' && event.pressure > 0
            ? event.pressure
            : 0.62,
        state,
        source: 'pointer',
        bounds,
      });
      if (!point) return;
      const nextPoint = { ...point, intent: 'draw' as const };
      const result = pointerStrokeMachineRef.current.accept(
        nextPoint,
        event.timeStamp || performance.now()
      );
      let emittedPointCount = debugInfoRef.current.emittedPointCount;
      for (const committedPoint of result.events) {
        emittedPointCount += 1;
        onPointRef.current?.(committedPoint);
        publishDebug(
          'pointer-fallback',
          {
            state: committedPoint.state,
            intent: committedPoint.intent ?? 'draw',
            x: roundDebugNumber(committedPoint.x),
            y: roundDebugNumber(committedPoint.y),
          },
          {
            emittedPointCount,
          },
          { log: committedPoint.state !== 'move' }
        );
      }
    },
    [publishDebug]
  );

  const handlePointerFallbackDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      pointerFallbackActiveRef.current = true;
      pointerFallbackIdRef.current = event.pointerId;
      pointerStrokeMachineRef.current.reset();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      emitPointerFallbackPoint(event, 'start');
    },
    [emitPointerFallbackPoint]
  );

  const handlePointerFallbackMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (
        !pointerFallbackActiveRef.current ||
        pointerFallbackIdRef.current !== event.pointerId
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      emitPointerFallbackPoint(event, 'move');
    },
    [emitPointerFallbackPoint]
  );

  const handlePointerFallbackEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (
        !pointerFallbackActiveRef.current ||
        pointerFallbackIdRef.current !== event.pointerId
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      emitPointerFallbackPoint(event, 'end');
      pointerFallbackActiveRef.current = false;
      pointerFallbackIdRef.current = null;
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    },
    [emitPointerFallbackPoint]
  );

  useEffect(() => {
    onPointRef.current = onPoint;
  }, [onPoint]);

  useEffect(() => {
    onEndAirBrushRef.current = onEndAirBrush;
  }, [onEndAirBrush]);

  useEffect(() => {
    stateSnapshotRef.current = {
      active,
      cameraState,
      trackingState,
      detectionCount,
    };
  }, [active, cameraState, trackingState, detectionCount]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    setDebugVisible(params.get('debug') === '1');
  }, []);

  useEffect(() => {
    if (!active) {
      const resetDebugInfo = { ...INITIAL_AIR_BRUSH_DEBUG_INFO };
      debugInfoRef.current = resetDebugInfo;
      setDebugInfo(resetDebugInfo);
      recordAirBrushDebugEvent(
        'inactive',
        {},
        {
          active: false,
          cameraState: 'idle',
          trackingState: 'idle',
          detectionCount: 0,
          frameCount: 0,
          skippedFrameCount: 0,
          detectErrorCount: 0,
          emittedPointCount: 0,
        },
        { log: false }
      );
      setCameraState('idle');
      setTrackingState('idle');
      setError(null);
      clearHandLandmarkOverlay(landmarkCanvasRef.current);
      if (cameraStrokeActiveRef.current) {
        const endPoint = translateMediaPipeHandLandmarksToAirBrushPoint({
          frame: null,
          previousPoint: lastCameraPointRef.current,
          activeStroke: true,
        });
        if (endPoint) onPointRef.current?.(endPoint);
      }
      cameraStrokeActiveRef.current = false;
      activeCameraIntentRef.current = null;
      pinchWarmupCountRef.current = { draw: 0, erase: 0 };
      openPalmHoldFramesRef.current = 0;
      endAirBrushFiredRef.current = false;
      hasStartedCameraStrokeRef.current = false;
      pointerFallbackActiveRef.current = false;
      pointerFallbackIdRef.current = null;
      lastCameraPointRef.current = null;
      lastRawCameraPointRef.current = null;
      lastLiveInkPointRef.current = null;
      calibrationSamplesRef.current = [];
      calibrationProfileRef.current = null;
      setPreflightState('idle');
      setCalibrationSampleCount(0);
      cameraStrokeMachineRef.current.reset();
      pointerStrokeMachineRef.current.reset();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      clearHandLandmarkOverlay(landmarkCanvasRef.current);
      clearLiveInkCanvas(liveInkCanvasRef.current);
      return;
    }

    let cancelled = false;
    const resetDebugInfo = { ...INITIAL_AIR_BRUSH_DEBUG_INFO };
    debugInfoRef.current = resetDebugInfo;
    setDebugInfo(resetDebugInfo);
    setDetectionCountState(0);
    cameraStrokeMachineRef.current = new AirBrushStrokeMachine();
    pointerStrokeMachineRef.current = new AirBrushStrokeMachine();
    cameraStrokeActiveRef.current = false;
    activeCameraIntentRef.current = null;
    lastCameraPointRef.current = null;
    lastRawCameraPointRef.current = null;
    lastLiveInkPointRef.current = null;
    calibrationSamplesRef.current = [];
    calibrationProfileRef.current = null;
    setPreflightState(mode === 'blind_signature' ? 'calibrating' : 'idle');
    setCalibrationSampleCount(0);
    clearLiveInkCanvas(liveInkCanvasRef.current);
    setCameraState('requesting');
    setError(null);
    stateSnapshotRef.current = {
      active: true,
      cameraState: 'requesting',
      trackingState: 'idle',
      detectionCount: 0,
    };
    publishDebug('camera-request');

    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.getUserMedia) {
      setCameraState('error');
      setError('camera unavailable');
      stateSnapshotRef.current = {
        ...stateSnapshotRef.current,
        cameraState: 'error',
      };
      publishDebug(
        'camera-error',
        { error: 'navigator.mediaDevices.getUserMedia unavailable' },
        { lastError: 'camera unavailable' }
      );
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
        stateSnapshotRef.current = {
          ...stateSnapshotRef.current,
          cameraState: 'ready',
        };
        publishDebug('camera-ready', {
          videoTracks: stream.getVideoTracks?.().length ?? 0,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          const video = videoRef.current;
          // Explicitly kick off playback. `autoPlay` on the element usually
          // handles this, but some browsers defer until play() is called when
          // the stream is attached post-mount (particularly in dev HMR and
          // after permission re-prompts). Without this, the video element
          // stays at currentTime=0 forever and MediaPipe's detectForVideo
          // keeps throwing.
          void video
            .play()
            .then(() => {
              if (cancelled) return;
              publishDebug(
                'video-play',
                { video: getAirBrushVideoDebug(video) },
                { video: getAirBrushVideoDebug(video) }
              );
            })
            .catch((err) => {
              if (cancelled) return;
              publishDebug(
                'video-play-blocked',
                {
                  error: messageFromUnknownError(err, 'video play blocked'),
                  video: getAirBrushVideoDebug(video),
                },
                { video: getAirBrushVideoDebug(video) }
              );
            });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        const message = messageFromUnknownError(err, 'camera unavailable');
        setCameraState('error');
        setError('camera unavailable');
        stateSnapshotRef.current = {
          ...stateSnapshotRef.current,
          cameraState: 'error',
        };
        publishDebug(
          'camera-error',
          { error: message },
          { lastError: message }
        );
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
      activeCameraIntentRef.current = null;
      pointerFallbackActiveRef.current = false;
      pointerFallbackIdRef.current = null;
      lastCameraPointRef.current = null;
      lastRawCameraPointRef.current = null;
      lastLiveInkPointRef.current = null;
      calibrationSamplesRef.current = [];
      calibrationProfileRef.current = null;
      setPreflightState('idle');
      setCalibrationSampleCount(0);
      cameraStrokeMachineRef.current.reset();
      pointerStrokeMachineRef.current.reset();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      clearLiveInkCanvas(liveInkCanvasRef.current);
    };
  }, [active, mode, publishDebug]);

  useEffect(() => {
    if (!active || cameraState !== 'ready') {
      setTrackingState((current) => (current === 'idle' ? current : 'idle'));
      clearHandLandmarkOverlay(landmarkCanvasRef.current);
      return;
    }

    let cancelled = false;
    let frameId = 0;
    let landmarker: AirBrushHandLandmarker | null = null;

    const endActiveStroke = (reason = 'hand-lost', timestamp = performance.now()) => {
      if (
        !cameraStrokeMachineRef.current.pointerDown &&
        !cameraStrokeMachineRef.current.hasPendingStroke &&
        !activeCameraIntentRef.current
      ) {
        return;
      }
      const endPoint = translateMediaPipeHandLandmarksToAirBrushPoint({
        frame: null,
        previousPoint: lastCameraPointRef.current,
        activeStroke: true,
      });
      if (endPoint) {
        const result = cameraStrokeMachineRef.current.accept(endPoint, timestamp);
        let emittedPointCount = debugInfoRef.current.emittedPointCount;
        for (const committedPoint of result.events) {
          emittedPointCount += 1;
          onPointRef.current?.(committedPoint);
          publishDebug(
            'stroke-ended',
            {
              reason,
              state: committedPoint.state,
              intent: committedPoint.intent ?? 'draw',
            },
            { emittedPointCount },
            { log: reason !== 'cleanup' }
          );
        }
      }
      cameraStrokeActiveRef.current = false;
      activeCameraIntentRef.current = null;
      lastCameraPointRef.current = null;
    };

    let frameCount = 0;
    let skippedFrameCount = 0;
    let detectErrorCount = 0;
    let emittedPointCount = debugInfoRef.current.emittedPointCount;
    let consecutiveErrors = 0;
    let hasLoggedFirstDetection = false;
    let lastVideoWaitLog = 0;
    const tick = (timestamp: number) => {
      if (cancelled || !landmarker) return;
      const video = videoRef.current;
      const videoDebug = getAirBrushVideoDebug(video);
      // readyState >= 2 alone can fire before dimensions resolve; MediaPipe
      // then throws on a zero-sized ROI and we'd kill the loop. Require real
      // dimensions + an actual played frame (currentTime > 0) too.
      if (
        !video ||
        video.readyState < 2 ||
        video.videoWidth <= 0 ||
        video.videoHeight <= 0 ||
        video.currentTime <= 0
      ) {
        skippedFrameCount += 1;
        if (skippedFrameCount === 1 || timestamp - lastVideoWaitLog > 1000) {
          lastVideoWaitLog = timestamp;
          publishDebug(
            'video-wait',
            { video: videoDebug },
            { skippedFrameCount, video: videoDebug },
            { log: skippedFrameCount === 1 }
          );
        }
        frameId = window.requestAnimationFrame(tick);
        return;
      }

      try {
        frameCount += 1;
        const frame = landmarker.detectForVideo(video, timestamp);
        if (frame.error) {
          clearHandLandmarkOverlay(landmarkCanvasRef.current);
          consecutiveErrors += 1;
          detectErrorCount += 1;
          publishDebug(
            'detect-error',
            {
              error: frame.error,
              consecutiveErrors,
              video: videoDebug,
            },
            {
              frameCount,
              detectErrorCount,
              video: videoDebug,
            },
            { log: consecutiveErrors === 1 || consecutiveErrors >= 10 }
          );
          if (consecutiveErrors >= 10) {
            setTrackingState('error');
            setError('finger tracking frame error');
            stateSnapshotRef.current = {
              ...stateSnapshotRef.current,
              trackingState: 'error',
            };
            endActiveStroke('detect-error');
            return;
          }
          frameId = window.requestAnimationFrame(tick);
          return;
        }

        const landmarksCount = frame?.landmarks?.length ?? 0;
        const activeIntent = activeCameraIntentRef.current;
        const raisedIndexInk = mode === 'blind_signature';
        const activeEraseHand = raisedIndexInk ? null : eraseHand;
        const eraseEval = activeEraseHand
          ? evaluateMediaPipeHandLandmarks({
              frame,
              previousPoint:
                activeIntent === 'erase' ? lastCameraPointRef.current : null,
              activeStroke: activeIntent === 'erase',
              preferredHand: activeEraseHand,
              intent: 'erase',
              requirePinch: true,
            })
          : ({ point: null, accepted: false } satisfies AirBrushLandmarkEvaluation);
        const drawEval = evaluateMediaPipeHandLandmarks({
          frame,
          previousPoint:
            activeIntent === 'draw'
              ? raisedIndexInk
                ? lastRawCameraPointRef.current
                : lastCameraPointRef.current
              : null,
          activeStroke: activeIntent === 'draw',
          preferredHand: drawHand,
          intent: 'draw',
          requirePinch: !raisedIndexInk,
          rejectOpenPalm: raisedIndexInk,
        });
        const erasePoint = eraseEval.point;
        let drawPoint = drawEval.point;
        let rawDrawPoint = drawPoint;
        if (raisedIndexInk && drawPoint && drawPoint.state !== 'end') {
          const profile = calibrationProfileRef.current;
          if (!profile) {
            calibrationSamplesRef.current = [
              ...calibrationSamplesRef.current,
              drawPoint,
            ].slice(-BLIND_SIGNATURE_CALIBRATION_FRAMES);
            setCalibrationSampleCount(calibrationSamplesRef.current.length);
            if (
              calibrationSamplesRef.current.length >=
              BLIND_SIGNATURE_CALIBRATION_FRAMES
            ) {
              const nextProfile = createAirBrushCalibrationProfile({
                samples: calibrationSamplesRef.current,
                targetText,
              });
              calibrationProfileRef.current = nextProfile;
              cameraStrokeMachineRef.current.configure(
                airBrushStrokeOptionsFromProfile(nextProfile)
              );
              setPreflightState('ready');
              setCalibrationSampleCount(BLIND_SIGNATURE_CALIBRATION_FRAMES);
              publishDebug(
                'point-emitted',
                {
                  calibration: 'ready',
                  jitter: roundDebugNumber(nextProfile.jitterRadius),
                  minStrokeDistance: roundDebugNumber(
                    nextProfile.minStrokeDistance
                  ),
                },
                {},
                { log: true }
              );
            } else {
              setPreflightState('calibrating');
            }
            drawPoint = null;
          } else {
            drawPoint = stabilizeAirBrushPoint(profile, drawPoint);
          }
        } else if (raisedIndexInk && drawPoint?.state === 'end') {
          drawPoint = lastCameraPointRef.current
            ? { ...lastCameraPointRef.current, state: 'end' }
            : null;
        }
        const eraseActive = Boolean(erasePoint && erasePoint.state !== 'end');
        const drawActive = Boolean(drawPoint && drawPoint.state !== 'end');

        // Reset pinch warmup for any intent whose pinch dropped this frame.
        if (!drawActive) pinchWarmupCountRef.current.draw = 0;
        if (!eraseActive) pinchWarmupCountRef.current.erase = 0;

        // Open-palm "done" gesture: either hand with five fingertips extended
        // away from the wrist and no pinch, held for OPEN_PALM_HOLD_FRAMES.
        if (openPalmEndEnabled) {
          const handsLandmarks = frame?.landmarks ?? [];
          let openPalmSeen = false;
          for (const hand of handsLandmarks) {
            if (detectOpenPalm(hand, { minHandSpan: 0.05 }).detected) {
              openPalmSeen = true;
              break;
            }
          }
          if (openPalmSeen && hasStartedCameraStrokeRef.current) {
            openPalmHoldFramesRef.current += 1;
            if (
              openPalmHoldFramesRef.current >= OPEN_PALM_HOLD_FRAMES &&
              !endAirBrushFiredRef.current &&
              onEndAirBrushRef.current
            ) {
              endAirBrushFiredRef.current = true;
              publishDebug(
                'stroke-ended',
                { reason: 'open-palm-gesture' },
                {},
                { log: true }
              );
              void onEndAirBrushRef.current();
            }
          } else {
            openPalmHoldFramesRef.current = 0;
          }
        } else {
          openPalmHoldFramesRef.current = 0;
        }

        // Pen-down debounce: swallow the first PINCH_WARMUP_FRAMES accepted
        // start frames so thumb-on-index landmark jitter doesn't leave a dot
        // at the start of the stroke.
        const preferredPointRaw = eraseActive
          ? erasePoint
          : drawActive
            ? drawPoint
            : null;
        let preferredPoint = preferredPointRaw;
        if (
          !raisedIndexInk &&
          preferredPointRaw &&
          preferredPointRaw.state === 'start' &&
          preferredPointRaw.intent &&
          !activeIntent
        ) {
          const intent = preferredPointRaw.intent;
          pinchWarmupCountRef.current[intent] += 1;
          if (pinchWarmupCountRef.current[intent] < PINCH_WARMUP_FRAMES) {
            preferredPoint = null;
          } else {
            pinchWarmupCountRef.current[intent] = 0;
          }
        }
        const pointsToEmit: AirBrushPoint[] = [];

        if (
          activeIntent &&
          preferredPoint &&
          preferredPoint.intent !== activeIntent
        ) {
          if (lastCameraPointRef.current) {
            pointsToEmit.push({
              ...lastCameraPointRef.current,
              state: 'end',
            });
          }
          pointsToEmit.push(preferredPoint);
        } else {
          const activeEndPoint =
            activeIntent === 'erase' && erasePoint?.state === 'end'
              ? erasePoint
              : activeIntent === 'draw' && drawPoint?.state === 'end'
                ? drawPoint
                : null;
          if (activeEndPoint) pointsToEmit.push(activeEndPoint);
          if (preferredPoint) pointsToEmit.push(preferredPoint);
        }

        const acceptedIntents: AcceptedHandIntents = {};
        if (drawActive) acceptedIntents[drawHand] = 'draw';
        if (activeEraseHand && eraseActive) {
          acceptedIntents[activeEraseHand] = 'erase';
        }
        drawHandLandmarkOverlay({
          canvas: landmarkCanvasRef.current,
          video,
          frame,
          acceptedIntents,
        });
        consecutiveErrors = 0;

        if (pointsToEmit.length > 0) {
          for (const point of pointsToEmit) {
            const result = cameraStrokeMachineRef.current.accept(point, timestamp);
            for (const committedPoint of result.events) {
              emittedPointCount += 1;
              drawLiveInkSegment({
                canvas: liveInkCanvasRef.current,
                from: lastLiveInkPointRef.current,
                to: committedPoint,
              });
              lastLiveInkPointRef.current =
                committedPoint.state === 'end' ? null : committedPoint;
              onPointRef.current?.(committedPoint);
              if (committedPoint.state === 'start') {
                // First committed stroke has started; pending pinch jitter
                // should not arm completion or create a canvas dot.
                hasStartedCameraStrokeRef.current = true;
              }
              if (committedPoint.state !== 'end') {
                setDetectionCountState((current) => current + 1);
                stateSnapshotRef.current = {
                  ...stateSnapshotRef.current,
                  detectionCount: stateSnapshotRef.current.detectionCount + 1,
                };
                if (!hasLoggedFirstDetection) {
                  hasLoggedFirstDetection = true;
                  publishDebug(
                    'hand-detected',
                    { landmarks: landmarksCount, video: videoDebug },
                    {
                      frameCount,
                      video: videoDebug,
                    }
                  );
                }
              }
              publishDebug(
                committedPoint.state === 'end' ? 'stroke-ended' : 'point-emitted',
                {
                  state: committedPoint.state,
                  source: committedPoint.source,
                  intent: committedPoint.intent ?? 'draw',
                  x: roundDebugNumber(committedPoint.x),
                  y: roundDebugNumber(committedPoint.y),
                },
                {
                  emittedPointCount,
                  frameCount,
                  video: videoDebug,
                  lastRejection: null,
                },
                {
                  log:
                    committedPoint.state !== 'move' ||
                    emittedPointCount % 30 === 0,
                }
              );
            }

            cameraStrokeActiveRef.current =
              cameraStrokeMachineRef.current.pointerDown;
            if (point.state === 'end') {
              activeCameraIntentRef.current = null;
              lastCameraPointRef.current = null;
              lastRawCameraPointRef.current = null;
            } else {
              activeCameraIntentRef.current = point.intent ?? 'draw';
              lastCameraPointRef.current = point;
              if (raisedIndexInk && rawDrawPoint && rawDrawPoint.state !== 'end') {
                lastRawCameraPointRef.current = rawDrawPoint;
              }
            }
          }
        } else if (landmarksCount > 0) {
          const primaryRejection = pickPrimaryRejection([drawEval, eraseEval]);
          const rejectionPatch = primaryRejection
            ? { lastRejection: primaryRejection }
            : {};
          if (frameCount === 1 || frameCount % 30 === 0) {
            publishDebug(
              'detect-rejected',
              {
                rawLandmarks: landmarksCount,
                frames: frameCount,
                video: videoDebug,
                reason: primaryRejection?.reason,
                metrics: primaryRejection?.metrics,
              },
              {
                frameCount,
                video: videoDebug,
                ...rejectionPatch,
              },
              { log: frameCount === 1 || frameCount % 180 === 0 }
            );
          } else if (primaryRejection) {
            // Keep the last rejection snapshot fresh between logged samples so
            // the debug hint updates as the user moves their hand.
            debugInfoRef.current = {
              ...debugInfoRef.current,
              ...rejectionPatch,
            };
            setDebugInfo(debugInfoRef.current);
          }
        } else if (landmarksCount === 0 && (frameCount === 1 || frameCount % 60 === 0)) {
          publishDebug(
            'detect-empty',
            { frames: frameCount, video: videoDebug },
            {
              frameCount,
              video: videoDebug,
            },
            { log: frameCount === 1 || frameCount % 180 === 0 }
          );
        }
      } catch (err) {
        const message = messageFromUnknownError(err, 'detectForVideo failed');
        consecutiveErrors += 1;
        detectErrorCount += 1;
        publishDebug(
          'detect-error',
          {
            error: message,
            consecutiveErrors,
            video: videoDebug,
          },
          {
            frameCount,
            detectErrorCount,
            video: videoDebug,
          },
          { log: consecutiveErrors === 1 || consecutiveErrors >= 10 }
        );
        if (consecutiveErrors >= 10) {
          setTrackingState('error');
          setError('finger tracking frame error');
          stateSnapshotRef.current = {
            ...stateSnapshotRef.current,
            trackingState: 'error',
          };
          endActiveStroke('detect-error');
          return;
        }
      }

      frameId = window.requestAnimationFrame(tick);
    };

    setTrackingState('loading');
    setError(null);
    stateSnapshotRef.current = {
      ...stateSnapshotRef.current,
      trackingState: 'loading',
    };
    publishDebug('tracker-load');
    createHandLandmarker()
      .then((nextLandmarker) => {
        if (cancelled) {
          nextLandmarker.close?.();
          return;
        }
        landmarker = nextLandmarker;
        setTrackingState('ready');
        stateSnapshotRef.current = {
          ...stateSnapshotRef.current,
          trackingState: 'ready',
        };
        publishDebug('tracker-ready');
        frameId = window.requestAnimationFrame(tick);
      })
      .catch((err) => {
        if (!cancelled) {
          const message = messageFromUnknownError(
            err,
            'finger tracking unavailable'
          );
          setTrackingState('error');
          setError('finger tracking unavailable');
          stateSnapshotRef.current = {
            ...stateSnapshotRef.current,
            trackingState: 'error',
          };
          publishDebug(
            'tracker-error',
            { error: message },
            { lastError: message }
          );
        }
      });

    return () => {
      cancelled = true;
      if (frameId) window.cancelAnimationFrame(frameId);
      endActiveStroke('cleanup');
      landmarker?.close?.();
      clearHandLandmarkOverlay(landmarkCanvasRef.current);
    };
  }, [
    active,
    cameraState,
    createHandLandmarker,
    drawHand,
    eraseHand,
    mode,
    openPalmEndEnabled,
    publishDebug,
    targetText,
  ]);

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

  const inputMode = resolveAirBrushInputMode({
    cameraReady: cameraState === 'ready',
    landmarksReady: trackingState === 'ready',
    pointerFallbackReady: true,
  });
  const displayError =
    error === 'camera unavailable'
      ? 'camera unavailable · draw here'
      : error;
  const rejectionHint = formatRejectionHint(debugInfo.lastRejection);
  const hint =
    displayError ??
    (cameraState === 'requesting'
      ? 'asking for camera'
      : trackingState === 'loading'
        ? 'loading hand tracker'
        : trackingState === 'error'
          ? 'finger tracking unavailable'
          : trackingState === 'ready'
            ? debugInfo.lastStage === 'video-wait'
              ? 'waiting for video frame'
              : mode === 'blind_signature' && preflightState === 'calibrating'
                ? `hold index still · ${calibrationSampleCount}/${BLIND_SIGNATURE_CALIBRATION_FRAMES}`
              : debugInfo.lastStage === 'detect-rejected'
                ? (rejectionHint ?? 'show index fingertip')
              : detectionCount > 0
                ? `hand seen · ${detectionCount} frames`
                : debugInfo.frameCount > 0
                  ? `no hand · ${debugInfo.frameCount} frames`
                  : 'show hand to camera'
            : 'draw on canvas');
  const debugVideo = debugInfo.video;

  return (
    <>
      <canvas
        ref={liveInkCanvasRef}
        aria-label="air brush live ink"
        data-air-brush-live-ink
        className="pointer-events-none absolute inset-0 z-[19] h-full w-full"
      />
      <aside
        aria-label="air brush"
        className={cn(
          'pointer-events-none absolute left-4 bottom-4 z-20 flex w-56 flex-col overflow-hidden rounded-md border border-border bg-surface-panel/95 shadow-sm backdrop-blur',
          className
        )}
      >
      <div
        aria-label="air brush fallback pad"
        className="pointer-events-auto relative aspect-[4/3] touch-none cursor-crosshair bg-ink"
        onPointerDown={handlePointerFallbackDown}
        onPointerMove={handlePointerFallbackMove}
        onPointerUp={handlePointerFallbackEnd}
        onPointerCancel={handlePointerFallbackEnd}
        onPointerLeave={handlePointerFallbackEnd}
      >
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
        <canvas
          ref={landmarkCanvasRef}
          aria-label="air brush hand landmarks"
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
        <div className="absolute left-2 top-2 inline-flex h-6 items-center gap-1 rounded-sm border border-white/15 bg-black/45 px-2 font-mono text-[9px] uppercase tracking-wide text-white/85">
          <Camera size={11} strokeWidth={1.7} />
          live
        </div>
      </div>

      <div className="flex items-center gap-2 px-2 py-1.5">
        <MousePointer2 size={12} strokeWidth={1.8} className="shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-2xs uppercase tracking-wide text-ink">
            {labelForMode(inputMode, cameraState, mode, targetText)}
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
      {debugVisible ? (
        <div
          aria-label="air brush debug"
          className="border-t border-border/70 px-2 py-1.5 font-mono text-[9px] leading-4 text-ink-dim"
        >
          <div className="truncate">
            camera {cameraState} · tracker {trackingState}
          </div>
          <div className="truncate">
            video rs {debugVideo?.readyState ?? '-'} ·{' '}
            {debugVideo?.videoWidth ?? 0}x{debugVideo?.videoHeight ?? 0} · t{' '}
            {formatDebugTime(debugVideo?.currentTime)}
          </div>
          <div className="truncate">
            frames {debugInfo.frameCount} · skipped {debugInfo.skippedFrameCount} ·
            errors {debugInfo.detectErrorCount}
          </div>
          <div className="truncate">
            hands {detectionCount} · points {debugInfo.emittedPointCount} · last{' '}
            {debugInfo.lastStage}
          </div>
          {debugInfo.lastRejection ? (
            <div className="truncate">
              reject {debugInfo.lastRejection.reason}
              {typeof debugInfo.lastRejection.metrics?.indexReach === 'number' &&
              typeof debugInfo.lastRejection.metrics?.requiredReach === 'number'
                ? ` · reach ${debugInfo.lastRejection.metrics.indexReach.toFixed(2)}/${debugInfo.lastRejection.metrics.requiredReach.toFixed(2)}`
                : ''}
              {typeof debugInfo.lastRejection.metrics?.score === 'number'
                ? ` · score ${debugInfo.lastRejection.metrics.score.toFixed(2)}`
                : ''}
              {debugInfo.lastRejection.metrics?.handedness
                ? ` · ${debugInfo.lastRejection.metrics.handedness.toLowerCase()}`
                : ''}
            </div>
          ) : null}
        </div>
      ) : null}
      </aside>
    </>
  );
}

export type AirBrushPointState = 'start' | 'move' | 'end' | 'hover';
export type AirBrushPointSource = 'camera' | 'pointer';
export type AirBrushInputMode =
  | 'camera-landmarks'
  | 'pointer-fallback'
  | 'unavailable';

const INDEX_FINGER_TIP_LANDMARK = 8;
const DEFAULT_HAND_CONFIDENCE = 0.5;
const DEFAULT_LANDMARK_VISIBILITY = 0.45;
const DEFAULT_SMOOTHING = 0.38;
const DEFAULT_DEAD_ZONE = 0.006;

export interface AirBrushPoint {
  x: number;
  y: number;
  pressure?: number;
  state: AirBrushPointState;
  source: AirBrushPointSource;
}

export interface AirBrushBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface NormalizeAirBrushPointInput {
  clientX: number;
  clientY: number;
  pressure?: number;
  state: AirBrushPointState;
  source: AirBrushPointSource;
  bounds: AirBrushBounds;
}

export interface ResolveAirBrushInputModeInput {
  cameraReady: boolean;
  landmarksReady: boolean;
  pointerFallbackReady: boolean;
}

export interface AirBrushHandLandmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export interface AirBrushHandCategory {
  score?: number;
}

export interface AirBrushHandLandmarkFrame {
  landmarks?: AirBrushHandLandmark[][];
  handedness?: AirBrushHandCategory[][];
  handednesses?: AirBrushHandCategory[][];
}

export interface TranslateHandLandmarksInput {
  frame: AirBrushHandLandmarkFrame | null | undefined;
  previousPoint?: AirBrushPoint | null;
  activeStroke: boolean;
  mirrorX?: boolean;
  minHandConfidence?: number;
  minLandmarkVisibility?: number;
  smoothing?: number;
  deadZone?: number;
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function distance(a: AirBrushPoint, b: AirBrushPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function resolveHandScore(frame: AirBrushHandLandmarkFrame): number {
  const handedness = frame.handedness ?? frame.handednesses;
  const score = handedness?.[0]?.[0]?.score;
  return Number.isFinite(score) ? score ?? 1 : 1;
}

function endCameraStroke(previousPoint?: AirBrushPoint | null): AirBrushPoint | null {
  if (!previousPoint || previousPoint.source !== 'camera') return null;
  return {
    ...previousPoint,
    state: 'end',
    source: 'camera',
  };
}

export function clampAirBrushPoint(point: AirBrushPoint): AirBrushPoint {
  return {
    ...point,
    x: clamp01(point.x),
    y: clamp01(point.y),
    pressure:
      point.pressure === undefined ? undefined : clamp01(point.pressure),
  };
}

export function normalizeAirBrushPoint(
  input: NormalizeAirBrushPointInput
): AirBrushPoint | null {
  if (
    !Number.isFinite(input.bounds.width) ||
    !Number.isFinite(input.bounds.height) ||
    input.bounds.width <= 0 ||
    input.bounds.height <= 0
  ) {
    return null;
  }

  return clampAirBrushPoint({
    x: (input.clientX - input.bounds.left) / input.bounds.width,
    y: (input.clientY - input.bounds.top) / input.bounds.height,
    pressure: input.pressure,
    state: input.state,
    source: input.source,
  });
}

export function resolveAirBrushInputMode({
  cameraReady,
  landmarksReady,
  pointerFallbackReady,
}: ResolveAirBrushInputModeInput): AirBrushInputMode {
  if (cameraReady && landmarksReady) return 'camera-landmarks';
  if (pointerFallbackReady) return 'pointer-fallback';
  return 'unavailable';
}

export function translateMediaPipeHandLandmarksToAirBrushPoint({
  frame,
  previousPoint,
  activeStroke,
  mirrorX = true,
  minHandConfidence = DEFAULT_HAND_CONFIDENCE,
  minLandmarkVisibility = DEFAULT_LANDMARK_VISIBILITY,
  smoothing = DEFAULT_SMOOTHING,
  deadZone = DEFAULT_DEAD_ZONE,
}: TranslateHandLandmarksInput): AirBrushPoint | null {
  const hand = frame?.landmarks?.[0];
  const tip = hand?.[INDEX_FINGER_TIP_LANDMARK];
  const score = frame ? resolveHandScore(frame) : 0;

  if (
    !tip ||
    score < minHandConfidence ||
    (Number.isFinite(tip.visibility) &&
      (tip.visibility ?? 1) < minLandmarkVisibility)
  ) {
    return activeStroke ? endCameraStroke(previousPoint) : null;
  }

  const cameraPrevious =
    previousPoint?.source === 'camera' && previousPoint.state !== 'end'
      ? previousPoint
      : null;
  const target = clampAirBrushPoint({
    x: mirrorX ? 1 - tip.x : tip.x,
    y: tip.y,
    pressure: 0.72 - Math.min(Math.max(tip.z ?? 0, -0.4), 0.4) * 0.45,
    state: activeStroke ? 'move' : 'start',
    source: 'camera',
  });

  const shouldSmooth = activeStroke && cameraPrevious;
  const next = shouldSmooth
    ? clampAirBrushPoint({
        ...target,
        x: cameraPrevious.x + (target.x - cameraPrevious.x) * clamp01(smoothing),
        y: cameraPrevious.y + (target.y - cameraPrevious.y) * clamp01(smoothing),
        pressure:
          cameraPrevious.pressure === undefined || target.pressure === undefined
            ? target.pressure
            : cameraPrevious.pressure +
              (target.pressure - cameraPrevious.pressure) * clamp01(smoothing),
      })
    : target;

  if (activeStroke && cameraPrevious && distance(cameraPrevious, next) < deadZone) {
    return null;
  }

  return next;
}

export type AirBrushPointState = 'start' | 'move' | 'end' | 'hover';
export type AirBrushPointSource = 'camera' | 'pointer';
export type AirBrushPointIntent = 'draw' | 'erase';
export type AirBrushHandedness = 'Left' | 'Right';
export type AirBrushInputMode =
  | 'camera-landmarks'
  | 'pointer-fallback'
  | 'unavailable';

const THUMB_TIP_LANDMARK = 4;
const INDEX_FINGER_TIP_LANDMARK = 8;
const INDEX_FINGER_MCP_LANDMARK = 5;
const PINKY_MCP_LANDMARK = 17;
const DEFAULT_HAND_CONFIDENCE = 0.62;
const DEFAULT_SMOOTHING = 0.38;
const DEFAULT_DEAD_ZONE = 0.006;
const DEFAULT_MIN_HAND_SPAN = 0.05;
const DEFAULT_MIN_INDEX_EXTENSION = 0.06;
const INDEX_REACH_PALM_RATIO = 0.3;
// Pinch: thumb tip close to index tip relative to palm span. Hysteresis keeps
// small tremors from flickering the stroke on/off — you must clearly close
// (ratio * palmSpan) to start and clearly open (1.4 * ratio * palmSpan) to
// end.
const DEFAULT_PINCH_RATIO = 0.48;
const PINCH_HYSTERESIS = 1.4;

export interface AirBrushPoint {
  x: number;
  y: number;
  pressure?: number;
  state: AirBrushPointState;
  source: AirBrushPointSource;
  intent?: AirBrushPointIntent;
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
  categoryName?: string;
  displayName?: string;
  index?: number;
}

export interface AirBrushHandLandmarkFrame {
  landmarks?: AirBrushHandLandmark[][];
  worldLandmarks?: AirBrushHandLandmark[][];
  handedness?: AirBrushHandCategory[][];
  handednesses?: AirBrushHandCategory[][];
  error?: string;
}

export interface TranslateHandLandmarksInput {
  frame: AirBrushHandLandmarkFrame | null | undefined;
  previousPoint?: AirBrushPoint | null;
  activeStroke: boolean;
  mirrorX?: boolean;
  preferredHand?: AirBrushHandedness;
  intent?: AirBrushPointIntent;
  minHandConfidence?: number;
  requireExtendedIndexFinger?: boolean;
  minHandSpan?: number;
  minIndexExtension?: number;
  smoothing?: number;
  deadZone?: number;
  requirePinch?: boolean;
  pinchRatio?: number;
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function distance(a: AirBrushPoint, b: AirBrushPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function resolveHandScore(
  frame: AirBrushHandLandmarkFrame,
  handIndex: number
): number {
  const handedness = frame.handedness ?? frame.handednesses;
  const score = handedness?.[handIndex]?.[0]?.score;
  return Number.isFinite(score) ? score ?? 0 : 0;
}

function normalizeHandednessName(value: unknown): AirBrushHandedness | null {
  if (value === 'Left' || value === 'Right') return value;
  if (typeof value !== 'string') return null;
  const normalized = value.toLowerCase();
  if (normalized === 'left') return 'Left';
  if (normalized === 'right') return 'Right';
  return null;
}

function resolveHandednessName(
  frame: AirBrushHandLandmarkFrame,
  handIndex: number
): AirBrushHandedness | null {
  const category = (frame.handedness ?? frame.handednesses)?.[handIndex]?.[0];
  return (
    normalizeHandednessName(category?.categoryName) ??
    normalizeHandednessName(category?.displayName)
  );
}

function resolveHandIndex(
  frame: AirBrushHandLandmarkFrame | null | undefined,
  preferredHand?: AirBrushHandedness
) {
  const hands = frame?.landmarks ?? [];
  if (!frame || hands.length === 0) return -1;
  if (!preferredHand) return 0;
  return hands.findIndex(
    (_hand, index) => resolveHandednessName(frame, index) === preferredHand
  );
}

function endCameraStroke(previousPoint?: AirBrushPoint | null): AirBrushPoint | null {
  if (!previousPoint || previousPoint.source !== 'camera') return null;
  return {
    ...previousPoint,
    state: 'end',
    source: 'camera',
  };
}

function hasFinitePoint(point: AirBrushHandLandmark | undefined) {
  return Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y));
}

function landmarkDistance(
  a: AirBrushHandLandmark,
  b: AirBrushHandLandmark
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export type AirBrushRejectionReason =
  | 'no-hand'
  | 'handedness-mismatch'
  | 'handedness-low'
  | 'tip-missing'
  | 'palm-too-small'
  | 'index-too-close'
  | 'pinch-open';

export interface AirBrushLandmarkMetrics {
  handIndex?: number;
  handedness?: AirBrushHandedness | null;
  score?: number;
  palmSpan?: number;
  indexReach?: number;
  requiredReach?: number;
  pinching?: boolean;
  pinchDistance?: number;
  pinchThreshold?: number;
}

export interface AirBrushLandmarkEvaluation {
  point: AirBrushPoint | null;
  accepted: boolean;
  reason?: AirBrushRejectionReason;
  metrics?: AirBrushLandmarkMetrics;
}

interface IndexFingerGateResult {
  accepted: boolean;
  reason?: Extract<
    AirBrushRejectionReason,
    'tip-missing' | 'palm-too-small' | 'index-too-close'
  >;
  palmSpan?: number;
  indexReach?: number;
  requiredReach?: number;
}

function evaluateIndexFingerGate({
  hand,
  minHandSpan,
  minIndexExtension,
}: {
  hand: AirBrushHandLandmark[];
  minHandSpan: number;
  minIndexExtension: number;
}): IndexFingerGateResult {
  // Practical gate for real webcam hands: require a visible palm and a clearly
  // extended index tip away from its MCP. We intentionally do NOT require
  // "straightness" across MCP->PIP->DIP->TIP. Real webcam fingers curl and
  // perspective distorts those segments; strict straightness rejected the very
  // pose a creator uses to point at the canvas.
  const wrist = hand[0];
  const indexMcp = hand[INDEX_FINGER_MCP_LANDMARK];
  const indexTip = hand[INDEX_FINGER_TIP_LANDMARK];
  const pinkyMcp = hand[PINKY_MCP_LANDMARK];

  if (
    !hasFinitePoint(wrist) ||
    !hasFinitePoint(indexMcp) ||
    !hasFinitePoint(indexTip) ||
    !hasFinitePoint(pinkyMcp)
  ) {
    return { accepted: false, reason: 'tip-missing' };
  }

  const palmSpan = Math.max(
    landmarkDistance(wrist, pinkyMcp),
    landmarkDistance(indexMcp, pinkyMcp)
  );
  const indexReach = landmarkDistance(indexMcp, indexTip);
  const requiredReach = Math.max(
    minIndexExtension,
    palmSpan * INDEX_REACH_PALM_RATIO
  );

  if (palmSpan < minHandSpan) {
    return {
      accepted: false,
      reason: 'palm-too-small',
      palmSpan,
      indexReach,
      requiredReach,
    };
  }
  if (indexReach < requiredReach) {
    return {
      accepted: false,
      reason: 'index-too-close',
      palmSpan,
      indexReach,
      requiredReach,
    };
  }
  return { accepted: true, palmSpan, indexReach, requiredReach };
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

export function evaluateMediaPipeHandLandmarks({
  frame,
  previousPoint,
  activeStroke,
  mirrorX = true,
  preferredHand,
  intent = previousPoint?.intent ?? 'draw',
  minHandConfidence = DEFAULT_HAND_CONFIDENCE,
  requireExtendedIndexFinger = true,
  minHandSpan = DEFAULT_MIN_HAND_SPAN,
  minIndexExtension = DEFAULT_MIN_INDEX_EXTENSION,
  smoothing = DEFAULT_SMOOTHING,
  deadZone = DEFAULT_DEAD_ZONE,
  requirePinch = false,
  pinchRatio = DEFAULT_PINCH_RATIO,
}: TranslateHandLandmarksInput): AirBrushLandmarkEvaluation {
  const endPoint = activeStroke ? endCameraStroke(previousPoint) : null;
  const reject = (
    reason: AirBrushRejectionReason,
    metrics?: AirBrushLandmarkMetrics
  ): AirBrushLandmarkEvaluation => ({
    point: endPoint,
    accepted: false,
    reason,
    metrics,
  });

  const handIndex = resolveHandIndex(frame, preferredHand);
  if (!frame || handIndex < 0) {
    const handsPresent = (frame?.landmarks?.length ?? 0) > 0;
    if (preferredHand && handsPresent) {
      return reject('handedness-mismatch');
    }
    return reject('no-hand');
  }

  const hand = frame.landmarks?.[handIndex];
  if (!hand) {
    return reject('no-hand');
  }

  const handedness = resolveHandednessName(frame, handIndex);
  const score = resolveHandScore(frame, handIndex);
  if (score < minHandConfidence) {
    return reject('handedness-low', { handIndex, handedness, score });
  }

  const tip = hand[INDEX_FINGER_TIP_LANDMARK];
  if (!tip || !Number.isFinite(tip.x) || !Number.isFinite(tip.y)) {
    return reject('tip-missing', { handIndex, handedness, score });
  }
  // MediaPipe Hand Landmarker does not populate per-landmark `visibility`
  // meaningfully (it's a Pose-model field); the hand's geometric layout below
  // is the real acceptance signal.

  let gatePalmSpan: number | undefined;
  let gateIndexReach: number | undefined;
  let gateRequiredReach: number | undefined;
  if (requireExtendedIndexFinger) {
    const gate = evaluateIndexFingerGate({ hand, minHandSpan, minIndexExtension });
    gatePalmSpan = gate.palmSpan;
    gateIndexReach = gate.indexReach;
    gateRequiredReach = gate.requiredReach;
    if (!gate.accepted) {
      return reject(gate.reason ?? 'tip-missing', {
        handIndex,
        handedness,
        score,
        palmSpan: gate.palmSpan,
        indexReach: gate.indexReach,
        requiredReach: gate.requiredReach,
      });
    }
  }

  if (requirePinch) {
    const thumb = hand[THUMB_TIP_LANDMARK];
    if (!thumb || !Number.isFinite(thumb.x) || !Number.isFinite(thumb.y)) {
      return reject('tip-missing', {
        handIndex,
        handedness,
        score,
        palmSpan: gatePalmSpan,
        indexReach: gateIndexReach,
        requiredReach: gateRequiredReach,
      });
    }
    const palmSpan =
      gatePalmSpan ??
      Math.max(
        hand[0] && hand[PINKY_MCP_LANDMARK]
          ? landmarkDistance(hand[0], hand[PINKY_MCP_LANDMARK])
          : 0,
        hand[INDEX_FINGER_MCP_LANDMARK] && hand[PINKY_MCP_LANDMARK]
          ? landmarkDistance(hand[INDEX_FINGER_MCP_LANDMARK], hand[PINKY_MCP_LANDMARK])
          : 0
      );
    const pinchDistance = landmarkDistance(thumb, tip);
    const closeThreshold = palmSpan * pinchRatio;
    const openThreshold = closeThreshold * PINCH_HYSTERESIS;
    const pinching = activeStroke
      ? pinchDistance <= openThreshold
      : pinchDistance <= closeThreshold;
    if (!pinching) {
      return {
        point: endPoint,
        accepted: false,
        reason: 'pinch-open',
        metrics: {
          handIndex,
          handedness,
          score,
          palmSpan,
          indexReach: gateIndexReach,
          requiredReach: gateRequiredReach,
          pinching: false,
          pinchDistance,
          pinchThreshold: closeThreshold,
        },
      };
    }
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
    intent,
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
    return {
      point: null,
      accepted: false,
      reason: undefined,
      metrics: {
        handIndex,
        handedness,
        score,
        palmSpan: gatePalmSpan,
        pinching: requirePinch ? true : undefined,
      },
    };
  }

  return {
    point: next,
    accepted: true,
    metrics: {
      handIndex,
      handedness,
      score,
      palmSpan: gatePalmSpan,
      indexReach: gateIndexReach,
      requiredReach: gateRequiredReach,
      pinching: requirePinch ? true : undefined,
    },
  };
}

export function translateMediaPipeHandLandmarksToAirBrushPoint(
  input: TranslateHandLandmarksInput
): AirBrushPoint | null {
  return evaluateMediaPipeHandLandmarks(input).point;
}

export type AirBrushDebugStage =
  | 'inactive'
  | 'camera-request'
  | 'camera-ready'
  | 'camera-error'
  | 'video-play'
  | 'video-play-blocked'
  | 'tracker-load'
  | 'tracker-ready'
  | 'tracker-error'
  | 'video-wait'
  | 'detect-empty'
  | 'detect-rejected'
  | 'detect-error'
  | 'hand-detected'
  | 'point-emitted'
  | 'stroke-ended'
  | 'capture'
  | 'dispatch'
  | 'dispatch-skipped'
  | 'dispatch-error'
  | 'pointer-fallback';

export interface AirBrushVideoDebug {
  readyState?: number;
  videoWidth?: number;
  videoHeight?: number;
  currentTime?: number;
  paused?: boolean;
  hasSrcObject?: boolean;
}

export interface AirBrushDebugEvent {
  at: string;
  stage: AirBrushDebugStage;
  detail?: Record<string, unknown>;
}

export interface AirBrushDebugSnapshot {
  active?: boolean;
  cameraState?: string;
  trackingState?: string;
  detectionCount?: number;
  frameCount?: number;
  skippedFrameCount?: number;
  detectErrorCount?: number;
  emittedPointCount?: number;
  dispatchedPointCount?: number;
  video?: AirBrushVideoDebug;
  lastStage?: AirBrushDebugStage;
  lastError?: string;
  lastRejection?: {
    reason: AirBrushRejectionReason;
    metrics?: AirBrushLandmarkMetrics;
  } | null;
  events: AirBrushDebugEvent[];
}

declare global {
  interface Window {
    __AETHER_AIR_BRUSH_DEBUG__?: AirBrushDebugSnapshot;
  }
}

const MAX_AIR_BRUSH_DEBUG_EVENTS = 80;

export function getAirBrushVideoDebug(
  video: HTMLVideoElement | null | undefined
): AirBrushVideoDebug {
  if (!video) return {};
  return {
    readyState: video.readyState,
    videoWidth: video.videoWidth,
    videoHeight: video.videoHeight,
    currentTime: Number(video.currentTime.toFixed(3)),
    paused: video.paused,
    hasSrcObject: Boolean(video.srcObject),
  };
}

export function messageFromUnknownError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return fallback;
}

export function recordAirBrushDebugEvent(
  stage: AirBrushDebugStage,
  detail: Record<string, unknown> = {},
  patch: Partial<Omit<AirBrushDebugSnapshot, 'events'>> = {},
  options: { log?: boolean } = {}
) {
  if (typeof window === 'undefined') return;
  const previous = window.__AETHER_AIR_BRUSH_DEBUG__ ?? { events: [] };
  const error =
    typeof detail.error === 'string' && detail.error.length > 0
      ? detail.error
      : previous.lastError;
  const event: AirBrushDebugEvent = {
    at: new Date().toISOString(),
    stage,
    detail,
  };
  const next: AirBrushDebugSnapshot = {
    ...previous,
    ...patch,
    lastStage: stage,
    lastError: error,
    events: [...previous.events, event].slice(-MAX_AIR_BRUSH_DEBUG_EVENTS),
  };
  window.__AETHER_AIR_BRUSH_DEBUG__ = next;

  if (options.log === false || typeof console === 'undefined') return;
  // Keep this as info so Next's error overlay does not treat diagnostics as app
  // failures. The compact in-app debug drawer mirrors the same snapshot.
  console.info('[air-brush]', stage, detail);
}

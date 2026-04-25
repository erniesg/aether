import type { AirBrushPoint } from './airBrush';
import type { AirBrushStrokeMachineOptions } from './airBrushStrokeMachine';

export interface AirBrushCalibrationProfile {
  targetText?: string;
  origin: { x: number; y: number };
  jitterRadius: number;
  deadZone: number;
  minStrokeDistance: number;
  minStrokeDurationMs: number;
  gain: number;
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
}

export interface CreateAirBrushCalibrationProfileInput {
  samples: AirBrushPoint[];
  targetText?: string;
  minJitterRadius?: number;
  gain?: number;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function percentile(values: number[], q: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = clamp(Math.ceil(q * sorted.length) - 1, 0, sorted.length - 1);
  return sorted[idx] ?? 0;
}

export function createAirBrushCalibrationProfile({
  samples,
  targetText,
  minJitterRadius = 0.006,
  gain = targetText ? 1.65 : 1.35,
}: CreateAirBrushCalibrationProfileInput): AirBrushCalibrationProfile {
  const usable = samples.filter(
    (point) => Number.isFinite(point.x) && Number.isFinite(point.y)
  );
  const origin =
    usable.length > 0
      ? {
          x: usable.reduce((sum, point) => sum + point.x, 0) / usable.length,
          y: usable.reduce((sum, point) => sum + point.y, 0) / usable.length,
        }
      : { x: 0.5, y: 0.5 };
  const distances = usable.map((point) =>
    Math.hypot(point.x - origin.x, point.y - origin.y)
  );
  const jitterRadius = Math.max(minJitterRadius, percentile(distances, 0.95));
  const deadZone = clamp(jitterRadius * 0.9, 0.005, 0.02);
  const minStrokeDistance = clamp(jitterRadius * 2.8, 0.018, 0.08);

  return {
    targetText,
    origin,
    jitterRadius,
    deadZone,
    minStrokeDistance,
    minStrokeDurationMs: 90,
    gain,
    bounds: {
      minX: 0.08,
      maxX: 0.92,
      minY: 0.12,
      maxY: 0.88,
    },
  };
}

export function airBrushStrokeOptionsFromProfile(
  profile: AirBrushCalibrationProfile
): AirBrushStrokeMachineOptions {
  return {
    minStrokeDistance: profile.minStrokeDistance,
    minStrokeDurationMs: profile.minStrokeDurationMs,
    deadZone: profile.deadZone,
    slowSmoothing: 0.34,
    fastSmoothing: 0.86,
    fastVelocity: Math.max(0.0012, profile.minStrokeDistance / 28),
  };
}

export function stabilizeAirBrushPoint(
  profile: AirBrushCalibrationProfile,
  point: AirBrushPoint
): AirBrushPoint {
  if (point.source !== 'camera' || point.state === 'end') return point;
  const x = 0.5 + (point.x - profile.origin.x) * profile.gain;
  const y = 0.5 + (point.y - profile.origin.y) * profile.gain;
  return {
    ...point,
    x: clamp(x, profile.bounds.minX, profile.bounds.maxX),
    y: clamp(y, profile.bounds.minY, profile.bounds.maxY),
  };
}

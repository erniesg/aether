import { describe, expect, it } from 'vitest';
import {
  clampAirBrushPoint,
  normalizeAirBrushPoint,
  resolveAirBrushInputMode,
  translateMediaPipeHandLandmarksToAirBrushPoint,
} from '@/lib/canvas/airBrush';

describe('air brush input helpers', () => {
  it('normalizes client coordinates into bounded canvas-relative points', () => {
    const point = normalizeAirBrushPoint({
      clientX: 150,
      clientY: 80,
      pressure: 0.7,
      state: 'move',
      source: 'pointer',
      bounds: {
        left: 100,
        top: 40,
        width: 200,
        height: 100,
      },
    });

    expect(point).toEqual({
      x: 0.25,
      y: 0.4,
      pressure: 0.7,
      state: 'move',
      source: 'pointer',
    });
  });

  it('clamps points and pressure for demo-safe fallback strokes', () => {
    expect(
      clampAirBrushPoint({
        x: 1.4,
        y: -0.2,
        pressure: 3,
        state: 'start',
        source: 'camera',
      })
    ).toEqual({
      x: 1,
      y: 0,
      pressure: 1,
      state: 'start',
      source: 'camera',
    });
  });

  it('prefers pointer fallback when hand landmarks are unavailable', () => {
    expect(
      resolveAirBrushInputMode({
        cameraReady: true,
        landmarksReady: false,
        pointerFallbackReady: true,
      })
    ).toBe('pointer-fallback');

    expect(
      resolveAirBrushInputMode({
        cameraReady: true,
        landmarksReady: true,
        pointerFallbackReady: true,
      })
    ).toBe('camera-landmarks');
  });

  it('maps MediaPipe index-finger landmark 8 into camera brush points', () => {
    const point = translateMediaPipeHandLandmarksToAirBrushPoint({
      frame: {
        landmarks: [
          Array.from({ length: 21 }, (_, index) => ({
            x: index === 8 ? 0.2 : 0.5,
            y: index === 8 ? 0.35 : 0.5,
            z: index === 8 ? -0.1 : 0,
            visibility: 0.95,
          })),
        ],
        handedness: [[{ score: 0.91 }]],
      },
      activeStroke: false,
    });

    expect(point).toMatchObject({
      x: 0.8,
      y: 0.35,
      state: 'start',
      source: 'camera',
    });
    expect(point?.pressure).toBeGreaterThan(0.7);
  });

  it('smooths active camera strokes and suppresses tiny landmark jitter', () => {
    const previousPoint = {
      x: 0.5,
      y: 0.5,
      pressure: 0.7,
      state: 'start' as const,
      source: 'camera' as const,
    };

    expect(
      translateMediaPipeHandLandmarksToAirBrushPoint({
        frame: {
          landmarks: [
            Array.from({ length: 21 }, (_, index) => ({
              x: index === 8 ? 0.496 : 0.5,
              y: index === 8 ? 0.504 : 0.5,
              z: 0,
              visibility: 0.95,
            })),
          ],
          handedness: [[{ score: 0.95 }]],
        },
        previousPoint,
        activeStroke: true,
      })
    ).toBeNull();

    const moved = translateMediaPipeHandLandmarksToAirBrushPoint({
      frame: {
        landmarks: [
          Array.from({ length: 21 }, (_, index) => ({
            x: index === 8 ? 0.2 : 0.5,
            y: index === 8 ? 0.8 : 0.5,
            z: 0,
            visibility: 0.95,
          })),
        ],
        handedness: [[{ score: 0.95 }]],
      },
      previousPoint,
      activeStroke: true,
      smoothing: 0.5,
    });

    expect(moved).toMatchObject({
      x: 0.65,
      y: 0.65,
      state: 'move',
      source: 'camera',
    });
  });

  it('ends the active camera stroke when hand presence drops below threshold', () => {
    expect(
      translateMediaPipeHandLandmarksToAirBrushPoint({
        frame: {
          landmarks: [
            Array.from({ length: 21 }, () => ({
              x: 0.5,
              y: 0.5,
              z: 0,
              visibility: 0.95,
            })),
          ],
          handedness: [[{ score: 0.12 }]],
        },
        previousPoint: {
          x: 0.42,
          y: 0.53,
          pressure: 0.6,
          state: 'move',
          source: 'camera',
        },
        activeStroke: true,
      })
    ).toEqual({
      x: 0.42,
      y: 0.53,
      pressure: 0.6,
      state: 'end',
      source: 'camera',
    });
  });
});

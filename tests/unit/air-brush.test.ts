import { describe, expect, it } from 'vitest';
import {
  clampAirBrushPoint,
  detectOpenPalm,
  evaluateMediaPipeHandLandmarks,
  normalizeAirBrushPoint,
  resolveAirBrushInputMode,
  type AirBrushHandLandmark,
  translateMediaPipeHandLandmarksToAirBrushPoint,
} from '@/lib/canvas/airBrush';

function pointingHand(
  overrides: Partial<Record<number, Partial<AirBrushHandLandmark>>> = {}
) {
  const landmarks = Array.from({ length: 21 }, () => ({
    x: 0.54,
    y: 0.74,
    z: 0,
    visibility: 0.95,
  }));
  landmarks[0] = { x: 0.52, y: 0.82, z: 0, visibility: 0.95 };
  landmarks[5] = { x: 0.46, y: 0.62, z: 0, visibility: 0.95 };
  landmarks[6] = { x: 0.44, y: 0.5, z: 0, visibility: 0.95 };
  landmarks[7] = { x: 0.42, y: 0.42, z: 0, visibility: 0.95 };
  landmarks[8] = { x: 0.2, y: 0.35, z: -0.1, visibility: 0.95 };
  landmarks[9] = { x: 0.52, y: 0.64, z: 0, visibility: 0.95 };
  landmarks[13] = { x: 0.58, y: 0.66, z: 0, visibility: 0.95 };
  landmarks[17] = { x: 0.64, y: 0.68, z: 0, visibility: 0.95 };

  for (const [index, patch] of Object.entries(overrides)) {
    const landmarkIndex = Number(index);
    landmarks[landmarkIndex] = {
      ...landmarks[landmarkIndex],
      ...patch,
    };
  }

  return landmarks;
}

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
        landmarks: [pointingHand()],
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

  it('maps right and left index fingers to draw and erase intents', () => {
    const frame = {
      landmarks: [
        pointingHand({ 8: { x: 0.2, y: 0.35, z: -0.1 } }),
        pointingHand({
          0: { x: 0.58, y: 0.82 },
          5: { x: 0.64, y: 0.62 },
          6: { x: 0.66, y: 0.54 },
          7: { x: 0.69, y: 0.48 },
          8: { x: 0.72, y: 0.42, z: 0 },
          17: { x: 0.46, y: 0.68 },
        }),
      ],
      handedness: [
        [{ score: 0.94, categoryName: 'Right' }],
        [{ score: 0.96, categoryName: 'Left' }],
      ],
    };

    expect(
      translateMediaPipeHandLandmarksToAirBrushPoint({
        frame,
        activeStroke: false,
        preferredHand: 'Right',
        intent: 'draw',
      })
    ).toMatchObject({
      x: 0.8,
      y: 0.35,
      state: 'start',
      source: 'camera',
      intent: 'draw',
    });

    expect(
      translateMediaPipeHandLandmarksToAirBrushPoint({
        frame,
        activeStroke: false,
        preferredHand: 'Left',
        intent: 'erase',
      })
    ).toMatchObject({
      x: 0.28,
      y: 0.42,
      state: 'start',
      source: 'camera',
      intent: 'erase',
    });
  });

  it('smooths active camera strokes and suppresses tiny landmark jitter', () => {
    const previousPoint = {
      x: 0.496,
      y: 0.45,
      pressure: 0.7,
      state: 'start' as const,
      source: 'camera' as const,
    };

    expect(
      translateMediaPipeHandLandmarksToAirBrushPoint({
        frame: {
          landmarks: [
            pointingHand({
              7: { x: 0.504, y: 0.48 },
              8: { x: 0.504, y: 0.45, z: 0 },
            }),
          ],
          handedness: [[{ score: 0.95 }]],
        },
        previousPoint,
        activeStroke: true,
      })
    ).toBeNull();

    const moved = translateMediaPipeHandLandmarksToAirBrushPoint({
      frame: {
        landmarks: [pointingHand({ 8: { x: 0.2, y: 0.36, z: 0 } })],
        handedness: [[{ score: 0.95 }]],
      },
      previousPoint,
      activeStroke: true,
      smoothing: 0.5,
    });

    expect(moved).toMatchObject({
      x: 0.648,
      y: 0.405,
      state: 'move',
      source: 'camera',
    });
  });

  it('ends the active camera stroke when hand presence drops below threshold', () => {
    expect(
      translateMediaPipeHandLandmarksToAirBrushPoint({
        frame: {
          landmarks: [pointingHand()],
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

  it('rejects raw landmark arrays that do not look like an extended index finger', () => {
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
          handedness: [[{ score: 0.99 }]],
        },
        activeStroke: false,
      })
    ).toBeNull();
  });

  it('rejects landmarks without handedness confidence', () => {
    expect(
      translateMediaPipeHandLandmarksToAirBrushPoint({
        frame: {
          landmarks: [pointingHand()],
        },
        activeStroke: false,
      })
    ).toBeNull();
  });

  it('accepts a partially curled open-hand index finger as a draw point', () => {
    // This fixture mirrors a real webcam hand: palm toward camera, index
    // fingertip clearly extended away from the MCP, but the middle segments
    // are not perfectly collinear (so the old strict straightness gate would
    // have rejected it).
    const curledPointingHand = pointingHand({
      0: { x: 0.5, y: 0.75 },
      5: { x: 0.48, y: 0.6 },
      6: { x: 0.4, y: 0.52 },
      7: { x: 0.34, y: 0.48 },
      8: { x: 0.28, y: 0.58, z: -0.05 },
      9: { x: 0.52, y: 0.6 },
      13: { x: 0.58, y: 0.62 },
      17: { x: 0.62, y: 0.65 },
    });

    const evaluation = evaluateMediaPipeHandLandmarks({
      frame: {
        landmarks: [curledPointingHand],
        handedness: [[{ score: 0.9, categoryName: 'Right' }]],
      },
      activeStroke: false,
      preferredHand: 'Right',
      intent: 'draw',
    });

    expect(evaluation.accepted).toBe(true);
    expect(evaluation.point).toMatchObject({
      state: 'start',
      source: 'camera',
      intent: 'draw',
    });
    expect(evaluation.point?.x).toBeCloseTo(0.72, 2);
    expect(evaluation.point?.y).toBeCloseTo(0.58, 2);
  });

  it('tags rejections with a reason and metrics for in-app diagnostics', () => {
    const lowConfidence = evaluateMediaPipeHandLandmarks({
      frame: {
        landmarks: [pointingHand()],
        handedness: [[{ score: 0.2, categoryName: 'Right' }]],
      },
      activeStroke: false,
      preferredHand: 'Right',
      intent: 'draw',
    });
    expect(lowConfidence.accepted).toBe(false);
    expect(lowConfidence.reason).toBe('handedness-low');
    expect(lowConfidence.metrics?.score).toBeCloseTo(0.2, 2);

    const collapsedLandmarks = Array.from({ length: 21 }, () => ({
      x: 0.5,
      y: 0.5,
      z: 0,
      visibility: 0.95,
    }));
    const tinyPalm = evaluateMediaPipeHandLandmarks({
      frame: {
        landmarks: [collapsedLandmarks],
        handedness: [[{ score: 0.95, categoryName: 'Right' }]],
      },
      activeStroke: false,
      preferredHand: 'Right',
      intent: 'draw',
    });
    expect(tinyPalm.accepted).toBe(false);
    expect(tinyPalm.reason).toBe('palm-too-small');
    expect(tinyPalm.metrics?.palmSpan).toBe(0);
  });

  it('only emits a draw point while thumb and index are pinched together', () => {
    // Thumb (landmark 4) is parked away from the index tip in the default
    // pointingHand fixture; that should read as "pen up" with requirePinch.
    const penUpHand = pointingHand();
    expect(penUpHand[4]).toEqual({ x: 0.54, y: 0.74, z: 0, visibility: 0.95 });

    const penUp = evaluateMediaPipeHandLandmarks({
      frame: {
        landmarks: [penUpHand],
        handedness: [[{ score: 0.95, categoryName: 'Right' }]],
      },
      activeStroke: false,
      preferredHand: 'Right',
      intent: 'draw',
      requirePinch: true,
    });
    expect(penUp.accepted).toBe(false);
    expect(penUp.reason).toBe('pinch-open');
    expect(penUp.metrics?.pinching).toBe(false);
    expect(penUp.metrics?.pinchDistance).toBeGreaterThan(
      penUp.metrics?.pinchThreshold ?? 0
    );
    expect(penUp.point).toBeNull();

    // Thumb moved onto the index tip → pinch closed → stroke starts.
    const penDown = evaluateMediaPipeHandLandmarks({
      frame: {
        landmarks: [
          pointingHand({ 4: { x: 0.21, y: 0.36 } }),
        ],
        handedness: [[{ score: 0.95, categoryName: 'Right' }]],
      },
      activeStroke: false,
      preferredHand: 'Right',
      intent: 'draw',
      requirePinch: true,
    });
    expect(penDown.accepted).toBe(true);
    expect(penDown.point).toMatchObject({
      state: 'start',
      source: 'camera',
      intent: 'draw',
    });
  });

  it('ends the active stroke when the pinch opens mid-stroke', () => {
    const previousPoint = {
      x: 0.75,
      y: 0.45,
      pressure: 0.7,
      state: 'move' as const,
      source: 'camera' as const,
      intent: 'draw' as const,
    };
    const penUp = evaluateMediaPipeHandLandmarks({
      frame: {
        landmarks: [pointingHand()],
        handedness: [[{ score: 0.95, categoryName: 'Right' }]],
      },
      previousPoint,
      activeStroke: true,
      preferredHand: 'Right',
      intent: 'draw',
      requirePinch: true,
    });

    expect(penUp.accepted).toBe(false);
    expect(penUp.reason).toBe('pinch-open');
    expect(penUp.point).toEqual({
      ...previousPoint,
      state: 'end',
    });
  });

  it('detects an open-palm "done" gesture and rejects drawing/fist poses', () => {
    const openPalm = Array.from({ length: 21 }, () => ({
      x: 0.5,
      y: 0.5,
      z: 0,
      visibility: 0.95,
    }));
    // Wrist at the bottom of the frame, five fingertips splayed well above it.
    openPalm[0] = { x: 0.5, y: 0.85, z: 0, visibility: 0.95 };
    openPalm[5] = { x: 0.44, y: 0.6, z: 0, visibility: 0.95 };
    openPalm[17] = { x: 0.62, y: 0.62, z: 0, visibility: 0.95 };
    openPalm[4] = { x: 0.32, y: 0.5, z: 0, visibility: 0.95 }; // thumb
    openPalm[8] = { x: 0.42, y: 0.32, z: 0, visibility: 0.95 }; // index
    openPalm[12] = { x: 0.52, y: 0.3, z: 0, visibility: 0.95 }; // middle
    openPalm[16] = { x: 0.6, y: 0.32, z: 0, visibility: 0.95 }; // ring
    openPalm[20] = { x: 0.68, y: 0.38, z: 0, visibility: 0.95 }; // pinky

    const palm = detectOpenPalm(openPalm);
    expect(palm.detected).toBe(true);
    expect(palm.minFingerReach ?? 0).toBeGreaterThan(palm.requiredReach ?? 0);

    // A drawing pose: thumb and index pinched together — must NOT be treated
    // as the done gesture even if the other fingertips are extended.
    const pinchedPose = openPalm.map((landmark) => ({ ...landmark }));
    pinchedPose[4] = { x: 0.41, y: 0.33, z: 0, visibility: 0.95 };
    pinchedPose[8] = { x: 0.42, y: 0.32, z: 0, visibility: 0.95 };
    expect(detectOpenPalm(pinchedPose).detected).toBe(false);

    // A fist: fingertips collapsed toward the palm — not an open palm.
    const fist = openPalm.map((landmark) => ({ ...landmark }));
    for (const idx of [4, 8, 12, 16, 20]) {
      fist[idx] = { x: 0.5, y: 0.72, z: 0, visibility: 0.95 };
    }
    expect(detectOpenPalm(fist).detected).toBe(false);

    expect(detectOpenPalm(undefined).detected).toBe(false);
    expect(detectOpenPalm([]).detected).toBe(false);
  });

  it('returns handedness-mismatch when the preferred hand is not in the frame', () => {
    const evaluation = evaluateMediaPipeHandLandmarks({
      frame: {
        landmarks: [pointingHand()],
        handedness: [[{ score: 0.95, categoryName: 'Left' }]],
      },
      activeStroke: false,
      preferredHand: 'Right',
      intent: 'draw',
    });

    expect(evaluation.accepted).toBe(false);
    expect(evaluation.reason).toBe('handedness-mismatch');
    expect(evaluation.point).toBeNull();
  });
});

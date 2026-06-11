import { describe, expect, it } from 'vitest';
import {
  airBrushStrokeOptionsFromProfile,
  createAirBrushCalibrationProfile,
  stabilizeAirBrushPoint,
} from '@/lib/canvas/airBrushCalibration';
import { AirBrushStrokeMachine } from '@/lib/canvas/airBrushStrokeMachine';

describe('air brush calibration', () => {
  it('derives jitter-aware stroke thresholds from neutral samples', () => {
    const profile = createAirBrushCalibrationProfile({
      targetText: '陈恩娇',
      samples: [
        { x: 0.61, y: 0.48, state: 'start', source: 'camera' },
        { x: 0.612, y: 0.481, state: 'move', source: 'camera' },
        { x: 0.609, y: 0.479, state: 'move', source: 'camera' },
        { x: 0.611, y: 0.482, state: 'move', source: 'camera' },
      ],
    });

    expect(profile.origin.x).toBeCloseTo(0.611, 3);
    expect(profile.origin.y).toBeCloseTo(0.4805, 4);
    expect(profile.jitterRadius).toBeGreaterThanOrEqual(0.006);
    expect(profile.minStrokeDistance).toBeGreaterThan(profile.jitterRadius * 2);
    expect(profile.gain).toBeLessThanOrEqual(1.25);

    expect(
      createAirBrushCalibrationProfile({
        targetText: '陈恩娇',
        samples: [{ x: 0.61, y: 0.48, state: 'start', source: 'camera' }],
        gain: 2.4,
      }).gain
    ).toBe(1.25);
  });

  it('keeps neutral tremor pending but promotes real movement', () => {
    const profile = createAirBrushCalibrationProfile({
      samples: [
        { x: 0.5, y: 0.5, state: 'start', source: 'camera' },
        { x: 0.505, y: 0.502, state: 'move', source: 'camera' },
        { x: 0.497, y: 0.499, state: 'move', source: 'camera' },
      ],
    });
    const machine = new AirBrushStrokeMachine(
      airBrushStrokeOptionsFromProfile(profile)
    );

    expect(
      machine.accept({ x: 0.5, y: 0.5, state: 'start', source: 'camera' }, 0)
        .events
    ).toEqual([]);
    expect(
      machine.accept({ x: 0.506, y: 0.501, state: 'move', source: 'camera' }, 40)
        .events
    ).toEqual([]);

    const promoted = machine.accept(
      { x: 0.56, y: 0.53, state: 'move', source: 'camera' },
      96
    );
    expect(promoted.events.some((point) => point.state === 'start')).toBe(true);
  });

  it('does not promote calibrated micro-movements into committed ink', () => {
    const profile = createAirBrushCalibrationProfile({
      targetText: '陈恩娇',
      samples: [
        { x: 0.62, y: 0.44, state: 'start', source: 'camera' },
        { x: 0.621, y: 0.441, state: 'move', source: 'camera' },
        { x: 0.619, y: 0.439, state: 'move', source: 'camera' },
      ],
    });
    const machine = new AirBrushStrokeMachine(
      airBrushStrokeOptionsFromProfile(profile)
    );
    const start = stabilizeAirBrushPoint(profile, {
      x: 0.621,
      y: 0.441,
      state: 'start',
      source: 'camera',
    });
    const tremor = stabilizeAirBrushPoint(profile, {
      x: 0.624,
      y: 0.443,
      state: 'move',
      source: 'camera',
    });

    expect(machine.accept(start, 0).events).toEqual([]);
    expect(machine.accept(tremor, 80).events).toEqual([]);
  });

  it('stabilizes a closed-eye pass around the calibrated writing origin', () => {
    const profile = createAirBrushCalibrationProfile({
      targetText: '陈恩娇',
      samples: [
        { x: 0.62, y: 0.44, state: 'start', source: 'camera' },
        { x: 0.621, y: 0.441, state: 'move', source: 'camera' },
      ],
      gain: 1.25,
    });

    const centered = stabilizeAirBrushPoint(
      profile,
      {
        x: profile.origin.x,
        y: profile.origin.y,
        state: 'start',
        source: 'camera',
      }
    );
    expect(centered.x).toBeCloseTo(0.5, 4);
    expect(centered.y).toBeCloseTo(0.5, 4);

    const moved = stabilizeAirBrushPoint(profile, {
      x: 0.68,
      y: 0.48,
      state: 'move',
      source: 'camera',
    });
    expect(moved.x).toBeCloseTo(0.574, 3);
    expect(moved.y).toBeCloseTo(0.549, 3);
  });
});

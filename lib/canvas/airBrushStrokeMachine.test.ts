import { describe, expect, it } from 'vitest';
import type { AirBrushPoint, AirBrushPointIntent, AirBrushPointState } from './airBrush';
import { AirBrushStrokeMachine } from './airBrushStrokeMachine';

// Characterization suite for the documented airbrush failure modes
// (docs/AIRBRUSH-VOICE-CALIBRATION-2026-04-25.md on feat/airbrush-voice-calibration):
// warm-up dots from pinch flicker, between-stroke resets, intent flips, jitter.

const OPTIONS = {
  minStrokeDistance: 0.03,
  minStrokeDurationMs: 100,
  deadZone: 0.004,
  slowSmoothing: 0.2,
  fastSmoothing: 1.0,
  fastVelocity: 0.001,
};

function point(
  x: number,
  y: number,
  state: AirBrushPointState,
  intent: AirBrushPointIntent = 'draw'
): AirBrushPoint {
  return { x, y, state, source: 'camera', intent };
}

function paintingMachine(): AirBrushStrokeMachine {
  const machine = new AirBrushStrokeMachine(OPTIONS);
  machine.accept(point(0.4, 0.4, 'start'), 0);
  const promoted = machine.accept(point(0.5, 0.4, 'move'), 50);
  expect(promoted.state).toBe('painting');
  return machine;
}

describe('AirBrushStrokeMachine arming', () => {
  it('arms on hover without emitting ink', () => {
    const machine = new AirBrushStrokeMachine(OPTIONS);
    const hovered = machine.accept(point(0.5, 0.5, 'hover'), 0);

    expect(hovered.state).toBe('armed');
    expect(hovered.events).toEqual([]);
    expect(hovered.preview).toMatchObject({ x: 0.5, y: 0.5, state: 'hover' });
  });

  it('re-arms from betweenStrokes so the next pinch can paint', () => {
    const machine = paintingMachine();
    machine.accept(point(0.5, 0.4, 'end'), 80);
    expect(machine.state).toBe('betweenStrokes');

    const rearmed = machine.accept(point(0.55, 0.45, 'hover'), 120);
    expect(rearmed.state).toBe('armed');
  });

  it('treats a bare move with no prior start as a fresh pending stroke', () => {
    const machine = new AirBrushStrokeMachine(OPTIONS);
    const result = machine.accept(point(0.3, 0.3, 'move'), 0);

    expect(result.state).toBe('pendingStroke');
    expect(result.events).toEqual([]);
  });
});

describe('AirBrushStrokeMachine pending-stroke hysteresis', () => {
  it('suppresses a warm-up pinch flicker entirely — no accidental dot', () => {
    const machine = new AirBrushStrokeMachine(OPTIONS);

    const events = [
      machine.accept(point(0.4, 0.4, 'start'), 0),
      machine.accept(point(0.402, 0.401, 'move'), 30),
      machine.accept(point(0.401, 0.4, 'move'), 60),
      machine.accept(point(0.401, 0.4, 'end'), 70),
    ].flatMap((result) => result.events);

    expect(events).toEqual([]);
    expect(machine.state).toBe('betweenStrokes');
  });

  it('keeps a long but near-stationary pinch pending — duration alone never commits', () => {
    const machine = new AirBrushStrokeMachine(OPTIONS);
    machine.accept(point(0.4, 0.4, 'start'), 0);
    // Held for 4x the minimum duration, but moved under 60% of the distance gate.
    const held = machine.accept(point(0.41, 0.4, 'move'), 400);

    expect(held.state).toBe('pendingStroke');
    expect(held.events).toEqual([]);
  });

  it('promotes on distance alone for a fast deliberate stroke', () => {
    const machine = new AirBrushStrokeMachine(OPTIONS);
    machine.accept(point(0.4, 0.4, 'start'), 0);
    const promoted = machine.accept(point(0.45, 0.4, 'move'), 20);

    expect(promoted.state).toBe('painting');
    expect(promoted.events[0]).toMatchObject({ x: 0.4, y: 0.4, state: 'start' });
    expect(promoted.events[1]).toMatchObject({ x: 0.45, y: 0.4, state: 'move' });
  });

  it('promotes via duration plus partial distance for a slow deliberate stroke', () => {
    const machine = new AirBrushStrokeMachine(OPTIONS);
    machine.accept(point(0.4, 0.4, 'start'), 0);
    // 0.02 moved: above the 60% (0.018) duration-path gate, below the 0.03 distance gate.
    const creeping = machine.accept(point(0.42, 0.4, 'move'), 80);
    expect(creeping.state).toBe('pendingStroke');

    const promoted = machine.accept(point(0.42, 0.4, 'move'), 120);
    expect(promoted.state).toBe('painting');
    expect(promoted.events[0]).toMatchObject({ x: 0.4, y: 0.4, state: 'start' });
  });
});

describe('AirBrushStrokeMachine painting', () => {
  it('ends a committed stroke with exactly one end event at the last committed point', () => {
    const machine = paintingMachine();
    const ended = machine.accept(point(0.7, 0.7, 'end'), 90);

    expect(ended.events).toHaveLength(1);
    expect(ended.events[0]).toMatchObject({ x: 0.5, y: 0.4, state: 'end', intent: 'draw' });
    expect(ended.state).toBe('betweenStrokes');
    expect(machine.pointerDown).toBe(false);
  });

  it('swallows sub-dead-zone jitter while painting', () => {
    const machine = paintingMachine();
    const jitter = machine.accept(point(0.502, 0.4, 'move'), 51);

    expect(jitter.events).toEqual([]);
    expect(jitter.state).toBe('painting');
  });

  it('tracks fast movement tighter than slow movement (velocity-adaptive smoothing)', () => {
    const fast = paintingMachine().accept(point(0.52, 0.4, 'move'), 52);
    const slow = paintingMachine().accept(point(0.52, 0.4, 'move'), 150);

    expect(fast.events[0]!.x).toBeCloseTo(0.52, 5);
    expect(slow.events[0]!.x).toBeLessThan(fast.events[0]!.x);
    expect(slow.events[0]!.x).toBeGreaterThan(0.5);
  });

  it('ends the draw stroke and re-pends when intent flips to erase mid-stroke', () => {
    const machine = paintingMachine();
    const flipped = machine.accept(point(0.6, 0.5, 'move', 'erase'), 70);

    expect(flipped.events).toHaveLength(1);
    expect(flipped.events[0]).toMatchObject({ state: 'end', intent: 'draw' });
    expect(flipped.state).toBe('pendingStroke');

    const promoted = machine.accept(point(0.7, 0.55, 'move', 'erase'), 90);
    expect(promoted.state).toBe('painting');
    expect(promoted.events[0]).toMatchObject({ state: 'start', intent: 'erase' });
  });
});

describe('AirBrushStrokeMachine lifecycle', () => {
  it('reset returns to hover and discards committed stroke context', () => {
    const machine = paintingMachine();
    machine.reset();

    expect(machine.state).toBe('hover');
    expect(machine.pointerDown).toBe(false);

    const afterReset = machine.accept(point(0.2, 0.2, 'move'), 200);
    expect(afterReset.state).toBe('pendingStroke');
    expect(afterReset.events).toEqual([]);
  });

  it('handoff parks the machine for voice-driven completion', () => {
    const machine = paintingMachine();
    machine.handoff();

    expect(machine.state).toBe('handoff');
  });

  it('configure tightens or loosens promotion without rebuilding the machine', () => {
    const machine = new AirBrushStrokeMachine({ ...OPTIONS, minStrokeDistance: 0.2 });
    machine.accept(point(0.4, 0.4, 'start'), 0);
    const strict = machine.accept(point(0.45, 0.4, 'move'), 20);
    expect(strict.state).toBe('pendingStroke');
    machine.accept(point(0.45, 0.4, 'end'), 30);

    machine.configure({ minStrokeDistance: 0.03 });
    machine.accept(point(0.4, 0.4, 'start'), 100);
    const loose = machine.accept(point(0.45, 0.4, 'move'), 120);
    expect(loose.state).toBe('painting');
  });
});

import type { AirBrushPoint, AirBrushPointIntent } from './airBrush';

export type AirBrushStrokeMachineState =
  | 'hover'
  | 'armed'
  | 'pendingStroke'
  | 'painting'
  | 'betweenStrokes'
  | 'handoff';

export interface AirBrushStrokeMachineOptions {
  minStrokeDistance?: number;
  minStrokeDurationMs?: number;
  preRollMs?: number;
  deadZone?: number;
  slowSmoothing?: number;
  fastSmoothing?: number;
  fastVelocity?: number;
}

export interface AirBrushStrokeMachineResult {
  state: AirBrushStrokeMachineState;
  events: AirBrushPoint[];
  preview: AirBrushPoint | null;
}

interface TimedPoint {
  point: AirBrushPoint;
  at: number;
}

const DEFAULT_OPTIONS: Required<AirBrushStrokeMachineOptions> = {
  minStrokeDistance: 0.018,
  minStrokeDurationMs: 100,
  preRollMs: 200,
  deadZone: 0.004,
  slowSmoothing: 0.32,
  fastSmoothing: 0.82,
  fastVelocity: 0.0014,
};

function clonePoint(point: AirBrushPoint, state = point.state): AirBrushPoint {
  return { ...point, state };
}

function distance(a: AirBrushPoint, b: AirBrushPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function sameIntent(a: AirBrushPoint | null, b: AirBrushPoint): boolean {
  return (a?.intent ?? 'draw') === (b.intent ?? 'draw');
}

function intentOf(point: AirBrushPoint | null): AirBrushPointIntent {
  return point?.intent ?? 'draw';
}

export class AirBrushStrokeMachine {
  private options: Required<AirBrushStrokeMachineOptions>;
  private currentState: AirBrushStrokeMachineState = 'hover';
  private hoverBuffer: TimedPoint[] = [];
  private pendingStart: TimedPoint | null = null;
  private pendingLast: TimedPoint | null = null;
  private lastCommitted: TimedPoint | null = null;

  constructor(options: AirBrushStrokeMachineOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  configure(options: AirBrushStrokeMachineOptions): void {
    this.options = { ...this.options, ...options };
  }

  get state(): AirBrushStrokeMachineState {
    return this.currentState;
  }

  get pointerDown(): boolean {
    return this.currentState === 'painting';
  }

  get hasPendingStroke(): boolean {
    return this.currentState === 'pendingStroke';
  }

  reset(): void {
    this.currentState = 'hover';
    this.hoverBuffer = [];
    this.pendingStart = null;
    this.pendingLast = null;
    this.lastCommitted = null;
  }

  accept(
    point: AirBrushPoint | null | undefined,
    at = performanceNow()
  ): AirBrushStrokeMachineResult {
    if (!point) return this.result([], null);

    if (point.state === 'hover') {
      this.pushHover(point, at);
      if (this.currentState === 'hover' || this.currentState === 'betweenStrokes') {
        this.currentState = 'armed';
      }
      return this.result([], point);
    }

    if (point.state === 'start') {
      if (
        this.currentState !== 'pendingStroke' ||
        !this.pendingLast ||
        !sameIntent(this.pendingLast.point, point)
      ) {
        this.beginPending(point, at);
        return this.result([], point);
      }
      return this.updatePending(point, at);
    }

    if (point.state === 'move') {
      if (this.currentState === 'pendingStroke') {
        return this.updatePending(point, at);
      }
      if (this.currentState !== 'painting') {
        this.beginPending(clonePoint(point, 'start'), at);
        return this.result([], point);
      }
      return this.paint(point, at);
    }

    return this.end(point, at);
  }

  handoff(): void {
    this.currentState = 'handoff';
  }

  private beginPending(point: AirBrushPoint, at: number): void {
    const start = clonePoint(point, 'start');
    this.currentState = 'pendingStroke';
    this.pendingStart = { point: start, at };
    this.pendingLast = { point: start, at };
  }

  private updatePending(
    point: AirBrushPoint,
    at: number
  ): AirBrushStrokeMachineResult {
    if (!this.pendingStart) {
      this.beginPending(clonePoint(point, 'start'), at);
      return this.result([], point);
    }

    this.pendingLast = { point, at };
    if (!this.shouldPromote(point, at)) {
      return this.result([], point);
    }

    const start = this.pendingStart.point;
    const events: AirBrushPoint[] = [clonePoint(start, 'start')];
    const firstMove = clonePoint(point, 'move');
    if (distance(start, firstMove) >= this.options.deadZone) {
      events.push(firstMove);
    }
    this.currentState = 'painting';
    this.lastCommitted = { point: events.at(-1) ?? start, at };
    this.pendingStart = null;
    this.pendingLast = null;
    return this.result(events, point);
  }

  private shouldPromote(point: AirBrushPoint, at: number): boolean {
    if (!this.pendingStart) return false;
    const elapsed = at - this.pendingStart.at;
    const moved = distance(this.pendingStart.point, point);
    if (moved >= this.options.minStrokeDistance) return true;
    return elapsed >= this.options.minStrokeDurationMs && moved >= this.options.minStrokeDistance * 0.6;
  }

  private paint(
    point: AirBrushPoint,
    at: number
  ): AirBrushStrokeMachineResult {
    if (!this.lastCommitted) {
      const start = clonePoint(point, 'start');
      this.lastCommitted = { point: start, at };
      return this.result([start], point);
    }

    if (!sameIntent(this.lastCommitted.point, point)) {
      const previous = clonePoint(this.lastCommitted.point, 'end');
      this.beginPending(clonePoint(point, 'start'), at);
      return this.result([previous], point);
    }

    const filtered = this.filterPoint(point, at);
    if (distance(this.lastCommitted.point, filtered) < this.options.deadZone) {
      return this.result([], point);
    }
    this.lastCommitted = { point: filtered, at };
    return this.result([filtered], point);
  }

  private end(
    point: AirBrushPoint,
    at: number
  ): AirBrushStrokeMachineResult {
    if (this.currentState === 'pendingStroke') {
      this.pendingStart = null;
      this.pendingLast = null;
      this.currentState = 'betweenStrokes';
      return this.result([], point);
    }

    if (this.currentState !== 'painting' || !this.lastCommitted) {
      this.currentState = 'betweenStrokes';
      return this.result([], point);
    }

    const endPoint = clonePoint(this.lastCommitted.point, 'end');
    if (intentOf(this.lastCommitted.point) !== intentOf(point)) {
      endPoint.intent = this.lastCommitted.point.intent;
    }
    this.lastCommitted = null;
    this.currentState = 'betweenStrokes';
    return this.result([endPoint], point);
  }

  private filterPoint(point: AirBrushPoint, at: number): AirBrushPoint {
    if (!this.lastCommitted) return clonePoint(point, 'move');
    const previous = this.lastCommitted.point;
    const elapsed = Math.max(1, at - this.lastCommitted.at);
    const velocity = distance(previous, point) / elapsed;
    const mix = clamp01(velocity / this.options.fastVelocity);
    const alpha =
      this.options.slowSmoothing +
      (this.options.fastSmoothing - this.options.slowSmoothing) * mix;
    return {
      ...point,
      state: 'move',
      x: previous.x + (point.x - previous.x) * alpha,
      y: previous.y + (point.y - previous.y) * alpha,
      pressure:
        previous.pressure === undefined || point.pressure === undefined
          ? point.pressure
          : previous.pressure + (point.pressure - previous.pressure) * alpha,
    };
  }

  private pushHover(point: AirBrushPoint, at: number): void {
    this.hoverBuffer.push({ point, at });
    const cutoff = at - this.options.preRollMs;
    while (this.hoverBuffer.length > 0 && this.hoverBuffer[0]!.at < cutoff) {
      this.hoverBuffer.shift();
    }
  }

  private result(
    events: AirBrushPoint[],
    preview: AirBrushPoint | null
  ): AirBrushStrokeMachineResult {
    return {
      state: this.currentState,
      events,
      preview,
    };
  }
}

function performanceNow(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

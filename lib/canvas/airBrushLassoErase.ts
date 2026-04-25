export interface AirBrushLassoPoint {
  x: number;
  y: number;
}

export interface AirBrushLassoBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AirBrushLassoShape {
  id: string;
  type: string;
  bounds: AirBrushLassoBounds | null | undefined;
}

export interface ResolveAirBrushLassoEraseShapeIdsInput {
  points: readonly AirBrushLassoPoint[];
  shapes: readonly AirBrushLassoShape[];
  minPoints?: number;
  minArea?: number;
}

function hasFinitePoint(point: AirBrushLassoPoint | undefined): point is AirBrushLassoPoint {
  return Boolean(
    point &&
      Number.isFinite(point.x) &&
      Number.isFinite(point.y)
  );
}

function hasFiniteBounds(
  bounds: AirBrushLassoBounds | null | undefined
): bounds is AirBrushLassoBounds {
  return Boolean(
    bounds &&
      Number.isFinite(bounds.x) &&
      Number.isFinite(bounds.y) &&
      Number.isFinite(bounds.w) &&
      Number.isFinite(bounds.h) &&
      bounds.w > 0 &&
      bounds.h > 0
  );
}

function polygonArea(points: readonly AirBrushLassoPoint[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum) / 2;
}

function pointInPolygon(
  point: AirBrushLassoPoint,
  polygon: readonly AirBrushLassoPoint[]
): boolean {
  let inside = false;
  for (
    let index = 0, previousIndex = polygon.length - 1;
    index < polygon.length;
    previousIndex = index, index += 1
  ) {
    const current = polygon[index]!;
    const previous = polygon[previousIndex]!;
    const intersects =
      current.y > point.y !== previous.y > point.y &&
      point.x <
        ((previous.x - current.x) * (point.y - current.y)) /
          (previous.y - current.y || Number.EPSILON) +
          current.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInBounds(point: AirBrushLassoPoint, bounds: AirBrushLassoBounds) {
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.w &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.h
  );
}

function boundsSamplePoints(bounds: AirBrushLassoBounds): AirBrushLassoPoint[] {
  const right = bounds.x + bounds.w;
  const bottom = bounds.y + bounds.h;
  const centerX = bounds.x + bounds.w / 2;
  const centerY = bounds.y + bounds.h / 2;
  return [
    { x: centerX, y: centerY },
    { x: bounds.x, y: bounds.y },
    { x: right, y: bounds.y },
    { x: right, y: bottom },
    { x: bounds.x, y: bottom },
    { x: centerX, y: bounds.y },
    { x: right, y: centerY },
    { x: centerX, y: bottom },
    { x: bounds.x, y: centerY },
  ];
}

function boundsIntersectsPolygon(
  bounds: AirBrushLassoBounds,
  polygon: readonly AirBrushLassoPoint[]
): boolean {
  if (boundsSamplePoints(bounds).some((point) => pointInPolygon(point, polygon))) {
    return true;
  }
  return polygon.some((point) => pointInBounds(point, bounds));
}

export function resolveAirBrushLassoEraseShapeIds({
  points,
  shapes,
  minPoints = 6,
  minArea = 64,
}: ResolveAirBrushLassoEraseShapeIdsInput): string[] {
  const polygon = points.filter(hasFinitePoint);
  if (polygon.length < minPoints || polygonArea(polygon) < minArea) return [];

  return shapes
    .filter((shape) => shape.type === 'draw' && hasFiniteBounds(shape.bounds))
    .filter((shape) => boundsIntersectsPolygon(shape.bounds!, polygon))
    .map((shape) => shape.id);
}

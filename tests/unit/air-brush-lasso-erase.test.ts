import { describe, expect, it } from 'vitest';
import { resolveAirBrushLassoEraseShapeIds } from '@/lib/canvas/airBrushLassoErase';

describe('air brush lasso erase', () => {
  it('deletes draw strokes inside a circled erase area', () => {
    const ids = resolveAirBrushLassoEraseShapeIds({
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
        { x: 0, y: 0 },
        { x: 4, y: 2 },
      ],
      shapes: [
        { id: 'inside', type: 'draw', bounds: { x: 35, y: 35, w: 20, h: 20 } },
        { id: 'outside', type: 'draw', bounds: { x: 160, y: 35, w: 20, h: 20 } },
        { id: 'image', type: 'image', bounds: { x: 35, y: 35, w: 20, h: 20 } },
      ],
    });

    expect(ids).toEqual(['inside']);
  });

  it('ignores tiny erase gestures so taps do not clear artwork', () => {
    const ids = resolveAirBrushLassoEraseShapeIds({
      points: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 2 },
        { x: 0, y: 2 },
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      shapes: [
        { id: 'inside', type: 'draw', bounds: { x: 1, y: 1, w: 1, h: 1 } },
      ],
    });

    expect(ids).toEqual([]);
  });
});

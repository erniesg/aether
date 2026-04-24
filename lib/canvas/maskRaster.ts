export interface MaskStrokePoint {
  /** Normalized [0,1] x-coordinate in the source image frame. */
  x: number;
  /** Normalized [0,1] y-coordinate. */
  y: number;
}

export interface MaskStroke {
  points: ReadonlyArray<MaskStrokePoint>;
  /**
   * Brush radius as a fraction of the shorter image side. 0.05 on a 1024×1024
   * image is ~51 px; on a 1200×627 image it's ~31 px (scaled against 627).
   */
  radius: number;
}

export type MaskConvention = 'openai' | 'gemini';

/**
 * Rasterize polyline mask strokes into an RGBA pixel buffer at the source
 * image's native dimensions. Pure (no DOM) so it's safe to unit test and to
 * call from either the client (paired with a canvas toDataURL) or the server.
 *
 * Conventions:
 *   - openai: background opaque white, brushed pixels become transparent
 *     (OpenAI Images edit treats alpha=0 as "edit here, preserve rest").
 *   - gemini: background fully transparent, brushed pixels become opaque
 *     white — matches the alpha-as-edit-region convention some adapters use.
 *
 * The radius is applied as a filled disc plus dense segment sampling so no
 * visible gaps appear between points, even on rapid sparse polylines.
 */
export function buildMaskPixels(
  strokes: ReadonlyArray<MaskStroke>,
  width: number,
  height: number,
  convention: MaskConvention = 'openai'
): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);

  if (convention === 'openai') {
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 255;
      pixels[i + 1] = 255;
      pixels[i + 2] = 255;
      pixels[i + 3] = 255;
    }
  }

  const short = Math.min(width, height);

  for (const stroke of strokes) {
    const radiusPx = Math.max(1, stroke.radius * short);
    if (stroke.points.length === 0) continue;

    if (stroke.points.length === 1) {
      const p = stroke.points[0]!;
      plotDisc(pixels, width, height, p.x * width, p.y * height, radiusPx, convention);
      continue;
    }

    for (let i = 1; i < stroke.points.length; i++) {
      const p0 = stroke.points[i - 1]!;
      const p1 = stroke.points[i]!;
      plotSegment(
        pixels,
        width,
        height,
        p0.x * width,
        p0.y * height,
        p1.x * width,
        p1.y * height,
        radiusPx,
        convention
      );
    }
  }

  return pixels;
}

function plotSegment(
  pixels: Uint8ClampedArray,
  w: number,
  h: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
  convention: MaskConvention
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const length = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(length));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    plotDisc(pixels, w, h, x0 + t * dx, y0 + t * dy, radius, convention);
  }
}

function plotDisc(
  pixels: Uint8ClampedArray,
  w: number,
  h: number,
  cx: number,
  cy: number,
  radius: number,
  convention: MaskConvention
): void {
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(w - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(h - 1, Math.ceil(cy + radius));
  const r2 = radius * radius;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dxp = x + 0.5 - cx;
      const dyp = y + 0.5 - cy;
      if (dxp * dxp + dyp * dyp > r2) continue;
      const idx = (y * w + x) * 4;
      if (convention === 'openai') {
        pixels[idx + 3] = 0;
      } else {
        pixels[idx] = 255;
        pixels[idx + 1] = 255;
        pixels[idx + 2] = 255;
        pixels[idx + 3] = 255;
      }
    }
  }
}

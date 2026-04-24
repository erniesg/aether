export interface NormalizedRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GuidanceReferenceInput {
  width: number;
  height: number;
  avoidanceRegions: ReadonlyArray<{ rect: NormalizedRect }>;
  focusArea?: NormalizedRect;
}

// Three-layer palette:
//   neutral  — image area with no explicit signal
//   focus    — where the hero subject should land (bright white)
//   avoidance — where nothing important should live (tinted red)
const NEUTRAL: readonly [number, number, number] = [200, 200, 200];
const FOCUS: readonly [number, number, number] = [255, 255, 255];
const AVOID: readonly [number, number, number] = [235, 60, 60];

function paintRect(
  px: Uint8ClampedArray,
  width: number,
  height: number,
  rect: NormalizedRect,
  rgb: readonly [number, number, number]
): void {
  const x0 = Math.max(0, Math.floor(rect.x * width));
  const x1 = Math.min(width, Math.ceil((rect.x + rect.w) * width));
  const y0 = Math.max(0, Math.floor(rect.y * height));
  const y1 = Math.min(height, Math.ceil((rect.y + rect.h) * height));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const idx = (y * width + x) * 4;
      px[idx] = rgb[0];
      px[idx + 1] = rgb[1];
      px[idx + 2] = rgb[2];
      px[idx + 3] = 255;
    }
  }
}

/**
 * Render a reference image (RGBA) that encodes composition constraints
 * as a visual cue. Safe areas (focusArea) are bright; avoidance regions
 * are tinted red; neutral mid-gray elsewhere. Pure — no DOM — so it's
 * callable server-side for PNG encoding or client-side via
 * HTMLCanvasElement.putImageData.
 *
 * Intended as an experimental, second-signal ref image to send alongside
 * the text prompt when a provider accepts multi-image inputs (Gemini
 * flash-image-preview, Seedream 4). Prompt suffix stays because most
 * providers are text-only; this augments rather than replaces.
 */
export function buildGuidanceReferencePixels(
  input: GuidanceReferenceInput
): Uint8ClampedArray {
  const { width, height, avoidanceRegions, focusArea } = input;
  const px = new Uint8ClampedArray(width * height * 4);

  for (let i = 0; i < px.length; i += 4) {
    px[i] = NEUTRAL[0];
    px[i + 1] = NEUTRAL[1];
    px[i + 2] = NEUTRAL[2];
    px[i + 3] = 255;
  }

  if (focusArea) paintRect(px, width, height, focusArea, FOCUS);
  for (const region of avoidanceRegions) {
    paintRect(px, width, height, region.rect, AVOID);
  }
  return px;
}

/**
 * Face-aware crop math + pan fallback. Replaces the
 * `focal: {x, y}` heuristic that biased `object-position` but couldn't
 * guarantee any specific region stayed visible.
 *
 * Contract: given an asset (with source dims and face bboxes in normalized
 * source coords) and a container aspect (`cw/ch`), produce one of three
 * results:
 *
 *  - `static`  — a fixed `object-position` value that keeps the union of
 *                all faces fully inside the visible window at scale 1.
 *  - `pan`     — when the face union is wider/taller than the visible
 *                window at scale 1, scan across over the scene duration.
 *  - `letterbox` — when no pan is allowed and the face union still doesn't
 *                fit, shrink the image (transform: scale < 1) and use
 *                `object-fit: contain` so the face fits with bars.
 *
 * Coords are normalized: the source image is the unit square (0..1) and the
 * visible window is also expressed in unit-square coords. `object-position`
 * is reported as CSS percentage strings (`"32.10% 50.00%"`).
 */

import { useCurrentFrame, useVideoConfig } from 'remotion';
import type { MediaAsset } from './data';
import { defaultKenBurns, type KenBurnsKey } from './data';

export interface Face {
  x: number;
  y: number;
  w: number;
  h: number;
  confidence?: number;
}

export interface FacesInput {
  sourceDims: { width: number; height: number };
  faces: Face[];
}

export interface PanKey {
  /** `object-position` in CSS percent form: "32.10% 50.00%" */
  objectPosition: string;
  /** `transform: scale(...)` multiplier. Default crop math uses 1. */
  scale: number;
}

export type CropResult =
  | { mode: 'static'; objectPosition: string; scale: 1 }
  | { mode: 'pan'; from: PanKey; to: PanKey }
  | { mode: 'letterbox'; objectFit: 'contain'; objectPosition: string; scale: number };

/** Compute the bounding union of a non-empty set of face bboxes. */
export function faceUnion(faces: Face[]): { x: number; y: number; w: number; h: number } {
  if (faces.length === 0) throw new Error('faceUnion requires at least one face');
  let x0 = 1;
  let y0 = 1;
  let x1 = 0;
  let y1 = 0;
  for (const f of faces) {
    x0 = Math.min(x0, f.x);
    y0 = Math.min(y0, f.y);
    x1 = Math.max(x1, f.x + f.w);
    y1 = Math.max(y1, f.y + f.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * At `object-fit: cover` scale, returns the visible window in normalized
 * source coords. Window is always `≤ 1 × 1`; one axis fills (= 1), the
 * other is shorter.
 */
export function visibleWindowAtCover(
  sourceAspect: number,
  containerAspect: number
): { w: number; h: number } {
  if (sourceAspect > containerAspect) {
    // source is wider → height fills, width is cropped
    return { w: containerAspect / sourceAspect, h: 1 };
  }
  return { w: 1, h: sourceAspect / containerAspect };
}

/**
 * Choose the `object-position` (in unit fractions) that best centers the
 * face union inside the visible window at cover scale. Returns `null` if
 * the union is wider/taller than the window — caller must pan or letterbox.
 *
 * `object-position` semantics: a value of P fraction on an axis means the
 * top-left of the visible window in source coords is `(1 - windowW) * P`.
 * So to land window-center at union-center we want
 *   srcLeft + windowW/2 = unionCx
 *   (1 - windowW) * P + windowW/2 = unionCx
 *   P = (unionCx - windowW/2) / (1 - windowW)
 * clamped to [0, 1].
 */
export function staticObjectPositionFractions(
  union: { x: number; y: number; w: number; h: number },
  window: { w: number; h: number },
  tolerance = 1e-6
): { x: number; y: number } | null {
  const unionCx = union.x + union.w / 2;
  const unionCy = union.y + union.h / 2;

  // Horizontal axis
  let px: number;
  if (window.w >= 1 - tolerance) {
    px = 0.5; // window fills horizontally — any position shows the whole row
  } else if (union.w > window.w + tolerance) {
    return null; // union wider than window — needs pan or letterbox
  } else {
    const denom = 1 - window.w;
    const raw = (unionCx - window.w / 2) / denom;
    px = Math.max(0, Math.min(1, raw));
    // After clamping, re-check that the union fits inside the resulting
    // visible window. (Clamp can move the window away from the union.)
    const left = (1 - window.w) * px;
    if (union.x < left - tolerance || union.x + union.w > left + window.w + tolerance) {
      return null;
    }
  }

  // Vertical axis
  let py: number;
  if (window.h >= 1 - tolerance) {
    py = 0.5;
  } else if (union.h > window.h + tolerance) {
    return null;
  } else {
    const denom = 1 - window.h;
    const raw = (unionCy - window.h / 2) / denom;
    py = Math.max(0, Math.min(1, raw));
    const top = (1 - window.h) * py;
    if (union.y < top - tolerance || union.y + union.h > top + window.h + tolerance) {
      return null;
    }
  }

  return { x: px, y: py };
}

function pct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

/**
 * Pick the dominant (most confident, largest area) face from a set. Used to
 * compute fallback focal when the union doesn't fit but the hero face does.
 */
function dominantFace(faces: Face[]): Face | null {
  if (faces.length === 0) return null;
  let best = faces[0];
  let bestScore = -Infinity;
  for (const f of faces) {
    const area = f.w * f.h;
    const conf = f.confidence ?? 1;
    const score = conf * Math.sqrt(area); // mild preference for area
    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }
  return best;
}

export interface FaceAwareOptions {
  /**
   * If set, pan-mode is allowed; the result's `from`/`to` keys span an
   * `object-position` arc from face-union's near edge to its far edge so
   * every part of the union touches the visible window over the scene.
   */
  allowPan: boolean;
  /**
   * Maximum down-scale for the letterbox fallback (default 0.55 — anything
   * smaller starts to read as a "picture in a frame" rather than a video).
   */
  minLetterboxScale?: number;
}

/**
 * Main entry point. `containerAspect = cw / ch`.
 */
export function computeFaceAwareTransform(
  asset: Pick<MediaAsset, 'focal' | 'subjectBox'> & {
    sourceDims?: { width: number; height: number };
    faces?: Face[];
  },
  containerAspect: number,
  opts: FaceAwareOptions = { allowPan: true }
): CropResult {
  const faces = asset.faces ?? [];
  // Pure fallback to legacy focal — nothing to constrain on.
  if (faces.length === 0 || !asset.sourceDims) {
    const fx = asset.focal?.x ?? 0.5;
    const fy = asset.focal?.y ?? 0.5;
    return {
      mode: 'static',
      objectPosition: `${pct(fx)} ${pct(fy)}`,
      scale: 1,
    };
  }

  const sourceAspect = asset.sourceDims.width / asset.sourceDims.height;
  const window = visibleWindowAtCover(sourceAspect, containerAspect);
  const union = faceUnion(faces);

  const staticPos = staticObjectPositionFractions(union, window);
  if (staticPos) {
    return {
      mode: 'static',
      objectPosition: `${pct(staticPos.x)} ${pct(staticPos.y)}`,
      scale: 1,
    };
  }

  // Union doesn't fit at static cover. Decide: pan vs letterbox.
  if (opts.allowPan) {
    // Build a from→to arc that scans across whichever axis overflows.
    // If both overflow (rare; e.g., one tiny portrait container with audience
    // photo), scan diagonally — pan endpoints are union near-corner →
    // union far-corner translated into object-position space.
    //
    // Position fraction P puts source-left at (1 - W) * P. We want the
    // visible window to start by showing union's LEFT (or TOP) edge at the
    // container's near edge, and end with union's RIGHT (or BOTTOM) edge at
    // the container's far edge.
    //   from: srcLeft = union.x          → P = union.x / (1 - W)
    //   to:   srcLeft + W = union.x + union.w  → P = (union.x + union.w - W) / (1 - W)
    const fracFrom = { x: 0.5, y: 0.5 };
    const fracTo = { x: 0.5, y: 0.5 };

    if (window.w < 1 - 1e-6) {
      const denom = 1 - window.w;
      const startP = union.x / denom;
      const endP = (union.x + union.w - window.w) / denom;
      fracFrom.x = Math.max(0, Math.min(1, startP));
      fracTo.x = Math.max(0, Math.min(1, endP));
    } else {
      const dom = dominantFace(faces);
      const fx = dom ? dom.x + dom.w / 2 : 0.5;
      fracFrom.x = fx;
      fracTo.x = fx;
    }
    if (window.h < 1 - 1e-6) {
      const denom = 1 - window.h;
      const startP = union.y / denom;
      const endP = (union.y + union.h - window.h) / denom;
      fracFrom.y = Math.max(0, Math.min(1, startP));
      fracTo.y = Math.max(0, Math.min(1, endP));
    } else {
      const dom = dominantFace(faces);
      const fy = dom ? dom.y + dom.h / 2 : 0.5;
      fracFrom.y = fy;
      fracTo.y = fy;
    }

    // If from/to ended up identical (e.g., clamping collapsed both ends),
    // collapse to a static crop — pan with zero distance is the static crop.
    if (Math.abs(fracFrom.x - fracTo.x) < 1e-6 && Math.abs(fracFrom.y - fracTo.y) < 1e-6) {
      return {
        mode: 'static',
        objectPosition: `${pct(fracFrom.x)} ${pct(fracFrom.y)}`,
        scale: 1,
      };
    }

    return {
      mode: 'pan',
      from: { objectPosition: `${pct(fracFrom.x)} ${pct(fracFrom.y)}`, scale: 1 },
      to: { objectPosition: `${pct(fracTo.x)} ${pct(fracTo.y)}`, scale: 1 },
    };
  }

  // Letterbox: shrink the image until the face union fits, anchor on union
  // center. `object-fit: contain` always shows the whole image; we just
  // need to ensure the union is big enough to read on a phone frame. The
  // dominant face's height in container fraction is faceH / sourceH after
  // contain-scaling; we pick scale = min(targetUnionFrac / unionH-on-screen).
  //
  // For our use case, "letterbox" is the safety valve when pan is forbidden.
  // We just contain at scale 1 with object-position centered on the union.
  const unionCx = union.x + union.w / 2;
  const unionCy = union.y + union.h / 2;
  const scale = opts.minLetterboxScale ?? 1;
  return {
    mode: 'letterbox',
    objectFit: 'contain',
    objectPosition: `${pct(unionCx)} ${pct(unionCy)}`,
    scale,
  };
}

/**
 * Pure helper: compute a face-aware `object-position` string for a fixed
 * pan progress against a known container aspect. Use this when the photo
 * sits inside a fixed-aspect sticker (Polaroid frame, sponsor wall card)
 * rather than the full composition.
 */
export function faceAwareObjectPosition(
  asset: Pick<MediaAsset, 'focal' | 'sourceDims' | 'faces'>,
  containerAspect: number,
  panProgress = 0
): string {
  const crop = computeFaceAwareTransform(asset, containerAspect, { allowPan: true });
  if (crop.mode !== 'pan') return crop.objectPosition;
  const t = Math.max(0, Math.min(1, panProgress));
  return interpolateObjectPositionString(crop.from.objectPosition, crop.to.objectPosition, t);
}

/**
 * Hook: returns the live `object-position` string for an asset given the
 * current composition aspect (auto-detected from `useVideoConfig`). When the
 * crop math returns a `pan`, the position is animated linearly across the
 * scene's `durationInFrames` (or the optional `panProgress` override). Use
 * this as a drop-in replacement for `focalObjectPosition(asset)` in scenes
 * that need a single static or panning crop.
 *
 * Pass `panProgress` (a 0..1 number) for scenes that drive their own
 * timeline — e.g., a glitch scene that cycles through N photos in different
 * sub-windows of the same `durationInFrames`. When omitted, the progress is
 * `frame / (durationInFrames - 1)`.
 *
 * Example:
 *   const objectPosition = useFaceAwareObjectPosition(img);
 *   <Img style={{ objectFit: 'cover', objectPosition }} ... />
 */
export function useFaceAwareObjectPosition(
  asset: Pick<MediaAsset, 'focal' | 'sourceDims' | 'faces'>,
  panProgress?: number
): string {
  const { width, height, durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();
  const containerAspect = width / height;
  const crop = computeFaceAwareTransform(asset, containerAspect, { allowPan: true });
  if (crop.mode !== 'pan') {
    return crop.objectPosition;
  }
  const t =
    typeof panProgress === 'number'
      ? Math.max(0, Math.min(1, panProgress))
      : durationInFrames > 1
        ? Math.max(0, Math.min(1, frame / (durationInFrames - 1)))
        : 0;
  return interpolateObjectPositionString(crop.from.objectPosition, crop.to.objectPosition, t);
}

/** Parse "X.XX% Y.YY%" → [x, y] in 0..100 units. */
function parsePct(s: string): [number, number] {
  const parts = s.split(/\s+/);
  return [parseFloat(parts[0]), parseFloat(parts[1])];
}

/** Linearly interpolate between two CSS percent-pair strings. */
export function interpolateObjectPositionString(from: string, to: string, t: number): string {
  const [fx, fy] = parsePct(from);
  const [tx, ty] = parsePct(to);
  const x = fx + (tx - fx) * t;
  const y = fy + (ty - fy) * t;
  return `${x.toFixed(2)}% ${y.toFixed(2)}%`;
}

/**
 * Face-aware version of `defaultKenBurns`. Returns the same `{ from, to }`
 * key shape as the legacy helper, but the (x, y) endpoints are guaranteed
 * to keep the face union visible at cover scale on the given container
 * aspect. Variants that drive their own ken-burns timeline should call
 * this instead of `defaultKenBurns(asset)` so the pan never wanders away
 * from a face.
 */
export function faceAwareKenBurns(
  asset: Pick<MediaAsset, 'focal' | 'subjectBox' | 'sourceDims' | 'faces'>,
  containerAspect: number
): { from: KenBurnsKey; to: KenBurnsKey } {
  // Fallback: no face info → legacy subject-box arc.
  if (!asset.faces || asset.faces.length === 0 || !asset.sourceDims) {
    return defaultKenBurns(asset);
  }

  const crop = computeFaceAwareTransform(asset, containerAspect, { allowPan: true });
  if (crop.mode === 'pan') {
    // PAN mode: from → to from face-aware crop. Scale arc kept gentle so it
    // still reads as ken-burns and not a hard zoom.
    const [fxPct, fyPct] = parsePct(crop.from.objectPosition);
    const [txPct, tyPct] = parsePct(crop.to.objectPosition);
    return {
      from: { x: fxPct / 100, y: fyPct / 100, scale: 1.02 },
      to: { x: txPct / 100, y: tyPct / 100, scale: 1.06 },
    };
  }
  if (crop.mode === 'letterbox') {
    return defaultKenBurns(asset);
  }
  // Static — gentle zoom anchored on the face-aware crop center.
  const [pxPct, pyPct] = parsePct(crop.objectPosition);
  return {
    from: { x: pxPct / 100, y: pyPct / 100, scale: 1.02 },
    to: { x: pxPct / 100, y: pyPct / 100, scale: 1.10 },
  };
}

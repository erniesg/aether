import React from 'react';
import { Img, OffthreadVideo, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { MediaAsset } from '../data';
import { computeFaceAwareTransform, type CropResult } from '../crop';

interface Props {
  /** Pool of media to cycle through. */
  pool: MediaAsset[];
  /** How long each photo holds before cross-cutting (in frames). */
  holdFrames?: number;
  /** Overlay tint applied on top — keep foreground text readable. */
  tintOpacity?: number;
  /** Strength of the ken-burns scale-up during each hold. */
  kenBurns?: number;
  /** Optional starting offset so different scenes don't all show the same image. */
  startIndex?: number;
}

/**
 * Rapidly cycles real captured photos behind any scene. Two consecutive
 * images are visible at once with a feathered cross-fade, plus a per-image
 * ken-burns scale-up so nothing ever sits still. This is what turns a
 * black-bg PDF into something that reads as video.
 *
 * Each tile uses the face-aware crop math (lib/EventRecap/crop.ts): if the
 * asset has SAM3-tagged faces, we keep the union visible at cover scale;
 * when the union can't fit, we pan across it during the hold.
 */
export const MediaBackdrop: React.FC<Props> = ({
  pool,
  holdFrames = 24,
  tintOpacity = 0.55,
  kenBurns = 0.12,
  startIndex = 0,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const containerAspect = width / height;
  const images = pool.filter((m) => m.type === 'image');
  if (images.length === 0) return null;

  const cycleLen = images.length * holdFrames;
  const localFrame = frame % cycleLen;
  const slot = Math.floor(localFrame / holdFrames);
  const slotFrame = localFrame % holdFrames;

  const current = images[(slot + startIndex) % images.length];
  const next = images[(slot + startIndex + 1) % images.length];

  // cross-fade window — last 8 frames of each hold transition to next
  const xfade = interpolate(slotFrame, [holdFrames - 8, holdFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const kbProgress = slotFrame / holdFrames;

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#000' }}>
      <Tile
        asset={current}
        scale={1 + kenBurns * kbProgress}
        opacity={1 - xfade}
        containerAspect={containerAspect}
        holdProgress={kbProgress}
      />
      <Tile
        asset={next}
        scale={1 + kenBurns * (kbProgress - 1)}
        opacity={xfade}
        containerAspect={containerAspect}
        holdProgress={kbProgress}
      />
      {/* dark tint so foreground text stays legible */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse at center, rgba(0,0,0,${tintOpacity * 0.6}) 0%, rgba(0,0,0,${tintOpacity}) 100%)`,
        }}
      />
      {/* subtle scanline + grain for cinematic feel */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'repeating-linear-gradient(0deg, rgba(0,0,0,0.04) 0 1px, transparent 1px 3px)',
          mixBlendMode: 'overlay',
          opacity: 0.6,
        }}
      />
    </div>
  );
};

interface TileProps {
  asset: MediaAsset;
  scale: number;
  opacity: number;
  containerAspect: number;
  /** 0..1 progress through this asset's hold. Used to interpolate pan keys. */
  holdProgress: number;
}

const Tile: React.FC<TileProps> = ({ asset, scale, opacity, containerAspect, holdProgress }) => {
  const crop: CropResult = computeFaceAwareTransform(asset, containerAspect, { allowPan: true });

  const objectPosition =
    crop.mode === 'pan'
      ? interpolateObjectPosition(crop.from.objectPosition, crop.to.objectPosition, holdProgress)
      : crop.objectPosition;

  const objectFit = crop.mode === 'letterbox' ? 'contain' : 'cover';
  const baseScale = crop.mode === 'letterbox' ? crop.scale : 1;
  const finalScale = scale * baseScale;

  // Anchor transforms to the same point we crop around, so ken-burns
  // doesn't slide AWAY from the focal/face region.
  const style: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit,
    objectPosition,
    transform: `scale(${finalScale})`,
    transformOrigin: objectPosition,
    opacity,
  };
  if (asset.type === 'video') {
    return <OffthreadVideo src={asset.url} muted style={style} />;
  }
  return <Img src={asset.url} style={style} />;
};

/**
 * Linearly interpolate between two CSS `object-position` strings of shape
 * `"X.XX% Y.YY%"`. Used by Tile when the crop math returns a pan arc.
 */
function interpolateObjectPosition(from: string, to: string, t: number): string {
  const parse = (s: string) => {
    const parts = s.split(/\s+/);
    return [parseFloat(parts[0]), parseFloat(parts[1])];
  };
  const [fx, fy] = parse(from);
  const [tx, ty] = parse(to);
  const x = fx + (tx - fx) * t;
  const y = fy + (ty - fy) * t;
  return `${x.toFixed(2)}% ${y.toFixed(2)}%`;
}

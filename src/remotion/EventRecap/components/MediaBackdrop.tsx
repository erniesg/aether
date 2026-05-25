import React from 'react';
import { Img, OffthreadVideo, interpolate, useCurrentFrame } from 'remotion';
import { theme } from '../theme';
import type { MediaAsset } from '../data';

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
 */
export const MediaBackdrop: React.FC<Props> = ({
  pool,
  holdFrames = 24,
  tintOpacity = 0.55,
  kenBurns = 0.12,
  startIndex = 0,
}) => {
  const frame = useCurrentFrame();
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
      <Tile asset={current} scale={1 + kenBurns * kbProgress} opacity={1 - xfade} />
      <Tile asset={next} scale={1 + kenBurns * (kbProgress - 1)} opacity={xfade} />
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

const Tile: React.FC<{ asset: MediaAsset; scale: number; opacity: number }> = ({
  asset,
  scale,
  opacity,
}) => {
  // Smart crop: if the asset was VLM-tagged with a focal point we honor it;
  // otherwise fall back to the historical 50%/50% centered cover. Same
  // origin is used for both `objectPosition` and `transformOrigin` so that
  // the ken-burns scale-up stays anchored to the subject.
  const fx = asset.focal ? asset.focal.x * 100 : 50;
  const fy = asset.focal ? asset.focal.y * 100 : 50;
  const style: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: `${fx}% ${fy}%`,
    transform: `scale(${scale})`,
    transformOrigin: `${fx}% ${fy}%`,
    opacity,
  };
  if (asset.type === 'video') {
    return <OffthreadVideo src={asset.url} muted style={style} />;
  }
  return <Img src={asset.url} style={style} />;
};

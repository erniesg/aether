import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame } from 'remotion';
import type { RecapBundle } from '../../../EventRecap/data';
import { aie2026MediaPool, focalObjectPosition } from '../../../EventRecap/data';

interface Props {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

/**
 * 0:04 — 0:08 montage. Three slow-pan photos, ~40 frames each with
 * 12-frame cross-fades between. No copy on top — let the imagery breathe.
 * Bottom-third holds a faint counter starting at frame 80.
 */
export const SlowMontage: React.FC<Props> = ({ bundle, orientation }) => {
  const frame = useCurrentFrame();
  // Hand-picked portraits/landscapes — natural-doc feel
  const picks = [
    aie2026MediaPool[2], // Rachael De Foe
    aie2026MediaPool[5], // Val Yap
    aie2026MediaPool[8], // AI Engineer keynote shot
  ];

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {picks.map((p, i) => {
        const start = i * 40;
        const end = start + 50;
        const op = interpolate(frame, [start, start + 10, end - 10, end], [0, 1, 1, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        const localFrame = frame - start;
        const scale = interpolate(localFrame, [0, 50], [1.05, 1.18]);
        // Pan-X drift
        const panX = interpolate(localFrame, [0, 50], [-3, 3]);
        return (
          <Img
            key={p.url}
            src={p.url}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: focalObjectPosition(p),
              transformOrigin: focalObjectPosition(p),
              transform: `scale(${scale}) translateX(${panX}%)`,
              opacity: op,
              filter: 'brightness(0.78) contrast(0.96) saturate(0.74) sepia(0.08)',
            }}
          />
        );
      })}
      {/* Edge vignette */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at center, rgba(0,0,0,0) 0%, rgba(0,0,0,0.4) 80%, rgba(0,0,0,0.7) 100%)',
        }}
      />
      {/* Tiny mono ref counter, lower right */}
      <div
        style={{
          position: 'absolute',
          right: orientation === 'vertical' ? 80 : 160,
          bottom: orientation === 'vertical' ? 130 : 120,
          color: '#a89c87',
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontStyle: 'italic',
          fontSize: orientation === 'vertical' ? 22 : 28,
          letterSpacing: '0.04em',
          textAlign: 'right',
          opacity: interpolate(frame, [70, 95], [0, 0.95], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
          textShadow: '0 2px 12px rgba(0,0,0,0.9)',
        }}
      >
        Singapore. <br />
        <span style={{ fontStyle: 'normal', color: '#f4ede0' }}>May 17 — 19, 2026.</span>
      </div>
    </AbsoluteFill>
  );
};

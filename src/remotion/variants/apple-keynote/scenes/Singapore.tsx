import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame } from 'remotion';
import type { RecapBundle } from '../../../EventRecap/data';
import { aie2026MediaPool, defaultKenBurns } from '../../../EventRecap/data';

interface Props {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * 0:00 — 0:04. "Singapore." resolves in. Wide-crop hallway photo
 * appears like product lighting — dimmed sides, brighter center.
 */
export const Singapore: React.FC<Props> = ({ bundle, orientation }) => {
  const frame = useCurrentFrame();

  // Crowd / hallway shot — Linh Nguyen's sponsors+booths
  const photo = aie2026MediaPool[9];

  // Photo fades in slow + ultra-slow rise — Ken Burns "rise" feel: the
  // photo settles inward, scale 1.06 → 1.0, drift y bias 0.55 → 0.45 so
  // it lifts gently while losing its zoom.
  const photoOpacity = interpolate(frame, [10, 60], [0, 0.7], { extrapolateRight: 'clamp', easing: easeInOutCubic });
  const kb = defaultKenBurns(photo);
  const t = interpolate(frame, [10, 120], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  // Start slightly below the focal, settle on it (the "rise").
  const px = interpolate(t, [0, 1], [kb.from.x, kb.to.x]) * 100;
  const pyRaw = interpolate(t, [0, 1], [kb.from.y + 0.05, kb.to.y - 0.05]);
  const py = Math.max(0, Math.min(1, pyRaw)) * 100;
  const photoScale = interpolate(t, [0, 1], [1.06, 1.0]);

  // Title fades in even slower
  const titleOpacity = interpolate(frame, [22, 68], [0, 1], { extrapolateRight: 'clamp', easing: easeInOutCubic });
  const titleY = interpolate(frame, [22, 68], [12, 0], { extrapolateRight: 'clamp', easing: easeInOutCubic });

  const subOpacity = interpolate(frame, [60, 95], [0, 1], { extrapolateRight: 'clamp', easing: easeInOutCubic });

  const exitFade = interpolate(frame, [110, 120], [1, 0], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: '#000', opacity: exitFade }}>
      {/* Photo — product-style lit from above */}
      <Img
        src={photo.url}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: `${px}% ${py}%`,
          transformOrigin: `${px}% ${py}%`,
          opacity: photoOpacity,
          transform: `scale(${photoScale})`,
          filter: 'brightness(0.55) contrast(1.05) saturate(0.85)',
        }}
      />
      {/* Spotlight gradient — bright center, deep edges */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at 50% 35%, rgba(0,0,0,0) 0%, rgba(0,0,0,0.45) 60%, rgba(0,0,0,0.9) 100%)',
        }}
      />
      {/* Top + bottom gradient for type contrast */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.0) 30%, rgba(0,0,0,0.0) 70%, rgba(0,0,0,0.85) 100%)',
        }}
      />

      {/* Title block */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontFamily: '-apple-system, "SF Pro Display", Inter, sans-serif',
          gap: 14,
        }}
      >
        <div
          style={{
            fontSize: orientation === 'vertical' ? 160 : 220,
            fontWeight: 600,
            letterSpacing: '-0.04em',
            lineHeight: 1,
            opacity: titleOpacity,
            transform: `translateY(${titleY}px)`,
            textShadow: '0 2px 40px rgba(0,0,0,0.7)',
          }}
        >
          Singapore.
        </div>
        <div
          style={{
            fontSize: orientation === 'vertical' ? 22 : 28,
            fontWeight: 400,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            opacity: subOpacity * 0.7,
            color: '#a8a8b3',
          }}
        >
          May 17 — 19, 2026
        </div>
      </div>
    </AbsoluteFill>
  );
};

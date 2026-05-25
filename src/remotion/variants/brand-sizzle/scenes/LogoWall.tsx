import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame } from 'remotion';
import type { RecapBundle } from '../../../EventRecap/data';
import { aie2026MediaPool, defaultKenBurns } from '../../../EventRecap/data';

interface Props {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);

/**
 * 0:00 — 0:04. Sponsor wall reveals row by row with smooth ease, holds
 * briefly, then morphs into a hallway photo via opacity crossfade.
 */
export const LogoWall: React.FC<Props> = ({ bundle, orientation }) => {
  const frame = useCurrentFrame();
  const sponsors = bundle.sponsors.slice(0, 12);

  // Logo wall is dominant from 0 to 80, then crossfades to photo by 100
  const wallOpacity = interpolate(frame, [80, 110], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easeOutQuart,
  });
  // Photo emerges
  const photoOpacity = interpolate(frame, [70, 110], [0, 0.7], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easeOutQuart,
  });

  const photo = aie2026MediaPool[9]; // Linh hallway/sponsors shot
  // Ken Burns: photo subtly drifts behind the logo crossfade for parallax.
  const kb = defaultKenBurns(photo);
  const t = interpolate(frame, [0, 120], [0, 1]);
  const px = interpolate(t, [0, 1], [kb.from.x, kb.to.x]) * 100;
  const py = interpolate(t, [0, 1], [kb.from.y, kb.to.y]) * 100;

  return (
    <AbsoluteFill
      style={{
        background: 'linear-gradient(135deg, #1a0e08 0%, #2a1815 50%, #1a0e08 100%)',
      }}
    >
      {/* Photo (revealed) */}
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
          filter: 'saturate(1.0) contrast(1.0) brightness(0.5) hue-rotate(-8deg)',
          transform: `scale(${interpolate(t, [0, 1], [1.04, 1.10])})`,
        }}
      />
      {/* Warm overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(255,120,40,0.18) 0%, rgba(20,8,2,0.4) 100%)',
          opacity: photoOpacity,
        }}
      />

      {/* Logo grid */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: wallOpacity,
        }}
      >
        <div
          style={{
            color: '#ff9a4a',
            fontFamily: 'Inter, sans-serif',
            fontSize: orientation === 'vertical' ? 16 : 22,
            fontWeight: 500,
            letterSpacing: '0.32em',
            textTransform: 'uppercase',
            marginBottom: 40,
            opacity: interpolate(frame, [4, 18], [0, 1], { extrapolateRight: 'clamp' }),
          }}
        >
          From the room
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: orientation === 'vertical' ? '1fr 1fr' : 'repeat(4, 1fr)',
            gap: orientation === 'vertical' ? '24px 50px' : '32px 80px',
            justifyItems: 'center',
            alignItems: 'center',
          }}
        >
          {sponsors.map((s, i) => {
            const start = 10 + i * 4;
            const op = interpolate(frame, [start, start + 18], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              easing: easeOutQuart,
            });
            const y = interpolate(op, [0, 1], [16, 0]);
            return (
              <div
                key={s.brand}
                style={{
                  fontFamily: 'Inter, sans-serif',
                  fontSize: orientation === 'vertical' ? 30 : 40,
                  fontWeight: s.tier === 'diamond' ? 600 : 500,
                  letterSpacing: '-0.015em',
                  color: '#fff',
                  opacity: op,
                  transform: `translateY(${y}px)`,
                }}
              >
                {s.brand}
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

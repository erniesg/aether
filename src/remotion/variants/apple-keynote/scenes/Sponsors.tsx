import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import type { RecapBundle } from '../../../EventRecap/data';

interface Props {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * 0:08 — 0:12. Sponsor wall rises in elegantly — each name on its own
 * line, mono spacing, stagger-fade-in. Closing line "And it just keeps
 * going." then product URL.
 */
export const Sponsors: React.FC<Props> = ({ bundle, orientation }) => {
  const frame = useCurrentFrame();

  const sponsors = bundle.sponsors.slice(0, 12);

  // Closing line appears at end
  const lineOpacity = interpolate(frame, [70, 100], [0, 1], { extrapolateRight: 'clamp', easing: easeInOutCubic });

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {/* Soft top-down gradient */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(28,30,42,0.4) 0%, rgba(0,0,0,1) 70%)',
        }}
      />

      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          paddingTop: orientation === 'vertical' ? '14%' : '12%',
          color: '#fff',
          fontFamily: '-apple-system, "SF Pro Display", Inter, sans-serif',
          gap: orientation === 'vertical' ? 30 : 40,
        }}
      >
        <div
          style={{
            fontSize: orientation === 'vertical' ? 20 : 28,
            color: '#a8a8b3',
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            fontWeight: 500,
            opacity: interpolate(frame, [0, 18], [0, 1], { extrapolateRight: 'clamp' }),
          }}
        >
          Made by
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: orientation === 'vertical' ? '1fr 1fr' : 'repeat(3, 1fr)',
            gap: orientation === 'vertical' ? '20px 60px' : '24px 100px',
            justifyItems: 'center',
            alignItems: 'center',
          }}
        >
          {sponsors.map((s, i) => {
            const start = 8 + i * 5;
            const op = interpolate(frame, [start, start + 24], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              easing: easeInOutCubic,
            });
            const y = interpolate(op, [0, 1], [12, 0]);
            return (
              <div
                key={s.brand}
                style={{
                  fontSize: orientation === 'vertical' ? 36 : 48,
                  fontWeight: s.tier === 'diamond' ? 600 : s.tier === 'platinum' ? 500 : 400,
                  letterSpacing: '-0.015em',
                  opacity: op * (s.tier === 'diamond' ? 1 : s.tier === 'platinum' ? 0.85 : 0.7),
                  transform: `translateY(${y}px)`,
                  color: '#fff',
                }}
              >
                {s.brand}
              </div>
            );
          })}
        </div>

        {/* Bottom closing */}
        <div
          style={{
            position: 'absolute',
            bottom: orientation === 'vertical' ? '12%' : '12%',
            left: 0,
            right: 0,
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
            opacity: lineOpacity,
          }}
        >
          <div
            style={{
              fontSize: orientation === 'vertical' ? 50 : 70,
              fontWeight: 500,
              letterSpacing: '-0.025em',
              color: '#fff',
            }}
          >
            And it just keeps going.
          </div>
          <div
            style={{
              fontSize: orientation === 'vertical' ? 18 : 22,
              color: '#a8a8b3',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
            }}
          >
            aether.berlayar.ai/vibes/{bundle.eventId}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

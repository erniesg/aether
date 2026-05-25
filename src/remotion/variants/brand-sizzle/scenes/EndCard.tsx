import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import type { RecapBundle } from '../../../EventRecap/data';

interface Props {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);

/**
 * 0:08 — 0:12. End card. "#AIE2026 SINGAPORE" as the hashtag with
 * soft orange glow, URL underneath, sponsor count line.
 */
export const EndCard: React.FC<Props> = ({ bundle, orientation }) => {
  const frame = useCurrentFrame();

  const hashOpacity = interpolate(frame, [6, 28], [0, 1], { extrapolateRight: 'clamp', easing: easeOutQuart });
  const hashScale = interpolate(frame, [6, 36], [0.97, 1.0], { extrapolateRight: 'clamp', easing: easeOutQuart });
  const subOpacity = interpolate(frame, [38, 58], [0, 1], { extrapolateRight: 'clamp', easing: easeOutQuart });
  const urlOpacity = interpolate(frame, [70, 95], [0, 1], { extrapolateRight: 'clamp' });
  // Pulse glow
  const glowAlpha = 0.35 + Math.sin(frame * 0.1) * 0.15;

  return (
    <AbsoluteFill
      style={{
        background:
          'radial-gradient(ellipse at 50% 45%, #4a1f08 0%, #1a0e08 70%, #0d0604 100%)',
      }}
    >
      {/* Background warm glow */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: orientation === 'vertical' ? 900 : 1200,
          height: orientation === 'vertical' ? 900 : 1200,
          borderRadius: '50%',
          background: `radial-gradient(circle, rgba(255,150,80,${glowAlpha}) 0%, rgba(0,0,0,0) 60%)`,
          filter: 'blur(40px)',
        }}
      />

      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontFamily: 'Inter, sans-serif',
          gap: 30,
        }}
      >
        <div
          style={{
            fontSize: orientation === 'vertical' ? 110 : 170,
            fontWeight: 700,
            letterSpacing: '-0.04em',
            opacity: hashOpacity,
            transform: `scale(${hashScale})`,
            textShadow: '0 0 60px rgba(255,150,80,0.55), 0 0 120px rgba(255,150,80,0.3)',
            background: 'linear-gradient(180deg, #fff 0%, #ffcfa8 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            lineHeight: 0.9,
            textAlign: 'center',
          }}
        >
          #AIE2026
        </div>
        <div
          style={{
            fontSize: orientation === 'vertical' ? 30 : 40,
            fontWeight: 500,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: '#ff9a4a',
            opacity: subOpacity,
          }}
        >
          Singapore · May 17—19
        </div>

        <div
          style={{
            marginTop: 12,
            fontSize: orientation === 'vertical' ? 22 : 28,
            fontWeight: 400,
            letterSpacing: '0.06em',
            color: '#ffcfa8',
            opacity: subOpacity * 0.8,
            textAlign: 'center',
            maxWidth: orientation === 'vertical' ? 720 : 1000,
            lineHeight: 1.35,
          }}
        >
          {bundle.stats.refs} refs · {bundle.voices.length} voices · {bundle.sponsors.length} sponsors
        </div>
      </div>

      {/* Bottom URL */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: orientation === 'vertical' ? 130 : 80,
          textAlign: 'center',
          fontFamily: 'Inter, sans-serif',
          fontSize: orientation === 'vertical' ? 22 : 28,
          fontWeight: 500,
          color: '#ff9a4a',
          letterSpacing: '0.12em',
          opacity: urlOpacity,
          textTransform: 'uppercase',
        }}
      >
        aether.berlayar.ai/vibes/{bundle.eventId}
      </div>
    </AbsoluteFill>
  );
};

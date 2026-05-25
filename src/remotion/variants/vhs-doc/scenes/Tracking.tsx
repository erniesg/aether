import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame } from 'remotion';
import type { RecapBundle } from '../../../EventRecap/data';
import { aie2026MediaPool, focalObjectPosition } from '../../../EventRecap/data';

interface Props {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

/**
 * 0:00 — 0:04. Tape boots up. First 12 frames: tracking lines + black.
 * Then a single photo emerges, washed-out, with subtle wobble.
 * Lower-third lower-band shows the event title in typewriter.
 */
export const Tracking: React.FC<Props> = ({ bundle, orientation }) => {
  const frame = useCurrentFrame();

  const photo = aie2026MediaPool[2]; // Rachael De Foe portrait

  // Photo fades in slowly with extra grain in first 12 frames
  const photoOpacity = interpolate(frame, [10, 40], [0, 0.8], { extrapolateRight: 'clamp' });
  // Wobble jitter
  const wobbleX = Math.sin(frame * 0.4) * 4;
  const wobbleY = Math.cos(frame * 0.3) * 2;

  // Title types in
  const title = 'AI ENGINEER · SINGAPORE · 2026';
  const charsShown = Math.max(0, Math.min(title.length, Math.floor((frame - 30) / 1.2)));
  const visibleTitle = title.slice(0, charsShown);

  // Stats line types
  const stats = '872 REFS · 4M VIEWS · 12 SPONSORS';
  const statsShown = Math.max(0, Math.min(stats.length, Math.floor((frame - 78) / 1.0)));
  const visibleStats = stats.slice(0, statsShown);

  return (
    <AbsoluteFill style={{ background: '#0a0a08' }}>
      <Img
        src={photo.url}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: focalObjectPosition(photo),
          opacity: photoOpacity,
          transform: `translate(${wobbleX}px, ${wobbleY}px) scale(1.04)`,
          filter: 'saturate(0.35) contrast(0.95) brightness(0.6) sepia(0.18)',
        }}
      />
      {/* Hue cast — slight cool-warm shift */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(80,60,30,0.25) 0%, rgba(20,10,30,0.5) 100%)',
        }}
      />

      {/* Boot-up tracking pattern (first 18 frames) */}
      {frame < 18 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              `repeating-linear-gradient(0deg, #000 0 4px, rgba(255,255,255,0.4) 4px 6px, #000 6px 10px)`,
            opacity: interpolate(frame, [0, 8, 18], [1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
            mixBlendMode: 'difference',
          }}
        />
      )}

      {/* Lower-third title band */}
      <div
        style={{
          position: 'absolute',
          left: orientation === 'vertical' ? 30 : 60,
          right: orientation === 'vertical' ? 30 : 60,
          bottom: orientation === 'vertical' ? 180 : 130,
          background: 'rgba(255,228,160,0.92)',
          color: '#1a0e00',
          fontFamily: 'ui-monospace, "Courier New", monospace',
          fontSize: orientation === 'vertical' ? 34 : 44,
          fontWeight: 700,
          letterSpacing: '0.04em',
          padding: '14px 18px',
          textTransform: 'uppercase',
          opacity: interpolate(frame, [26, 36], [0, 1], { extrapolateRight: 'clamp' }),
          borderTop: '3px solid #1a0e00',
          borderBottom: '3px solid #1a0e00',
        }}
      >
        {visibleTitle}
        {charsShown < title.length && <span style={{ opacity: (frame % 30) < 15 ? 1 : 0 }}>_</span>}
      </div>
      {/* Stats line */}
      <div
        style={{
          position: 'absolute',
          left: orientation === 'vertical' ? 30 : 60,
          right: orientation === 'vertical' ? 30 : 60,
          bottom: orientation === 'vertical' ? 130 : 80,
          color: '#ffe4a0',
          fontFamily: 'ui-monospace, "Courier New", monospace',
          fontSize: orientation === 'vertical' ? 22 : 30,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textShadow: '2px 2px 0 #000',
          opacity: interpolate(frame, [74, 84], [0, 1], { extrapolateRight: 'clamp' }),
        }}
      >
        {visibleStats}
        {statsShown < stats.length && <span style={{ opacity: (frame % 30) < 15 ? 1 : 0 }}>_</span>}
      </div>
    </AbsoluteFill>
  );
};

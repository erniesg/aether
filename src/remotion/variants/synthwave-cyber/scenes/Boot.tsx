import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import type { RecapBundle } from '../../../EventRecap/data';

interface Props {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

const MAGENTA = '#ff0080';
const CYAN = '#00fff0';
const PURPLE = '#5b00a3';

/**
 * 0:00 — 0:04. CRT power-on. Single horizontal scan-line sweeps top
 * to bottom in first 20 frames, then "AI ENGINEER//SG.2026" appears
 * with chromatic-aberration ghosts (magenta + cyan offsets).
 */
export const Boot: React.FC<Props> = ({ bundle, orientation }) => {
  const frame = useCurrentFrame();

  // Power-on sweep
  const sweepProgress = interpolate(frame, [0, 24], [0, 1], { extrapolateRight: 'clamp' });
  const sweepY = interpolate(sweepProgress, [0, 1], [-30, 110], {
    extrapolateRight: 'clamp',
  });
  const screenOpacity = interpolate(frame, [12, 26], [0, 1], { extrapolateRight: 'clamp' });

  // Title appears after screen on
  const titleOpacity = interpolate(frame, [28, 40], [0, 1], { extrapolateRight: 'clamp' });
  // Sub-text appears later
  const subOpacity = interpolate(frame, [50, 70], [0, 1], { extrapolateRight: 'clamp' });

  // Chromatic aberration oscillates
  const cab = 3 + Math.sin(frame * 0.3) * 2;
  // Glitch line every 24 frames
  const glitchY = Math.floor((frame * 13) % 100);
  const showGlitch = frame % 24 < 3;

  return (
    <AbsoluteFill
      style={{
        background:
          'linear-gradient(180deg, #1a002e 0%, #350066 30%, #ff0080 100%)',
        overflow: 'hidden',
        opacity: screenOpacity,
      }}
    >
      {/* Grid floor — pseudo perspective */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '50%',
          background:
            `linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.7) 100%),
             repeating-linear-gradient(90deg, transparent 0 79px, ${CYAN} 79px 81px),
             repeating-linear-gradient(0deg, transparent 0 39px, ${CYAN} 39px 41px)`,
          transform: 'perspective(600px) rotateX(60deg) translateY(0)',
          transformOrigin: 'center top',
          opacity: 0.6,
        }}
      />

      {/* Sweep line */}
      {sweepProgress < 1 && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: `${sweepY}%`,
            height: 4,
            background: CYAN,
            boxShadow: `0 0 24px ${CYAN}, 0 0 60px ${CYAN}`,
            zIndex: 5,
          }}
        />
      )}

      {/* Glitch displacement bar */}
      {showGlitch && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: `${glitchY}%`,
            height: 18,
            background: MAGENTA,
            mixBlendMode: 'difference',
            zIndex: 7,
            transform: `translateX(${Math.random() * 14 - 7}px)`,
          }}
        />
      )}

      {/* Title with chromatic aberration */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          color: '#fff',
          fontFamily: 'ui-monospace, "Courier New", monospace',
          opacity: titleOpacity,
        }}
      >
        <ChromaText cab={cab} size={orientation === 'vertical' ? 78 : 110}>
          AI ENGINEER
        </ChromaText>
        <ChromaText cab={cab} size={orientation === 'vertical' ? 78 : 110}>
          // SG.2026
        </ChromaText>
        <div
          style={{
            marginTop: 12,
            background: 'rgba(0,0,0,0.5)',
            color: CYAN,
            padding: '6px 18px',
            border: `2px solid ${CYAN}`,
            fontSize: orientation === 'vertical' ? 18 : 24,
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
            opacity: subOpacity,
            boxShadow: `0 0 18px ${CYAN}66`,
          }}
        >
          {bundle.dates}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const ChromaText: React.FC<{ cab: number; size: number; children: React.ReactNode }> = ({
  cab,
  size,
  children,
}) => (
  <div
    style={{
      position: 'relative',
      fontSize: size,
      fontWeight: 700,
      letterSpacing: '-0.02em',
      lineHeight: 1,
    }}
  >
    <span style={{ position: 'absolute', left: -cab, top: 0, color: CYAN, opacity: 0.85, mixBlendMode: 'screen' }}>
      {children}
    </span>
    <span style={{ position: 'absolute', left: cab, top: 0, color: MAGENTA, opacity: 0.85, mixBlendMode: 'screen' }}>
      {children}
    </span>
    <span style={{ position: 'relative', color: '#fff' }}>{children}</span>
  </div>
);

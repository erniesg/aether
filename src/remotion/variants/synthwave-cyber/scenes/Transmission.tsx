import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import type { RecapBundle } from '../../../EventRecap/data';

interface Props {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

const MAGENTA = '#ff0080';
const CYAN = '#00fff0';

/**
 * 0:08 — 0:12. "TRANSMISSION ENDS" with URL ticker scrolling at bottom.
 * Big magenta sun, grid floor visible, scanlines persist.
 */
export const Transmission: React.FC<Props> = ({ bundle, orientation }) => {
  const frame = useCurrentFrame();

  const titleOpacity = interpolate(frame, [4, 24], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [4, 24], [22, 0], { extrapolateRight: 'clamp' });

  const subOpacity = interpolate(frame, [30, 50], [0, 1], { extrapolateRight: 'clamp' });

  // Ticker scrolls left
  const tickerX = interpolate(frame, [0, 120], [120, -120]);
  const cab = 4;

  return (
    <AbsoluteFill
      style={{
        background: 'linear-gradient(180deg, #1a002e 0%, #5b00a3 40%, #ff0080 100%)',
        overflow: 'hidden',
      }}
    >
      {/* Big sun */}
      <div
        style={{
          position: 'absolute',
          top: orientation === 'vertical' ? '30%' : '32%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: orientation === 'vertical' ? 700 : 700,
          height: orientation === 'vertical' ? 700 : 700,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, #ffea00 0%, #ff7a00 50%, #ff0080 100%)',
          boxShadow: `0 0 200px ${MAGENTA}`,
          opacity: 0.75,
        }}
      />
      {/* Horizontal slats over sun */}
      <div
        style={{
          position: 'absolute',
          top: orientation === 'vertical' ? '30%' : '32%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: orientation === 'vertical' ? 700 : 700,
          height: orientation === 'vertical' ? 700 : 700,
          background: `repeating-linear-gradient(0deg, transparent 0 20px, #1a002e 20px 30px)`,
          mixBlendMode: 'multiply',
        }}
      />

      {/* Grid floor */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '40%',
          background:
            `linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.7) 100%),
             repeating-linear-gradient(90deg, transparent 0 79px, ${CYAN} 79px 81px),
             repeating-linear-gradient(0deg, transparent 0 39px, ${CYAN} 39px 41px)`,
          transform: 'perspective(600px) rotateX(60deg)',
          transformOrigin: 'center top',
          opacity: 0.75,
        }}
      />

      {/* Title */}
      <div
        style={{
          position: 'absolute',
          top: orientation === 'vertical' ? '46%' : '50%',
          left: 0,
          right: 0,
          textAlign: 'center',
          fontFamily: 'ui-monospace, "Courier New", monospace',
          fontSize: orientation === 'vertical' ? 70 : 100,
          fontWeight: 700,
          letterSpacing: '0.04em',
          color: '#fff',
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          textShadow: `${cab}px 0 ${CYAN}, ${-cab}px 0 ${MAGENTA}, 0 0 24px rgba(255,255,255,0.6)`,
        }}
      >
        TRANSMISSION
        <br />
        <span style={{ color: CYAN }}>// ENDS</span>
      </div>

      {/* Sub */}
      <div
        style={{
          position: 'absolute',
          top: orientation === 'vertical' ? '66%' : '74%',
          left: 0,
          right: 0,
          textAlign: 'center',
          fontFamily: 'ui-monospace, "Courier New", monospace',
          fontSize: orientation === 'vertical' ? 22 : 30,
          fontWeight: 700,
          color: CYAN,
          letterSpacing: '0.18em',
          opacity: subOpacity,
          textShadow: `0 0 18px ${CYAN}`,
        }}
      >
        — SIGNAL ARCHIVED · 872 REFS —
      </div>

      {/* URL ticker */}
      <div
        style={{
          position: 'absolute',
          bottom: 60,
          left: 0,
          right: 0,
          overflow: 'hidden',
          height: orientation === 'vertical' ? 50 : 60,
          background: 'rgba(0,0,0,0.7)',
          borderTop: `2px solid ${MAGENTA}`,
          borderBottom: `2px solid ${MAGENTA}`,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: 0,
            transform: `translateY(-50%) translateX(${tickerX}%)`,
            whiteSpace: 'nowrap',
            fontFamily: 'ui-monospace, "Courier New", monospace',
            fontSize: orientation === 'vertical' ? 24 : 32,
            color: '#fff',
            fontWeight: 700,
            letterSpacing: '0.2em',
          }}
        >
          ▸ AETHER.BERLAYAR.AI/VIBES/{bundle.eventId.toUpperCase()} ▸ ▸ 872 REFS · 4M VIEWS · {bundle.themes.length} THEMES · {bundle.voices.length} VOICES · {bundle.sponsors.length} SPONSORS ▸ ▸
        </div>
      </div>
    </AbsoluteFill>
  );
};

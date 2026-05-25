import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { RecapBundle } from '../../../EventRecap/data';

interface Props {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

const fmt = (n: number) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(0) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
  return String(n);
};

/**
 * 0:04 — 0:08. "4M" punches in HUGE. Three star-bursts behind. Tiny
 * sub-stats orbit around.
 */
export const Punch: React.FC<Props> = ({ bundle, orientation }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Background — checker pattern + gradient overlay
  const sp = spring({ frame, fps, config: { damping: 6, stiffness: 220 } });

  // Star burst rotations
  const rot1 = frame * 4;
  const rot2 = -frame * 3;
  const rot3 = frame * 5;

  // Sub-stats orbit
  const subs = [
    { label: '872 REFS', color: '#ff36b8', orbitR: orientation === 'vertical' ? 200 : 320, delay: 0 },
    { label: '36.8K REACTIONS', color: '#fff700', orbitR: orientation === 'vertical' ? 260 : 380, delay: 8 },
    { label: '12 SPONSORS', color: '#00d6ff', orbitR: orientation === 'vertical' ? 320 : 440, delay: 16 },
    { label: '54 VIDEOS', color: '#00ff66', orbitR: orientation === 'vertical' ? 380 : 500, delay: 24 },
  ];

  return (
    <AbsoluteFill
      style={{
        background: `
          repeating-linear-gradient(45deg, #ff36b8 0 40px, #fff700 40px 80px),
          #000`,
        overflow: 'hidden',
      }}
    >
      {/* Soft gradient overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at center, rgba(255,255,255,0.4) 0%, rgba(170,0,255,0.6) 100%)',
        }}
      />

      {/* Star bursts */}
      <StarBurst x="20%" y="22%" size={orientation === 'vertical' ? 320 : 480} rot={rot1} color="#fff700" />
      <StarBurst x="80%" y="76%" size={orientation === 'vertical' ? 320 : 480} rot={rot2} color="#00d6ff" />
      <StarBurst x="78%" y="20%" size={orientation === 'vertical' ? 240 : 360} rot={rot3} color="#ff36b8" />
      <StarBurst x="18%" y="78%" size={orientation === 'vertical' ? 240 : 360} rot={-rot1} color="#00ff66" />

      {/* Center 4M */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Impact, Haettenschweiler, sans-serif',
          fontSize: orientation === 'vertical' ? 520 : 700,
          fontWeight: 900,
          color: '#fff',
          textShadow:
            '0 0 0 10px #000, 8px 8px 0 #000, -8px -8px 0 #000, 0 18px 0 rgba(0,0,0,0.6)',
          WebkitTextStroke: '6px #000',
          transform: `scale(${sp}) rotate(${interpolate(sp, [0, 1], [-25, 0])}deg)`,
          letterSpacing: '-0.05em',
        }}
      >
        {fmt(bundle.stats.knownViews)}
      </div>

      {/* "VIEWS!!!" sticker */}
      <div
        style={{
          position: 'absolute',
          bottom: orientation === 'vertical' ? '14%' : '12%',
          left: '50%',
          transform: `translateX(-50%) rotate(${-3 + Math.sin(frame * 0.2) * 4}deg) scale(${interpolate(frame, [22, 38], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })})`,
          background: '#00ff66',
          color: '#000',
          padding: '14px 32px',
          border: '8px solid #000',
          fontFamily: 'Impact, sans-serif',
          fontSize: orientation === 'vertical' ? 80 : 110,
          fontWeight: 900,
          boxShadow: '0 10px 0 #000',
          letterSpacing: '0.04em',
        }}
      >
        VIEWS!!!
      </div>

      {/* Orbit stats */}
      {subs.map((s, i) => {
        const ang = (frame * 1.5 + s.delay * 12) % 360;
        const x = 50 + Math.cos((ang * Math.PI) / 180) * (s.orbitR / 18);
        const y = 50 + Math.sin((ang * Math.PI) / 180) * (s.orbitR / 12);
        const appear = interpolate(frame, [s.delay, s.delay + 16], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${x}%`,
              top: `${y}%`,
              transform: `translate(-50%, -50%) rotate(${ang}deg) scale(${appear})`,
              background: s.color,
              border: '4px solid #000',
              padding: '6px 14px',
              fontFamily: 'Comic Sans MS, cursive',
              fontSize: orientation === 'vertical' ? 22 : 28,
              fontWeight: 900,
              color: '#000',
              boxShadow: '0 4px 0 #000',
              whiteSpace: 'nowrap',
            }}
          >
            {s.label}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const StarBurst: React.FC<{ x: string; y: string; size: number; rot: number; color: string }> = ({
  x,
  y,
  size,
  rot,
  color,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 100 100"
    style={{
      position: 'absolute',
      left: x,
      top: y,
      transform: `translate(-50%, -50%) rotate(${rot}deg)`,
    }}
  >
    {Array.from({ length: 12 }).map((_, i) => {
      const a = (i / 12) * Math.PI * 2;
      const x2 = 50 + Math.cos(a) * 45;
      const y2 = 50 + Math.sin(a) * 45;
      return (
        <line key={i} x1="50" y1="50" x2={x2} y2={y2} stroke={color} strokeWidth="6" strokeLinecap="round" />
      );
    })}
    <circle cx="50" cy="50" r="14" fill={color} />
  </svg>
);

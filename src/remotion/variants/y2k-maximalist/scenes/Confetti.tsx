import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { RecapBundle } from '../../../EventRecap/data';

interface Props {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

const COLORS = ['#ff36b8', '#00d6ff', '#fff700', '#ff9100', '#aa00ff', '#00ff66'];

const fontFor = (i: number) => {
  const fonts = [
    `'Comic Sans MS', cursive`,
    `Impact, Haettenschweiler, sans-serif`,
    `'Brush Script MT', cursive`,
    `Verdana, Geneva, sans-serif`,
    `'Courier New', monospace`,
  ];
  return fonts[i % fonts.length];
};

/**
 * 0:00 — 0:04. Pure chaos burst. Gradient swirl background, 60+
 * particle stars, "AIE 26!!!" appears letter-by-letter each in a
 * different font + color. Star stickers explode out.
 */
export const Confetti: React.FC<Props> = ({ bundle, orientation }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Background swirling gradient
  const angle = (frame * 3) % 360;

  // 80 particles
  const particles = Array.from({ length: 80 }).map((_, i) => {
    const seed = i / 80;
    const angleSeed = seed * Math.PI * 2;
    const baseX = 50 + Math.cos(angleSeed) * 8;
    const baseY = 50 + Math.sin(angleSeed) * 8;
    const targetX = 50 + Math.cos(angleSeed) * 60;
    const targetY = 50 + Math.sin(angleSeed) * 90;
    const delay = (i % 20) * 0.6;
    const prog = interpolate(frame, [delay, delay + 30], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: (t) => 1 - Math.pow(1 - t, 3),
    });
    const x = baseX + (targetX - baseX) * prog;
    const y = baseY + (targetY - baseY) * prog;
    const rot = frame * 6 + i * 30;
    const color = COLORS[i % COLORS.length];
    return { i, x, y, rot, color, size: 18 + (i % 4) * 6, opacity: 1 - prog * 0.4 };
  });

  // Title letters: "AIE 26!!"
  const text = 'AIE 26!!';
  const letters = text.split('');

  return (
    <AbsoluteFill
      style={{
        background: `conic-gradient(from ${angle}deg at 50% 50%, #ff36b8, #00d6ff, #fff700, #ff9100, #ff36b8)`,
        overflow: 'hidden',
      }}
    >
      {/* Concentric ring */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: orientation === 'vertical' ? 900 : 1100,
          height: orientation === 'vertical' ? 900 : 1100,
          borderRadius: '50%',
          transform: 'translate(-50%, -50%)',
          background:
            'radial-gradient(circle, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 60%)',
          opacity: 0.6,
        }}
      />

      {/* Stars */}
      {particles.map((p) => (
        <div
          key={p.i}
          style={{
            position: 'absolute',
            left: `${p.x}%`,
            top: `${p.y}%`,
            transform: `translate(-50%, -50%) rotate(${p.rot}deg)`,
            fontSize: p.size,
            opacity: p.opacity,
            color: p.color,
            textShadow: '0 0 6px rgba(0,0,0,0.4)',
            fontWeight: 900,
          }}
        >
          {p.i % 4 === 0 ? '★' : p.i % 4 === 1 ? '✦' : p.i % 4 === 2 ? '✺' : '✸'}
        </div>
      ))}

      {/* Title */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          flexWrap: 'wrap',
          padding: 40,
        }}
      >
        {letters.map((ch, i) => {
          const sp = spring({ frame: frame - 6 - i * 3, fps, config: { damping: 7, stiffness: 220 } });
          const bounceY = Math.sin((frame - i * 3) * 0.2) * 18;
          if (sp <= 0) return null;
          return (
            <span
              key={i}
              style={{
                display: 'inline-block',
                fontFamily: fontFor(i),
                fontWeight: 900,
                fontSize: orientation === 'vertical' ? 200 : 280,
                color: COLORS[i % COLORS.length],
                textShadow: '6px 6px 0 #000, -3px -3px 0 #fff, 0 12px 0 rgba(0,0,0,0.4)',
                transform: `scale(${sp}) translateY(${bounceY}px) rotate(${(i % 2 ? 1 : -1) * 5}deg)`,
                letterSpacing: '-0.04em',
                lineHeight: 1,
              }}
            >
              {ch === ' ' ? ' ' : ch}
            </span>
          );
        })}
      </div>

      {/* "BRAND NEW!" sticker */}
      <div
        style={{
          position: 'absolute',
          top: orientation === 'vertical' ? '8%' : '8%',
          right: orientation === 'vertical' ? '8%' : '12%',
          background: '#fff700',
          padding: '12px 18px',
          border: '6px solid #000',
          fontFamily: 'Impact, sans-serif',
          fontSize: orientation === 'vertical' ? 32 : 44,
          fontWeight: 900,
          transform: `rotate(${15 + Math.sin(frame * 0.2) * 4}deg) scale(${interpolate(frame, [12, 24], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })})`,
          letterSpacing: '0.04em',
          color: '#000',
          boxShadow: '0 0 0 4px #ff36b8, 0 6px 0 #000',
        }}
      >
        SO HOT!! 🔥
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: orientation === 'vertical' ? '8%' : '8%',
          left: orientation === 'vertical' ? '8%' : '12%',
          background: '#00d6ff',
          padding: '12px 18px',
          border: '6px solid #000',
          fontFamily: 'Comic Sans MS, cursive',
          fontSize: orientation === 'vertical' ? 30 : 40,
          fontWeight: 900,
          transform: `rotate(${-12 + Math.cos(frame * 0.2) * 4}deg) scale(${interpolate(frame, [20, 32], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })})`,
          color: '#000',
          boxShadow: '0 0 0 4px #fff700, 0 6px 0 #000',
        }}
      >
        ★ SINGAPORE ★
      </div>
    </AbsoluteFill>
  );
};

import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { RecapBundle } from '../../../EventRecap/data';
import { aie2026MediaPool } from '../../../EventRecap/data';
import { faceAwareObjectPosition } from '../../../EventRecap/crop';

interface Props {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

const COLORS = ['#ff36b8', '#00d6ff', '#fff700', '#ff9100', '#aa00ff', '#00ff66'];

/**
 * 0:08 — 0:12. Six photos spin in like a sticker collage, holds, then
 * "VISIT NOW!!!" sticker punches in.
 */
export const Spin: React.FC<Props> = ({ bundle, orientation }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const images = aie2026MediaPool.filter((m) => m.type === 'image').slice(0, 6);

  return (
    <AbsoluteFill
      style={{
        background:
          `repeating-linear-gradient(90deg, #fff700 0 30px, #ff36b8 30px 60px, #00d6ff 60px 90px),
           #000`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle at 50% 40%, rgba(255,255,255,0.5) 0%, rgba(170,0,255,0.7) 100%)',
        }}
      />

      {/* Spinning sticker collage */}
      {images.map((p, i) => {
        const localFrame = frame - i * 6;
        const sp = spring({ frame: localFrame, fps, config: { damping: 7, stiffness: 200 } });
        const rot = interpolate(sp, [0, 1], [-360, (i % 2 === 0 ? -8 : 8)]);
        const positions = [
          { x: 25, y: 28 },
          { x: 70, y: 22 },
          { x: 22, y: 56 },
          { x: 75, y: 60 },
          { x: 30, y: 80 },
          { x: 72, y: 84 },
        ];
        const pos = positions[i];
        const w = orientation === 'vertical' ? 240 : 320;
        const h = orientation === 'vertical' ? 240 : 240;
        return (
          <div
            key={p.url}
            style={{
              position: 'absolute',
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              transform: `translate(-50%, -50%) rotate(${rot}deg) scale(${Math.max(0, sp)})`,
              background: '#fff',
              padding: 10,
              paddingBottom: 30,
              border: `6px solid ${COLORS[i % COLORS.length]}`,
              boxShadow: `0 12px 0 #000, 0 0 0 4px #000`,
            }}
          >
            <Img
              src={p.url}
              style={{
                display: 'block',
                width: w,
                height: h,
                objectFit: 'cover',
                objectPosition: faceAwareObjectPosition(p, w / h, 0),
                filter: 'saturate(1.4) contrast(1.05)',
              }}
            />
          </div>
        );
      })}

      {/* "VISIT NOW!" centerpiece */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: `translate(-50%, -50%) scale(${spring({ frame: frame - 50, fps, config: { damping: 6, stiffness: 220 } })}) rotate(${-4 + Math.sin(frame * 0.2) * 5}deg)`,
        }}
      >
        <div
          style={{
            background: '#fff700',
            color: '#000',
            border: '10px solid #000',
            padding: orientation === 'vertical' ? '18px 30px' : '24px 44px',
            fontFamily: 'Impact, Haettenschweiler, sans-serif',
            fontSize: orientation === 'vertical' ? 90 : 130,
            fontWeight: 900,
            letterSpacing: '-0.02em',
            boxShadow: '0 14px 0 #000, 0 0 0 4px #ff36b8',
            textAlign: 'center',
            lineHeight: 0.95,
          }}
        >
          VISIT
          <br />
          <span style={{ color: '#ff36b8', WebkitTextStroke: '3px #000' }}>NOW!!!</span>
        </div>
        <div
          style={{
            marginTop: 16,
            background: '#000',
            color: '#fff700',
            border: '6px solid #fff700',
            padding: '8px 14px',
            fontFamily: 'Courier New, monospace',
            fontSize: orientation === 'vertical' ? 22 : 28,
            fontWeight: 900,
            letterSpacing: '0.04em',
            textAlign: 'center',
            transform: 'rotate(2deg)',
          }}
        >
          aether.berlayar.ai/vibes/{bundle.eventId}
        </div>
      </div>

      {/* Random sparkles */}
      {Array.from({ length: 40 }).map((_, i) => {
        const seed = i / 40;
        const x = (seed * 763) % 100;
        const y = ((seed * 1234) + frame * 0.4) % 100;
        const size = 14 + ((i * 7) % 18);
        return (
          <span
            key={i}
            style={{
              position: 'absolute',
              left: `${x}%`,
              top: `${y}%`,
              fontSize: size,
              color: COLORS[i % COLORS.length],
              opacity: 0.7 + Math.sin((frame + i * 7) * 0.2) * 0.3,
              textShadow: '0 0 4px rgba(0,0,0,0.5)',
              transform: `rotate(${frame * 3 + i * 30}deg)`,
              pointerEvents: 'none',
            }}
          >
            ✦
          </span>
        );
      })}
    </AbsoluteFill>
  );
};

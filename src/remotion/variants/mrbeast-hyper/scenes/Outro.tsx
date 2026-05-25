import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { RecapBundle } from '../../../EventRecap/data';
import { aie2026MediaPool, focalObjectPosition } from '../../../EventRecap/data';

interface Props {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

const HYPER_YELLOW = '#FFE400';

/**
 * 0:08 — 0:12 outro. "TAP TO WATCH FULL RECAP →" with finger pointer.
 * Hero moment photo in a tilted sticker frame behind.
 */
export const Outro: React.FC<Props> = ({ bundle, orientation }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Use Vivian portrait as hero photo
  const hero = aie2026MediaPool[10];
  const stickerSpring = spring({ frame, fps, config: { damping: 9, stiffness: 200 } });
  const ctaSpring = spring({ frame: frame - 16, fps, config: { damping: 9, stiffness: 200 } });
  // Finger bobs
  const fingerY = Math.sin(frame * 0.25) * 14;

  return (
    <AbsoluteFill style={{ background: HYPER_YELLOW }}>
      {/* Polaroid sticker for hero photo */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: orientation === 'vertical' ? '12%' : '14%',
          transform: `translateX(-50%) scale(${stickerSpring}) rotate(-4deg)`,
          background: '#fff',
          padding: 12,
          paddingBottom: 36,
          border: '6px solid #000',
          boxShadow: '0 16px 0 #000',
        }}
      >
        <div style={{ width: orientation === 'vertical' ? 560 : 720, height: orientation === 'vertical' ? 560 : 480, overflow: 'hidden' }}>
          <Img
            src={hero.url}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: focalObjectPosition(hero),
              filter: 'saturate(1.15) contrast(1.1)',
            }}
          />
        </div>
        <div
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            background: '#FF2D2D',
            color: '#fff',
            padding: '8px 14px',
            fontFamily: 'Arial Black, Impact, Helvetica, sans-serif',
            fontWeight: 900,
            fontSize: 28,
            border: '4px solid #000',
            transform: 'rotate(8deg)',
            textShadow: '2px 2px 0 #000',
          }}
        >
          872 REFS!!
        </div>
      </div>

      {/* CTA pill at bottom */}
      <div
        style={{
          position: 'absolute',
          bottom: orientation === 'vertical' ? 200 : 130,
          left: 0,
          right: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 18,
          transform: `scale(${ctaSpring})`,
          opacity: ctaSpring,
        }}
      >
        <div
          style={{
            background: '#000',
            color: HYPER_YELLOW,
            padding: orientation === 'vertical' ? '24px 36px' : '24px 50px',
            fontFamily: 'Arial Black, Impact, Helvetica, sans-serif',
            fontWeight: 900,
            fontSize: orientation === 'vertical' ? 58 : 76,
            borderRadius: 99,
            letterSpacing: '-0.02em',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            textTransform: 'uppercase',
          }}
        >
          FULL RECAP <span style={{ fontSize: '1.2em' }}>→</span>
        </div>
        <div
          style={{
            fontFamily: 'Arial Black, Impact, Helvetica, sans-serif',
            fontSize: orientation === 'vertical' ? 30 : 38,
            color: '#000',
            fontWeight: 900,
            background: '#fff',
            padding: '8px 18px',
            border: '5px solid #000',
            boxShadow: '0 6px 0 #000',
            transform: 'rotate(-2deg)',
          }}
        >
          aether.berlayar.ai/vibes/{bundle.eventId}
        </div>
      </div>

      {/* Bobbing finger pointing at CTA */}
      <div
        style={{
          position: 'absolute',
          bottom: orientation === 'vertical' ? 140 : 80,
          right: orientation === 'vertical' ? 80 : 200,
          fontSize: orientation === 'vertical' ? 130 : 150,
          transform: `translateY(${fingerY}px) rotate(-22deg)`,
          opacity: interpolate(frame, [30, 50], [0, 1], { extrapolateRight: 'clamp' }),
        }}
      >
        👇
      </div>
    </AbsoluteFill>
  );
};

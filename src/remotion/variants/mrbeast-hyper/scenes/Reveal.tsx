import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { RecapBundle } from '../../../EventRecap/data';
import { aie2026MediaPool, focalObjectPosition } from '../../../EventRecap/data';

interface Props {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

const HYPER_YELLOW = '#FFE400';
const HYPER_CYAN = '#00E0FF';
const HYPER_BLACK = '#0d0d0d';

/**
 * 0:04 — 0:08 reveal. Top 3 themes as massive bouncing pills with photo
 * crops behind. Each pill spring-bounces in 24 frames apart.
 */
export const Reveal: React.FC<Props> = ({ bundle, orientation }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const top3 = bundle.themes.slice(0, 3);
  const images = aie2026MediaPool.filter((m) => m.type === 'image');

  // Background flashes between two photos with cyan flash on beat
  const bgIdx1 = Math.floor(frame / 6) % images.length;
  const bg = images[bgIdx1];

  const colors = [HYPER_YELLOW, '#FF2D2D', HYPER_CYAN];

  return (
    <AbsoluteFill style={{ background: HYPER_BLACK }}>
      <Img
        src={bg.url}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: focalObjectPosition(bg),
          filter: 'saturate(0.6) contrast(1.4) brightness(0.4)',
        }}
      />
      {/* yellow gradient mask */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(255,228,0,0.18) 0%, rgba(0,0,0,0.65) 100%)',
        }}
      />

      {/* Headline */}
      <div
        style={{
          position: 'absolute',
          top: orientation === 'vertical' ? 80 : 60,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontFamily: 'Arial Black, Impact, Helvetica, sans-serif',
          fontWeight: 900,
          fontSize: orientation === 'vertical' ? 70 : 88,
          color: '#fff',
          textShadow: '5px 5px 0 #000',
          letterSpacing: '-0.02em',
          lineHeight: 0.95,
          transform: `scale(${spring({ frame, fps, config: { damping: 9, stiffness: 180 } })})`,
        }}
      >
        WHAT THE INTERNET<br />ACTUALLY TALKED ABOUT 👇
      </div>

      {/* Three pills */}
      <div
        style={{
          position: 'absolute',
          left: 40,
          right: 40,
          top: orientation === 'vertical' ? '32%' : '36%',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
          fontFamily: 'Arial Black, Impact, Helvetica, sans-serif',
        }}
      >
        {top3.map((t, i) => {
          const localFrame = frame - 14 - i * 18;
          const sp = spring({ frame: localFrame, fps, config: { damping: 9, stiffness: 220 } });
          if (sp <= 0) return null;
          const rotate = (i % 2 === 0 ? -1 : 1) * (3 - i);
          // small wiggle
          const wiggle = Math.sin((frame - i * 8) * 0.18) * 1.2;
          return (
            <div
              key={t.storyId}
              style={{
                background: colors[i],
                color: HYPER_BLACK,
                padding: orientation === 'vertical' ? '22px 28px' : '22px 36px',
                fontSize: orientation === 'vertical' ? 44 : 56,
                fontWeight: 900,
                border: '8px solid #000',
                borderRadius: 99,
                boxShadow: '0 12px 0 #000',
                transform: `scale(${sp}) rotate(${rotate + wiggle}deg)`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 16,
                letterSpacing: '-0.02em',
              }}
            >
              <span
                style={{
                  background: '#000',
                  color: colors[i],
                  width: orientation === 'vertical' ? 64 : 80,
                  height: orientation === 'vertical' ? 64 : 80,
                  borderRadius: 99,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: orientation === 'vertical' ? 38 : 50,
                }}
              >
                {i + 1}
              </span>
              <span style={{ flex: 1, textAlign: 'left', textTransform: 'uppercase' }}>
                {abbreviate(t.label)}
              </span>
              <span style={{ fontSize: orientation === 'vertical' ? 36 : 44, opacity: 0.7 }}>
                {t.postCount}
              </span>
            </div>
          );
        })}
      </div>

      {/* "+ 5 MORE THEMES" sticker */}
      <div
        style={{
          position: 'absolute',
          bottom: orientation === 'vertical' ? 160 : 80,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          opacity: interpolate(frame, [80, 100], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        }}
      >
        <div
          style={{
            background: '#fff',
            color: HYPER_BLACK,
            padding: '10px 24px',
            fontFamily: 'Arial Black, Impact, Helvetica, sans-serif',
            fontWeight: 900,
            fontSize: orientation === 'vertical' ? 32 : 40,
            border: '5px solid #000',
            boxShadow: '0 8px 0 #000',
            transform: 'rotate(-3deg)',
            textTransform: 'uppercase',
            letterSpacing: '0.02em',
          }}
        >
          + 5 more 🤯
        </div>
      </div>
    </AbsoluteFill>
  );
};

function abbreviate(s: string) {
  // Shorten for big bold pills
  if (s.length > 26) return s.slice(0, 24).toUpperCase() + '…';
  return s.toUpperCase();
}

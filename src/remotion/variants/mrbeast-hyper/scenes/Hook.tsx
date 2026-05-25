import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame } from 'remotion';
import type { RecapBundle } from '../../../EventRecap/data';
import { aie2026MediaPool, focalObjectPosition } from '../../../EventRecap/data';

interface Props {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

const fmt = (n: number) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(0) + 'M';
  return String(n);
};

const HYPER_YELLOW = '#FFE400';
const HYPER_RED = '#FF2D2D';
const HYPER_BLACK = '#0d0d0d';

/**
 * 0:00 — 0:04 hook. Pure WTF energy. Flash montage cycling 1 image
 * every 4 frames behind. Foreground: "BRO 🇸🇬" first, then "AIE 26"
 * slams in, then "4M VIEWS??" with shake.
 */
export const Hook: React.FC<Props> = ({ bundle, orientation }) => {
  const frame = useCurrentFrame();
  const images = aie2026MediaPool.filter((m) => m.type === 'image');

  // Flash montage: 1 image every 4 frames
  const idx = Math.floor(frame / 4) % images.length;
  const current = images[idx];

  // Beat-locked screen-shake on number
  const shake = frame >= 40 ? Math.sin(frame * 0.9) * 4 : 0;

  // Text appears in beats
  const broShow = frame >= 0 && frame < 28;
  const aieShow = frame >= 28 && frame < 56;
  const numShow = frame >= 56;

  // Scale punch
  const broScale = interpolate(frame, [0, 6, 22, 28], [0.7, 1.2, 1.05, 0.9], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const aieScale = interpolate(frame, [28, 34, 50, 56], [0.7, 1.2, 1.05, 0.9], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const numScale = interpolate(frame, [56, 64], [0.5, 1.05], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ background: HYPER_BLACK }}>
      <Img
        src={current.url}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: focalObjectPosition(current),
          filter: 'saturate(1.15) contrast(1.1)',
        }}
      />
      {/* Bright yellow overlay flash on beat 1 + 8 */}
      {(frame === 0 || frame === 28 || frame === 56) && (
        <div style={{ position: 'absolute', inset: 0, background: HYPER_YELLOW, opacity: 0.4 }} />
      )}

      {/* "BRO 🇸🇬" */}
      {broShow && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'Arial Black, Impact, Helvetica, sans-serif',
            fontWeight: 900,
            fontSize: orientation === 'vertical' ? 260 : 320,
            color: HYPER_YELLOW,
            textShadow: '6px 6px 0 #000, -6px -6px 0 #000, 6px -6px 0 #000, -6px 6px 0 #000, 0 12px 0 #000',
            transform: `scale(${broScale}) rotate(-3deg)`,
            letterSpacing: '-0.04em',
            textAlign: 'center',
            lineHeight: 0.9,
          }}
        >
          BRO 🇸🇬
        </div>
      )}

      {/* "AIE 26" stickers */}
      {aieShow && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            fontFamily: 'Arial Black, Impact, Helvetica, sans-serif',
            fontWeight: 900,
          }}
        >
          <div
            style={{
              background: HYPER_YELLOW,
              color: HYPER_BLACK,
              padding: '18px 48px',
              fontSize: orientation === 'vertical' ? 180 : 220,
              transform: `scale(${aieScale}) rotate(-4deg)`,
              border: '8px solid #000',
              boxShadow: '0 12px 0 #000',
              letterSpacing: '-0.03em',
            }}
          >
            AIE&nbsp;26
          </div>
          <div
            style={{
              background: HYPER_RED,
              color: '#fff',
              padding: '10px 22px',
              fontSize: orientation === 'vertical' ? 42 : 56,
              transform: `rotate(2deg) translateY(${interpolate(frame, [32, 44], [40, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}px)`,
              border: '5px solid #000',
              boxShadow: '0 8px 0 #000',
              textShadow: '3px 3px 0 #000',
              letterSpacing: '0.02em',
            }}
          >
            ACTUALLY WILD 🔥
          </div>
        </div>
      )}

      {/* 4M VIEWS shake */}
      {numShow && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            fontFamily: 'Arial Black, Impact, Helvetica, sans-serif',
            fontWeight: 900,
            transform: `translateX(${shake}px)`,
          }}
        >
          <div
            style={{
              fontSize: orientation === 'vertical' ? 50 : 64,
              color: '#fff',
              textShadow: '4px 4px 0 #000',
              letterSpacing: '0.06em',
            }}
          >
            WAIT WHAT
          </div>
          <div
            style={{
              fontSize: orientation === 'vertical' ? 380 : 440,
              color: HYPER_YELLOW,
              textShadow: '8px 8px 0 #000, -8px -8px 0 #000, 0 14px 0 #000',
              letterSpacing: '-0.05em',
              lineHeight: 0.9,
              transform: `scale(${numScale})`,
            }}
          >
            {fmt(bundle.stats.knownViews)}
          </div>
          <div
            style={{
              background: '#fff',
              color: HYPER_BLACK,
              padding: '8px 26px',
              fontSize: orientation === 'vertical' ? 56 : 72,
              border: '6px solid #000',
              boxShadow: '0 8px 0 #000',
              letterSpacing: '0.02em',
              transform: 'rotate(-2deg)',
            }}
          >
            VIEWS ??!
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};

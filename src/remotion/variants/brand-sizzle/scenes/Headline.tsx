import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { RecapBundle } from '../../../EventRecap/data';
import { aie2026MediaPool } from '../../../EventRecap/data';
import { faceAwareKenBurns } from '../../../EventRecap/crop';

interface Props {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);

const fmt = (n: number) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(0) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
  return String(n);
};

/**
 * 0:04 — 0:08. Big headline stat over slow-pan b-roll (Vivian keynote
 * photo). Numbers fade in with smooth ease. Parallax tracking shift.
 */
export const Headline: React.FC<Props> = ({ bundle, orientation }) => {
  const frame = useCurrentFrame();
  const { width: compW, height: compH } = useVideoConfig();

  // Slow tracking pan — face-aware drift across Vivian's keynote photo. If
  // his face fits at the container aspect, we get a static zoom anchored on
  // him; if the audience seats overflow, we pan across the seat row.
  const photo = aie2026MediaPool[10];
  const kb = faceAwareKenBurns(photo, compW / compH);
  const t = interpolate(frame, [0, 120], [0, 1]);
  const px = interpolate(t, [0, 1], [kb.from.x, kb.to.x]) * 100;
  const py = interpolate(t, [0, 1], [kb.from.y, kb.to.y]) * 100;
  const scale = interpolate(t, [0, 1], [1.08, 1.14]);

  // Stat reveal
  const statOpacity = interpolate(frame, [10, 32], [0, 1], {
    extrapolateRight: 'clamp',
    easing: easeOutQuart,
  });
  const statY = interpolate(frame, [10, 32], [16, 0], {
    extrapolateRight: 'clamp',
    easing: easeOutQuart,
  });

  // Sub-stat reveal
  const subOpacity = interpolate(frame, [44, 64], [0, 1], {
    extrapolateRight: 'clamp',
    easing: easeOutQuart,
  });

  // Caption appears at bottom
  const captionOpacity = interpolate(frame, [70, 90], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: '#1a0e08' }}>
      <Img
        src={photo.url}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: `${px}% ${py}%`,
          transformOrigin: `${px}% ${py}%`,
          transform: `scale(${scale})`,
          filter: 'saturate(1.1) contrast(1.05) brightness(0.55) hue-rotate(-8deg)',
        }}
      />
      {/* Warm gradient + scrim */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(255,120,40,0.16) 0%, rgba(20,8,2,0.4) 30%, rgba(20,8,2,0.7) 100%)',
        }}
      />

      {/* Left-aligned big stat */}
      <div
        style={{
          position: 'absolute',
          left: orientation === 'vertical' ? 50 : 100,
          right: orientation === 'vertical' ? 50 : '50%',
          bottom: orientation === 'vertical' ? '38%' : '32%',
          fontFamily: 'Inter, sans-serif',
          color: '#fff',
        }}
      >
        <div
          style={{
            fontSize: orientation === 'vertical' ? 16 : 22,
            fontWeight: 500,
            letterSpacing: '0.28em',
            color: '#ff9a4a',
            textTransform: 'uppercase',
            opacity: interpolate(frame, [4, 18], [0, 1], { extrapolateRight: 'clamp' }),
          }}
        >
          What travelled
        </div>
        <div
          style={{
            marginTop: 16,
            fontSize: orientation === 'vertical' ? 220 : 280,
            fontWeight: 700,
            letterSpacing: '-0.04em',
            lineHeight: 0.9,
            opacity: statOpacity,
            transform: `translateY(${statY}px)`,
            color: '#fff',
            textShadow: '0 4px 40px rgba(0,0,0,0.6)',
          }}
        >
          {fmt(bundle.stats.knownViews)}
        </div>
        <div
          style={{
            marginTop: 20,
            display: 'flex',
            gap: 32,
            opacity: subOpacity,
            color: '#ffcfa8',
            fontSize: orientation === 'vertical' ? 26 : 36,
            fontWeight: 500,
            letterSpacing: '-0.015em',
          }}
        >
          <span>
            <span style={{ color: '#fff', fontWeight: 700 }}>{bundle.stats.refs}</span> refs
          </span>
          <span>
            <span style={{ color: '#fff', fontWeight: 700 }}>{bundle.stats.mediaAssets}</span> assets
          </span>
          <span>
            <span style={{ color: '#fff', fontWeight: 700 }}>{bundle.themes.length}</span> themes
          </span>
        </div>
      </div>

      {/* Caption bottom */}
      <div
        style={{
          position: 'absolute',
          left: orientation === 'vertical' ? 50 : 100,
          right: orientation === 'vertical' ? 50 : 100,
          bottom: orientation === 'vertical' ? 120 : 90,
          fontFamily: 'Inter, sans-serif',
          color: '#ff9a4a',
          fontSize: orientation === 'vertical' ? 24 : 32,
          fontWeight: 500,
          letterSpacing: '-0.005em',
          opacity: captionOpacity,
          maxWidth: orientation === 'vertical' ? 900 : 1300,
          lineHeight: 1.35,
        }}
      >
        <span style={{ color: '#fff', fontWeight: 600 }}>
          When the room shows up — the internet does too.
        </span>
      </div>
    </AbsoluteFill>
  );
};

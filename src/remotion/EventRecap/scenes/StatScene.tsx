import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { theme } from '../theme';
import type { RecapBundle } from '../data';

interface Props {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

const fmt = (n: number) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1) + 'K';
  return String(Math.round(n));
};

/**
 * Scene 1 · 7s · big known-views counter from 0 → 4M, with a platform
 * breakdown bar that fills underneath, plus a row of secondary stats
 * (refs · reactions · media · videos) that fade in.
 */
export const StatScene: React.FC<Props> = ({ bundle, orientation }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const counterEnd = bundle.stats.knownViews;
  const t = interpolate(frame, [0, 60], [0, 1], { extrapolateRight: 'clamp', easing: easeOutCubic });
  const current = counterEnd * t;
  const barProgress = interpolate(frame, [40, 90], [0, 1], { extrapolateRight: 'clamp' });
  const secondaryOpacity = interpolate(frame, [70, 100], [0, 1], { extrapolateRight: 'clamp' });
  const exit = interpolate(frame, [durationInFrames - 18, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const vert = orientation === 'vertical';
  return (
    <AbsoluteFill
      style={{
        background: 'linear-gradient(180deg,#0a0a0a 0%,#000 100%)',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 28,
        padding: 64,
        opacity: exit,
        fontFamily: theme.sans,
      }}
    >
      <div
        style={{
          fontFamily: theme.serif,
          fontSize: vert ? 220 : 280,
          lineHeight: 0.9,
          color: theme.accent,
          letterSpacing: '-0.03em',
        }}
      >
        {fmt(current)}
      </div>
      <div
        style={{
          fontFamily: theme.mono,
          fontSize: vert ? 22 : 28,
          textTransform: 'uppercase',
          letterSpacing: '0.32em',
        }}
      >
        known views
      </div>

      <div style={{ width: vert ? '80%' : '60%', maxWidth: 720 }}>
        <div style={{ display: 'flex', gap: 4, height: 10, borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ width: `${barProgress * 67}%`, background: theme.accent }} />
          <div style={{ width: `${barProgress * 33}%`, background: '#fff' }} />
        </div>
        <div
          style={{
            marginTop: 14,
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: theme.mono,
            fontSize: 14,
            color: theme.muted,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            opacity: barProgress,
          }}
        >
          <span>X · 2.7M</span>
          <span>YouTube · 1.3M</span>
        </div>
      </div>

      <div
        style={{
          marginTop: 18,
          display: 'flex',
          gap: vert ? 30 : 50,
          opacity: secondaryOpacity,
          fontFamily: theme.mono,
          fontSize: vert ? 18 : 22,
          color: '#fff',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}
      >
        <span>
          <b style={{ color: theme.accent, fontWeight: 600 }}>{bundle.stats.refs}</b> refs
        </span>
        <span>
          <b style={{ color: theme.accent, fontWeight: 600 }}>{fmt(bundle.stats.publicReactions)}</b> reactions
        </span>
        <span>
          <b style={{ color: theme.accent, fontWeight: 600 }}>{bundle.stats.mediaAssets}</b> media
        </span>
        <span>
          <b style={{ color: theme.accent, fontWeight: 600 }}>{bundle.stats.playableVideos}</b> videos
        </span>
      </div>
    </AbsoluteFill>
  );
};

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

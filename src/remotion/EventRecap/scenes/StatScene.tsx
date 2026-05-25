import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { theme } from '../theme';
import type { RecapBundle } from '../data';
import { aie2026MediaPool } from '../data';
import { MediaBackdrop } from '../components/MediaBackdrop';

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
 * Scene · 6s · the BIG number — but layered over rapid b-roll cuts so
 * the frame is never static. Photos cycle behind every 0.5s · ken-burns
 * + dark tint keeps the foreground text legible. Number ticks up with
 * a slight scale punch on completion.
 */
export const StatScene: React.FC<Props> = ({ bundle, orientation }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const counterEnd = bundle.stats.knownViews;

  // counter eases in over first 40 frames, then settles
  const tNum = interpolate(frame, [0, 36], [0, 1], { extrapolateRight: 'clamp', easing: easeOutCubic });
  const current = counterEnd * tNum;
  // tiny scale-punch when counter completes
  const punch = interpolate(frame, [34, 42, 50], [1, 1.06, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const lblOpacity = interpolate(frame, [30, 50], [0, 1], { extrapolateRight: 'clamp' });
  const barProgress = interpolate(frame, [40, 80], [0, 1], { extrapolateRight: 'clamp' });
  const secondaryOpacity = interpolate(frame, [70, 100], [0, 1], { extrapolateRight: 'clamp' });
  const exit = interpolate(frame, [durationInFrames - 14, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const vert = orientation === 'vertical';

  return (
    <AbsoluteFill style={{ background: '#000', opacity: exit }}>
      {/* b-roll cycling behind everything */}
      <MediaBackdrop pool={aie2026MediaPool} holdFrames={18} tintOpacity={0.7} kenBurns={0.14} startIndex={3} />

      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          gap: vert ? 18 : 24,
          padding: 64,
          fontFamily: theme.sans,
        }}
      >
        <div
          style={{
            fontFamily: theme.mono,
            fontSize: vert ? 16 : 22,
            textTransform: 'uppercase',
            letterSpacing: '0.32em',
            color: theme.accent,
            opacity: lblOpacity,
          }}
        >
          known views · cross-platform
        </div>

        <div
          style={{
            fontFamily: theme.serif,
            fontSize: vert ? 320 : 420,
            lineHeight: 0.9,
            color: '#fff',
            letterSpacing: '-0.04em',
            transform: `scale(${punch})`,
            textShadow: '0 12px 40px rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'baseline',
          }}
        >
          <span>{fmt(current)}</span>
        </div>

        {/* platform split — bold X(orange/black) + YouTube(red) + LinkedIn(blue) */}
        <div
          style={{
            display: 'flex',
            gap: vert ? 18 : 32,
            opacity: barProgress,
            fontFamily: theme.mono,
            fontSize: vert ? 22 : 32,
          }}
        >
          <PlatformPill label="X" value="2.7M" color="#fff" bg="#000" border="#fff" progress={barProgress} delay={0} />
          <PlatformPill label="YOUTUBE" value="1.3M" color="#fff" bg="#cc0000" border="#cc0000" progress={barProgress} delay={6} />
          <PlatformPill label="LINKEDIN" value="—" color="#fff" bg="#0a66c2" border="#0a66c2" progress={barProgress} delay={12} />
        </div>

        {/* secondary row — refs, reactions, media, videos */}
        <div
          style={{
            marginTop: vert ? 14 : 22,
            display: 'flex',
            gap: vert ? 22 : 40,
            opacity: secondaryOpacity,
            fontFamily: theme.mono,
            fontSize: vert ? 18 : 26,
            color: '#fff',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            background: 'rgba(0,0,0,0.55)',
            padding: '10px 22px',
            backdropFilter: 'blur(10px)',
            borderTop: `1px solid rgba(222,115,64,0.4)`,
          }}
        >
          <span>
            <b style={{ color: theme.accent, fontWeight: 700 }}>{bundle.stats.refs}</b> refs
          </span>
          <span>
            <b style={{ color: theme.accent, fontWeight: 700 }}>{fmt(bundle.stats.publicReactions)}</b> reactions
          </span>
          <span>
            <b style={{ color: theme.accent, fontWeight: 700 }}>{bundle.stats.mediaAssets}</b> media
          </span>
          <span>
            <b style={{ color: theme.accent, fontWeight: 700 }}>{bundle.stats.playableVideos}</b> videos
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const PlatformPill: React.FC<{
  label: string;
  value: string;
  color: string;
  bg: string;
  border: string;
  progress: number;
  delay: number;
}> = ({ label, value, color, bg, border, progress, delay }) => {
  const local = Math.max(0, progress - delay / 40);
  const fade = Math.min(1, local * 3);
  return (
    <div
      style={{
        padding: '12px 18px',
        background: bg,
        border: `1px solid ${border}`,
        color,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 2,
        opacity: fade,
        transform: `translateY(${interpolate(fade, [0, 1], [12, 0])}px)`,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      }}
    >
      <span style={{ fontSize: '0.5em', letterSpacing: '0.18em', opacity: 0.7 }}>{label}</span>
      <span style={{ fontWeight: 700 }}>{value}</span>
    </div>
  );
};

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

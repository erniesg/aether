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

/**
 * Scene · 6s · rapid b-roll montage with title slammed across it. Real
 * captured photos flash through behind big bold type. Tells you in
 * 6 seconds: WHO, WHERE, WHEN — without ever holding still.
 */
export const OpeningMontage: React.FC<Props> = ({ bundle, orientation }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const vert = orientation === 'vertical';

  // big city-name slams in on frame 8 and stays
  const slamIn = interpolate(frame, [6, 14], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: (t) => 1 - Math.pow(1 - t, 4),
  });
  const slamScale = interpolate(slamIn, [0, 1], [1.4, 1]);

  // sub-line crawls in
  const subOpacity = interpolate(frame, [22, 36], [0, 1], { extrapolateRight: 'clamp' });

  const exit = interpolate(frame, [durationInFrames - 14, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ background: '#000', opacity: exit }}>
      {/* rapid backdrop · 12-frame holds = 8 cuts in 6 seconds */}
      <MediaBackdrop pool={aie2026MediaPool} holdFrames={14} tintOpacity={0.55} kenBurns={0.18} />

      {/* foreground type */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          gap: 12,
          fontFamily: theme.sans,
        }}
      >
        <span
          style={{
            fontFamily: theme.mono,
            fontSize: vert ? 18 : 24,
            textTransform: 'uppercase',
            letterSpacing: '0.36em',
            color: theme.accent,
            opacity: slamIn,
          }}
        >
          AI Engineer
        </span>
        <span
          style={{
            fontFamily: theme.serif,
            fontStyle: 'italic',
            fontSize: vert ? 200 : 280,
            lineHeight: 0.95,
            letterSpacing: '-0.03em',
            transform: `scale(${slamScale})`,
            opacity: slamIn,
            textShadow: '0 8px 32px rgba(0,0,0,0.6)',
          }}
        >
          Singapore
        </span>
        <span
          style={{
            fontFamily: theme.mono,
            fontSize: vert ? 22 : 30,
            textTransform: 'uppercase',
            letterSpacing: '0.24em',
            color: '#fff',
            opacity: subOpacity,
            background: 'rgba(0,0,0,0.5)',
            padding: '8px 20px',
            backdropFilter: 'blur(8px)',
          }}
        >
          {bundle.dates}
        </span>
      </div>
    </AbsoluteFill>
  );
};

import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { theme } from '../theme';
import type { RecapBundle } from '../data';

interface Props {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

/**
 * Scene 8 · 6s · close. "you are the scene" with italic kinetic type,
 * URL underneath as kerned mono, all fading from a radial vignette.
 */
export const OutroScene: React.FC<Props> = ({ bundle, orientation }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = spring({ frame, fps, config: { damping: 24, stiffness: 70 } });
  const urlOpacity = interpolate(frame, [40, 70], [0, 1], { extrapolateRight: 'clamp' });
  const finalFade = interpolate(frame, [durationInFrames - 36, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill
      style={{
        background: 'radial-gradient(ellipse at 50% 50%, #2a1e15 0%, #000 70%)',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 28,
        opacity: finalFade,
        fontFamily: theme.sans,
      }}
    >
      <div
        style={{
          fontFamily: theme.serif,
          fontStyle: 'italic',
          fontSize: orientation === 'vertical' ? 112 : 160,
          lineHeight: 1,
          opacity: t,
          transform: `translateY(${interpolate(t, [0, 1], [22, 0])}px)`,
          textAlign: 'center',
        }}
      >
        you are<br />the scene
      </div>
      <div
        style={{
          fontFamily: theme.mono,
          fontSize: orientation === 'vertical' ? 20 : 26,
          color: theme.accent,
          textTransform: 'uppercase',
          letterSpacing: '0.22em',
          opacity: urlOpacity,
        }}
      >
        aether.berlayar.ai/vibes/{bundle.eventId} ↗
      </div>
    </AbsoluteFill>
  );
};

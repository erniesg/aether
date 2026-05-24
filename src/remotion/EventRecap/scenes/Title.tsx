import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { theme } from '../theme';
import type { RecapBundle } from '../data';

interface Props {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

/**
 * Scene 0 · 3s · cold open. Letter-by-letter reveal of the event name
 * with a deep boom + airy pad sound (mixed externally). Outro fades.
 */
export const TitleScene: React.FC<Props> = ({ bundle, orientation }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const exit = interpolate(frame, [durationInFrames - 18, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const letters = bundle.eventName.split('');
  return (
    <AbsoluteFill
      style={{
        background: 'radial-gradient(ellipse at 50% 60%, #1a1612 0%, #000 70%)',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        opacity: exit,
        fontFamily: theme.sans,
      }}
    >
      <div
        style={{
          fontFamily: theme.serif,
          fontSize: orientation === 'vertical' ? 96 : 144,
          lineHeight: 1,
          letterSpacing: '-0.01em',
          textAlign: 'center',
        }}
      >
        {letters.map((ch, i) => {
          const t = spring({ frame: frame - i * 1.6, fps, config: { damping: 14, stiffness: 90 } });
          return (
            <span
              key={i}
              style={{
                display: 'inline-block',
                opacity: t,
                transform: `translateY(${interpolate(t, [0, 1], [12, 0])}px)`,
                color: ch === 'S' ? theme.accent : '#fff',
              }}
            >
              {ch === ' ' ? ' ' : ch}
            </span>
          );
        })}
      </div>
      <div
        style={{
          fontFamily: theme.mono,
          fontSize: orientation === 'vertical' ? 18 : 22,
          textTransform: 'uppercase',
          letterSpacing: '0.32em',
          color: theme.muted,
          opacity: interpolate(frame, [20, 40], [0, 1], { extrapolateRight: 'clamp' }),
        }}
      >
        {bundle.dates}
      </div>
    </AbsoluteFill>
  );
};

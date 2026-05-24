import React from 'react';
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { theme } from '../theme';

interface Props {
  eyebrow?: string;
  name: string;
  meta?: string;
  /** Frame at which the lower-third should slide in (relative to scene start). */
  delay?: number;
}

/**
 * Lower-third overlay — name strap that slides up from the bottom.
 * Used by MomentScene + VoiceScene for attribution.
 */
export const LowerThird: React.FC<Props> = ({ eyebrow, name, meta, delay = 30 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = Math.max(0, frame - delay);
  const slide = spring({ frame: local, fps, config: { damping: 18, stiffness: 90 } });
  const opacity = interpolate(local, [0, 12], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <div
      style={{
        position: 'absolute',
        left: 64,
        bottom: 96,
        zIndex: 30,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '14px 22px',
        borderLeft: `3px solid ${theme.accent}`,
        background: 'linear-gradient(90deg, rgba(0,0,0,0.78), rgba(0,0,0,0))',
        color: '#fff',
        maxWidth: '70%',
        transform: `translateX(${interpolate(slide, [0, 1], [-32, 0])}px)`,
        opacity,
        fontFamily: theme.sans,
      }}
    >
      {eyebrow && (
        <span
          style={{
            fontFamily: theme.mono,
            fontSize: 12,
            color: theme.accent,
            textTransform: 'uppercase',
            letterSpacing: '0.18em',
          }}
        >
          {eyebrow}
        </span>
      )}
      <span style={{ fontFamily: theme.serif, fontSize: 28, lineHeight: 1.1 }}>{name}</span>
      {meta && (
        <span
          style={{
            fontFamily: theme.mono,
            fontSize: 13,
            color: 'rgba(255,255,255,0.75)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          {meta}
        </span>
      )}
    </div>
  );
};

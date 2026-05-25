import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { theme } from '../theme';
import type { RecapBundle } from '../data';
import { aie2026MediaPool } from '../data';
import { SponsorLogo } from '../components/SponsorLogo';
import { MediaBackdrop } from '../components/MediaBackdrop';

interface Props {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

/**
 * Scene 6 · 8s · "Partners". Logos appear in tier order — diamond first
 * (largest), then platinum, then gold — with a slight stagger so the
 * eye reads the hierarchy. After all logos are in, the count callout
 * fades in on top.
 */
export const SponsorScene: React.FC<Props> = ({ bundle, orientation }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const exit = interpolate(frame, [durationInFrames - 18, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const headOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });

  const groups = [
    { tier: 'diamond', size: 'lg' as const, items: bundle.sponsors.filter((s) => s.tier === 'diamond') },
    { tier: 'platinum', size: 'md' as const, items: bundle.sponsors.filter((s) => s.tier === 'platinum') },
    { tier: 'gold', size: 'sm' as const, items: bundle.sponsors.filter((s) => s.tier === 'gold') },
  ];

  return (
    <AbsoluteFill style={{ background: '#000', opacity: exit }}>
      <MediaBackdrop pool={aie2026MediaPool} holdFrames={20} tintOpacity={0.75} kenBurns={0.1} startIndex={11} />
    <AbsoluteFill
      style={{
        background: 'transparent',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        padding: orientation === 'vertical' ? '80px 56px' : '96px 144px',
        gap: orientation === 'vertical' ? 28 : 36,
        opacity: exit,
        fontFamily: theme.sans,
      }}
    >
      <h3
        style={{
          fontFamily: theme.serif,
          fontSize: orientation === 'vertical' ? 48 : 64,
          margin: 0,
          fontWeight: 400,
          opacity: headOpacity,
        }}
      >
        Partners <span style={{ color: theme.muted, fontSize: '0.55em' }}>· 12 across the floor</span>
      </h3>

      {groups.map((g, gi) => {
        const baseDelay = gi * 24;
        return (
          <div
            key={g.tier}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              borderTop: `1px solid ${theme.line}`,
              paddingTop: 18,
            }}
          >
            <span
              style={{
                fontFamily: theme.mono,
                fontSize: 12,
                color: theme.muted,
                textTransform: 'uppercase',
                letterSpacing: '0.18em',
              }}
            >
              {g.tier}
            </span>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: g.size === 'lg' ? 36 : g.size === 'sm' ? 18 : 24,
                alignItems: 'center',
              }}
            >
              {g.items.map((s, i) => {
                const delay = baseDelay + i * 4 + 12;
                const t = spring({ frame: frame - delay, fps, config: { damping: 14, stiffness: 100 } });
                return (
                  <div
                    key={s.brand}
                    style={{
                      opacity: t,
                      transform: `scale(${interpolate(t, [0, 1], [0.8, 1])})`,
                    }}
                  >
                    <SponsorLogo sponsor={s} size={g.size} />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
    </AbsoluteFill>
  );
};

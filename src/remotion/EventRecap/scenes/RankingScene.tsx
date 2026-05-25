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
 * Scene 2 · 7s · "What travelled". Top 6 themes bar-fill with stagger,
 * each scaled to the leader (Vivian's keynote @ 145 refs).
 */
export const RankingScene: React.FC<Props> = ({ bundle, orientation }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const themes = bundle.themes.slice(0, 6);
  const max = themes[0]?.postCount ?? 1;
  const exit = interpolate(frame, [durationInFrames - 18, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={{ background: '#000', opacity: exit }}>
      <MediaBackdrop pool={aie2026MediaPool} holdFrames={22} tintOpacity={0.75} kenBurns={0.12} startIndex={6} />
    <AbsoluteFill
      style={{
        background: 'transparent',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: orientation === 'vertical' ? '64px 48px' : '80px 120px',
        gap: 14,
        fontFamily: theme.sans,
      }}
    >
      <h3
        style={{
          fontFamily: theme.serif,
          fontSize: orientation === 'vertical' ? 44 : 56,
          margin: '0 0 18px',
          color: '#fff',
          fontWeight: 400,
        }}
      >
        What travelled <span style={{ color: theme.muted, fontSize: '0.55em' }}>· {bundle.stats.refs} refs</span>
      </h3>
      {themes.map((t, i) => {
        const stagger = i * 8;
        const grow = interpolate(frame, [20 + stagger, 60 + stagger], [0, 1], {
          extrapolateRight: 'clamp',
          easing: (x) => 1 - Math.pow(1 - x, 3),
        });
        const labelOpacity = interpolate(frame, [10 + stagger, 30 + stagger], [0, 1], {
          extrapolateRight: 'clamp',
        });
        return (
          <div key={t.storyId} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                opacity: labelOpacity,
              }}
            >
              <span style={{ fontSize: orientation === 'vertical' ? 18 : 24 }}>{t.label}</span>
              <span
                style={{
                  fontFamily: theme.mono,
                  fontSize: orientation === 'vertical' ? 14 : 18,
                  color: theme.muted,
                }}
              >
                {t.postCount}
              </span>
            </div>
            <div style={{ height: 8, background: theme.soft, borderRadius: 99, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${(t.postCount / max) * grow * 100}%`,
                  background: i === 0 ? theme.accent : `rgba(222,115,64,${0.95 - i * 0.12})`,
                }}
              />
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
    </AbsoluteFill>
  );
};

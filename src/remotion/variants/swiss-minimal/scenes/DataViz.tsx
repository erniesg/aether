import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import type { RecapBundle } from '../../../EventRecap/data';

interface Props {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

const RED = '#d92d20';
const INK = '#0a0a0a';
const BG = '#fafaf8';

/**
 * 0:04 — 0:08. Pure data viz. Top 6 themes as a proper bar chart with
 * axis labels. Numbers tick up. No photos.
 */
export const DataViz: React.FC<Props> = ({ bundle, orientation }) => {
  const frame = useCurrentFrame();
  const themes = bundle.themes.slice(0, 6);
  const max = Math.max(...themes.map((t) => t.postCount));

  return (
    <AbsoluteFill style={{ background: BG, color: INK, fontFamily: 'Inter, Helvetica, sans-serif' }}>
      <div
        style={{
          position: 'absolute',
          inset: orientation === 'vertical' ? '80px 60px' : '70px 120px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            marginBottom: 30,
          }}
        >
          <div>
            <div
              style={{
                fontSize: orientation === 'vertical' ? 14 : 18,
                letterSpacing: '0.32em',
                fontWeight: 500,
                marginBottom: 12,
                opacity: interpolate(frame, [4, 14], [0, 1], { extrapolateRight: 'clamp' }),
              }}
            >
              FIG.&thinsp;01 · WHAT TRAVELLED
            </div>
            <div
              style={{
                fontSize: orientation === 'vertical' ? 56 : 78,
                fontWeight: 800,
                letterSpacing: '-0.04em',
                lineHeight: 0.95,
                opacity: interpolate(frame, [8, 22], [0, 1], { extrapolateRight: 'clamp' }),
              }}
            >
              {bundle.stats.refs} <span style={{ color: RED }}>REFS</span>
              <br />
              <span style={{ fontSize: '0.5em', fontWeight: 500, letterSpacing: '0.04em' }}>
                CROSS-PLATFORM
              </span>
            </div>
          </div>
          <div
            style={{
              fontSize: orientation === 'vertical' ? 12 : 16,
              letterSpacing: '0.16em',
              color: '#6b6963',
              textAlign: 'right',
              opacity: interpolate(frame, [14, 28], [0, 1], { extrapolateRight: 'clamp' }),
            }}
          >
            N = {bundle.stats.refs}<br />
            SOURCE: X · LINKEDIN · YT<br />
            CAPTURED 2026-05-19
          </div>
        </div>

        {/* Horizontal rule */}
        <div
          style={{
            height: 2,
            background: INK,
            transform: `scaleX(${interpolate(frame, [14, 36], [0, 1], { extrapolateRight: 'clamp' })})`,
            transformOrigin: 'left',
            marginBottom: 22,
          }}
        />

        {/* Bars */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {themes.map((t, i) => {
            const start = 30 + i * 6;
            const grow = interpolate(frame, [start, start + 30], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              easing: (x) => 1 - Math.pow(1 - x, 3),
            });
            const labelOp = interpolate(frame, [start, start + 12], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            const tickValue = Math.round(t.postCount * grow);
            const widthPct = (t.postCount / max) * grow * 100;
            return (
              <div key={t.storyId} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: orientation === 'vertical' ? 14 : 18,
                    fontWeight: 500,
                    letterSpacing: '0.12em',
                    opacity: labelOp,
                    textTransform: 'uppercase',
                  }}
                >
                  <span>
                    <b style={{ color: RED, marginRight: 8 }}>{String(i + 1).padStart(2, '0')}</b>
                    {t.label}
                  </span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{tickValue}</span>
                </div>
                <div
                  style={{
                    height: orientation === 'vertical' ? 28 : 36,
                    background: i === 0 ? RED : INK,
                    width: `${widthPct}%`,
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* X-axis ticks */}
        <div
          style={{
            marginTop: 10,
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: orientation === 'vertical' ? 12 : 14,
            color: '#6b6963',
            letterSpacing: '0.18em',
            fontWeight: 500,
            opacity: interpolate(frame, [70, 90], [0, 1], { extrapolateRight: 'clamp' }),
          }}
        >
          <span>0</span>
          <span>50</span>
          <span>100</span>
          <span>145 ▮</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

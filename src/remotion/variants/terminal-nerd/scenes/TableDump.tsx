import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import type { RecapBundle } from '../../../EventRecap/data';

interface Props {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

const TERM_BG = '#0a0e0a';
const TERM_GREEN = '#5af78e';
const TERM_AMBER = '#f3a261';
const TERM_DIM = '#3e6347';
const TERM_BRIGHT = '#a4f0b8';

const FONT = `'JetBrains Mono', ui-monospace, 'SF Mono', 'Menlo', 'Courier New', monospace`;

/**
 * 0:04 — 0:08. Fake `SELECT * FROM refs` style table dump. Renders as
 * an actual mono table with rows ticking in.
 */
export const TableDump: React.FC<Props> = ({ bundle, orientation }) => {
  const frame = useCurrentFrame();

  const rows = [
    { idx: '01', theme: "vivian's keynote        ", refs: 145, reach: '30.0', plat: 'x' },
    { idx: '02', theme: 'event recaps + hallway  ', refs: 89, reach: '14.7', plat: 'li' },
    { idx: '03', theme: 'sponsors + booths       ', refs: 76, reach: '11.2', plat: 'li' },
    { idx: '04', theme: 'openai codex presence   ', refs: 68, reach: '10.8', plat: 'li' },
    { idx: '05', theme: 'students + 65labs       ', refs: 54, reach: '8.40', plat: 'li' },
    { idx: '06', theme: 'workshops + agentic     ', refs: 42, reach: '6.10', plat: 'li' },
  ];

  return (
    <AbsoluteFill style={{ background: TERM_BG }}>
      {/* Frame */}
      <div
        style={{
          position: 'absolute',
          top: 20,
          left: 20,
          right: 20,
          bottom: 20,
          border: `1px solid ${TERM_GREEN}33`,
          borderRadius: 8,
          pointerEvents: 'none',
        }}
      />

      {/* Header */}
      <div
        style={{
          position: 'absolute',
          top: 50,
          left: orientation === 'vertical' ? 60 : 120,
          right: orientation === 'vertical' ? 60 : 120,
          fontFamily: FONT,
          fontSize: orientation === 'vertical' ? 24 : 30,
        }}
      >
        <div style={{ color: TERM_GREEN, fontWeight: 700, marginBottom: 10 }}>
          $ <span style={{ color: TERM_BRIGHT }}>aie2026 query --top themes</span>
        </div>
        <div style={{ color: TERM_DIM, fontSize: orientation === 'vertical' ? 18 : 22, marginBottom: 16 }}>
          # 872 refs · {bundle.themes.length} themes · {bundle.voices.length} voices
        </div>
      </div>

      {/* Table */}
      <div
        style={{
          position: 'absolute',
          top: orientation === 'vertical' ? 200 : 180,
          left: orientation === 'vertical' ? 60 : 120,
          right: orientation === 'vertical' ? 60 : 120,
          fontFamily: FONT,
          fontSize: orientation === 'vertical' ? 22 : 28,
          lineHeight: 1.55,
          color: TERM_BRIGHT,
        }}
      >
        {/* Header row */}
        <div style={{ color: TERM_AMBER, fontWeight: 700 }}>
          ┌────┬──────────────────────────┬──────┬───────┬───────┐
        </div>
        <div style={{ color: TERM_AMBER, fontWeight: 700 }}>
          │ # &nbsp;│ theme&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│ refs │ reach │ plat&nbsp;&nbsp;│
        </div>
        <div style={{ color: TERM_AMBER, fontWeight: 700 }}>
          ├────┼──────────────────────────┼──────┼───────┼───────┤
        </div>

        {rows.map((r, i) => {
          const start = 8 + i * 9;
          if (frame < start) return null;
          const op = interpolate(frame, [start, start + 4], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          const highlight = i === 0;
          return (
            <div
              key={r.idx}
              style={{
                color: highlight ? TERM_GREEN : TERM_BRIGHT,
                opacity: op,
                fontWeight: highlight ? 700 : 400,
                textShadow: highlight ? `0 0 8px ${TERM_GREEN}88` : 'none',
              }}
            >
              │ {r.idx} │ {r.theme}│ {String(r.refs).padStart(4, ' ')} │ {r.reach.padStart(5, ' ')} │ {r.plat.padEnd(5, ' ')}│
            </div>
          );
        })}
        <div style={{ color: TERM_AMBER, fontWeight: 700 }}>
          └────┴──────────────────────────┴──────┴───────┴───────┘
        </div>

        {/* Footer summary */}
        <div
          style={{
            color: TERM_DIM,
            marginTop: 16,
            opacity: interpolate(frame, [70, 92], [0, 1], { extrapolateRight: 'clamp' }),
          }}
        >
          (6 rows · query took 1.4ms · indexed)
        </div>
        <div
          style={{
            color: TERM_GREEN,
            marginTop: 8,
            fontWeight: 700,
            opacity: interpolate(frame, [86, 100], [0, 1], { extrapolateRight: 'clamp' }),
            textShadow: `0 0 6px ${TERM_GREEN}66`,
          }}
        >
          ✓ no LLM hallucinated · all from real posts
        </div>
      </div>
    </AbsoluteFill>
  );
};

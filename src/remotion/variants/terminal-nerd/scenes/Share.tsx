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
const TERM_CYAN = '#6cd2eb';
const FONT = `'JetBrains Mono', ui-monospace, 'SF Mono', 'Menlo', 'Courier New', monospace`;

/**
 * 0:08 — 0:12. `> SHARE: aether.berlayar.ai/vibes/aie2026` with a big
 * boxed ASCII frame around it. Pulse cursor. ASCII signature block.
 */
export const Share: React.FC<Props> = ({ bundle, orientation }) => {
  const frame = useCurrentFrame();

  // Type each component in sequence
  const url = `https://aether.berlayar.ai/vibes/${bundle.eventId}`;
  const urlChars = Math.min(url.length, Math.floor(frame / 1.0));
  const urlVisible = url.slice(0, urlChars);

  // ASCII banner appears after URL
  const banner = ['╔══════════════════════════════════════╗', '║   AIE · SG · 26   →   FULL RECAP   ║', '╚══════════════════════════════════════╝'];

  return (
    <AbsoluteFill style={{ background: TERM_BG }}>
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
      <div
        style={{
          position: 'absolute',
          top: 50,
          left: orientation === 'vertical' ? 60 : 120,
          right: orientation === 'vertical' ? 60 : 120,
          fontFamily: FONT,
          fontSize: orientation === 'vertical' ? 22 : 28,
          color: TERM_DIM,
        }}
      >
        $ <span style={{ color: TERM_BRIGHT }}>aie2026 share</span>
      </div>

      {/* Big SHARE block */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: FONT,
          gap: 18,
        }}
      >
        <div
          style={{
            color: TERM_AMBER,
            fontSize: orientation === 'vertical' ? 26 : 36,
            fontWeight: 700,
            letterSpacing: '0.1em',
            opacity: interpolate(frame, [2, 14], [0, 1], { extrapolateRight: 'clamp' }),
            textShadow: `0 0 8px ${TERM_AMBER}66`,
          }}
        >
          &gt;&gt; SHARE
        </div>
        {/* URL line */}
        <div
          style={{
            color: TERM_GREEN,
            fontSize: orientation === 'vertical' ? 28 : 40,
            fontWeight: 700,
            background: 'rgba(90,247,142,0.06)',
            border: `2px solid ${TERM_GREEN}`,
            borderRadius: 4,
            padding: '14px 22px',
            textShadow: `0 0 10px ${TERM_GREEN}88`,
            boxShadow: `0 0 30px ${TERM_GREEN}33, inset 0 0 20px ${TERM_GREEN}10`,
            letterSpacing: 0,
            wordBreak: 'break-all',
            textAlign: 'center',
          }}
        >
          {urlVisible}
          {urlChars < url.length && <span style={{ opacity: (frame % 16) < 8 ? 1 : 0 }}>█</span>}
        </div>

        {/* ASCII banner */}
        <div
          style={{
            marginTop: 18,
            color: TERM_CYAN,
            fontSize: orientation === 'vertical' ? 20 : 28,
            fontWeight: 700,
            opacity: interpolate(frame, [44, 64], [0, 1], { extrapolateRight: 'clamp' }),
            lineHeight: 1.1,
            textShadow: `0 0 6px ${TERM_CYAN}66`,
            textAlign: 'center',
          }}
        >
          {banner.map((row, i) => (
            <div key={i}>{row}</div>
          ))}
        </div>

        {/* Sig block */}
        <div
          style={{
            marginTop: 24,
            color: TERM_DIM,
            fontSize: orientation === 'vertical' ? 18 : 22,
            opacity: interpolate(frame, [70, 90], [0, 1], { extrapolateRight: 'clamp' }),
            textAlign: 'left',
            lineHeight: 1.4,
          }}
        >
          # 872 refs · 4M views · 12 sponsors · 5 voices
          <br />
          # captured 2026-05-19 · public bundle · zero spin
          <br />
          # built with aether · agentic event recap
        </div>
        <div
          style={{
            marginTop: 18,
            color: TERM_AMBER,
            fontSize: orientation === 'vertical' ? 24 : 30,
            fontWeight: 700,
            opacity: interpolate(frame, [96, 116], [0, 1], { extrapolateRight: 'clamp' }),
            textShadow: `0 0 8px ${TERM_AMBER}88`,
          }}
        >
          $ <span style={{ color: TERM_GREEN }}>_</span>
          <span style={{ opacity: (frame % 16) < 8 ? 1 : 0, color: TERM_GREEN }}>█</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

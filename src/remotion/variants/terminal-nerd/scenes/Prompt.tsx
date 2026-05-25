import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import type { RecapBundle } from '../../../EventRecap/data';

interface Props {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

const TERM_BG = '#0a0e0a';
const TERM_GREEN = '#5af78e';
const TERM_AMBER = '#f3a261';
const TERM_DIM = '#3e6347';

const FONT = `'JetBrains Mono', ui-monospace, 'SF Mono', 'Menlo', 'Courier New', monospace`;

/**
 * 0:00 — 0:04. Terminal boots. Prompt char-types `aie2026 --recap` then
 * ASCII spinner runs while "fetching corpus" output streams in below.
 */
export const Prompt: React.FC<Props> = ({ bundle, orientation }) => {
  const frame = useCurrentFrame();

  // Lines stream in. Each line is "shown" once frame >= start.
  const lines: { text: string; color: string; bold?: boolean; start: number; cps?: number }[] = [
    { text: '$ aie2026 --recap --event aie-singapore-2026', color: TERM_GREEN, bold: true, start: 0, cps: 1.2 },
    { text: '> fetching corpus...', color: TERM_DIM, start: 36 },
    { text: `  ✓ 872 references found across 3 platforms`, color: TERM_GREEN, start: 50 },
    { text: `  ✓ ${bundle.stats.mediaAssets} media assets · ${bundle.stats.playableVideos} playable videos`, color: TERM_GREEN, start: 60 },
    { text: `  ✓ ${bundle.themes.length} themes · ${bundle.voices.length} voices · ${bundle.sponsors.length} sponsors`, color: TERM_GREEN, start: 70 },
    { text: '> compositing recap...', color: TERM_DIM, start: 86 },
  ];

  const renderLine = (line: typeof lines[0], y: number, key: number) => {
    if (frame < line.start) return null;
    const cps = line.cps ?? 1.6;
    const charsShown = Math.min(line.text.length, Math.floor((frame - line.start) * cps));
    const isLastVisible = frame >= line.start && charsShown < line.text.length;
    return (
      <div
        key={key}
        style={{
          color: line.color,
          fontFamily: FONT,
          fontSize: orientation === 'vertical' ? 28 : 36,
          fontWeight: line.bold ? 700 : 400,
          letterSpacing: 0,
          marginBottom: 8,
          textShadow: `0 0 4px ${line.color}33`,
        }}
      >
        {line.text.slice(0, charsShown)}
        {isLastVisible && <span style={{ opacity: (frame % 16) < 8 ? 1 : 0 }}>█</span>}
      </div>
    );
  };

  // Spinner frames
  const spinnerChars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  const spinIdx = Math.floor(frame / 4) % spinnerChars.length;
  const showSpinner = frame >= 100;

  return (
    <AbsoluteFill style={{ background: TERM_BG }}>
      {/* ASCII border frame */}
      <Frame orientation={orientation} />
      {/* Status bar (top) */}
      <div
        style={{
          position: 'absolute',
          top: 30,
          left: orientation === 'vertical' ? 60 : 100,
          right: orientation === 'vertical' ? 60 : 100,
          fontFamily: FONT,
          fontSize: orientation === 'vertical' ? 18 : 22,
          color: TERM_DIM,
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>~/aether/recap • main *</span>
        <span style={{ color: TERM_AMBER }}>● live</span>
      </div>

      {/* Output area */}
      <div
        style={{
          position: 'absolute',
          left: orientation === 'vertical' ? 80 : 120,
          right: orientation === 'vertical' ? 80 : 120,
          top: orientation === 'vertical' ? 200 : 160,
          fontFamily: FONT,
          lineHeight: 1.5,
        }}
      >
        {lines.map((line, i) => renderLine(line, i, i))}
        {showSpinner && (
          <div
            style={{
              color: TERM_AMBER,
              fontFamily: FONT,
              fontSize: orientation === 'vertical' ? 28 : 36,
              marginTop: 16,
              textShadow: `0 0 6px ${TERM_AMBER}66`,
            }}
          >
            {spinnerChars[spinIdx]} <span style={{ color: TERM_GREEN }}>rendering ▶</span>
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

const Frame: React.FC<{ orientation: 'vertical' | 'horizontal' }> = ({ orientation }) => {
  // Thin glow border like a modern terminal window
  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: 20,
          left: 20,
          right: 20,
          bottom: 20,
          border: `1px solid ${TERM_GREEN}33`,
          borderRadius: 8,
          boxShadow: `inset 0 0 80px ${TERM_GREEN}10`,
          pointerEvents: 'none',
        }}
      />
      {/* Corner brackets */}
      {[
        { top: 30, left: 30, borderTop: true, borderLeft: true },
        { top: 30, right: 30, borderTop: true, borderRight: true },
        { bottom: 30, left: 30, borderBottom: true, borderLeft: true },
        { bottom: 30, right: 30, borderBottom: true, borderRight: true },
      ].map((c, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            width: 24,
            height: 24,
            top: c.top as number | undefined,
            left: c.left as number | undefined,
            right: c.right as number | undefined,
            bottom: c.bottom as number | undefined,
            borderTop: c.borderTop ? `2px solid ${TERM_GREEN}` : undefined,
            borderLeft: c.borderLeft ? `2px solid ${TERM_GREEN}` : undefined,
            borderRight: c.borderRight ? `2px solid ${TERM_GREEN}` : undefined,
            borderBottom: c.borderBottom ? `2px solid ${TERM_GREEN}` : undefined,
            pointerEvents: 'none',
          }}
        />
      ))}
    </>
  );
};

import React from 'react';
import { AbsoluteFill, Series } from 'remotion';
import type { RecapBundle } from '../../EventRecap/data';
import { Prompt } from './scenes/Prompt';
import { TableDump } from './scenes/TableDump';
import { Share } from './scenes/Share';

export interface TerminalProps {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

/**
 * Variant 10 · Terminal nerd / AI-engineer.
 *
 * Reference: Hacker News, t3.chat, Vercel ship logs, warp.dev.
 * Monospaced everything (JetBrains Mono). Green-on-black or
 * amber-on-black. ASCII art frames. Type reveals char-by-char with
 * blinking cursor. Log-style output.
 *
 * 12s · 360 frames at 30fps. Type cadence ~1 char per frame.
 *   0:00 — 0:04  Prompt     120f  `$ aie2026 --recap` typing + ASCII spinner
 *   0:04 — 0:08  TableDump  120f  fake JSON / table of refs/themes/voices
 *   0:08 — 0:12  Share      120f  `> SHARE: aether.berlayar.ai/...`
 *
 * Audio cue (todo): mechanical key clicks per char, terminal bell on errors.
 */
export const TerminalNerd: React.FC<TerminalProps> = ({ bundle, orientation }) => {
  return (
    <AbsoluteFill style={{ background: '#0a0e0a' }}>
      <Series>
        <Series.Sequence durationInFrames={120}>
          <Prompt bundle={bundle} orientation={orientation} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={120}>
          <TableDump bundle={bundle} orientation={orientation} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={120}>
          <Share bundle={bundle} orientation={orientation} />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};

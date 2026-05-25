import React from 'react';
import { AbsoluteFill, Series } from 'remotion';
import type { RecapBundle } from '../../EventRecap/data';
import { TitleStack } from './scenes/TitleStack';
import { DataViz } from './scenes/DataViz';
import { Quote } from './scenes/Quote';

export interface SwissProps {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

/**
 * Variant 9 · Swiss minimalism / Helvetica.
 *
 * Reference: Müller-Brockmann posters, Massimo Vignelli, Pentagram.
 * Visible 12-column grid during build. All caps Inter. Single accent
 * color (deep red #d92d20). Photos clipped into geometric shapes only.
 *
 * 12s · 360 frames at 30fps.
 *   0:00 — 0:04  TitleStack  120f  "AIE / SG / 26" with grid lines visible
 *   0:04 — 0:08  DataViz     120f  bar chart with axis labels
 *   0:08 — 0:12  Quote       120f  pull-quote with grid-based hierarchy
 *
 * Audio cue (todo): single tonal piano hit per scene change. Spare.
 */
export const SwissMinimal: React.FC<SwissProps> = ({ bundle, orientation }) => {
  return (
    <AbsoluteFill style={{ background: '#fafaf8' }}>
      <Series>
        <Series.Sequence durationInFrames={120}>
          <TitleStack bundle={bundle} orientation={orientation} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={120}>
          <DataViz bundle={bundle} orientation={orientation} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={120}>
          <Quote bundle={bundle} orientation={orientation} />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};

import React from 'react';
import { AbsoluteFill, Series } from 'remotion';
import type { RecapBundle } from '../../EventRecap/data';
import { Singapore } from './scenes/Singapore';
import { FourMillion } from './scenes/FourMillion';
import { Sponsors } from './scenes/Sponsors';

export interface AppleProps {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

/**
 * Variant 3 · Apple keynote sizzle.
 *
 * Reference: WWDC keynote intro, Apple Event sizzle reels. Pure black,
 * single spotlit photo, SF Display-style sans, long ease curves, white
 * text only. No clutter. Restraint by way of stage lighting.
 *
 * 12s · 360 frames at 30fps.
 *   0:00 — 0:04  Singapore     120f  "Singapore." with skyline-style photo
 *   0:04 — 0:08  FourMillion   120f  "Four million views." with bar fills
 *   0:08 — 0:12  Sponsors      120f  Sponsor wall rises elegantly
 *
 * Audio cue (todo): orchestral pad + single soft drone strike at each cut.
 */
export const AppleKeynote: React.FC<AppleProps> = ({ bundle, orientation }) => {
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <Series>
        <Series.Sequence durationInFrames={120}>
          <Singapore bundle={bundle} orientation={orientation} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={120}>
          <FourMillion bundle={bundle} orientation={orientation} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={120}>
          <Sponsors bundle={bundle} orientation={orientation} />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};

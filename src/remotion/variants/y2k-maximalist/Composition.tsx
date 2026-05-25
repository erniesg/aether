import React from 'react';
import { AbsoluteFill, Series } from 'remotion';
import type { RecapBundle } from '../../EventRecap/data';
import { Confetti } from './scenes/Confetti';
import { Punch } from './scenes/Punch';
import { Spin } from './scenes/Spin';

export interface Y2KProps {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

/**
 * Variant 6 · Y2K maximalist chaos.
 *
 * Reference: early-2000s music videos, MTV bumpers, Lisa Frank, anything
 * with "WOW" stickers. Bouncing typography (every word a different
 * font), glitter particles, swirling backgrounds, sticker bursts
 * (BREAKING!, VIRAL!, NEW!), aggressive cyan-pink-yellow gradients.
 *
 * 12s · 360 frames at 30fps. Cuts every 8 frames.
 *   0:00 — 0:04  Confetti  120f  burst + "AIE 26!!"
 *   0:04 — 0:08  Punch     120f  4M punches in with 3 star-bursts
 *   0:08 — 0:12  Spin      120f  photo collage spinning into frame
 *
 * Audio cue (todo): pure pop banger, 128 BPM, with whoosh/zoom SFX.
 */
export const Y2KMaximalist: React.FC<Y2KProps> = ({ bundle, orientation }) => {
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <Series>
        <Series.Sequence durationInFrames={120}>
          <Confetti bundle={bundle} orientation={orientation} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={120}>
          <Punch bundle={bundle} orientation={orientation} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={120}>
          <Spin bundle={bundle} orientation={orientation} />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};

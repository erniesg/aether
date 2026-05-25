import React from 'react';
import { AbsoluteFill, Series } from 'remotion';
import type { RecapBundle } from '../../EventRecap/data';
import { OpeningMontage } from '../../EventRecap/scenes/OpeningMontage';
import { StatScene } from '../../EventRecap/scenes/StatScene';
import { OutroScene } from '../../EventRecap/scenes/Outro';

export interface EditorialProps {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

/**
 * Variant 5 · Editorial newspaper / restraint-aesthetic.
 *
 * This is the current /vibes/aie2026 vibe — Instrument Serif + JetBrains
 * Mono + accent orange on dark. Included here for direct comparison
 * against the other 9 — reviewer asked to see why it doesn't read as a
 * share-out asset next to bolder vibes.
 *
 * Reuses the EXISTING OpeningMontage + StatScene + OutroScene scenes
 * verbatim — no edits — just trimmed to 12 seconds total.
 *
 * 12s · 360 frames at 30fps.
 *   0:00 — 0:04  OpeningMontage  120f  rapid b-roll + serif slam
 *   0:04 — 0:08  StatScene       120f  4M counter + platform pills
 *   0:08 — 0:12  OutroScene      120f  "you are the scene" + URL
 *
 * Audio cue (todo): subtle ambient pad, no beat.
 */
export const EditorialNewspaper: React.FC<EditorialProps> = ({ bundle, orientation }) => {
  return (
    <AbsoluteFill style={{ background: '#070808' }}>
      <Series>
        <Series.Sequence durationInFrames={120}>
          <OpeningMontage bundle={bundle} orientation={orientation} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={120}>
          <StatScene bundle={bundle} orientation={orientation} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={120}>
          <OutroScene bundle={bundle} orientation={orientation} />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};

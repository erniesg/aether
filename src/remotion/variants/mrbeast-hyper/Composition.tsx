import React from 'react';
import { AbsoluteFill, Series } from 'remotion';
import type { RecapBundle } from '../../EventRecap/data';
import { Hook } from './scenes/Hook';
import { Reveal } from './scenes/Reveal';
import { Outro } from './scenes/Outro';

export interface HyperProps {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

/**
 * Variant 2 · MrBeast-style TikTok hyper-cut.
 *
 * Reference: MrBeast, Recess Therapy, viral TikTok captions. Cuts on
 * every beat (~4-frame jumps during peaks). Inter Black with white
 * outlines + drop shadows. Safety yellow #FFE400 accents. Numbers
 * screen-shake on entry. Emojis sprinkled aggressively.
 *
 * 12s · 360 frames at 30fps. Cuts on every 4-frame beat (~133 BPM).
 *   0:00 — 0:04  Hook    120f  "BRO 🇸🇬 4M VIEWS??!" + flash montage
 *   0:04 — 0:08  Reveal  120f  Top 3 themes as huge bouncing pills
 *   0:08 — 0:12  Outro   120f  "TAP TO WATCH FULL RECAP →"
 *
 * Audio cue (todo): up-tempo 140 BPM beat with kick on every 4 frames.
 */
export const MrBeastHyper: React.FC<HyperProps> = ({ bundle, orientation }) => {
  return (
    <AbsoluteFill style={{ background: '#FFE400' }}>
      <Series>
        <Series.Sequence durationInFrames={120}>
          <Hook bundle={bundle} orientation={orientation} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={120}>
          <Reveal bundle={bundle} orientation={orientation} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={120}>
          <Outro bundle={bundle} orientation={orientation} />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};

import React from 'react';
import { AbsoluteFill, Series } from 'remotion';
import type { RecapBundle } from './data';
import { TitleScene } from './scenes/Title';
import { StatScene } from './scenes/StatScene';
import { RankingScene } from './scenes/RankingScene';
import { MomentScene } from './scenes/MomentScene';
import { SponsorScene } from './scenes/SponsorScene';
import { OutroScene } from './scenes/Outro';
import { Watermark } from './components/Watermark';

export interface EventRecapProps {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

/**
 * 60 seconds · 30fps · 1800 frames. Series<Sequence> chains the six
 * scenes back-to-back; each scene handles its own intro + exit fade
 * so transitions overlap rather than hard-cut. The persistent
 * Watermark layer sits on top.
 *
 *   0 –  90    TitleScene       3s    cold open · letter cascade
 *  90 – 390    StatScene       10s    4M counter + breakdown + secondary stats
 * 390 – 660    RankingScene     9s    6 themes bar-fill with stagger
 * 660 –1200    MomentScene     18s    real Vivian video + pull-quote
 *1200 –1560    SponsorScene    12s    tier stagger of 12 brand logos
 *1560 –1800    OutroScene       8s    "you are the scene" + URL
 *
 * Audio (not shown — wire via <Audio src=…> in production):
 *   deep boom (0:00) · synth swell (0:03) · ticks ×6 (0:13) ·
 *   heartbeat + room tone (0:22) · chord swell (0:40) · final boom (0:52).
 */
export const EventRecap: React.FC<EventRecapProps> = ({ bundle, orientation }) => {
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <Series>
        <Series.Sequence durationInFrames={90}>
          <TitleScene bundle={bundle} orientation={orientation} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={300}>
          <StatScene bundle={bundle} orientation={orientation} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={270}>
          <RankingScene bundle={bundle} orientation={orientation} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={540}>
          <MomentScene bundle={bundle} orientation={orientation} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={360}>
          <SponsorScene bundle={bundle} orientation={orientation} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={240}>
          <OutroScene bundle={bundle} orientation={orientation} />
        </Series.Sequence>
      </Series>
      <Watermark eventId={bundle.eventId} version="v1.0" />
    </AbsoluteFill>
  );
};

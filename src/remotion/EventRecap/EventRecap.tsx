import React from 'react';
import { AbsoluteFill, Series } from 'remotion';
import type { RecapBundle } from './data';
import { OpeningMontage } from './scenes/OpeningMontage';
import { StatScene } from './scenes/StatScene';
import { RankingScene } from './scenes/RankingScene';
import { MomentClip } from './scenes/MomentClip';
import { VoiceMontage } from './scenes/VoiceMontage';
import { SponsorScene } from './scenes/SponsorScene';
import { OutroScene } from './scenes/Outro';
import { Watermark } from './components/Watermark';

export interface EventRecapProps {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

/**
 * 60 seconds · 30fps · 1800 frames. Multi-cut recap with real captured
 * media cross-cutting BEHIND every scene (not isolated black backgrounds).
 *
 *   0:00 ─  240   OpeningMontage    8s   8 rapid b-roll cuts + serif title slam
 *   0:08 ─  180   StatScene         6s   4M counter over rolling b-roll + platform pills
 *   0:14 ─  270   RankingScene      9s   6 theme bars stagger-fill over b-roll
 *   0:23 ─  300   MomentClip       10s   full-frame Vivian keynote video + pull-quote
 *   0:33 ─  270   VoiceMontage      9s   5 real LinkedIn / X quotes cycle every 1.6s
 *   0:42 ─  300   SponsorScene     10s   12 brand logos tier-staggered over b-roll
 *   0:52 ─  240   OutroScene        8s   "you are the scene" + URL
 *
 * Persistent Watermark sits on top of every scene.
 */
export const EventRecap: React.FC<EventRecapProps> = ({ bundle, orientation }) => {
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <Series>
        <Series.Sequence durationInFrames={240}>
          <OpeningMontage bundle={bundle} orientation={orientation} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={180}>
          <StatScene bundle={bundle} orientation={orientation} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={270}>
          <RankingScene bundle={bundle} orientation={orientation} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={300}>
          <MomentClip bundle={bundle} orientation={orientation} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={270}>
          <VoiceMontage bundle={bundle} orientation={orientation} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={300}>
          <SponsorScene bundle={bundle} orientation={orientation} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={240}>
          <OutroScene bundle={bundle} orientation={orientation} />
        </Series.Sequence>
      </Series>
      <Watermark eventId={bundle.eventId} version="v2.0" />
    </AbsoluteFill>
  );
};

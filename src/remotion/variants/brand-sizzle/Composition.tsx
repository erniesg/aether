import React from 'react';
import { AbsoluteFill, Series } from 'remotion';
import type { RecapBundle } from '../../EventRecap/data';
import { LogoWall } from './scenes/LogoWall';
import { Headline } from './scenes/Headline';
import { EndCard } from './scenes/EndCard';

export interface SizzleProps {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

/**
 * Variant 8 · Polished brand sizzle.
 *
 * Reference: Stripe brand films, Linear launch videos, modern SaaS
 * keynote tags. Warm color grade (orange tint, lifted blacks). Big
 * sans-serif with subtle parallax. Smooth bezier curves (no springs).
 *
 * 12s · 360 frames at 30fps.
 *   0:00 — 0:04  LogoWall    120f  sponsor wall reveals then morphs into photo
 *   0:04 — 0:08  Headline    120f  stat over slow-tracking b-roll
 *   0:08 — 0:12  EndCard     120f  hashtag end-card with soft glow
 *
 * Audio cue (todo): warm cinematic synth, kick on every other beat at 110 BPM.
 */
export const BrandSizzle: React.FC<SizzleProps> = ({ bundle, orientation }) => {
  return (
    <AbsoluteFill style={{ background: '#1a0e08' }}>
      <Series>
        <Series.Sequence durationInFrames={120}>
          <LogoWall bundle={bundle} orientation={orientation} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={120}>
          <Headline bundle={bundle} orientation={orientation} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={120}>
          <EndCard bundle={bundle} orientation={orientation} />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};

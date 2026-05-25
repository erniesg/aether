import React from 'react';
import { AbsoluteFill, Series } from 'remotion';
import type { RecapBundle } from '../../EventRecap/data';
import { ColdOpen } from './scenes/ColdOpen';
import { SlowMontage } from './scenes/SlowMontage';
import { Reveal } from './scenes/Reveal';

export interface SundanceProps {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

/**
 * Variant 1 · Sundance documentary trailer.
 *
 * Reference: Free Solo trailer, A24 doc cuts, Sundance selections.
 * Hand-held feel; soft natural-light grading; long pans on faces;
 * letterbox bars top + bottom 90px; italic serif lower-thirds.
 *
 * 12s · 360 frames at 30fps.
 *   0:00 — 0:04  ColdOpen     120f  black to first photo, Vivian quote types in
 *   0:04 — 0:08  SlowMontage  120f  3 ken-burns photos, slow pans
 *   0:08 — 0:12  Reveal       120f  4M views + 872 refs reveal + event title
 *
 * Audio cue (todo): ambient pad starting at 0:00, soft swell at 0:08.
 * Cut on every 8th beat at 90 BPM (~5.3s) — so really only one cut.
 */
export const SundanceDoc: React.FC<SundanceProps> = ({ bundle, orientation }) => {
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <Series>
        <Series.Sequence durationInFrames={120}>
          <ColdOpen bundle={bundle} orientation={orientation} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={120}>
          <SlowMontage bundle={bundle} orientation={orientation} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={120}>
          <Reveal bundle={bundle} orientation={orientation} />
        </Series.Sequence>
      </Series>
      {/* Letterbox bars sit on top of every scene */}
      <Letterbox />
      {/* Film grain texture overlay */}
      <FilmGrain />
    </AbsoluteFill>
  );
};

const Letterbox: React.FC = () => (
  <>
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 90,
        background: '#000',
        zIndex: 10,
      }}
    />
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 90,
        background: '#000',
        zIndex: 10,
      }}
    />
  </>
);

const FilmGrain: React.FC = () => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      zIndex: 9,
      background: `
        radial-gradient(circle at 23% 47%, rgba(255,255,255,0.025) 0px, transparent 1px),
        radial-gradient(circle at 73% 19%, rgba(255,255,255,0.02) 0px, transparent 1px),
        radial-gradient(circle at 41% 83%, rgba(255,255,255,0.02) 0px, transparent 1px),
        radial-gradient(circle at 89% 67%, rgba(255,255,255,0.025) 0px, transparent 1px)
      `,
      backgroundSize: '3px 3px, 4px 4px, 5px 5px, 6px 6px',
      mixBlendMode: 'overlay',
      pointerEvents: 'none',
    }}
  />
);

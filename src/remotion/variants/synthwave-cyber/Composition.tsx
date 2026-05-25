import React from 'react';
import { AbsoluteFill, Series, useCurrentFrame } from 'remotion';
import type { RecapBundle } from '../../EventRecap/data';
import { Boot } from './scenes/Boot';
import { GlitchMontage } from './scenes/GlitchMontage';
import { Transmission } from './scenes/Transmission';

export interface CyberProps {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

/**
 * Variant 4 · Synthwave / cyberpunk.
 *
 * Reference: Stranger Things opening, retro-futurism, late-80s neon.
 * Magenta + cyan gradients, scanlines, chromatic aberration on text,
 * bitmap fonts, grid floor perspective, VHS noise between cuts.
 *
 * 12s · 360 frames at 30fps. Cuts every ~6 frames during glitch scene.
 *   0:00 — 0:04  Boot           120f  "AI ENGINEER//SG.2026" with CRT scan
 *   0:04 — 0:08  GlitchMontage  120f  Photo cuts with VHS noise frames
 *   0:08 — 0:12  Transmission   120f  "TRANSMISSION ENDS" + URL ticker
 *
 * Audio cue (todo): 110 BPM synthwave bass + occasional VHS rewind SFX.
 */
export const SynthwaveCyber: React.FC<CyberProps> = ({ bundle, orientation }) => {
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <Series>
        <Series.Sequence durationInFrames={120}>
          <Boot bundle={bundle} orientation={orientation} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={120}>
          <GlitchMontage bundle={bundle} orientation={orientation} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={120}>
          <Transmission bundle={bundle} orientation={orientation} />
        </Series.Sequence>
      </Series>
      {/* Persistent CRT scan-line overlay */}
      <Scanlines />
    </AbsoluteFill>
  );
};

const Scanlines: React.FC = () => {
  const frame = useCurrentFrame();
  // Scan-line drift
  const offset = (frame * 0.6) % 4;
  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'repeating-linear-gradient(0deg, rgba(0,0,0,0.35) 0 1px, transparent 1px 3px)',
          backgroundPositionY: `${offset}px`,
          mixBlendMode: 'multiply',
          pointerEvents: 'none',
          zIndex: 100,
        }}
      />
      {/* CRT curvature vignette */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at center, rgba(0,0,0,0) 50%, rgba(0,0,0,0.55) 100%)',
          pointerEvents: 'none',
          zIndex: 101,
        }}
      />
    </>
  );
};

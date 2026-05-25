import React from 'react';
import { AbsoluteFill, Series, useCurrentFrame } from 'remotion';
import type { RecapBundle } from '../../EventRecap/data';
import { Tracking } from './scenes/Tracking';
import { Archive } from './scenes/Archive';
import { EndRec } from './scenes/EndRec';

export interface VHSProps {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

/**
 * Variant 7 · VHS documentary (Adam Curtis style).
 *
 * Reference: Adam Curtis docs, VHS-tape aesthetic, lo-fi archival.
 * Heavy scan lines + chroma noise, date-stamp overlay, wobble jitter
 * on photos, desaturated color grading. Persistent "REC" + date.
 *
 * 12s · 360 frames at 30fps.
 *   0:00 — 0:04  Tracking  120f  REC + tracking-error glitch + first photo
 *   0:04 — 0:08  Archive   120f  Photos with VHS interruptions
 *   0:08 — 0:12  EndRec    120f  "END REC" + sponsor names typewriter
 *
 * Audio cue (todo): low hum + occasional tape rewind SFX.
 */
export const VHSDoc: React.FC<VHSProps> = ({ bundle, orientation }) => {
  return (
    <AbsoluteFill style={{ background: '#0a0a08' }}>
      <Series>
        <Series.Sequence durationInFrames={120}>
          <Tracking bundle={bundle} orientation={orientation} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={120}>
          <Archive bundle={bundle} orientation={orientation} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={120}>
          <EndRec bundle={bundle} orientation={orientation} />
        </Series.Sequence>
      </Series>
      <VHSOverlay />
      <DateRecStamp />
    </AbsoluteFill>
  );
};

const VHSOverlay: React.FC = () => {
  const frame = useCurrentFrame();
  // Scan-line offset oscillates for that VHS jitter
  const offset = (frame * 0.4) % 6;
  // Tracking error appears every 80 frames
  const showTracking = frame % 80 < 6;
  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'repeating-linear-gradient(0deg, rgba(0,0,0,0.25) 0 2px, transparent 2px 5px)',
          backgroundPositionY: `${offset}px`,
          mixBlendMode: 'multiply',
          pointerEvents: 'none',
          zIndex: 200,
        }}
      />
      {/* Chroma bleed */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'repeating-linear-gradient(90deg, rgba(255,30,30,0.04) 0 2px, transparent 2px 4px, rgba(30,90,255,0.04) 4px 6px)',
          mixBlendMode: 'screen',
          pointerEvents: 'none',
          zIndex: 201,
        }}
      />
      {/* Vignette */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.6) 100%)',
          pointerEvents: 'none',
          zIndex: 202,
        }}
      />
      {/* Tracking error band */}
      {showTracking && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: `${(frame * 13) % 100}%`,
            height: 24,
            background: 'rgba(255,255,255,0.3)',
            mixBlendMode: 'difference',
            zIndex: 203,
          }}
        />
      )}
    </>
  );
};

const DateRecStamp: React.FC = () => {
  const frame = useCurrentFrame();
  // Blink REC dot
  const dotOn = (frame % 30) < 18;
  return (
    <div
      style={{
        position: 'absolute',
        top: 30,
        left: 30,
        zIndex: 250,
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        fontFamily: 'ui-monospace, "Courier New", monospace',
        fontSize: 22,
        fontWeight: 700,
        color: '#fff',
        textShadow: '2px 2px 0 #000',
        letterSpacing: '0.04em',
      }}
    >
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: dotOn ? '#ff2020' : '#600000',
          boxShadow: dotOn ? '0 0 12px #ff2020' : 'none',
        }}
      />
      REC&nbsp;&nbsp;05.18.2026&nbsp;&nbsp;PULLMAN&nbsp;HOTEL
    </div>
  );
};

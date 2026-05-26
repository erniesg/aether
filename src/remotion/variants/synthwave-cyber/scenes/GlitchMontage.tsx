import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame } from 'remotion';
import type { RecapBundle } from '../../../EventRecap/data';
import { aie2026MediaPool } from '../../../EventRecap/data';
import { useFaceAwareObjectPosition } from '../../../EventRecap/crop';

interface Props {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

const MAGENTA = '#ff0080';
const CYAN = '#00fff0';

const fmt = (n: number) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(0) + 'M';
  return String(n);
};

/**
 * 0:04 — 0:08. Glitch montage. Photos cut every 12 frames. Between
 * cuts, a 2-frame VHS noise frame (pure magenta/cyan static). Stats
 * appear as overlay text.
 */
export const GlitchMontage: React.FC<Props> = ({ bundle, orientation }) => {
  const frame = useCurrentFrame();
  const images = aie2026MediaPool.filter((m) => m.type === 'image');

  // Cycle photos every 12 frames, with 2-frame noise between
  const cycleLen = 14;
  const cyclePhase = frame % cycleLen;
  const inNoise = cyclePhase < 2;
  const slot = Math.floor(frame / cycleLen) % images.length;
  const img = images[slot];
  // Pan across each per-image cycle so face-union scans don't stall on the
  // pan's `from` keyframe for the whole 12-frame hold.
  const imgObjectPosition = useFaceAwareObjectPosition(img, cyclePhase / cycleLen);

  // Stat readouts cycle with photos
  const stats = [
    `872 REFS`,
    `${fmt(bundle.stats.knownViews)} VIEWS`,
    `${bundle.stats.mediaAssets} ASSETS`,
    `${bundle.stats.playableVideos} VIDEOS`,
    `${bundle.themes.length} THEMES`,
    `${bundle.voices.length} VOICES`,
    `${bundle.sponsors.length} SPONSORS`,
  ];
  const statText = stats[slot % stats.length];

  // Chromatic aberration on photo
  const offset = inNoise ? 18 : 4;

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {/* Cyan-shifted photo (background layer) */}
      <Img
        src={img.url}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: imgObjectPosition,
          filter: 'saturate(0.4) contrast(1.4) brightness(0.6) hue-rotate(160deg)',
          transform: `translateX(${-offset}px)`,
          mixBlendMode: 'screen',
          opacity: 0.7,
        }}
      />
      {/* Magenta-shifted photo */}
      <Img
        src={img.url}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: imgObjectPosition,
          filter: 'saturate(0.4) contrast(1.4) brightness(0.6) hue-rotate(-40deg)',
          transform: `translateX(${offset}px)`,
          mixBlendMode: 'screen',
          opacity: 0.7,
        }}
      />
      {/* Centered base photo */}
      <Img
        src={img.url}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: imgObjectPosition,
          filter: 'saturate(0.7) contrast(1.2) brightness(0.55)',
          opacity: 0.7,
        }}
      />
      {/* Magenta wash */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(135deg, rgba(255,0,128,0.35) 0%, rgba(0,255,240,0.25) 100%)',
          mixBlendMode: 'overlay',
        }}
      />

      {/* VHS noise frame */}
      {inNoise && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `
              repeating-linear-gradient(90deg, ${MAGENTA} 0 4px, ${CYAN} 4px 8px, #000 8px 12px),
              repeating-linear-gradient(0deg, rgba(0,0,0,0.4) 0 2px, transparent 2px 4px)
            `,
            mixBlendMode: 'difference',
            opacity: 0.85,
          }}
        />
      )}

      {/* Stat readout — bottom left in monospace box */}
      <div
        style={{
          position: 'absolute',
          left: orientation === 'vertical' ? 50 : 90,
          bottom: orientation === 'vertical' ? 200 : 130,
          fontFamily: 'ui-monospace, "Courier New", monospace',
          color: CYAN,
          fontSize: orientation === 'vertical' ? 28 : 38,
          fontWeight: 700,
          background: 'rgba(0,0,0,0.7)',
          border: `2px solid ${CYAN}`,
          padding: '8px 14px',
          letterSpacing: '0.1em',
          boxShadow: `0 0 30px ${CYAN}88, inset 0 0 18px rgba(0,255,240,0.2)`,
        }}
      >
        &gt;&gt; {statText}
      </div>

      {/* Top status bar */}
      <div
        style={{
          position: 'absolute',
          top: orientation === 'vertical' ? 100 : 50,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontFamily: 'ui-monospace, "Courier New", monospace',
          color: '#fff',
          fontSize: orientation === 'vertical' ? 22 : 28,
          fontWeight: 700,
          letterSpacing: '0.4em',
          textShadow: `0 0 16px ${MAGENTA}`,
        }}
      >
        ▌ DECODING SIGNAL ▌
      </div>
    </AbsoluteFill>
  );
};

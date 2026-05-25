import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame } from 'remotion';
import type { RecapBundle } from '../../../EventRecap/data';
import { aie2026MediaPool, defaultKenBurns } from '../../../EventRecap/data';

interface Props {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

/**
 * 0:04 — 0:08. Archival photo reel. Each photo holds ~24 frames, with
 * a 2-frame "tracking interruption" between (pure noise). Title at top
 * narrates "WHAT TRAVELLED" with running theme labels.
 */
export const Archive: React.FC<Props> = ({ bundle, orientation }) => {
  const frame = useCurrentFrame();
  const images = aie2026MediaPool.filter((m) => m.type === 'image');
  const themes = bundle.themes.slice(0, 5);

  const cycleLen = 26;
  const slot = Math.floor(frame / cycleLen) % images.length;
  const cyclePhase = frame % cycleLen;
  const inGlitch = cyclePhase < 2;
  const img = images[slot];

  // Wobble jitter on photo
  const wobbleX = Math.sin(frame * 0.5) * 6;
  const wobbleY = Math.cos(frame * 0.4) * 3;
  // Mini Ken Burns within each slot: slow pan from subjectBox center
  // toward focal across the 26-frame hold.
  const kb = defaultKenBurns(img);
  const slotT = cyclePhase / cycleLen;
  const px = interpolate(slotT, [0, 1], [kb.from.x, kb.to.x]) * 100;
  const py = interpolate(slotT, [0, 1], [kb.from.y, kb.to.y]) * 100;
  const scale = interpolate(slotT, [0, 1], [1.06, 1.12]);

  // Narration line based on current slot
  const themeIdx = slot % themes.length;
  const narration = themes[themeIdx]?.label ?? '';
  const narrationCount = themes[themeIdx]?.postCount ?? 0;

  return (
    <AbsoluteFill style={{ background: '#0a0a08' }}>
      <Img
        src={img.url}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: `${px}% ${py}%`,
          transformOrigin: `${px}% ${py}%`,
          transform: `translate(${wobbleX}px, ${wobbleY}px) scale(${scale})`,
          filter: 'saturate(0.4) contrast(1.0) brightness(0.65) sepia(0.2)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(80,40,10,0.25) 50%, rgba(0,0,0,0.6) 100%)',
        }}
      />

      {/* Tracking interruption */}
      {inGlitch && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              `repeating-linear-gradient(0deg, #000 0 3px, rgba(255,255,255,0.4) 3px 5px, #220 5px 8px)`,
            mixBlendMode: 'difference',
          }}
        />
      )}

      {/* Top counter / index */}
      <div
        style={{
          position: 'absolute',
          top: 30,
          right: 30,
          fontFamily: 'ui-monospace, "Courier New", monospace',
          fontSize: 22,
          fontWeight: 700,
          color: '#ffe4a0',
          textShadow: '2px 2px 0 #000',
          letterSpacing: '0.04em',
        }}
      >
        ARCHIVE #{String(slot + 1).padStart(3, '0')} / {String(images.length).padStart(3, '0')}
      </div>

      {/* Lower band: theme label + count */}
      <div
        style={{
          position: 'absolute',
          left: orientation === 'vertical' ? 30 : 60,
          right: orientation === 'vertical' ? 30 : 60,
          bottom: orientation === 'vertical' ? 200 : 150,
          background: 'rgba(0,0,0,0.85)',
          borderTop: '3px solid #ffe4a0',
          borderBottom: '3px solid #ffe4a0',
          padding: '14px 20px',
          fontFamily: 'ui-monospace, "Courier New", monospace',
          color: '#ffe4a0',
        }}
      >
        <div
          style={{
            fontSize: orientation === 'vertical' ? 16 : 22,
            letterSpacing: '0.24em',
            opacity: 0.8,
            textTransform: 'uppercase',
          }}
        >
          THEME #{themeIdx + 1} · {narrationCount} refs
        </div>
        <div
          style={{
            marginTop: 4,
            fontSize: orientation === 'vertical' ? 30 : 40,
            fontWeight: 700,
            letterSpacing: '0.04em',
            color: '#fff',
            textTransform: 'uppercase',
          }}
        >
          {narration}
        </div>
      </div>

      {/* Quote pull (bottom left) */}
      <div
        style={{
          position: 'absolute',
          left: orientation === 'vertical' ? 30 : 60,
          right: orientation === 'vertical' ? 30 : 60,
          bottom: orientation === 'vertical' ? 80 : 60,
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontStyle: 'italic',
          fontSize: orientation === 'vertical' ? 20 : 26,
          color: '#fff',
          opacity: 0.85,
          textShadow: '2px 2px 0 #000',
        }}
      >
        &ldquo;{bundle.voices[slot % bundle.voices.length]?.sampleQuote ?? ''}&rdquo;
      </div>
    </AbsoluteFill>
  );
};

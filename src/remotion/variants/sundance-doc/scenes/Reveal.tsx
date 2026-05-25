import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame } from 'remotion';
import type { RecapBundle } from '../../../EventRecap/data';
import { aie2026MediaPool, defaultKenBurns } from '../../../EventRecap/data';

interface Props {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

const fmt = (n: number) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
  return String(n);
};

/**
 * 0:08 — 0:12 reveal. Dim photo backdrop. Big italic 4M typed at top,
 * smaller "what 872 refs travelled" beneath, event name + dates at bottom.
 * Everything drifts very slowly. Letterbox stays.
 */
export const Reveal: React.FC<Props> = ({ bundle, orientation }) => {
  const frame = useCurrentFrame();
  // Wide group/crowd image as backdrop
  const photo = aie2026MediaPool[9]; // Linh Nguyen sponsors+booths shot

  const photoOpacity = interpolate(frame, [0, 30], [0, 0.55], { extrapolateRight: 'clamp' });
  // Slow Ken Burns drift across the crowd shot — the big stat sits over
  // a moving plate instead of a static one.
  const kb = defaultKenBurns(photo);
  const t = interpolate(frame, [0, 120], [0, 1]);
  const px = interpolate(t, [0, 1], [kb.from.x, kb.to.x]) * 100;
  const py = interpolate(t, [0, 1], [kb.from.y, kb.to.y]) * 100;
  const scale = interpolate(t, [0, 1], [1.0, 1.07]);

  // Big number fade-in
  const numOpacity = interpolate(frame, [10, 35], [0, 1], { extrapolateRight: 'clamp' });
  const numTranslate = interpolate(frame, [10, 35], [12, 0], { extrapolateRight: 'clamp' });
  // Refs line
  const refsOpacity = interpolate(frame, [35, 60], [0, 1], { extrapolateRight: 'clamp' });
  // Title block at bottom
  const titleOpacity = interpolate(frame, [55, 80], [0, 1], { extrapolateRight: 'clamp' });
  // Final fade-out
  const finalFade = interpolate(frame, [105, 120], [1, 0], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: '#000', opacity: finalFade }}>
      <Img
        src={photo.url}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: `${px}% ${py}%`,
          transformOrigin: `${px}% ${py}%`,
          opacity: photoOpacity,
          transform: `scale(${scale})`,
          filter: 'brightness(0.55) contrast(0.92) saturate(0.6) sepia(0.05)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at 50% 35%, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.7) 100%)',
        }}
      />

      {/* Big italic number */}
      <div
        style={{
          position: 'absolute',
          top: orientation === 'vertical' ? '20%' : '22%',
          left: 0,
          right: 0,
          textAlign: 'center',
          color: '#f4ede0',
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontStyle: 'italic',
          fontSize: orientation === 'vertical' ? 280 : 360,
          fontWeight: 400,
          lineHeight: 0.95,
          letterSpacing: '-0.03em',
          opacity: numOpacity,
          transform: `translateY(${numTranslate}px)`,
          textShadow: '0 4px 32px rgba(0,0,0,0.9)',
        }}
      >
        {fmt(bundle.stats.knownViews)}
      </div>
      <div
        style={{
          position: 'absolute',
          top: orientation === 'vertical' ? '50%' : '58%',
          left: 0,
          right: 0,
          textAlign: 'center',
          color: '#d8cdb8',
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontStyle: 'italic',
          fontSize: orientation === 'vertical' ? 34 : 42,
          opacity: refsOpacity,
          textShadow: '0 2px 16px rgba(0,0,0,0.9)',
        }}
      >
        — what {bundle.stats.refs} references travelled —
      </div>

      {/* Bottom titling */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: orientation === 'vertical' ? 140 : 130,
          textAlign: 'center',
          color: '#f4ede0',
          fontFamily: 'Georgia, "Times New Roman", serif',
          opacity: titleOpacity,
        }}
      >
        <div
          style={{
            fontStyle: 'italic',
            fontSize: orientation === 'vertical' ? 58 : 72,
            letterSpacing: '-0.01em',
            textShadow: '0 4px 24px rgba(0,0,0,0.9)',
          }}
        >
          {bundle.eventName}
        </div>
        <div
          style={{
            marginTop: 14,
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: orientation === 'vertical' ? 18 : 22,
            letterSpacing: '0.32em',
            textTransform: 'uppercase',
            color: '#a89c87',
          }}
        >
          {bundle.dates}
        </div>
      </div>
    </AbsoluteFill>
  );
};

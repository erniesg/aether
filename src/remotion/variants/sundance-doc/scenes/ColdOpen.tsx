import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame } from 'remotion';
import type { RecapBundle } from '../../../EventRecap/data';
import { aie2026MediaPool, defaultKenBurns } from '../../../EventRecap/data';

interface Props {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

/**
 * 0:00 — 0:04 cold open. Black holds 18 frames, then a single photo
 * fades in over 30 frames with very slow ken-burns. Vivian's pull-quote
 * types in starting at frame 30, finishing by frame 90, holds.
 */
export const ColdOpen: React.FC<Props> = ({ bundle, orientation }) => {
  const frame = useCurrentFrame();
  // First photo of Vivian (index 10 in the pool — actual portrait of him)
  const photo = aie2026MediaPool[10];

  const photoOpacity = interpolate(frame, [18, 60], [0, 0.85], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  // Ken Burns: slow drift from wide subject-box framing toward the focal
  // face. 4s scene = 120 frames; pan + zoom in lockstep with the fade-in.
  const kb = defaultKenBurns(photo);
  const t = interpolate(frame, [0, 120], [0, 1]);
  const px = interpolate(t, [0, 1], [kb.from.x, kb.to.x]) * 100;
  const py = interpolate(t, [0, 1], [kb.from.y, kb.to.y]) * 100;
  const scale = interpolate(t, [0, 1], [kb.from.scale, kb.to.scale]);

  // Vivian quote
  const quote = bundle.voices[0]?.sampleQuote ?? 'You cannot govern a technology you have only been briefed on.';
  // Type-in: 1 char per 1.2 frames starting at frame 30
  const charsShown = Math.max(0, Math.min(quote.length, Math.floor((frame - 30) / 1.0)));
  const visibleQuote = quote.slice(0, charsShown);

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <Img
        src={photo.url}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: `${px}% ${py}%`,
          transform: `scale(${scale})`,
          transformOrigin: `${px}% ${py}%`,
          opacity: photoOpacity,
          filter: 'brightness(0.75) contrast(0.95) saturate(0.78)',
        }}
      />
      {/* Soft natural-light vignette */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 0%, rgba(0,0,0,0.45) 70%, rgba(0,0,0,0.75) 100%)',
        }}
      />
      {/* Lower-third pull-quote */}
      <div
        style={{
          position: 'absolute',
          left: orientation === 'vertical' ? 80 : 160,
          right: orientation === 'vertical' ? 80 : 160,
          bottom: orientation === 'vertical' ? 200 : 180,
          color: '#f4ede0',
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontStyle: 'italic',
          fontSize: orientation === 'vertical' ? 48 : 60,
          lineHeight: 1.25,
          letterSpacing: '-0.01em',
          textShadow: '0 4px 24px rgba(0,0,0,0.95), 0 0 1px rgba(0,0,0,1)',
          opacity: interpolate(frame, [24, 40], [0, 1], { extrapolateRight: 'clamp' }),
        }}
      >
        &ldquo;{visibleQuote}
        {charsShown < quote.length && (
          <span style={{ opacity: (frame % 30) < 15 ? 1 : 0 }}>|</span>
        )}
        {charsShown >= quote.length && '"'}
      </div>
      {/* Attribution under quote */}
      <div
        style={{
          position: 'absolute',
          left: orientation === 'vertical' ? 80 : 160,
          bottom: orientation === 'vertical' ? 140 : 130,
          color: '#a89c87',
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: orientation === 'vertical' ? 22 : 28,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          opacity: interpolate(frame, [90, 110], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        }}
      >
        — Dr. Vivian Balakrishnan
      </div>
    </AbsoluteFill>
  );
};

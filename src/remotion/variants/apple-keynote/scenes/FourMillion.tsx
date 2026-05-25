import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import type { RecapBundle } from '../../../EventRecap/data';

interface Props {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * 0:04 — 0:08. "Four million views." Pure black with the line
 * appearing word-by-word, then three soft thin bars beneath. Apple
 * keynote restraint — no rapid cuts, no photos at all.
 */
export const FourMillion: React.FC<Props> = ({ bundle, orientation }) => {
  const frame = useCurrentFrame();

  // Three words: "Four" "million" "views."
  const words = ['Four', 'million', 'views.'];
  const wordStart = [4, 18, 32];
  const wordDur = 24;

  const barProgress = interpolate(frame, [60, 100], [0, 1], { extrapolateRight: 'clamp', easing: easeInOutCubic });

  const exitFade = interpolate(frame, [110, 120], [1, 0], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: '#000', opacity: exitFade }}>
      {/* Subtle radial gradient for cinematic vignette */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at 50% 45%, rgba(40,40,55,0.15) 0%, rgba(0,0,0,0.0) 70%)',
        }}
      />

      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontFamily: '-apple-system, "SF Pro Display", Inter, sans-serif',
          gap: 60,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: orientation === 'vertical' ? 22 : 28,
            fontSize: orientation === 'vertical' ? 130 : 180,
            fontWeight: 600,
            letterSpacing: '-0.04em',
            lineHeight: 1,
            textAlign: 'center',
            maxWidth: orientation === 'vertical' ? 900 : 1400,
          }}
        >
          {words.map((w, i) => {
            const op = interpolate(frame, [wordStart[i], wordStart[i] + wordDur], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              easing: easeInOutCubic,
            });
            const y = interpolate(op, [0, 1], [16, 0]);
            return (
              <span
                key={w}
                style={{
                  opacity: op,
                  transform: `translateY(${y}px)`,
                  display: 'inline-block',
                }}
              >
                {w}
              </span>
            );
          })}
        </div>

        {/* Three thin bars: X / YouTube / LinkedIn */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
            width: orientation === 'vertical' ? 720 : 900,
            fontFamily: '-apple-system, "SF Pro Display", Inter, sans-serif',
          }}
        >
          {[
            { label: 'X', value: '2.7M', share: 0.68 },
            { label: 'YouTube', value: '1.3M', share: 0.33 },
            { label: 'LinkedIn', value: '36.8K reactions', share: 0.05 },
          ].map((row, i) => {
            const stagger = i * 8;
            const fill = interpolate(barProgress * 100, [stagger, stagger + 35], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              easing: easeInOutCubic,
            });
            const fade = interpolate(barProgress * 100, [stagger, stagger + 12], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            return (
              <div key={row.label} style={{ display: 'flex', flexDirection: 'column', gap: 8, opacity: fade }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: orientation === 'vertical' ? 20 : 24,
                    color: '#cbcbd4',
                    fontWeight: 500,
                    letterSpacing: '-0.005em',
                  }}
                >
                  <span>{row.label}</span>
                  <span style={{ color: '#fff' }}>{row.value}</span>
                </div>
                <div style={{ height: 2, background: 'rgba(255,255,255,0.12)', overflow: 'hidden', borderRadius: 1 }}>
                  <div style={{ height: '100%', width: `${row.share * fill * 100}%`, background: '#fff' }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

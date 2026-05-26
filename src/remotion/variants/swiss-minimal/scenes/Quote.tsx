import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame } from 'remotion';
import type { RecapBundle } from '../../../EventRecap/data';
import { aie2026MediaPool } from '../../../EventRecap/data';
import { faceAwareObjectPosition } from '../../../EventRecap/crop';

interface Props {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

const RED = '#d92d20';
const INK = '#0a0a0a';
const BG = '#fafaf8';

/**
 * 0:08 — 0:12. Pull-quote with grid-based hierarchy. Small portrait
 * (clipped circle), big bold quote, attribution.
 */
export const Quote: React.FC<Props> = ({ bundle, orientation }) => {
  const frame = useCurrentFrame();

  const photo = aie2026MediaPool[10]; // Vivian
  const quote = bundle.voices[0]?.sampleQuote ?? 'You cannot govern a technology you have only been briefed on.';

  const photoOpacity = interpolate(frame, [4, 22], [0, 1], { extrapolateRight: 'clamp' });
  const numberOpacity = interpolate(frame, [10, 26], [0, 1], { extrapolateRight: 'clamp' });
  const quoteOpacity = interpolate(frame, [20, 42], [0, 1], { extrapolateRight: 'clamp' });
  const attribOpacity = interpolate(frame, [42, 60], [0, 1], { extrapolateRight: 'clamp' });
  const footerOpacity = interpolate(frame, [70, 95], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: BG, color: INK, fontFamily: 'Inter, Helvetica, sans-serif' }}>
      <div
        style={{
          position: 'absolute',
          inset: orientation === 'vertical' ? '80px 60px' : '70px 120px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div
            style={{
              fontSize: orientation === 'vertical' ? 14 : 18,
              letterSpacing: '0.32em',
              fontWeight: 500,
            }}
          >
            FIG.&thinsp;02 · DIRECT QUOTE
          </div>
          <div
            style={{
              fontSize: orientation === 'vertical' ? 14 : 18,
              letterSpacing: '0.18em',
              color: '#6b6963',
              textAlign: 'right',
            }}
          >
            REACH 30.0 · X · MAY 18
          </div>
        </div>

        {/* Centre column */}
        <div style={{ display: 'flex', flexDirection: orientation === 'vertical' ? 'column' : 'row', gap: 30, alignItems: 'flex-start' }}>
          {/* Portrait in circle */}
          <div
            style={{
              width: orientation === 'vertical' ? 200 : 240,
              height: orientation === 'vertical' ? 200 : 240,
              borderRadius: '50%',
              overflow: 'hidden',
              flexShrink: 0,
              opacity: photoOpacity,
              border: `4px solid ${RED}`,
            }}
          >
            <Img
              src={photo.url}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: faceAwareObjectPosition(photo, 1, 0),
                filter: 'grayscale(1) contrast(1.05)',
              }}
            />
          </div>

          {/* Quote block */}
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: orientation === 'vertical' ? 130 : 160,
                fontWeight: 800,
                lineHeight: 0.9,
                letterSpacing: '-0.04em',
                color: RED,
                opacity: numberOpacity,
                marginBottom: 8,
              }}
            >
              &ldquo;
            </div>
            <div
              style={{
                fontSize: orientation === 'vertical' ? 40 : 60,
                fontWeight: 800,
                letterSpacing: '-0.025em',
                lineHeight: 1.05,
                color: INK,
                opacity: quoteOpacity,
                marginBottom: 24,
                maxWidth: orientation === 'vertical' ? '100%' : 900,
              }}
            >
              {quote.toUpperCase()}
            </div>
            <div
              style={{
                fontSize: orientation === 'vertical' ? 16 : 22,
                letterSpacing: '0.18em',
                fontWeight: 500,
                color: INK,
                opacity: attribOpacity,
                textTransform: 'uppercase',
              }}
            >
              — DR. VIVIAN BALAKRISHNAN
              <br />
              <span style={{ color: '#6b6963' }}>FOREIGN MINISTER · SINGAPORE</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            opacity: footerOpacity,
          }}
        >
          <div
            style={{
              fontSize: orientation === 'vertical' ? 14 : 18,
              letterSpacing: '0.32em',
              color: RED,
              fontWeight: 500,
            }}
          >
            ▮ VOL.&thinsp;01 / END
          </div>
          <div
            style={{
              fontSize: orientation === 'vertical' ? 14 : 18,
              letterSpacing: '0.18em',
              fontWeight: 500,
              color: INK,
            }}
          >
            AETHER.BERLAYAR.AI / VIBES / {bundle.eventId.toUpperCase()}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

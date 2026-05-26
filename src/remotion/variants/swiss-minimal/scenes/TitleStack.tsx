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
 * 0:00 — 0:04. Grid lines visible. "AIE / SG / 26" stacks in left.
 * Right column has a photo clipped into a hard rectangle.
 */
export const TitleStack: React.FC<Props> = ({ bundle, orientation }) => {
  const frame = useCurrentFrame();

  // Grid draws in
  const gridProgress = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: 'clamp' });

  // Stack appears letter by letter
  const stackParts = ['AIE', 'SG', '26'];

  // Photo clip
  const photo = aie2026MediaPool[2]; // De Foe portrait
  const photoOpacity = interpolate(frame, [22, 48], [0, 1], { extrapolateRight: 'clamp' });

  // Grid lines
  const cols = orientation === 'vertical' ? 6 : 12;
  const colGap = 100 / cols;

  return (
    <AbsoluteFill style={{ background: BG, color: INK, fontFamily: 'Inter, Helvetica, sans-serif' }}>
      {/* Grid columns */}
      {Array.from({ length: cols + 1 }).map((_, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${i * colGap}%`,
            width: 1,
            background: '#e8e6e0',
            transform: `scaleY(${gridProgress})`,
            transformOrigin: 'top',
            opacity: 0.85,
          }}
        />
      ))}
      {/* Padded inner */}
      <div
        style={{
          position: 'absolute',
          inset: orientation === 'vertical' ? '90px 60px' : '80px 120px',
          display: 'flex',
          flexDirection: orientation === 'vertical' ? 'column' : 'row',
          gap: orientation === 'vertical' ? 40 : 60,
        }}
      >
        {/* Left column — title stack */}
        <div
          style={{
            flex: orientation === 'vertical' ? '0 0 auto' : '0 0 45%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-start',
            gap: 0,
          }}
        >
          <div
            style={{
              fontSize: orientation === 'vertical' ? 14 : 18,
              letterSpacing: '0.32em',
              fontWeight: 500,
              color: INK,
              opacity: interpolate(frame, [10, 22], [0, 1], { extrapolateRight: 'clamp' }),
              marginBottom: 22,
            }}
          >
            005 / 010 — AI ENGINEER
          </div>
          {stackParts.map((part, i) => {
            const start = 14 + i * 8;
            const op = interpolate(frame, [start, start + 16], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            const x = interpolate(op, [0, 1], [-22, 0]);
            const isAccent = part === 'SG';
            return (
              <div
                key={part}
                style={{
                  fontSize: orientation === 'vertical' ? 240 : 320,
                  fontWeight: 800,
                  lineHeight: 0.86,
                  letterSpacing: '-0.05em',
                  color: isAccent ? RED : INK,
                  opacity: op,
                  transform: `translateX(${x}px)`,
                }}
              >
                {part}
                {i < 2 && (
                  <span style={{ color: '#bcbab2', fontWeight: 400, fontSize: '0.5em', marginLeft: 12 }}>/</span>
                )}
              </div>
            );
          })}
          <div
            style={{
              marginTop: 30,
              fontSize: orientation === 'vertical' ? 16 : 22,
              fontWeight: 500,
              letterSpacing: '0.18em',
              color: INK,
              opacity: interpolate(frame, [60, 75], [0, 1], { extrapolateRight: 'clamp' }),
            }}
          >
            17 — 19 / MAY / 2026
            <br />
            PULLMAN + KEMPINSKI
          </div>
        </div>

        {/* Right column — geometric photo */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            position: 'relative',
          }}
        >
          <div
            style={{
              width: orientation === 'vertical' ? 400 : 480,
              height: orientation === 'vertical' ? 540 : 540,
              overflow: 'hidden',
              opacity: photoOpacity,
              borderBottom: `8px solid ${RED}`,
            }}
          >
            <Img
              src={photo.url}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: faceAwareObjectPosition(
                  photo,
                  orientation === 'vertical' ? 400 / 540 : 480 / 540,
                  0
                ),
                filter: 'grayscale(1) contrast(1.05) brightness(0.95)',
              }}
            />
          </div>
        </div>
      </div>

      {/* Bottom-left marker */}
      <div
        style={{
          position: 'absolute',
          left: orientation === 'vertical' ? 60 : 120,
          bottom: 50,
          fontSize: orientation === 'vertical' ? 14 : 18,
          letterSpacing: '0.28em',
          color: RED,
          fontWeight: 500,
        }}
      >
        ▮ VOL.&thinsp;01
      </div>
      <div
        style={{
          position: 'absolute',
          right: orientation === 'vertical' ? 60 : 120,
          bottom: 50,
          fontSize: orientation === 'vertical' ? 14 : 18,
          letterSpacing: '0.18em',
          color: INK,
          fontWeight: 500,
        }}
      >
        AETHER.BERLAYAR.AI / VIBES / AIE2026
      </div>
    </AbsoluteFill>
  );
};

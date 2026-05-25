import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { theme } from '../theme';
import type { RecapBundle } from '../data';
import { aie2026MediaPool } from '../data';
import { MediaBackdrop } from '../components/MediaBackdrop';

interface Props {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

/**
 * Scene · 9s · "Voices". 5 real LinkedIn / X quotes cycle every ~1.6s,
 * each with author initial badge + name + handle + platform chip. Photos
 * cross-cut behind the whole time so the energy never flatlines.
 */
export const VoiceMontage: React.FC<Props> = ({ bundle, orientation }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const voices = bundle.voices;
  const HOLD = 48; // ~1.6s per quote
  const slot = Math.floor(frame / HOLD) % voices.length;
  const slotFrame = frame % HOLD;

  const cardIn = interpolate(slotFrame, [0, 14], [0, 1], {
    extrapolateRight: 'clamp',
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });
  const cardOut = interpolate(slotFrame, [HOLD - 10, HOLD], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const opacity = cardIn * cardOut;
  const translateY = interpolate(cardIn, [0, 1], [40, 0]);

  const headOpacity = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: 'clamp' });
  const exit = interpolate(frame, [durationInFrames - 14, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const vert = orientation === 'vertical';
  const v = voices[slot];
  const platformChip = v.platform === 'x' ? 'X' : v.platform === 'linkedin' ? 'LinkedIn' : 'YouTube';
  const platformColor = v.platform === 'x' ? '#000' : v.platform === 'linkedin' ? '#0a66c2' : '#cc0000';

  return (
    <AbsoluteFill style={{ background: '#000', opacity: exit }}>
      <MediaBackdrop pool={aie2026MediaPool} holdFrames={28} tintOpacity={0.78} kenBurns={0.1} startIndex={2} />

      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: vert ? '120px 56px' : '120px 144px',
          fontFamily: theme.sans,
        }}
      >
        {/* section label up top */}
        <div
          style={{
            position: 'absolute',
            top: vert ? 80 : 60,
            left: vert ? 56 : 96,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            opacity: headOpacity,
            color: '#fff',
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: theme.accent,
              boxShadow: `0 0 0 8px rgba(222,115,64,0.18)`,
            }}
          />
          <span
            style={{
              fontFamily: theme.mono,
              fontSize: vert ? 14 : 18,
              textTransform: 'uppercase',
              letterSpacing: '0.28em',
              color: theme.accent,
            }}
          >
            Voices · 5 of {bundle.stats.refs}
          </span>
        </div>

        {/* progress dots — show which voice is active */}
        <div
          style={{
            position: 'absolute',
            top: vert ? 116 : 100,
            left: vert ? 56 : 96,
            display: 'flex',
            gap: 6,
            opacity: headOpacity,
          }}
        >
          {voices.map((_, i) => (
            <span
              key={i}
              style={{
                width: i === slot ? 24 : 8,
                height: 4,
                background: i === slot ? theme.accent : 'rgba(255,255,255,0.3)',
                transition: 'width 0.2s ease',
              }}
            />
          ))}
        </div>

        {/* the quote card itself */}
        <div
          key={slot}
          style={{
            maxWidth: vert ? '100%' : '70%',
            display: 'flex',
            flexDirection: 'column',
            gap: 28,
            opacity,
            transform: `translateY(${translateY}px)`,
          }}
        >
          {/* avatar + name row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div
              style={{
                width: vert ? 64 : 80,
                height: vert ? 64 : 80,
                borderRadius: 999,
                background: `linear-gradient(135deg, ${theme.accent}, #4a2814)`,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: theme.serif,
                fontSize: vert ? 32 : 42,
                border: `3px solid ${theme.accent}`,
                boxShadow: `0 8px 32px rgba(0,0,0,0.6)`,
              }}
            >
              {v.initial}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span
                style={{
                  fontFamily: theme.serif,
                  fontSize: vert ? 32 : 44,
                  color: '#fff',
                  lineHeight: 1,
                  textShadow: '0 2px 12px rgba(0,0,0,0.6)',
                }}
              >
                {v.name}
              </span>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span
                  style={{
                    padding: '3px 8px',
                    background: platformColor,
                    color: '#fff',
                    fontFamily: theme.mono,
                    fontSize: vert ? 10 : 12,
                    textTransform: 'uppercase',
                    letterSpacing: '0.16em',
                  }}
                >
                  {platformChip}
                </span>
                <span
                  style={{
                    fontFamily: theme.mono,
                    fontSize: vert ? 14 : 18,
                    color: 'rgba(255,255,255,0.7)',
                  }}
                >
                  {v.handle}
                </span>
              </div>
            </div>
          </div>

          {/* the quote */}
          <p
            style={{
              margin: 0,
              fontFamily: theme.serif,
              fontSize: vert ? 48 : 60,
              lineHeight: 1.12,
              color: '#fff',
              letterSpacing: '-0.01em',
              textShadow: '0 4px 18px rgba(0,0,0,0.7)',
              borderLeft: `4px solid ${theme.accent}`,
              paddingLeft: vert ? 22 : 32,
            }}
          >
            "{v.sampleQuote}"
          </p>

          <div
            style={{
              fontFamily: theme.mono,
              fontSize: vert ? 13 : 16,
              color: 'rgba(255,255,255,0.6)',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
            }}
          >
            {v.postCount} posts · reach {v.reachScore.toFixed(2)}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

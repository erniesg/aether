import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { theme } from '../theme';
import type { RecapBundle } from '../data';
import { aie2026MediaPool } from '../data';
import { MediaBackdrop } from '../components/MediaBackdrop';
import { pickOverlayPositionForPool, type OverlayCandidate } from '../text-placement';

interface Props {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

/**
 * Scene · 6s · rapid b-roll montage with title slammed across it. Real
 * captured photos flash through behind big bold type. Tells you in
 * 6 seconds: WHO, WHERE, WHEN — without ever holding still.
 */
export const OpeningMontage: React.FC<Props> = ({ bundle, orientation }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  const vert = orientation === 'vertical';
  const aspect = vert ? '9x16' : '16x9';

  // Title stack as a single overlay box. Approximate height: kicker (~36) +
  // gap + wordmark (~200·0.95) + gap + date pill (~50) ≈ 350 vert / 470 horiz.
  // Width: serif "Singapore" at 200/280px ≈ 760/1000 px.
  const stackBox = vert ? { w: 760, h: 350 } : { w: 1100, h: 470 };
  // Candidates in aesthetic-preference order: center first, then descending
  // toward the lower band (which is consistently face-free across the
  // backdrop pool union — most face mass clusters in the middle three rows).
  const candidates: OverlayCandidate[] = vert
    ? [
        { anchor: 'center', boxPx: stackBox },
        { anchor: 'top-center', boxPx: stackBox, offset: { x: 0, y: 80 } },
        { anchor: 'bottom-center', boxPx: stackBox, offset: { x: 0, y: -120 } },
        { anchor: 'bottom-center', boxPx: stackBox, offset: { x: 0, y: -60 } },
      ]
    : [
        { anchor: 'center', boxPx: stackBox },
        { anchor: 'top-center', boxPx: stackBox, offset: { x: 0, y: 60 } },
        { anchor: 'bottom-center', boxPx: stackBox, offset: { x: 0, y: -60 } },
      ];
  const placement = pickOverlayPositionForPool(
    { assetUrls: aie2026MediaPool.map((m) => m.url), aspect, containerPx: { w: width, h: height } },
    candidates,
    0.08
  );

  // big city-name slams in on frame 8 and stays
  const slamIn = interpolate(frame, [6, 14], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: (t) => 1 - Math.pow(1 - t, 4),
  });
  const slamScale = interpolate(slamIn, [0, 1], [1.4, 1]);

  // sub-line crawls in
  const subOpacity = interpolate(frame, [22, 36], [0, 1], { extrapolateRight: 'clamp' });

  const exit = interpolate(frame, [durationInFrames - 14, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ background: '#000', opacity: exit }}>
      {/* rapid backdrop · 12-frame holds = 8 cuts in 6 seconds */}
      <MediaBackdrop pool={aie2026MediaPool} holdFrames={14} tintOpacity={0.55} kenBurns={0.18} />

      {/* foreground type — anchored to a face-clear region via
          pickOverlayPositionForPool() so the wordmark never lands over
          a face mask across any cycling backdrop asset. */}
      {placement.dim && (
        <div
          style={{
            position: 'absolute',
            left: placement.pxX - 40,
            top: placement.pxY - 30,
            width: stackBox.w + 80,
            height: stackBox.h + 60,
            background:
              'radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.45) 60%, rgba(0,0,0,0) 100%)',
            opacity: slamIn,
            pointerEvents: 'none',
          }}
        />
      )}
      <div
        style={{
          position: 'absolute',
          left: placement.pxX,
          top: placement.pxY,
          width: stackBox.w,
          height: stackBox.h,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          gap: 12,
          fontFamily: theme.sans,
        }}
      >
        <span
          style={{
            fontFamily: theme.mono,
            fontSize: vert ? 18 : 24,
            textTransform: 'uppercase',
            letterSpacing: '0.36em',
            color: theme.accent,
            opacity: slamIn,
          }}
        >
          AI Engineer
        </span>
        <span
          style={{
            fontFamily: theme.serif,
            fontStyle: 'italic',
            fontSize: vert ? 200 : 280,
            lineHeight: 0.95,
            letterSpacing: '-0.03em',
            transform: `scale(${slamScale})`,
            opacity: slamIn,
            textShadow: '0 8px 32px rgba(0,0,0,0.6)',
          }}
        >
          Singapore
        </span>
        <span
          style={{
            fontFamily: theme.mono,
            fontSize: vert ? 22 : 30,
            textTransform: 'uppercase',
            letterSpacing: '0.24em',
            color: '#fff',
            opacity: subOpacity,
            background: 'rgba(0,0,0,0.5)',
            padding: '8px 20px',
            backdropFilter: 'blur(8px)',
          }}
        >
          {bundle.dates}
        </span>
      </div>
    </AbsoluteFill>
  );
};

import React, { useState } from 'react';
import { AbsoluteFill, OffthreadVideo, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { theme } from '../theme';
import type { RecapBundle } from '../data';

interface Props {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

/**
 * Scene · 7s · the hero moment as a FULL-FRAME clip, not an embedded
 * tweet card. The real keynote video fills the canvas, dims, gets a
 * giant pulled-up quote and X-style engagement counters overlaid like
 * lower-thirds on a news package.
 */
export const MomentClip: React.FC<Props> = ({ bundle, orientation }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const post = bundle.heroMoment;

  const quoteIn = interpolate(frame, [40, 70], [0, 1], { extrapolateRight: 'clamp', easing: (t) => 1 - Math.pow(1 - t, 3) });
  const statsIn = interpolate(frame, [80, 110], [0, 1], { extrapolateRight: 'clamp' });
  const exit = interpolate(frame, [durationInFrames - 14, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const vert = orientation === 'vertical';

  return (
    <AbsoluteFill style={{ background: '#000', opacity: exit }}>
      <VideoWithFallback src={post.media?.url ?? ''} />
      {/* darkening gradient so the text reads */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.85) 100%)',
        }}
      />

      {/* big pull-quote bottom-left */}
      <div
        style={{
          position: 'absolute',
          left: vert ? 56 : 96,
          right: vert ? 56 : 96,
          bottom: vert ? 240 : 200,
          opacity: quoteIn,
          transform: `translateY(${interpolate(quoteIn, [0, 1], [40, 0])}px)`,
        }}
      >
        <p
          style={{
            margin: 0,
            fontFamily: theme.serif,
            fontSize: vert ? 64 : 88,
            lineHeight: 1.05,
            letterSpacing: '-0.015em',
            color: '#fff',
            textShadow: '0 4px 20px rgba(0,0,0,0.9)',
            maxWidth: '24ch',
          }}
        >
          "You cannot govern<br />
          a technology you have<br />
          only been <span style={{ color: theme.accent, fontStyle: 'italic' }}>briefed on</span>."
        </p>
      </div>

      {/* attribution + X stats — stamps in like a lower-third */}
      <div
        style={{
          position: 'absolute',
          left: vert ? 56 : 96,
          bottom: vert ? 88 : 80,
          opacity: statsIn,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <span
          style={{
            fontFamily: theme.mono,
            fontSize: vert ? 14 : 16,
            textTransform: 'uppercase',
            letterSpacing: '0.18em',
            color: theme.accent,
          }}
        >
          Vivian Balakrishnan · Minister for Foreign Affairs
        </span>
        <div
          style={{
            display: 'flex',
            gap: vert ? 24 : 36,
            fontFamily: theme.mono,
            fontSize: vert ? 16 : 22,
            color: '#fff',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          <StatBlock label="views" value="2.2M" />
          <StatBlock label="likes" value="11K" />
          <StatBlock label="reposts" value="2.4K" />
          <StatBlock label="via" value="@MsMelChen" />
        </div>
      </div>
    </AbsoluteFill>
  );
};

const StatBlock: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
    <b style={{ color: '#fff', fontWeight: 600, fontSize: '1.4em' }}>{value}</b>
    <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.65em' }}>{label}</span>
  </span>
);

const VideoWithFallback: React.FC<{ src: string }> = ({ src }) => {
  const [failed, setFailed] = useState(false);
  if (failed || !src) {
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(135deg, #2a1a10 0%, #de7340 100%), radial-gradient(circle at 30% 30%, rgba(255,255,255,0.18), transparent 50%)',
        }}
      />
    );
  }
  return (
    <OffthreadVideo
      src={src}
      muted
      onError={() => setFailed(true)}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
    />
  );
};

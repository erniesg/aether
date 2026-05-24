import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { theme } from '../theme';
import type { RecapBundle } from '../data';
import { XPostCard } from '../components/XPostCard';
import { LowerThird } from '../components/LowerThird';

interface Props {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

/**
 * Scene 3 · 9s · the hero moment. The real X-post card (Melissa Chen's
 * tweet about Vivian's keynote with the playable amplify_video) slides
 * up from the bottom and settles. After ~3s, a pull-quote rises and the
 * lower-third attribution slides in from the left.
 *
 * This is the scene that turns a stat-driven recap into something that
 * feels like a moment — the corpus's loudest single signal, surfaced
 * with its actual footage and a callout that reads cleanly on socials.
 */
export const MomentScene: React.FC<Props> = ({ bundle, orientation }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const post = bundle.heroMoment;

  const cardRise = spring({ frame: frame - 6, fps, config: { damping: 18, stiffness: 80 } });
  const cardOpacity = interpolate(frame, [0, 16], [0, 1], { extrapolateRight: 'clamp' });
  const quoteIn = interpolate(frame, [110, 140], [0, 1], { extrapolateRight: 'clamp', easing: easeOutCubic });
  const quoteY = interpolate(quoteIn, [0, 1], [22, 0]);
  const exit = interpolate(frame, [durationInFrames - 18, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const vert = orientation === 'vertical';

  return (
    <AbsoluteFill
      style={{
        background: 'linear-gradient(135deg, #1a1410 0%, #000 100%)',
        opacity: exit,
        fontFamily: theme.sans,
      }}
    >
      {/* X post card — fills the frame for the first half, scales slightly */}
      <div
        style={{
          position: 'absolute',
          inset: vert ? '120px 56px auto 56px' : '80px 96px auto 96px',
          width: vert ? 'auto' : '46%',
          opacity: cardOpacity,
          transform: `translateY(${interpolate(cardRise, [0, 1], [40, 0])}px)`,
        }}
      >
        <XPostCard post={post} compact={vert ? false : true} />
      </div>

      {/* pull-quote */}
      <div
        style={{
          position: 'absolute',
          left: vert ? 56 : '52%',
          right: vert ? 56 : 96,
          bottom: vert ? 180 : 'auto',
          top: vert ? 'auto' : '20%',
          opacity: quoteIn,
          transform: `translateY(${quoteY}px)`,
        }}
      >
        <p
          style={{
            margin: 0,
            fontFamily: theme.serif,
            fontSize: vert ? 56 : 68,
            lineHeight: 1.08,
            color: '#fff',
            textShadow: '0 2px 14px rgba(0,0,0,0.8)',
            maxWidth: '20ch',
          }}
        >
          "You cannot govern a technology<br />
          you have only been <span style={{ color: theme.accent }}>briefed on</span>."
        </p>
        <p
          style={{
            margin: '18px 0 0',
            fontFamily: theme.mono,
            fontSize: 14,
            textTransform: 'uppercase',
            letterSpacing: '0.16em',
            color: theme.accent,
          }}
        >
          Vivian Balakrishnan · keynote · 2.2m views
        </p>
      </div>

      <LowerThird
        eyebrow="scene 03 · keynote"
        name="Vivian Balakrishnan"
        meta="Minister for Foreign Affairs · @vivianbala · 2.1m views"
        delay={150}
      />
    </AbsoluteFill>
  );
};

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

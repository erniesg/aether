import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import type { RecapBundle } from '../../../EventRecap/data';

interface Props {
  bundle: RecapBundle;
  orientation: 'vertical' | 'horizontal';
}

/**
 * 0:08 — 0:12. END REC stamp on solid black; sponsor names typewriter
 * scroll on the right side.
 */
export const EndRec: React.FC<Props> = ({ bundle, orientation }) => {
  const frame = useCurrentFrame();

  const sponsors = bundle.sponsors.slice(0, 12).map((s) => s.brand);
  // Typewriter scroll: chars-per-second
  const fullText = sponsors.join('  ·  ');
  const charsShown = Math.max(0, Math.min(fullText.length, Math.floor((frame - 24) / 0.9)));
  const visible = fullText.slice(0, charsShown);

  const endRecOpacity = interpolate(frame, [0, 16], [0, 1], { extrapolateRight: 'clamp' });
  const endRecScale = interpolate(frame, [0, 16], [0.94, 1.0], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: '#0a0a08' }}>
      {/* Wash gradient */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at center, rgba(80,40,10,0.25) 0%, rgba(0,0,0,0.9) 80%)',
        }}
      />

      {/* END REC main */}
      <div
        style={{
          position: 'absolute',
          top: orientation === 'vertical' ? '12%' : '14%',
          left: 0,
          right: 0,
          textAlign: 'center',
          opacity: endRecOpacity,
          transform: `scale(${endRecScale})`,
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            gap: 16,
            alignItems: 'center',
            background: 'rgba(255,228,160,0.95)',
            color: '#1a0e00',
            padding: '20px 28px',
            border: '4px solid #1a0e00',
            fontFamily: 'ui-monospace, "Courier New", monospace',
            fontSize: orientation === 'vertical' ? 50 : 70,
            fontWeight: 700,
            letterSpacing: '0.16em',
          }}
        >
          ■&nbsp;&nbsp;END REC.
        </div>
      </div>

      {/* Tape metadata block */}
      <div
        style={{
          position: 'absolute',
          top: orientation === 'vertical' ? '28%' : '34%',
          left: 0,
          right: 0,
          textAlign: 'center',
          fontFamily: 'ui-monospace, "Courier New", monospace',
          color: '#ffe4a0',
          fontSize: orientation === 'vertical' ? 22 : 30,
          letterSpacing: '0.18em',
          opacity: interpolate(frame, [10, 26], [0, 1], { extrapolateRight: 'clamp' }),
          textShadow: '2px 2px 0 #000',
          textTransform: 'uppercase',
        }}
      >
        TAPE 01 · 12:00 · {bundle.stats.refs} REFS
        <br />
        <span style={{ color: '#fff', fontSize: '1.4em', marginTop: 12, display: 'inline-block' }}>
          {bundle.eventName.toUpperCase()}
        </span>
      </div>

      {/* Sponsor scroll */}
      <div
        style={{
          position: 'absolute',
          left: orientation === 'vertical' ? 40 : 80,
          right: orientation === 'vertical' ? 40 : 80,
          bottom: orientation === 'vertical' ? 200 : 160,
          fontFamily: 'ui-monospace, "Courier New", monospace',
          color: '#ffe4a0',
          fontSize: orientation === 'vertical' ? 24 : 32,
          fontWeight: 700,
          letterSpacing: '0.06em',
          lineHeight: 1.5,
          textTransform: 'uppercase',
          background: 'rgba(0,0,0,0.7)',
          padding: '14px 18px',
          border: '2px solid #ffe4a0',
          textShadow: '2px 2px 0 #000',
        }}
      >
        <div style={{ fontSize: '0.6em', opacity: 0.7, marginBottom: 6 }}>&gt; CAPTURE_LOG.TXT</div>
        {visible}
        {charsShown < fullText.length && <span style={{ opacity: (frame % 30) < 15 ? 1 : 0 }}>_</span>}
      </div>

      {/* URL */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: orientation === 'vertical' ? 80 : 60,
          textAlign: 'center',
          fontFamily: 'ui-monospace, "Courier New", monospace',
          fontSize: orientation === 'vertical' ? 20 : 26,
          fontWeight: 700,
          color: '#fff',
          letterSpacing: '0.2em',
          textShadow: '2px 2px 0 #000',
          opacity: interpolate(frame, [80, 100], [0, 1], { extrapolateRight: 'clamp' }),
        }}
      >
        ▸ aether.berlayar.ai/vibes/{bundle.eventId}
      </div>
    </AbsoluteFill>
  );
};

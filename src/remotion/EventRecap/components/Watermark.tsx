import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { theme } from '../theme';

interface Props {
  eventId: string;
  version?: string;
  /** Display the live elapsed time / total time. */
  showTimer?: boolean;
}

/**
 * Persistent corner badge — pinned top-right of every scene. Same role as
 * the .watermark element in the HTML mock. Includes a live timer rendered
 * from useCurrentFrame so editors can see the playhead in studio.
 */
export const Watermark: React.FC<Props> = ({ eventId, version = 'v1.0', showTimer = true }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const elapsedSec = frame / fps;
  const totalSec = durationInFrames / fps;
  return (
    <div
      style={{
        position: 'absolute',
        right: 28,
        top: 28,
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 8,
        pointerEvents: 'none',
        fontFamily: theme.mono,
      }}
    >
      <span
        style={{
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.25)',
          color: '#fff',
          padding: '5px 12px',
          fontSize: 13,
          textTransform: 'uppercase',
          letterSpacing: '0.16em',
          backdropFilter: 'blur(6px)',
        }}
      >
        {eventId} · recap
      </span>
      {showTimer && (
        <span
          style={{
            color: 'rgba(255,255,255,0.7)',
            fontSize: 12,
            letterSpacing: '0.06em',
          }}
        >
          {version} · {fmt(elapsedSec)} / {fmt(totalSec)}
        </span>
      )}
    </div>
  );
};

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
} from 'remotion';

export const ROUTINE_SCREEN_FPS = 30;
export const ROUTINE_SCREEN_DURATION = 108;

const ROUTINE = [
  'OPEN.',
  'FIND.',
  'COPY.',
  'PASTE.',
  'RANK.',
  'CHART.',
  'DRAFT.',
  'CHECK.',
];

const clamp = {
  extrapolateLeft: 'clamp' as const,
  extrapolateRight: 'clamp' as const,
};

export function RoutineScreenPreview() {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{backgroundColor: '#061321'}}>
      <Img
        src={staticFile('assets/scene-03-pineapple-lamp-start.png')}
        style={{width: '100%', height: '100%', objectFit: 'cover'}}
      />

      {/* Exact deterministic replacement for the green monitor interior. */}
      <div
        style={{
          position: 'absolute',
          left: 468,
          top: 245,
          width: 296,
          height: 207,
          overflow: 'hidden',
          background:
            'radial-gradient(circle at 48% 40%, #102c42 0%, #081b2d 58%, #051321 100%)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 17,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gridTemplateRows: 'repeat(4, 1fr)',
            columnGap: 14,
            rowGap: 7,
          }}
        >
          {ROUTINE.map((word, index) => {
            const start = 7 + index * 7;
            const enter = interpolate(frame, [start, start + 6], [0, 1], {
              ...clamp,
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            });
            const isCurrent = frame >= start && frame < start + 8;

            return (
              <div
                key={word}
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: 10,
                  opacity: enter,
                  transform: `translateY(${(1 - enter) * 10}px)`,
                  color: isCurrent ? '#ffb31a' : '#f3ead8',
                  fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
                  fontSize: 21,
                  fontWeight: 700,
                  letterSpacing: '0.035em',
                  lineHeight: 1,
                  textShadow: '0 2px 10px rgba(0, 0, 0, 0.5)',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    left: 0,
                    width: 3,
                    height: `${12 + enter * 13}px`,
                    backgroundColor: isCurrent ? '#ffb31a' : '#b94635',
                  }}
                />
                {word}
              </div>
            );
          })}
        </div>

        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: interpolate(frame, [0, 107], [-10, 217], clamp),
            height: 1,
            opacity: 0.13,
            backgroundColor: '#dff6ff',
          }}
        />
      </div>

      {/* Restore every non-chroma source pixel above the insert so the
          pineapple's hand and the monitor bezel occlude the typography. */}
      <Img
        src={staticFile('assets/scene-03-pineapple-lamp-foreground.png')}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />
      <Img
        src={staticFile('assets/scene-03-pineapple-foreground.png')}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />
    </AbsoluteFill>
  );
}

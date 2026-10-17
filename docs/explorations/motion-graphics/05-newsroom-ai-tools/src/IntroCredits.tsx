import type {ReactNode} from 'react';
import {
  AbsoluteFill,
  Easing,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from 'remotion';

export const INTRO_CREDITS_FPS = 30;
export const INTRO_DURATION_IN_FRAMES = 90;
export const CREDITS_DURATION_IN_FRAMES = 300;
export const INTRO_CREDITS_DURATION_IN_FRAMES =
  INTRO_DURATION_IN_FRAMES + CREDITS_DURATION_IN_FRAMES;

const clamp = {
  extrapolateLeft: 'clamp' as const,
  extrapolateRight: 'clamp' as const,
};

const arrive = (frame: number, from: number, duration = 16) =>
  interpolate(frame, [from, from + duration], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

const depart = (frame: number, from: number, duration = 10) =>
  interpolate(frame, [from, from + duration], [1, 0], {
    ...clamp,
    easing: Easing.bezier(0.7, 0, 0.84, 0),
  });

const BLUE = '#38589d';
const INK = '#17191d';
const MUTED = '#5d6169';
const DISPLAY = 'Arial Black, Arial, Helvetica, sans-serif';
const BODY = 'Arial, Helvetica, sans-serif';
const MONO = 'Arial Narrow, Arial, Helvetica, sans-serif';

export const CREDITS = [
  'Benjamin Cher',
  'Chen Enjiao (Ernie)',
  'Chloe Lim',
  'Daniel Buenas',
  'David Li Zuowei',
  'Gareth Chung',
  'Ivan Tan',
  'Jeanette Lee',
  'Tessa Oh',
  'Vivien Ang',
  'Yeo Cheng Yong',
];

const SignalFrame = ({children}: {children: ReactNode}) => {
  const frame = useCurrentFrame();
  const wake = arrive(frame, 0, 20);
  const scan = interpolate(frame, [0, 90], [-160, 1240], clamp);

  return (
    <AbsoluteFill style={{background: '#d7d9dc', overflow: 'hidden'}}>
      <Img
        src={staticFile('assets/newsroom-ai-silver-frame.png')}
        style={{height: '100%', width: '100%', objectFit: 'cover'}}
      />
      <div
        style={{
          position: 'absolute',
          inset: '6.2% 2.9% 6.5%',
          background:
            'linear-gradient(108deg, rgba(255,255,255,.2), rgba(255,255,255,0) 38%, rgba(56,88,157,.05))',
          opacity: wake,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: scan,
            height: 2,
            background: BLUE,
            boxShadow: '0 0 22px rgba(56,88,157,.42)',
            opacity: 0.35,
          }}
        />
      </div>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'repeating-linear-gradient(0deg, transparent 0 3px, rgba(10,15,25,.018) 3px 4px)',
          mixBlendMode: 'multiply',
          pointerEvents: 'none',
        }}
      />
      {children}
    </AbsoluteFill>
  );
};

export const NewsroomIntro = () => {
  const frame = useCurrentFrame();
  const kickerIn = arrive(frame, 3, 14);
  const newsroomIn = arrive(frame, 9, 18);
  const aiIn = arrive(frame, 16, 18);
  const toolsIn = arrive(frame, 23, 18);
  const ruleIn = arrive(frame, 30, 16);
  const out = depart(frame, 72, 12);

  return (
    <SignalFrame>
      <AbsoluteFill style={{opacity: out}}>
        <div
          style={{
            position: 'absolute',
            left: 118,
            top: 116,
            color: MUTED,
            fontFamily: MONO,
            fontSize: 24,
            fontWeight: 800,
            letterSpacing: '0.16em',
            opacity: kickerIn,
            textTransform: 'uppercase',
            transform: `translateX(${(1 - kickerIn) * -40}px)`,
          }}
        >
          SPH STAFF AWARDS · INNOVATION AWARD
        </div>

        <div
          style={{
            position: 'absolute',
            left: 118,
            top: 280,
            color: INK,
            fontFamily: DISPLAY,
            fontSize: 156,
            fontWeight: 950,
            letterSpacing: '-0.045em',
            lineHeight: 0.84,
            textTransform: 'uppercase',
          }}
        >
          <div
            style={{
              opacity: newsroomIn,
              transform: `translateX(${(1 - newsroomIn) * -210}px) scaleX(${0.78 + newsroomIn * 0.22})`,
              transformOrigin: 'left center',
            }}
          >
            Newsroom
          </div>
          <div style={{display: 'flex', alignItems: 'baseline', gap: 34}}>
            <span
              style={{
                color: BLUE,
                opacity: aiIn,
                transform: `translateY(${(1 - aiIn) * 90}px) rotate(${(1 - aiIn) * -4}deg)`,
              }}
            >
              AI
            </span>
            <span
              style={{
                opacity: toolsIn,
                transform: `translateX(${(1 - toolsIn) * 240}px)`,
              }}
            >
              Tools
            </span>
          </div>
        </div>

        <div
          style={{
            position: 'absolute',
            left: 118,
            bottom: 118,
            width: 930,
            height: 12,
            background: BLUE,
            transform: `scaleX(${ruleIn})`,
            transformOrigin: 'left center',
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: 122,
            bottom: 108,
            color: MUTED,
            fontFamily: MONO,
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: '0.12em',
            opacity: ruleIn,
            textTransform: 'uppercase',
          }}
        >
          More time for work that matters
        </div>
      </AbsoluteFill>
    </SignalFrame>
  );
};

export const NewsroomCredits = () => {
  const frame = useCurrentFrame();
  const beatLength = 11;
  const nameStart = 22;
  const namesEnd = nameStart + CREDITS.length * beatLength;
  const activeIndex = Math.max(
    0,
    Math.min(CREDITS.length - 1, Math.floor((frame - nameStart) / beatLength))
  );
  const activeName = CREDITS[activeIndex];
  const hit = arrive(frame, nameStart + activeIndex * beatLength, 5);
  const listIn = arrive(frame, namesEnd + 4, 18);
  const listOut = depart(frame, 218, 10);
  const makerIn = arrive(frame, 226, 18);
  const finalFade = depart(frame, 286, 12);
  const showHits = frame >= nameStart && frame < namesEnd + 4;

  return (
    <SignalFrame>
      <AbsoluteFill style={{opacity: finalFade}}>
        <div
          style={{
            position: 'absolute',
            left: 118,
            top: 108,
            color: BLUE,
            fontFamily: MONO,
            fontSize: 24,
            fontWeight: 900,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
          }}
        >
          The team behind BT / Newsroom AI Tools
        </div>

        {showHits ? (
          <div
            style={{
              position: 'absolute',
              left: 118,
              right: 118,
              top: 290,
              color: INK,
              fontFamily: DISPLAY,
              fontSize: activeName.length > 19 ? 118 : 144,
              fontWeight: 950,
              letterSpacing: '-0.045em',
              lineHeight: 0.92,
              opacity: hit,
              textTransform: 'uppercase',
              transform: `translateX(${(1 - hit) * 170}px) scaleX(${1.18 - hit * 0.18})`,
              transformOrigin: 'left center',
            }}
          >
            {activeName}
          </div>
        ) : null}

        <div
          style={{
            position: 'absolute',
            left: 118,
            right: 118,
            top: 190,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            columnGap: 92,
            opacity: listIn * listOut,
            transform: `translateY(${(1 - listIn) * 46}px)`,
          }}
        >
          {[CREDITS.slice(0, 6), CREDITS.slice(6)].map((column, columnIndex) => (
            <div key={columnIndex} style={{display: 'grid'}}>
              {column.map((name, index) => {
                const order = columnIndex === 0 ? index : index + 6;
                const rowIn = arrive(frame, namesEnd + 6 + order * 2, 10);
                return (
                  <div
                    key={name}
                    style={{
                      borderBottom: '2px solid rgba(23,25,29,.18)',
                      color: INK,
                      fontFamily: BODY,
                      fontSize: 35,
                      fontWeight: 800,
                      lineHeight: 1,
                      opacity: rowIn,
                      padding: '20px 0 16px',
                      transform: `translateX(${(1 - rowIn) * (columnIndex ? 36 : -36)}px)`,
                    }}
                  >
                    <span
                      style={{
                        color: BLUE,
                        display: 'inline-block',
                        fontFamily: MONO,
                        fontSize: 18,
                        letterSpacing: '0.08em',
                        marginRight: 20,
                        verticalAlign: 5,
                      }}
                    >
                      {String(order + 1).padStart(2, '0')}
                    </span>
                    {name}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div
          style={{
            position: 'absolute',
            inset: '250px 118px auto',
            color: INK,
            fontFamily: DISPLAY,
            fontSize: 98,
            fontWeight: 950,
            letterSpacing: '-0.04em',
            lineHeight: 0.95,
            opacity: makerIn,
            textTransform: 'uppercase',
            transform: `translateY(${(1 - makerIn) * 70}px)`,
          }}
        >
          Video made with
          <br />
          <span style={{color: BLUE}}>Codex and Seedance</span>
        </div>
        <div
          style={{
            position: 'absolute',
            left: 118,
            bottom: 112,
            width: 520,
            height: 10,
            background: BLUE,
            opacity: makerIn,
            transform: `scaleX(${makerIn})`,
            transformOrigin: 'left center',
          }}
        />
      </AbsoluteFill>
    </SignalFrame>
  );
};

export const IntroCredits = () => (
  <AbsoluteFill style={{background: '#d7d9dc'}}>
    <Sequence durationInFrames={INTRO_DURATION_IN_FRAMES}>
      <NewsroomIntro />
    </Sequence>
    <Sequence
      from={INTRO_DURATION_IN_FRAMES}
      durationInFrames={CREDITS_DURATION_IN_FRAMES}
    >
      <NewsroomCredits />
    </Sequence>
  </AbsoluteFill>
);

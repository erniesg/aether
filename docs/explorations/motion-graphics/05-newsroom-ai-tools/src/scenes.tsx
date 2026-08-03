import type {CSSProperties, ReactNode} from 'react';
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {
  HeadlineStrip,
  MarketSparkline,
  Paper,
  Photo,
  SceneTag,
  SmallLabel,
  Tape,
  beatJitter,
  composedTransform,
  ease,
  editorialEase,
  sceneOpacity,
} from './primitives';
import {THEMES, type VisualStyle} from './theme';

const clamp = {
  extrapolateLeft: 'clamp' as const,
  extrapolateRight: 'clamp' as const,
};

type SceneProps = {
  style: VisualStyle;
  duration: number;
};

const floatingTransform = ({
  style,
  frame,
  delay,
  x,
  y,
  rotate,
  scale = 1,
}: {
  style: VisualStyle;
  frame: number;
  delay: number;
  x: number;
  y: number;
  rotate: number;
  scale?: number;
}) => {
  const progress = ease(frame, delay, delay + 18);
  const jitter = beatJitter(frame + delay, style, 2.6);
  return composedTransform({
    x: x + (1 - progress) * (style === 'kirigami' ? 0 : x > 0 ? 160 : -160) + jitter,
    y: y + (1 - progress) * (style === 'kirigami' ? 120 : -90) - jitter,
    rotate: rotate + (1 - progress) * (style === 'newsprint' ? 4 : 11),
    rotateX: style === 'kirigami' ? (1 - progress) * -84 : 0,
    scale: scale * (0.84 + progress * 0.16),
  });
};

export function OpeningScene({style, duration}: SceneProps) {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const theme = THEMES[style];
  const opacity = sceneOpacity(frame, duration, 4, 8);
  const camera = editorialEase(frame, 0, duration, [1.06, 1.015]);
  const intro1 = ease(frame, 1, 13);
  const intro2 = ease(frame, 47, 62);
  const basePerspective = style === 'kirigami' ? 'perspective(1200px)' : undefined;

  const scraps = [
    {left: -70, top: -90, width: 730, height: 330, rotate: -7, position: '13% 6%'},
    {left: 580, top: -60, width: 690, height: 280, rotate: 5, position: '70% 2%'},
    {left: 1310, top: -65, width: 640, height: 410, rotate: -4, position: '91% 18%'},
    {left: -55, top: 680, width: 730, height: 440, rotate: 4, position: '12% 82%'},
    {left: 560, top: 760, width: 800, height: 370, rotate: -3, position: '52% 92%'},
    {left: 1260, top: 680, width: 720, height: 430, rotate: 7, position: '88% 75%'},
  ];

  return (
    <AbsoluteFill style={{opacity, overflow: 'hidden', perspective: 1500}}>
      <div
        style={{
          position: 'absolute',
          inset: -40,
          transform: `scale(${camera})`,
          transformOrigin: 'center',
        }}
      >
        {scraps.map((scrap, index) => {
          const enter = ease(frame, index * 3, 13 + index * 3);
          const popRotate =
            style === 'kirigami' ? interpolate(enter, [0, 1], [-78, 0]) : 0;
          return (
            <div
              key={scrap.left}
              style={{
                position: 'absolute',
                left: scrap.left,
                top: scrap.top,
                width: scrap.width,
                height: scrap.height,
                transformOrigin: index % 2 ? 'bottom center' : 'top center',
                transform: `${basePerspective ?? ''} translateY(${(1 - enter) * (index % 2 ? 130 : -130)}px) rotate(${scrap.rotate}deg) rotateX(${popRotate}deg)`,
                opacity: enter,
              }}
            >
              <Photo
                src="assets/opening-reference.png"
                style={style}
                objectPosition={scrap.position}
                css={{width: '100%', height: '100%'}}
                imageCss={{transform: 'scale(1.42)'}}
              />
            </div>
          );
        })}
      </div>

      <div
        style={{
          position: 'absolute',
          left: 330,
          top: 340,
          width: 1270,
          transformOrigin: style === 'kirigami' ? 'bottom center' : 'center',
          transform: composedTransform({
            x: (1 - intro1) * -1080,
            y: (1 - intro1) * -40,
            rotate: style === 'scrapbook' ? -1.8 : style === 'newsprint' ? -0.8 : 0,
            rotateX: style === 'kirigami' ? (1 - intro1) * -88 : 0,
            scale: 0.96 + intro1 * 0.04,
          }),
          opacity: intro1,
          zIndex: 20,
        }}
      >
        <HeadlineStrip style={style} dark>
          Every day, the news changes.
        </HeadlineStrip>
        {style === 'scrapbook' ? (
          <>
            <Tape style={style} css={{left: 45, top: -14, transform: 'rotate(-8deg)'}} />
            <Tape style={style} css={{right: 60, bottom: -12, transform: 'rotate(7deg)'}} />
          </>
        ) : null}
      </div>

      <div
        style={{
          position: 'absolute',
          left: 450,
          top: 610,
          width: 1110,
          transformOrigin: style === 'kirigami' ? 'bottom center' : 'center',
          transform: composedTransform({
            x: (1 - intro2) * 1120,
            y: (1 - intro2) * 50,
            rotate: style === 'scrapbook' ? 1.1 : style === 'newsprint' ? 0.7 : 0,
            rotateX: style === 'kirigami' ? (1 - intro2) * -88 : 0,
          }),
          opacity: intro2,
          zIndex: 22,
        }}
      >
        <HeadlineStrip style={style}>
          Somehow, the chores don’t.
        </HeadlineStrip>
      </div>

      <div
        style={{
          position: 'absolute',
          right: 56,
          bottom: 36,
          color: style === 'kirigami' ? theme.paper : theme.ink,
          fontFamily: theme.mono,
          fontSize: 17,
          letterSpacing: '0.16em',
          opacity: 0.72,
          textTransform: 'uppercase',
        }}
      >
        Newsroom AI Tools • Staff Awards 2026
      </div>
    </AbsoluteFill>
  );
}

export function ReaderScene({style, duration}: SceneProps) {
  const frame = useCurrentFrame();
  const theme = THEMES[style];
  const opacity = sceneOpacity(frame, duration);
  const photoIn = ease(frame, 0, 16);
  const chartIn = ease(frame, 13, 48);
  const lineProgress = ease(frame, 28, 85);
  const timePulse = ease(frame, 70, 92);
  const jitter = beatJitter(frame, style, 1.5);
  const popRotate = style === 'kirigami' ? interpolate(photoIn, [0, 1], [-88, 0]) : 0;

  return (
    <AbsoluteFill style={{opacity, overflow: 'hidden', perspective: 1400}}>
      <SceneTag style={style}>01 • What readers see</SceneTag>

      <div
        style={{
          position: 'absolute',
          left: 120,
          top: 130,
          width: 1120,
          height: 760,
          transformOrigin: style === 'kirigami' ? 'bottom center' : 'center',
          transform: composedTransform({
            x: (1 - photoIn) * -480 + jitter,
            y: (1 - photoIn) * 80,
            rotate: style === 'scrapbook' ? -2 : style === 'newsprint' ? -0.8 : 0,
            rotateX: popRotate,
            scale: 0.92 + photoIn * 0.08,
          }),
          opacity: photoIn,
        }}
      >
        <Photo
          src="assets/market-reference.png"
          style={style}
          css={{width: '100%', height: '100%'}}
          imageCss={{
            objectPosition: '55% center',
            transform: 'scale(1.3) translateY(-12%)',
          }}
        />
        <Tape style={style} css={{left: 90, top: -16, transform: 'rotate(-5deg)'}} />
      </div>

      <Paper
        style={style}
        rotate={style === 'scrapbook' ? 2.8 : 0}
        css={{
          position: 'absolute',
          right: 74,
          top: 164,
          width: 760,
          height: 620,
          padding: '70px 58px 54px',
          opacity: chartIn,
          transform: composedTransform({
            x: (1 - chartIn) * 520,
            y: (1 - chartIn) * 40,
            rotate: style === 'scrapbook' ? 2.8 : 0,
            rotateY: style === 'kirigami' ? (1 - chartIn) * 88 : 0,
          }),
          transformOrigin: style === 'kirigami' ? 'left center' : 'center',
        }}
      >
        <SmallLabel style={style}>STI / CATALIST • MARKET CLOSE</SmallLabel>
        <div
          style={{
            fontFamily: theme.headline,
            fontSize: 82,
            fontWeight: 900,
            letterSpacing: '-0.05em',
            lineHeight: 0.94,
            marginTop: 26,
          }}
        >
          Understand the day
          <br />
          <span style={{color: theme.accent}}>in seconds.</span>
        </div>
        <div style={{position: 'absolute', left: 28, bottom: 26}}>
          <MarketSparkline style={style} progress={lineProgress} width={700} height={280} />
        </div>
      </Paper>

      <div
        style={{
          alignItems: 'center',
          background: theme.accent,
          borderRadius: style === 'kirigami' ? 0 : 999,
          bottom: 76,
          color: theme.paper,
          display: 'flex',
          fontFamily: theme.mono,
          fontSize: 23,
          fontWeight: 900,
          gap: 16,
          justifyContent: 'center',
          letterSpacing: '0.08em',
          padding: '20px 30px 17px',
          position: 'absolute',
          right: 160,
          textTransform: 'uppercase',
          transform: `scale(${0.84 + timePulse * 0.16})`,
          opacity: timePulse,
        }}
      >
        <span style={{fontSize: 34}}>↯</span> Reader time: seconds
      </div>
    </AbsoluteFill>
  );
}

const routineWords = ['OPEN', 'FIND', 'COPY', 'PASTE', 'RANK', 'CHART', 'DRAFT', 'CHECK'];

function Bell({style, progress}: {style: VisualStyle; progress: number}) {
  const theme = THEMES[style];
  return (
    <svg width="250" height="260" viewBox="0 0 250 260">
      <path
        d="M42 178 C56 151 66 128 66 89 C66 45 91 20 125 20 C159 20 184 45 184 89 C184 128 194 151 208 178 Z"
        fill={theme.paper}
        stroke={theme.ink}
        strokeWidth="12"
      />
      <rect x="30" y="177" width="190" height="31" rx="8" fill={theme.accent} />
      <circle cx="125" cy="225" r="19" fill={theme.accent2} />
      <path
        d="M19 94 C 3 108, 4 140, 20 153 M231 94 C247 108, 246 140, 230 153"
        fill="none"
        stroke={theme.accent2}
        strokeWidth="12"
        strokeLinecap="round"
        opacity={progress}
      />
    </svg>
  );
}

export function RoutineScene({style, duration}: SceneProps) {
  const frame = useCurrentFrame();
  const theme = THEMES[style];
  const opacity = sceneOpacity(frame, duration, 5, 6);
  const bellIn = ease(frame, 0, 12);
  const why = ease(frame, 48, 67);
  const ring = Math.sin(frame * 1.9) * Math.max(0, 1 - frame / 38) * 7;

  return (
    <AbsoluteFill style={{opacity, overflow: 'hidden', perspective: 1300}}>
      <SceneTag style={style}>02 • Market close</SceneTag>

      <div
        style={{
          left: 96,
          position: 'absolute',
          top: 230,
          transform: composedTransform({
            x: (1 - bellIn) * -220,
            y: (1 - bellIn) * 80,
            rotate: ring,
            rotateX: style === 'kirigami' ? (1 - bellIn) * -80 : 0,
            scale: 0.75 + bellIn * 0.25,
          }),
          transformOrigin: 'bottom center',
          opacity: bellIn,
        }}
      >
        <Bell style={style} progress={bellIn} />
        <SmallLabel
          style={style}
          css={{
            color: style === 'kirigami' ? theme.paper : theme.ink,
            fontSize: 30,
            marginTop: 18,
            textAlign: 'center',
          }}
        >
          SGX CLOSES
        </SmallLabel>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 430,
          right: 50,
          top: 190,
          height: 520,
          display: 'flex',
          flexWrap: 'wrap',
          alignContent: 'center',
          justifyContent: 'center',
          gap: 20,
        }}
      >
        {routineWords.map((word, index) => {
          const inProgress = ease(frame, 4 + index * 5, 16 + index * 5);
          const loopX = ((frame * 8 + index * 185) % 1780) - 120;
          const isCopyPaste = word === 'COPY' || word === 'PASTE';
          return (
            <Paper
              key={word}
              style={style}
              color={isCopyPaste ? theme.accent : index % 3 === 0 ? theme.accent2 : theme.paper}
              rotate={style === 'scrapbook' ? (index % 2 ? 2.2 : -2.8) : 0}
              css={{
                width: 310,
                minHeight: 138,
                alignItems: 'center',
                display: 'flex',
                justifyContent: 'center',
                opacity: inProgress,
                transform:
                  style === 'newsprint'
                    ? `translateX(${(1 - inProgress) * 360}px) rotate(${index % 2 ? 1 : -1}deg)`
                    : style === 'kirigami'
                      ? composedTransform({
                          y: (1 - inProgress) * 100,
                          rotateX: (1 - inProgress) * -86,
                        })
                      : `translate(${(1 - inProgress) * 100 + Math.sin(loopX / 240) * 5}px, ${(1 - inProgress) * -80}px) rotate(${index % 2 ? 2.2 : -2.8}deg)`,
                transformOrigin: 'bottom center',
              }}
            >
              <span
                style={{
                  color: isCopyPaste ? theme.paper : theme.ink,
                  fontFamily: theme.headline,
                  fontSize: 56,
                  fontWeight: 900,
                  letterSpacing: '-0.04em',
                }}
              >
                {word}.
              </span>
            </Paper>
          );
        })}
      </div>

      <HeadlineStrip
        style={style}
        dark
        css={{
          position: 'absolute',
          bottom: 85,
          left: 500,
          width: 1250,
          opacity: why,
          transform: `translateY(${(1 - why) * 110}px) rotate(${style === 'scrapbook' ? -1 : 0}deg)`,
        }}
      >
        Why are we still doing this?
      </HeadlineStrip>
    </AbsoluteFill>
  );
}

function Keycap({
  label,
  style,
  css,
}: {
  label: string;
  style: VisualStyle;
  css?: CSSProperties;
}) {
  const theme = THEMES[style];
  return (
    <div
      style={{
        width: label.length > 1 ? 330 : 220,
        height: 210,
        alignItems: 'center',
        justifyContent: 'center',
        display: 'flex',
        background: theme.paper,
        border: `8px solid ${theme.ink}`,
        boxShadow:
          style === 'kirigami'
            ? `0 25px 0 ${theme.quiet}, 0 45px 65px ${theme.shadow}`
            : `12px 16px 0 ${theme.ink}, 0 34px 52px ${theme.shadow}`,
        fontFamily: theme.mono,
        fontWeight: 900,
        fontSize: label.length > 1 ? 58 : 116,
        borderRadius: style === 'newsprint' ? 0 : 28,
        ...css,
      }}
    >
      {label}
    </div>
  );
}

export function CtrlVScene({style, duration}: SceneProps) {
  const frame = useCurrentFrame();
  const theme = THEMES[style];
  const opacity = sceneOpacity(frame, duration);
  const keysIn = ease(frame, 0, 18);
  const slash = ease(frame, 41, 64);
  const buttonIn = ease(frame, 91, 111);
  const click = ease(frame, 102, 113) - ease(frame, 114, 124);
  const outputIn = ease(frame, 108, 139);
  const chartProgress = ease(frame, 121, 151);
  const jitter = beatJitter(frame, style, 1.8);

  return (
    <AbsoluteFill style={{opacity, overflow: 'hidden', perspective: 1500}}>
      <SceneTag style={style}>03 • Break the loop</SceneTag>

      <div
        style={{
          position: 'absolute',
          left: 110,
          top: 205,
          display: 'flex',
          gap: 84,
          transform: composedTransform({
            x: (1 - keysIn) * -520 + jitter,
            y: (1 - keysIn) * 100,
            rotate: style === 'scrapbook' ? -2 : 0,
            rotateX: style === 'kirigami' ? (1 - keysIn) * -80 : 0,
            scale: 0.8 + keysIn * 0.2,
          }),
          transformOrigin: 'bottom center',
          opacity: keysIn,
        }}
      >
        <Keycap label="CTRL+C" style={style} />
        <Keycap label="CTRL+V" style={style} />
        <svg
          width="800"
          height="340"
          viewBox="0 0 800 340"
          style={{left: -30, pointerEvents: 'none', position: 'absolute', top: -60}}
        >
          <path
            d="M 30 315 C 218 250, 480 108, 760 22"
            fill="none"
            pathLength={1}
            stroke={theme.accent}
            strokeDasharray={1}
            strokeDashoffset={1 - slash}
            strokeLinecap="round"
            strokeWidth="36"
          />
        </svg>
      </div>

      <div
        style={{
          color: style === 'kirigami' ? theme.paper : theme.ink,
          fontFamily: theme.headline,
          fontSize: 86,
          fontWeight: 900,
          left: 110,
          letterSpacing: '-0.055em',
          lineHeight: 0.92,
          position: 'absolute',
          top: 590,
          transform: `translateY(${(1 - slash) * 50}px)`,
          opacity: slash,
        }}
      >
        KILLED THE
        <br />
        <span style={{color: theme.accent}}>COPY–PASTE LOOP.</span>
      </div>

      <Paper
        style={style}
        rotate={style === 'scrapbook' ? 1.6 : 0}
        css={{
          position: 'absolute',
          right: 76,
          top: 148,
          width: 850,
          height: 770,
          padding: '56px 56px 48px',
          transformOrigin: style === 'kirigami' ? 'bottom center' : 'center',
          transform: composedTransform({
            x: (1 - outputIn) * 620,
            y: (1 - outputIn) * 80,
            rotate: style === 'scrapbook' ? 1.6 : 0,
            rotateY: style === 'kirigami' ? (1 - outputIn) * 82 : 0,
          }),
          opacity: outputIn,
        }}
      >
        <button
          type="button"
          style={{
            appearance: 'none',
            background: theme.accent2,
            border: `5px solid ${theme.ink}`,
            boxShadow:
              style === 'kirigami'
                ? `0 ${18 - click * 12}px 0 ${theme.quiet}`
                : `8px ${10 - click * 6}px 0 ${theme.ink}`,
            color: theme.ink,
            fontFamily: theme.mono,
            fontSize: 28,
            fontWeight: 900,
            padding: '20px 26px 17px',
            position: 'relative',
            textTransform: 'uppercase',
            transform: `translateY(${click * 9}px) scale(${0.92 + buttonIn * 0.08})`,
            opacity: buttonIn,
          }}
        >
          ONE CLICK → GENERATE MARKET WRAP
        </button>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.05fr .95fr',
            gap: 30,
            marginTop: 48,
          }}
        >
          <div>
            <SmallLabel style={style}>Editable daily summary</SmallLabel>
            <div
              style={{
                marginTop: 24,
                display: 'grid',
                gap: 16,
              }}
            >
              {[0.92, 0.78, 0.87, 0.66, 0.84, 0.52].map((width, index) => (
                <div
                  key={width}
                  style={{
                    height: index === 0 ? 24 : 14,
                    width: `${width * 100 * outputIn}%`,
                    background: index === 0 ? theme.ink : theme.quiet,
                    opacity: index === 0 ? 1 : 0.46,
                  }}
                />
              ))}
            </div>
          </div>
          <div
            style={{
              alignItems: 'center',
              background: style === 'kirigami' ? '#e0d2b8' : '#ded3bf',
              border: `3px solid ${theme.ink}`,
              display: 'flex',
              justifyContent: 'center',
              minHeight: 350,
            }}
          >
            <MarketSparkline
              style={style}
              progress={chartProgress}
              width={350}
              height={220}
            />
          </div>
        </div>

        <SmallLabel
          style={style}
          css={{
            bottom: 42,
            color: theme.accent,
            fontSize: 22,
            position: 'absolute',
            right: 54,
          }}
        >
          WORKING DRAFT • READY TO EDIT
        </SmallLabel>
      </Paper>
    </AbsoluteFill>
  );
}

function DataDot({
  style,
  progress,
  delay,
  row,
}: {
  style: VisualStyle;
  progress: number;
  delay: number;
  row: number;
}) {
  const theme = THEMES[style];
  const local = interpolate(progress, [delay, Math.min(1, delay + 0.56)], [0, 1], clamp);
  const x = interpolate(local, [0, 0.46, 1], [160, 780, 1450]);
  const y = 245 + row * 92 + Math.sin(local * Math.PI) * -55;
  return (
    <div
      style={{
        position: 'absolute',
        width: 26,
        height: 26,
        borderRadius: style === 'kirigami' ? 2 : 99,
        background: row % 2 ? theme.accent2 : theme.accent,
        border: `4px solid ${theme.ink}`,
        left: x,
        top: y,
        opacity: local > 0 && local < 1 ? 1 : 0,
        transform: `rotate(${local * 220}deg)`,
        zIndex: 30,
      }}
    />
  );
}

export function PipelineScene({style, duration}: SceneProps) {
  const frame = useCurrentFrame();
  const theme = THEMES[style];
  const opacity = sceneOpacity(frame, duration);
  const progress = editorialEase(frame, 0, duration - 8);
  const inputIn = ease(frame, 0, 20);
  const outputIn = ease(frame, 45, 76);
  const humanIn = ease(frame, 88, 112);

  return (
    <AbsoluteFill style={{opacity, overflow: 'hidden', perspective: 1500}}>
      <SceneTag style={style}>04 • Behind the scenes</SceneTag>

      <svg
        width="1920"
        height="1080"
        viewBox="0 0 1920 1080"
        style={{position: 'absolute', inset: 0}}
      >
        {[0, 1, 2, 3].map((row) => (
          <path
            key={row}
            d={`M 285 ${257 + row * 92} C 590 ${180 + row * 95}, 850 ${
              440 + row * 30
            }, 1060 ${330 + row * 86} S 1400 ${255 + row * 96}, 1600 ${265 + row * 90}`}
            fill="none"
            stroke={theme.ink}
            strokeOpacity={0.2}
            strokeWidth={style === 'kirigami' ? 8 : 4}
            strokeDasharray={style === 'scrapbook' ? '14 12' : undefined}
          />
        ))}
      </svg>

      <Paper
        style={style}
        rotate={style === 'scrapbook' ? -2.2 : 0}
        css={{
          position: 'absolute',
          left: 94,
          top: 184,
          width: 390,
          height: 640,
          padding: '44px 38px',
          transform: composedTransform({
            x: (1 - inputIn) * -420,
            rotate: style === 'scrapbook' ? -2.2 : 0,
            rotateY: style === 'kirigami' ? (1 - inputIn) * -84 : 0,
          }),
          transformOrigin: 'right center',
          opacity: inputIn,
        }}
      >
        <SmallLabel style={style}>Live inputs</SmallLabel>
        <div
          style={{
            fontFamily: theme.headline,
            fontSize: 60,
            fontWeight: 900,
            lineHeight: 0.95,
            marginTop: 30,
          }}
        >
          DATA
          <br />
          MONITORING
        </div>
        <div style={{display: 'grid', gap: 17, marginTop: 48}}>
          {['STI', 'NEXT 50', 'BREADTH', 'MOVERS', 'REGION'].map((label, index) => (
            <div
              key={label}
              style={{
                alignItems: 'center',
                display: 'flex',
                gap: 16,
                fontFamily: theme.mono,
                fontSize: 22,
                fontWeight: 900,
              }}
            >
              <span
                style={{
                  width: 18,
                  height: 18,
                  background: index % 2 ? theme.accent2 : theme.accent,
                  borderRadius: style === 'kirigami' ? 2 : 99,
                }}
              />
              {label}
              <span style={{marginLeft: 'auto', color: theme.accent}}>LIVE</span>
            </div>
          ))}
        </div>
      </Paper>

      {[0, 1, 2, 3].map((row) => (
        <DataDot
          key={row}
          style={style}
          progress={progress}
          delay={row * 0.08}
          row={row}
        />
      ))}

      <Paper
        style={style}
        css={{
          position: 'absolute',
          right: 330,
          top: 142,
          width: 610,
          height: 700,
          padding: '48px 46px',
          transformOrigin: style === 'kirigami' ? 'bottom center' : 'center',
          transform: composedTransform({
            x: (1 - outputIn) * 560,
            y: (1 - outputIn) * 80,
            rotate: style === 'scrapbook' ? 1.8 : 0,
            rotateX: style === 'kirigami' ? (1 - outputIn) * -86 : 0,
          }),
          opacity: outputIn,
        }}
      >
        <SmallLabel style={style}>Editable outputs</SmallLabel>
        <div
          style={{
            alignItems: 'center',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 24,
            marginTop: 34,
          }}
        >
          <OutputTile style={style} label="COPY" icon="¶" />
          <OutputTile style={style} label="CHART" icon="↗" />
          <OutputTile style={style} label="PRINT" icon="▤" />
          <OutputTile style={style} label="DIGITAL" icon="▣" />
        </div>
        <div
          style={{
            bottom: 34,
            color: theme.accent,
            fontFamily: theme.mono,
            fontSize: 21,
            fontWeight: 900,
            letterSpacing: '0.08em',
            position: 'absolute',
            textTransform: 'uppercase',
          }}
        >
          EDITABLE • NOT AUTOPUBLISHED
        </div>
      </Paper>

      <div
        style={{
          alignItems: 'center',
          background: theme.accent2,
          border: `7px solid ${theme.ink}`,
          bottom: 72,
          color: theme.ink,
          display: 'flex',
          fontFamily: theme.headline,
          fontSize: 46,
          fontWeight: 900,
          gap: 18,
          justifyContent: 'center',
          padding: '21px 30px 18px',
          position: 'absolute',
          right: 86,
          textTransform: 'uppercase',
          transform: `translateY(${(1 - humanIn) * 90}px) scale(${0.9 + humanIn * 0.1}) rotate(${style === 'scrapbook' ? -2 : 0}deg)`,
          opacity: humanIn,
        }}
      >
        <span style={{fontSize: 56}}>✓</span> HUMANS IN THE LOOP
      </div>
    </AbsoluteFill>
  );
}

function OutputTile({
  style,
  label,
  icon,
}: {
  style: VisualStyle;
  label: string;
  icon: string;
}) {
  const theme = THEMES[style];
  return (
    <div
      style={{
        alignItems: 'center',
        aspectRatio: '1.25',
        background: '#ded3bf',
        border: `4px solid ${theme.ink}`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      <div style={{color: theme.accent, fontSize: 62, fontWeight: 900}}>{icon}</div>
      <SmallLabel style={style} css={{fontSize: 20, marginTop: 12}}>
        {label}
      </SmallLabel>
    </div>
  );
}

export function HumanScene({style, duration}: SceneProps) {
  const frame = useCurrentFrame();
  const theme = THEMES[style];
  const opacity = sceneOpacity(frame, duration);
  const stable = ease(frame, 0, 17);
  const remove = ease(frame, 43, 79);
  const judgement = ease(frame, 67, 91);
  const chores = ['COPY', 'PASTE', 'FORMAT', 'RESIZE', 'REPEAT'];

  return (
    <AbsoluteFill style={{opacity, overflow: 'hidden', perspective: 1400}}>
      <SceneTag style={style}>05 • Keep the journalism</SceneTag>

      <div
        style={{
          color: style === 'kirigami' ? theme.paper : theme.ink,
          fontFamily: theme.headline,
          fontSize: 142,
          fontWeight: 900,
          left: 80,
          letterSpacing: '-0.07em',
          lineHeight: 0.82,
          position: 'absolute',
          top: 210,
          transform: `translateY(${(1 - stable) * 70}px)`,
          opacity: stable,
        }}
      >
        NOT AUTOMATING
        <br />
        <span style={{color: theme.accent}}>JOURNALISM.</span>
      </div>

      <div
        style={{
          color: style === 'kirigami' ? theme.paper : theme.ink,
          fontFamily: theme.body,
          fontSize: 48,
          fontWeight: 700,
          left: 90,
          lineHeight: 1.16,
          position: 'absolute',
          top: 480,
          width: 780,
          opacity: stable,
        }}
      >
        Removing the grunt work
        <br />
        <span style={{fontWeight: 400}}>around it.</span>
      </div>

      <div
        style={{
          position: 'absolute',
          right: 92,
          top: 170,
          width: 780,
          height: 600,
        }}
      >
        {chores.map((chore, index) => {
          const local = interpolate(remove, [index * 0.09, 0.56 + index * 0.09], [0, 1], clamp);
          const direction = index % 2 ? 1 : -1;
          return (
            <Paper
              key={chore}
              style={style}
              color={index === 2 ? theme.accent : theme.paper}
              rotate={style === 'scrapbook' ? direction * (2 + index * 0.5) : 0}
              css={{
                position: 'absolute',
                left: 80 + (index % 2) * 240,
                top: index * 86,
                width: 470,
                height: 124,
                alignItems: 'center',
                display: 'flex',
                justifyContent: 'center',
                opacity: 1 - local,
                transform: composedTransform({
                  x: local * direction * 880,
                  y: local * (index - 2) * 75,
                  rotate:
                    style === 'kirigami'
                      ? local * direction * 68
                      : direction * (2 + index * 0.5) + local * direction * 28,
                  rotateY: style === 'kirigami' ? local * direction * 74 : 0,
                  scale: 1 - local * 0.18,
                }),
              }}
            >
              <span
                style={{
                  color: index === 2 ? theme.paper : theme.ink,
                  fontFamily: theme.mono,
                  fontSize: 47,
                  fontWeight: 900,
                  letterSpacing: '0.08em',
                }}
              >
                {chore}
              </span>
            </Paper>
          );
        })}
      </div>

      <HeadlineStrip
        style={style}
        dark
        css={{
          position: 'absolute',
          bottom: 86,
          left: 180,
          width: 1560,
          opacity: judgement,
          transform: composedTransform({
            y: (1 - judgement) * 120,
            rotate: style === 'scrapbook' ? -1 : 0,
            rotateX: style === 'kirigami' ? (1 - judgement) * -82 : 0,
          }),
          transformOrigin: 'bottom center',
        }}
      >
        AI handles repetition. Journalists make the call.
      </HeadlineStrip>
    </AbsoluteFill>
  );
}

type WorkflowCardProps = {
  style: VisualStyle;
  label: string;
  number: string;
  image?: string;
  progress: number;
  rotate?: number;
  css?: CSSProperties;
  children?: ReactNode;
};

function WorkflowCard({
  style,
  label,
  number,
  image,
  progress,
  rotate = 0,
  css,
  children,
}: WorkflowCardProps) {
  const theme = THEMES[style];
  return (
    <Paper
      style={style}
      rotate={rotate}
      css={{
        width: 390,
        height: 610,
        padding: 24,
        transformOrigin: 'bottom center',
        opacity: progress,
        transform: composedTransform({
          y: (1 - progress) * 420,
          rotate: rotate + (1 - progress) * 8,
          rotateX: style === 'kirigami' ? (1 - progress) * -88 : 0,
          scale: 0.84 + progress * 0.16,
        }),
        ...css,
      }}
    >
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 18,
        }}
      >
        <SmallLabel style={style}>{label}</SmallLabel>
        <span
          style={{
            color: theme.accent,
            fontFamily: theme.headline,
            fontSize: 40,
            fontWeight: 900,
          }}
        >
          {number}
        </span>
      </div>
      <div
        style={{
          background: '#d7cbb5',
          border: `4px solid ${theme.ink}`,
          height: 465,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {image ? (
          <Img
            src={staticFile(image)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter:
                style === 'newsprint'
                  ? 'grayscale(1) contrast(1.28)'
                  : 'saturate(.8) contrast(1.04)',
            }}
          />
        ) : (
          children
        )}
      </div>
      <div
        style={{
          color: theme.quiet,
          fontFamily: theme.mono,
          fontSize: 16,
          letterSpacing: '0.1em',
          marginTop: 18,
          textTransform: 'uppercase',
        }}
      >
        SOURCE → EDITABLE OUTPUT
      </div>
    </Paper>
  );
}

export function ScaleScene({style, duration}: SceneProps) {
  const frame = useCurrentFrame();
  const theme = THEMES[style];
  const opacity = sceneOpacity(frame, duration);
  const title = ease(frame, 0, 17);
  const cardProgress = [0, 1, 2, 3].map((index) =>
    ease(frame, 42 + index * 8, 68 + index * 8)
  );

  return (
    <AbsoluteFill style={{opacity, overflow: 'hidden', perspective: 1500}}>
      <SceneTag style={style}>06 • One idea, scaled</SceneTag>
      <div
        style={{
          color: style === 'kirigami' ? theme.paper : theme.ink,
          fontFamily: theme.headline,
          fontSize: 88,
          fontWeight: 900,
          left: 188,
          letterSpacing: '-0.055em',
          lineHeight: 0.94,
          position: 'absolute',
          textAlign: 'center',
          top: 88,
          width: 1550,
          transform: `translateY(${(1 - title) * -60}px)`,
          opacity: title,
        }}
      >
        ONE SIMPLE IDEA. <span style={{color: theme.accent}}>SCALE IT.</span>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 84,
          right: 84,
          bottom: -70,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
        }}
      >
        <WorkflowCard
          style={style}
          label="EARNINGS"
          number="01"
          progress={cardProgress[0]}
          rotate={style === 'scrapbook' ? -3 : 0}
        >
          <div style={{padding: 28}}>
            <SmallLabel style={style}>RESULTS PDF</SmallLabel>
            <div
              style={{
                color: theme.accent,
                fontFamily: theme.headline,
                fontSize: 82,
                fontWeight: 900,
                marginTop: 28,
              }}
            >
              +18%
            </div>
            <div style={{display: 'grid', gap: 14, marginTop: 30}}>
              {[0.92, 0.7, 0.82, 0.58, 0.76].map((value) => (
                <div
                  key={value}
                  style={{height: 14, width: `${value * 100}%`, background: theme.ink}}
                />
              ))}
            </div>
            <MarketSparkline style={style} progress={cardProgress[0]} width={310} height={180} />
          </div>
        </WorkflowCard>

        <WorkflowCard
          style={style}
          label="STATISTICS"
          number="02"
          image="assets/cpi.png"
          progress={cardProgress[1]}
          rotate={style === 'scrapbook' ? 2 : 0}
        />

        <WorkflowCard
          style={style}
          label="PROPERTY"
          number="03"
          image="assets/househunt.png"
          progress={cardProgress[2]}
          rotate={style === 'scrapbook' ? -1.6 : 0}
        />

        <WorkflowCard
          style={style}
          label="SOCIAL"
          number="04"
          progress={cardProgress[3]}
          rotate={style === 'scrapbook' ? 2.8 : 0}
        >
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: theme.ink,
            }}
          >
            <div
              style={{
                width: 218,
                height: 382,
                background: theme.paper,
                border: `9px solid ${theme.accent}`,
                padding: 18,
              }}
            >
              <div
                style={{
                  height: 188,
                  background: theme.accent2,
                  color: theme.ink,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: theme.headline,
                  fontSize: 58,
                  fontWeight: 900,
                }}
              >
                ↗
              </div>
              <div
                style={{
                  color: theme.ink,
                  fontFamily: theme.headline,
                  fontSize: 27,
                  fontWeight: 900,
                  lineHeight: 0.95,
                  marginTop: 20,
                }}
              >
                STORY,
                <br />
                RESIZED.
              </div>
              <div style={{height: 9, background: theme.accent, marginTop: 20}} />
              <div style={{height: 9, background: theme.ink, marginTop: 9, width: '70%'}} />
            </div>
          </div>
        </WorkflowCard>
      </div>
    </AbsoluteFill>
  );
}

export function EndScene({style, duration}: SceneProps) {
  const frame = useCurrentFrame();
  const theme = THEMES[style];
  const opacity = ease(frame, 0, 7);
  const story = ease(frame, 0, 20);
  const oldStory = ease(frame, 36, 58);
  const logo = ease(frame, 82, 104);
  const final = ease(frame, 108, 132);
  const chart = ease(frame, 70, 122);

  return (
    <AbsoluteFill style={{opacity, overflow: 'hidden', perspective: 1500}}>
      <div
        style={{
          position: 'absolute',
          left: -40,
          top: 130,
          width: 780,
          height: 540,
          transform: floatingTransform({
            style,
            frame,
            delay: 4,
            x: 0,
            y: 0,
            rotate: style === 'scrapbook' ? -6 : -2,
          }),
        }}
      >
        <Photo
          src="assets/market-chart.png"
          style={style}
          css={{width: '100%', height: '100%'}}
        />
      </div>

      <div
        style={{
          position: 'absolute',
          right: -40,
          top: 70,
          width: 690,
          height: 500,
          transform: floatingTransform({
            style,
            frame,
            delay: 10,
            x: 0,
            y: 0,
            rotate: style === 'scrapbook' ? 5 : 2,
          }),
        }}
      >
        <Photo
          src="assets/retail.png"
          style={style}
          css={{width: '100%', height: '100%'}}
        />
      </div>

      <Paper
        style={style}
        color={style === 'kirigami' ? theme.paper : theme.backgroundAlt}
        css={{
          position: 'absolute',
          left: 410,
          top: 180,
          width: 1100,
          height: 670,
          padding: '66px 74px',
          transformOrigin: style === 'kirigami' ? 'bottom center' : 'center',
          transform: composedTransform({
            y: (1 - story) * 120,
            rotate: style === 'scrapbook' ? -0.8 : 0,
            rotateX: style === 'kirigami' ? (1 - story) * -87 : 0,
          }),
          opacity: story,
          zIndex: 20,
        }}
      >
        <div
          style={{
            fontFamily: theme.headline,
            fontSize: 91,
            fontWeight: 900,
            letterSpacing: '-0.065em',
            lineHeight: 0.92,
          }}
        >
          EVERY DAY BRINGS
          <br />A <span style={{color: theme.accent}}>NEW STORY.</span>
        </div>
        <div
          style={{
            fontFamily: theme.body,
            fontSize: 42,
            fontWeight: 700,
            lineHeight: 1.1,
            marginTop: 34,
            opacity: oldStory,
          }}
        >
          The work around it shouldn’t be
          <br />
          <span
            style={{
              color: theme.accent,
              textDecoration: 'line-through',
              textDecorationThickness: 10,
            }}
          >
            the same old story.
          </span>
        </div>
        <div style={{position: 'absolute', bottom: 8, left: 270}}>
          <MarketSparkline style={style} progress={chart} width={750} height={255} />
        </div>
      </Paper>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          alignItems: 'center',
          background:
            style === 'kirigami'
              ? `linear-gradient(120deg, ${theme.backgroundAlt}, ${theme.background})`
              : theme.ink,
          color: theme.paper,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          opacity: logo,
          transform: `scale(${0.94 + logo * 0.06})`,
          zIndex: 50,
        }}
      >
        <div
          style={{
            color: theme.accent2,
            fontFamily: theme.mono,
            fontSize: 23,
            fontWeight: 900,
            letterSpacing: '0.26em',
            marginBottom: 24,
            textTransform: 'uppercase',
          }}
        >
          SPH STAFF AWARDS • INNOVATION AWARD
        </div>
        <div
          style={{
            fontFamily: theme.headline,
            fontSize: 152,
            fontWeight: 900,
            letterSpacing: style === 'newsprint' ? '-0.065em' : '-0.04em',
            lineHeight: 0.84,
            textAlign: 'center',
          }}
        >
          NEWSROOM
          <br />
          <span style={{color: theme.accent}}>AI TOOLS</span>
        </div>
        <div
          style={{
            background: theme.paper,
            color: theme.ink,
            fontFamily: theme.mono,
            fontSize: 30,
            fontWeight: 900,
            letterSpacing: '0.11em',
            marginTop: 58,
            padding: '22px 34px 18px',
            textTransform: 'uppercase',
            transform: `translateY(${(1 - final) * 50}px)`,
            opacity: final,
          }}
        >
          MORE TIME FOR THE WORK THAT MATTERS.
        </div>
      </div>
    </AbsoluteFill>
  );
}

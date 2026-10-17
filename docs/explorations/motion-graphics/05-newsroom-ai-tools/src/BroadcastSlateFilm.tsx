import type {CSSProperties, ReactNode} from 'react';
import {Audio, Video} from '@remotion/media';
import {
  AbsoluteFill,
  Easing,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {BroadcastCaptions} from './BroadcastCaptions';
import {SCENE03_GREEN_QUADS, type Scene03Quad} from './scene03GreenTrack';

export const BROADCAST_FPS = 30;

const INTRO_SECONDS = 2.8;
const VO_DURATION_SECONDS = 44.43425;
const NATIVE_VO_START_SECONDS = 26.44;
const ORIGINAL_RESUME_SECONDS = 30.48;
const NATIVE_DURATION_SECONDS = 8.057;
const NATIVE_START_SECONDS = INTRO_SECONDS + NATIVE_VO_START_SECONDS;
const RESUME_SECONDS = NATIVE_START_SECONDS + NATIVE_DURATION_SECONDS;
const STORY_END_SECONDS =
  RESUME_SECONDS + (VO_DURATION_SECONDS - ORIGINAL_RESUME_SECONDS);
const CREDITS_SECONDS = 8.65;
export const BROADCAST_DURATION_SECONDS = STORY_END_SECONDS + CREDITS_SECONDS;
export const BROADCAST_DURATION_IN_FRAMES = Math.ceil(
  BROADCAST_DURATION_SECONDS * BROADCAST_FPS
);

const COLORS = {
  black: '#101115',
  aperture: '#080a0d',
  white: '#e7e3dc',
  orange: '#f26a48',
  graphite: '#34373d',
  muted: '#97938c',
};

const DISPLAY = 'Arial Black, Arial, Helvetica, sans-serif';
const BODY = 'Arial, Helvetica, sans-serif';
const MONO = 'Courier New, Courier, monospace';

const clamp = {
  extrapolateLeft: 'clamp' as const,
  extrapolateRight: 'clamp' as const,
};

const arrive = (frame: number, from: number, duration = 14) =>
  interpolate(frame, [from, from + duration], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

const secondsToFrames = (seconds: number) =>
  Math.round(seconds * BROADCAST_FPS);

const postNative = (originalSeconds: number) =>
  RESUME_SECONDS + (originalSeconds - ORIGINAL_RESUME_SECONDS);

const Background = () => {
  return (
    <AbsoluteFill style={{background: COLORS.black, overflow: 'hidden'}}>
      <AbsoluteFill
        style={{
          opacity: 0.12,
          backgroundImage:
            'radial-gradient(circle at 20% 15%, rgba(242,106,72,.34), rgba(242,106,72,0) 24%), radial-gradient(circle at 82% 74%, rgba(231,227,220,.12), rgba(231,227,220,0) 30%)',
        }}
      />
    </AbsoluteFill>
  );
};

const Corner = ({position}: {position: 'tl' | 'tr' | 'bl' | 'br'}) => {
  const frame = useCurrentFrame();
  const p = arrive(frame, 2, 12);
  const isRight = position.includes('r');
  const isBottom = position.includes('b');
  return (
    <div
      style={{
        position: 'absolute',
        [isRight ? 'right' : 'left']: 0,
        [isBottom ? 'bottom' : 'top']: 0,
        width: 35,
        height: 35,
        borderColor: 'rgba(231,227,220,.62)',
        borderStyle: 'solid',
        borderWidth: `${isBottom ? 0 : 3}px ${isRight ? 3 : 0}px ${isBottom ? 3 : 0}px ${isRight ? 0 : 3}px`,
        opacity: p,
        transform: `scale(${0.65 + p * 0.35})`,
        transformOrigin: position,
      }}
    />
  );
};

const Aperture = ({
  children,
  scene,
  slug,
  note,
  fullBleed = false,
}: {
  children: ReactNode;
  scene: string;
  slug: string;
  note?: string;
  fullBleed?: boolean;
}) => {
  const frame = useCurrentFrame();
  const shell = arrive(frame, 0, 16);
  const rule = arrive(frame, 5, 20);
  const numeral = arrive(frame, 7, 18);
  return (
    <AbsoluteFill style={{color: COLORS.white, fontFamily: BODY}}>
      <div
        style={{
          position: 'absolute',
          inset: fullBleed ? 0 : '52px 70px 58px',
          border: fullBleed ? 'none' : '1px solid rgba(231,227,220,.2)',
          background: fullBleed ? 'transparent' : COLORS.aperture,
          overflow: 'hidden',
          opacity: shell,
          transform: `scale(${0.985 + shell * 0.015})`,
        }}
      >
        {children}
        {!fullBleed ? (
          <>
            <Corner position="tl" />
            <Corner position="tr" />
            <Corner position="bl" />
            <Corner position="br" />
          </>
        ) : null}
      </div>
      {!fullBleed ? (
        <>
          <div
            style={{
              position: 'absolute',
              left: 92,
              top: 29,
              color: COLORS.orange,
              fontFamily: MONO,
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: '0.16em',
              opacity: rule,
              textTransform: 'uppercase',
            }}
          >
            S{scene} / {slug}
          </div>
          <div
            style={{
              position: 'absolute',
              right: 90,
              top: 27,
              color: COLORS.muted,
              fontFamily: MONO,
              fontSize: 15,
              letterSpacing: '0.12em',
              opacity: rule,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {note ?? 'BT / NEWSROOM AI TOOLS'}
          </div>
        </>
      ) : null}
      {!fullBleed ? <div
        style={{
          position: 'absolute',
          right: 88,
          bottom: 18,
          color: 'rgba(231,227,220,.08)',
          fontFamily: DISPLAY,
          fontSize: 250,
          fontWeight: 900,
          lineHeight: 0.72,
          opacity: numeral,
          WebkitTextFillColor: 'transparent',
          WebkitTextStroke: '2px rgba(231,227,220,.13)',
          transform: `translateX(${(1 - numeral) * 80}px)`,
        }}
      >
        {scene}
      </div> : null}
    </AbsoluteFill>
  );
};

const FootageScene = ({
  src,
  scene,
  slug,
  mediaStart = 0,
  volume = 0.12,
  objectPosition = 'center',
  overlay = true,
  graphic,
}: {
  src: string;
  scene: string;
  slug: string;
  mediaStart?: number;
  volume?: number;
  objectPosition?: string;
  overlay?: boolean;
  graphic?: ReactNode;
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const imageIn = arrive(frame, 2, 18);
  return (
    <Aperture scene={scene} slug={slug} fullBleed>
      <Video
        src={staticFile(src)}
        trimBefore={Math.round(mediaStart * fps)}
        volume={volume}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition,
          opacity: 1,
          transform: `scale(${1.025 - imageIn * 0.025})`,
        }}
      />
      {overlay ? (
        <AbsoluteFill
          style={{
            background:
              'linear-gradient(90deg, rgba(8,10,13,.46), rgba(8,10,13,0) 42%, rgba(8,10,13,.08))',
          }}
        />
      ) : null}
      {graphic}
    </Aperture>
  );
};

const ROUTINE_STEPS = ['OPEN', 'FIND', 'COPY', 'PASTE', 'RANK', 'CHART', 'DRAFT', 'CHECK'];
const ROUTINE_ICONS = ['▣', '⌕', '⧉', '▤', '↕', '↗', '✎', '✓'];

const MONITOR_W = 550;
const MONITOR_H = 370;

// CSS matrix3d pinning the w×h design rect onto the measured screen quad.
const cornerPin = (quad: Scene03Quad, w: number, h: number) => {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = quad;
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3;
  const sy = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (sx * dy2 - dx2 * sy) / den;
  const hh = (dx1 * sy - sx * dy1) / den;
  const a = x1 - x0 + g * x1;
  const b = x3 - x0 + hh * x3;
  const d = y1 - y0 + g * y1;
  const e = y3 - y0 + hh * y3;
  return `matrix3d(${a / w}, ${d / w}, 0, ${g / w}, ${b / h}, ${e / h}, 0, ${hh / h}, 0, 0, 1, 0, ${x0}, ${y0}, 0, 1)`;
};

const MonitorRoutine = () => {
  const frame = useCurrentFrame();
  const stepLength = 8;
  const stepIndex = Math.min(ROUTINE_STEPS.length - 1, Math.floor(frame / stepLength));
  const local = frame - stepIndex * stepLength;
  const hit = interpolate(local, [0, 2, 6, 8], [0.25, 1, 1, 0.25], clamp);
  const sweep = interpolate(frame, [0, 63], [0, 1], clamp);
  const quad =
    SCENE03_GREEN_QUADS[
      Math.min(SCENE03_GREEN_QUADS.length - 1, Math.max(0, frame))
    ];

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: MONITOR_W,
        height: MONITOR_H,
        background: '#0a1116',
        color: COLORS.white,
        fontFamily: MONO,
        overflow: 'hidden',
        transformOrigin: '0 0',
        transform: cornerPin(quad, MONITOR_W, MONITOR_H),
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 26,
          right: 26,
          top: 20,
          display: 'flex',
          color: COLORS.orange,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.16em',
        }}
      >
        <span>DAILY ROUTINE</span>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 26,
          right: 26,
          top: 58,
          display: 'flex',
          gap: 8,
        }}
      >
        {ROUTINE_STEPS.map((step, index) => (
          <div
            key={step}
            style={{
              flex: 1,
              height: 4,
              background: index <= stepIndex ? COLORS.orange : 'rgba(231,227,220,.18)',
            }}
          />
        ))}
      </div>
      <div
        style={{
          position: 'absolute',
          left: 28,
          top: 108,
          fontFamily: DISPLAY,
          fontSize: ROUTINE_STEPS[stepIndex] === 'CHECK' ? 80 : 92,
          fontWeight: 900,
          letterSpacing: '-0.07em',
          lineHeight: 0.8,
          opacity: hit,
          transform: `translateX(${(1 - hit) * 90}px) scaleX(${0.7 + hit * 0.3})`,
          transformOrigin: 'left center',
        }}
      >
        {ROUTINE_STEPS[stepIndex]}<span style={{color: COLORS.orange}}>.</span>
      </div>
      <div
        style={{
          position: 'absolute',
          right: 34,
          top: 96,
          color: COLORS.orange,
          fontFamily: DISPLAY,
          fontSize: 92,
          fontWeight: 900,
          opacity: hit * 0.9,
          transform: `rotate(${(1 - hit) * 18}deg) scale(${0.55 + hit * 0.45})`,
        }}
      >
        {ROUTINE_ICONS[stepIndex]}
      </div>
      <div
        style={{
          position: 'absolute',
          left: 28,
          bottom: 64,
          color: COLORS.muted,
          fontSize: 10,
          letterSpacing: '0.08em',
        }}
      >
        OPEN · FIND · COPY · PASTE · RANK · CHART · DRAFT · CHECK
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          width: '100%',
          height: 12,
          background: COLORS.orange,
          transform: `scaleX(${sweep})`,
          transformOrigin: 'left center',
        }}
      />
    </div>
  );
};

const RoutineMonitorScene = () => {
  const {fps} = useVideoConfig();
  return (
    <Aperture scene="03" slug="MARKET CLOSE / ROUTINE BEGINS" fullBleed>
      <AbsoluteFill style={{background: COLORS.aperture}} />
      <MonitorRoutine />
      <Video
        src={staticFile('assets/broadcast-scene-03-matte.webm')}
        trimBefore={Math.round(0.7 * fps)}
        muted
        style={{width: '100%', height: '100%', objectFit: 'cover'}}
      />
      <Audio
        src={staticFile('assets/broadcast-scene-03.mp4')}
        trimBefore={Math.round(0.7 * fps)}
        volume={0.56}
      />
    </Aperture>
  );
};

const ChromaMonitorScene = () => {
  const {fps} = useVideoConfig();
  const trim = Math.round(0.7 * fps);
  return (
    <Aperture scene="03" slug="MARKET CLOSE / ROUTINE BEGINS" fullBleed>
      <Video
        src={staticFile('assets/broadcast-scene-03-keyed-dark.mp4')}
        trimBefore={trim}
        volume={0.56}
        style={{width: '100%', height: '100%', objectFit: 'cover'}}
      />
      <MonitorRoutine />
    </Aperture>
  );
};

const Intro = () => {
  const frame = useCurrentFrame();
  const kicker = arrive(frame, 4, 13);
  const title = arrive(frame, 11, 18);
  const ai = arrive(frame, 18, 13);
  const tools = arrive(frame, 21, 18);
  const rule = arrive(frame, 30, 18);
  const countIndex = Math.min(2, Math.max(0, Math.floor((frame - 42) / 14)));
  const countLocal = frame - (42 + countIndex * 14);
  const countVisible = frame >= 42;
  const countHit = interpolate(countLocal, [0, 4, 12, 14], [0, 1, 1, 0], clamp);
  const count = ['3', '2', '1'][countIndex];
  return (
    <AbsoluteFill style={{color: COLORS.white, fontFamily: BODY}}>
      <div style={{position: 'absolute', inset: '62px 70px', border: '1px solid rgba(231,227,220,.18)'}}>
        <Corner position="tl" />
        <Corner position="tr" />
        <Corner position="bl" />
        <Corner position="br" />
      </div>
      <div
        style={{
          position: 'absolute',
          left: 96,
          top: 118,
          color: COLORS.orange,
          fontFamily: MONO,
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: '0.2em',
          opacity: kicker,
          transform: `translateX(${(1 - kicker) * -44}px)`,
        }}
      >
        SPH STAFF AWARDS — INNOVATION AWARD
      </div>
      <div
        style={{
          position: 'absolute',
          left: 96,
          top: 304,
          width: 1440,
          fontFamily: DISPLAY,
          fontSize: 142,
          fontWeight: 900,
          letterSpacing: '-0.065em',
          lineHeight: 0.78,
          textTransform: 'uppercase',
        }}
      >
        <div style={{opacity: title, transform: `translateX(${(1 - title) * -180}px)`}}>
          Newsroom
        </div>
        <div
          style={{
            marginTop: 30,
            display: 'flex',
            alignItems: 'baseline',
            gap: 36,
          }}
        >
          <span
            style={{
              color: COLORS.orange,
              opacity: ai,
              transform: `translateY(${(1 - ai) * 90}px) scaleY(${0.62 + ai * 0.38})`,
              transformOrigin: 'bottom center',
            }}
          >
            AI
          </span>
          <span style={{opacity: tools, transform: `translateX(${(1 - tools) * 180}px)`}}>
            TOOLS
          </span>
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 96,
          bottom: 150,
          width: 1040,
          height: 4,
          background: COLORS.orange,
          transform: `scaleX(${rule})`,
          transformOrigin: 'left center',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 96,
          bottom: 105,
          color: 'rgba(231,227,220,.78)',
          fontFamily: MONO,
          fontSize: 18,
          letterSpacing: '0.16em',
          opacity: rule,
        }}
      >
        BT / NEWSROOM AI TOOLS
      </div>
      <div
        style={{
          position: 'absolute',
          right: 98,
          bottom: 96,
          color: 'rgba(231,227,220,.1)',
          fontFamily: DISPLAY,
          fontSize: 230,
          fontVariantNumeric: 'tabular-nums',
          WebkitTextFillColor: 'transparent',
          WebkitTextStroke: '2px rgba(231,227,220,.16)',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            opacity: countVisible ? countHit : 0,
            transform: `scale(${1.34 - countHit * 0.34}) translateY(${(1 - countHit) * 24}px)`,
          }}
        >
          {count}
        </span>
      </div>
    </AbsoluteFill>
  );
};

const QuestionScene = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const video = arrive(frame, 0, 10);
  const why = arrive(frame, 3, 9);
  const still = arrive(frame, 9, 12);
  return (
    <Aperture scene="04" slug="BREAK THE LOOP" note="HOLD / OPTICAL STRESS" fullBleed>
      <Video
        src={staticFile('assets/broadcast-scene-03-keyed-dark.mp4')}
        trimBefore={Math.round(2.6 * fps)}
        volume={0.56}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          filter: 'grayscale(.82) contrast(1.18) brightness(.56)',
          opacity: 1,
          transform: `scale(${1 + still * 0.035})`,
        }}
      />
      <AbsoluteFill style={{background: 'rgba(8,10,13,.28)'}} />
      <div
        style={{
          position: 'absolute',
          left: 78,
          top: 190,
          color: COLORS.white,
          fontFamily: DISPLAY,
          fontSize: 168,
          fontWeight: 900,
          letterSpacing: '-0.07em',
          lineHeight: 0.78,
          opacity: why,
          transform: `translateX(${(1 - why) * -150}px) scaleX(${0.72 + why * 0.28})`,
          transformOrigin: 'left center',
        }}
      >
        WHY ARE WE
        <div style={{color: COLORS.orange}}>STILL DOING THIS?</div>
      </div>
      <div
        style={{
          position: 'absolute',
          right: 62,
          bottom: 44,
          color: COLORS.white,
          fontFamily: MONO,
          fontSize: 15,
          letterSpacing: '0.16em',
          opacity: still,
        }}
      >
        ROUTINE DETECTED / 01 LOOP / 00 VALUE
      </div>
    </Aperture>
  );
};

const CtrlScene = () => {
  const frame = useCurrentFrame();
  const keyA = arrive(frame, 2, 12);
  const keyB = arrive(frame, 8, 12);
  const slash = arrive(frame, 17, 8);
  const output = arrive(frame, 28, 18);
  const chart = arrive(frame, 54, 24);
  const pulse = interpolate(frame % 24, [0, 12, 24], [0.45, 1, 0.45], clamp);
  return (
    <Aperture scene="05" slug="CTRL+C / CTRL+V / INTERRUPTED" note="DESIGN PLACEHOLDER / AUDIO LOCKED">
      <div style={{position: 'absolute', inset: 0, background: COLORS.aperture}} />
      {[
        {label: 'CTRL+C', left: 105, progress: keyA},
        {label: 'CTRL+V', left: 430, progress: keyB},
      ].map((key) => (
        <div
          key={key.label}
          style={{
            position: 'absolute',
            left: key.left,
            top: 210,
            width: 270,
            height: 180,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid rgba(231,227,220,.5)',
            color: COLORS.white,
            fontFamily: MONO,
            fontSize: 40,
            fontWeight: 700,
            boxShadow: '12px 14px 0 rgba(231,227,220,.08)',
            opacity: key.progress,
            transform: `translateY(${(1 - key.progress) * -90}px) rotate(${(1 - key.progress) * -4}deg)`,
          }}
        >
          {key.label}
        </div>
      ))}
      <div
        style={{
          position: 'absolute',
          left: 84,
          top: 290,
          width: 640,
          height: 18,
          background: COLORS.orange,
          opacity: slash,
          transform: `rotate(-11deg) scaleX(${slash})`,
          transformOrigin: 'left center',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 102,
          top: 486,
          color: COLORS.white,
          fontFamily: DISPLAY,
          fontSize: 78,
          fontWeight: 900,
          letterSpacing: '-0.055em',
          lineHeight: 0.88,
          opacity: slash,
        }}
      >
        KILLED THE
        <div style={{color: COLORS.orange}}>COPY–PASTE LOOP.</div>
      </div>
      <div
        style={{
          position: 'absolute',
          right: 88,
          top: 128,
          width: 650,
          height: 610,
          border: '1px solid rgba(231,227,220,.36)',
          background: '#13161a',
          opacity: output,
          transform: `translateX(${(1 - output) * 160}px)`,
        }}
      >
        <div
          style={{
            background: COLORS.orange,
            color: COLORS.aperture,
            fontFamily: MONO,
            fontSize: 17,
            fontWeight: 700,
            letterSpacing: '0.11em',
            padding: '17px 22px',
          }}
        >
          ONE CLICK → DAILY MARKET WRAP
        </div>
        <div style={{padding: '38px 40px'}}>
          <div style={{color: COLORS.muted, fontFamily: MONO, fontSize: 15, letterSpacing: '0.12em'}}>
            EDITABLE SUMMARY / READY FOR REVIEW
          </div>
          {[0.88, 0.72, 0.94, 0.61].map((width, index) => (
            <div
              key={index}
              style={{
                width: `${width * 100}%`,
                height: index === 0 ? 15 : 11,
                marginTop: index === 0 ? 34 : 18,
                background: index === 0 ? COLORS.white : 'rgba(231,227,220,.34)',
                transform: `scaleX(${output})`,
                transformOrigin: 'left center',
              }}
            />
          ))}
          <svg width="560" height="200" viewBox="0 0 560 200" style={{marginTop: 34}}>
            <path d="M8 164 C74 154, 100 173, 146 132 S220 119, 262 98 S350 117, 392 72 S470 82, 548 25" fill="none" stroke={COLORS.orange} strokeWidth="7" strokeDasharray="760" strokeDashoffset={760 * (1 - chart)} />
          </svg>
        </div>
        <div
          style={{
            position: 'absolute',
            right: 24,
            bottom: 18,
            color: COLORS.orange,
            fontFamily: MONO,
            fontSize: 14,
            opacity: pulse,
          }}
        >
          HUMAN REVIEW ACTIVE ●
        </div>
      </div>
    </Aperture>
  );
};

const PipelineScene = () => {
  const frame = useCurrentFrame();
  const data = arrive(frame, 2, 16);
  const copy = arrive(frame, 18, 16);
  const chart = arrive(frame, 36, 16);
  const approve = arrive(frame, 62, 14);
  const line = arrive(frame, 10, 70);
  const nodes = [
    {x: 94, title: 'MONITOR', subtitle: 'MARKET DATA', p: data},
    {x: 650, title: 'CREATE', subtitle: 'EDITABLE COPY', p: copy},
    {x: 1206, title: 'PUBLISH', subtitle: 'PRINT + DIGITAL', p: chart},
  ];
  return (
    <Aperture scene="06" slug="BEHIND THE SCENES" note="DESIGN PLACEHOLDER / HUMAN IN LOOP">
      <div style={{position: 'absolute', inset: 0, background: COLORS.aperture}} />
      <div
        style={{
          position: 'absolute',
          left: 140,
          right: 140,
          top: 382,
          height: 3,
          background: COLORS.graphite,
          transform: `scaleX(${line})`,
          transformOrigin: 'left center',
        }}
      />
      {nodes.map((node, index) => (
        <div
          key={node.title}
          style={{
            position: 'absolute',
            left: node.x,
            top: 170,
            width: 430,
            height: 390,
            border: `1px solid ${index === 1 ? COLORS.orange : 'rgba(231,227,220,.28)'}`,
            background: index === 1 ? '#17191e' : '#111318',
            opacity: node.p,
            transform: `translateY(${(1 - node.p) * (index % 2 ? 80 : -70)}px)`,
          }}
        >
          <div
            style={{
              color: COLORS.orange,
              fontFamily: MONO,
              fontSize: 15,
              letterSpacing: '0.15em',
              padding: '24px 26px',
            }}
          >
            0{index + 1} / {node.subtitle}
          </div>
          <div
            style={{
              color: COLORS.white,
              fontFamily: DISPLAY,
              fontSize: 54,
              fontWeight: 900,
              letterSpacing: '-0.045em',
              padding: '30px 26px 0',
            }}
          >
            {node.title}
          </div>
          {index === 0 ? (
            <div style={{padding: '38px 26px'}}>
              {[0.6, 0.9, 0.72].map((w, i) => (
                <div key={i} style={{width: `${w * 100}%`, height: 8, marginBottom: 18, background: i === 1 ? COLORS.orange : COLORS.graphite}} />
              ))}
            </div>
          ) : null}
          {index === 1 ? (
            <div style={{padding: '32px 26px'}}>
              {[0.96, 0.78, 0.88, 0.55].map((w, i) => (
                <div key={i} style={{width: `${w * 100}%`, height: 10, marginBottom: 18, background: i === 0 ? COLORS.white : COLORS.graphite}} />
              ))}
            </div>
          ) : null}
          {index === 2 ? (
            <svg width="370" height="150" viewBox="0 0 370 150" style={{margin: '28px 28px'}}>
              <path d="M2 126 C54 110, 74 132, 116 91 S188 98, 230 57 S294 72, 364 12" fill="none" stroke={COLORS.orange} strokeWidth="6" strokeDasharray="520" strokeDashoffset={520 * (1 - chart)} />
            </svg>
          ) : null}
        </div>
      ))}
      <div
        style={{
          position: 'absolute',
          right: 130,
          bottom: 105,
          border: `3px solid ${COLORS.orange}`,
          color: COLORS.orange,
          fontFamily: MONO,
          fontSize: 21,
          fontWeight: 700,
          letterSpacing: '0.14em',
          padding: '17px 22px',
          opacity: approve,
          transform: `rotate(-4deg) scale(${0.78 + approve * 0.22})`,
        }}
      >
        HUMAN APPROVED ✓
      </div>
    </Aperture>
  );
};

const ActualToolsScene = () => {
  return (
    <Aperture scene="04" slug="CTRL+C / CTRL+V → AI" note="ORIGINAL S04 FOOTAGE" fullBleed>
      <Video
        src={staticFile('assets/broadcast-scene-04.mp4')}
        volume={0.72}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />
    </Aperture>
  );
};

const ActualBehindScenes = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const switchFrame = 100;
  const firstOpacity = interpolate(frame, [switchFrame - 9, switchFrame + 5], [1, 0], clamp);
  const secondOpacity = interpolate(frame, [switchFrame - 9, switchFrame + 5], [0, 1], clamp);
  return (
    <Aperture scene="05" slug="BEHIND THE SCENES / HUMAN IN LOOP" note="ORIGINAL WORKFLOW FOOTAGE" fullBleed>
      <Video
        src={staticFile('assets/broadcast-scene-05-behind-precision.mp4')}
        volume={0.58}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: firstOpacity,
          transform: `scale(${1.02 - firstOpacity * 0.02})`,
        }}
      />
      <Video
        src={staticFile('assets/broadcast-scene-05-behind-human.mp4')}
        trimBefore={Math.round(2.75 * fps)}
        volume={0.58}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: secondOpacity,
          transform: `scale(${1.025 - secondOpacity * 0.025})`,
        }}
      />
    </Aperture>
  );
};

const NativeScene = () => {
  const frame = useCurrentFrame();
  const videoIn = arrive(frame, 0, 14);
  return (
    <Aperture scene="06" slug="NATIVE DIALOGUE" note="SEEDANCE / ORIGINAL VIDEO + VO" fullBleed>
      <Video
        src={staticFile('assets/broadcast-scene-06-native.mp4')}
        volume={1}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: 1,
          transform: `scale(${1.02 - videoIn * 0.02})`,
        }}
      />
    </Aperture>
  );
};

const FinalLockup = () => {
  return (
    <Aperture scene="10" slug="THE WORK THAT MATTERS" note="FINAL STORY LOCKUP" fullBleed>
      <Video
        src={staticFile('assets/broadcast-scene-08-10.mp4')}
        trimBefore={secondsToFrames(10.22)}
        volume={0.58}
        style={{width: '100%', height: '100%', objectFit: 'cover'}}
      />
    </Aperture>
  );
};

const MotionTransition = ({accent = false, variant}: {accent?: boolean; variant: number}) => {
  const frame = useCurrentFrame();
  const close = interpolate(frame, [0, 8], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.76, 0, 0.24, 1),
  });
  const open = interpolate(frame, [9, 17], [1, 0], {
    ...clamp,
    easing: Easing.bezier(0.76, 0, 0.24, 1),
  });
  const cover = frame <= 8 ? close : open;
  const mark = interpolate(frame, [4, 8, 10, 14], [0, 1, 1, 0], clamp);
  const markScale = interpolate(mark, [0, 1], [0.45, 1], clamp);

  const punctuation = (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        color: accent ? COLORS.aperture : COLORS.orange,
        fontFamily: DISPLAY,
        fontSize: accent ? 170 : 110,
        fontWeight: 900,
        lineHeight: 1,
        opacity: mark,
        transform: `translate(-50%, -50%) rotate(${(1 - mark) * -24}deg) scale(${markScale})`,
      }}
    >
      {accent ? '×' : '•'}
    </div>
  );

  if (variant === 1) {
    return (
      <AbsoluteFill style={{zIndex: 900, pointerEvents: 'none', overflow: 'hidden'}}>
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 190,
            height: 190,
            borderRadius: '50%',
            background: accent ? COLORS.orange : COLORS.white,
            transform: `translate(-50%, -50%) scale(${cover * 14})`,
          }}
        />
        {punctuation}
      </AbsoluteFill>
    );
  }

  if (variant === 2) {
    return (
      <AbsoluteFill style={{zIndex: 900, pointerEvents: 'none', overflow: 'hidden'}}>
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            height: '50.5%',
            background: accent ? COLORS.orange : COLORS.aperture,
            transform: `translateY(${-(1 - cover) * 101}%)`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: '50.5%',
            background: accent ? COLORS.orange : COLORS.aperture,
            transform: `translateY(${(1 - cover) * 101}%)`,
          }}
        />
        {punctuation}
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{zIndex: 900, pointerEvents: 'none', overflow: 'hidden'}}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: '50.5%',
          background: accent ? COLORS.orange : COLORS.aperture,
          transform: `translateX(${-(1 - cover) * 101}%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: '50.5%',
          background: accent ? COLORS.orange : COLORS.aperture,
          transform: `translateX(${(1 - cover) * 101}%)`,
        }}
      />
      {punctuation}
    </AbsoluteFill>
  );
};

const EditorialExposureCut = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 6, 8, 10, 17], [0, 0, 0.16, 0.06, 0], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });
  const bloom = interpolate(frame, [4, 8, 12], [0.82, 1, 1.08], clamp);
  return (
    <AbsoluteFill style={{zIndex: 900, pointerEvents: 'none', overflow: 'hidden'}}>
      <AbsoluteFill
        style={{
          background: 'radial-gradient(circle at 58% 46%, #fff7e8 0%, #f26a48 42%, rgba(242,106,72,0) 78%)',
          mixBlendMode: 'screen',
          opacity,
          transform: `scale(${bloom})`,
        }}
      />
    </AbsoluteFill>
  );
};

const CREDITS = [
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

const Credits = () => {
  const frame = useCurrentFrame();
  const fade = interpolate(frame, [238, 259], [1, 0], clamp);
  const rule = arrive(frame, 18, 18);
  const creditCells = [...CREDITS, 'VIDEO MADE WITH\nCODEX + SEEDANCE 2.0'];

  return (
    <AbsoluteFill style={{color: COLORS.white, fontFamily: BODY, opacity: fade}}>
      <div style={{position: 'absolute', inset: '62px 70px', border: '1px solid rgba(231,227,220,.18)'}}>
        <Corner position="tl" />
        <Corner position="tr" />
        <Corner position="bl" />
        <Corner position="br" />
      </div>
      <div
        style={{
          position: 'absolute',
          left: 96,
          top: 104,
          color: COLORS.orange,
          fontFamily: MONO,
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: '0.2em',
        }}
      >
        SPH STAFF AWARDS — INNOVATION AWARD
      </div>
      <div
        style={{
          position: 'absolute',
          left: 96,
          right: 96,
          top: 230,
          bottom: 170,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gridTemplateRows: 'repeat(4, 1fr)',
          columnGap: 74,
          rowGap: 20,
        }}
      >
        {creditCells.map((name, index) => {
          const itemIn = arrive(frame, 8 + index * 4, 12);
          const maker = index === CREDITS.length;
          return (
            <div
              key={name}
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                borderTop: `2px solid ${maker ? COLORS.orange : 'rgba(231,227,220,.22)'}`,
                padding: '18px 0 8px',
                boxSizing: 'border-box',
                opacity: itemIn,
                transform: `translateY(${(1 - itemIn) * 24}px)`,
              }}
            >
              {maker ? <div style={{color: COLORS.orange, fontFamily: MONO, fontSize: 13, marginBottom: 8, letterSpacing: '0.14em'}}>VIDEO MADE WITH</div> : null}
              <div
                style={{
                  color: COLORS.white,
                  fontFamily: maker ? DISPLAY : BODY,
                  fontSize: maker ? 27 : 31,
                  fontWeight: maker ? 900 : 800,
                  letterSpacing: maker ? '-0.035em' : '-0.02em',
                  lineHeight: 1.02,
                  whiteSpace: 'pre-line',
                }}
              >
                {maker ? 'CODEX + SEEDANCE 2.0' : name}
              </div>
            </div>
          );
        })}
      </div>
      <div
        style={{
          position: 'absolute',
          left: 96,
          bottom: 126,
          width: 790,
          height: 5,
          background: COLORS.orange,
          opacity: rule,
          transform: `scaleX(${rule})`,
          transformOrigin: 'left center',
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: 96,
          bottom: 104,
          color: COLORS.muted,
          fontFamily: MONO,
          fontSize: 16,
          letterSpacing: '0.14em',
          opacity: rule,
        }}
      >
        BT / NEWSROOM AI TOOLS
      </div>
    </AbsoluteFill>
  );
};

type SceneDef = {
  key: string;
  start: number;
  end: number;
  node: ReactNode;
  accent?: boolean;
};

const scenes: SceneDef[] = [
  {key: 'intro', start: 0, end: INTRO_SECONDS, node: <Intro />},
  {
    key: 's01',
    start: INTRO_SECONDS,
    end: INTRO_SECONDS + 5.78,
    node: <FootageScene src="assets/broadcast-scene-01.mp4" scene="01" slug="EVERY DAY / THE NEWS CHANGES" volume={0.52} overlay={false} />,
  },
  {
    key: 's02',
    start: INTRO_SECONDS + 5.78,
    end: INTRO_SECONDS + 11.4,
    node: <FootageScene src="assets/broadcast-scene-02.mp4" scene="02" slug="WHAT READERS SEE" volume={0.52} />,
  },
  {
    key: 's03',
    start: INTRO_SECONDS + 11.4,
    end: INTRO_SECONDS + 13.54,
    node: <ChromaMonitorScene />,
  },
  {key: 's04', start: INTRO_SECONDS + 13.54, end: INTRO_SECONDS + 15, node: <QuestionScene />, accent: true},
  {key: 's05', start: INTRO_SECONDS + 15, end: INTRO_SECONDS + 18.14, node: <ActualToolsScene />, accent: true},
  {
    key: 's06',
    start: INTRO_SECONDS + 18.14,
    end: NATIVE_START_SECONDS,
    node: <FootageScene src="assets/broadcast-scene-05-to-earnings-8.30.mp4" scene="05" slug="ONE CLICK / HUMAN IN LOOP" volume={0} overlay={false} />,
  },
  {key: 'native', start: NATIVE_START_SECONDS, end: RESUME_SECONDS, node: <NativeScene />, accent: true},
  {
    key: 's08',
    start: RESUME_SECONDS,
    end: postNative(36.32),
    node: <FootageScene src="assets/broadcast-scene-08-10.mp4" scene="08" slug="SCALE THE IDEA" volume={0.58} overlay={false} />,
  },
  {
    key: 's09',
    start: postNative(36.32),
    end: postNative(40.7),
    node: <FootageScene src="assets/broadcast-scene-08-10.mp4" scene="09" slug="A NEW STORY" mediaStart={5.84} volume={0.58} overlay={false} />,
  },
  {key: 's10', start: postNative(40.7), end: STORY_END_SECONDS, node: <FinalLockup />},
  {key: 'credits', start: STORY_END_SECONDS, end: BROADCAST_DURATION_SECONDS, node: <Credits />, accent: true},
];

const musicVolume = (audioFrame: number) => {
  const seconds = audioFrame / BROADCAST_FPS;
  const fadeIn = interpolate(seconds, [0, 1.4], [0, 0.13], clamp);
  const storyBed = seconds < INTRO_SECONDS ? fadeIn : Math.min(fadeIn, 0.075);
  const nativeDuck =
    seconds >= NATIVE_START_SECONDS - 0.35 && seconds <= RESUME_SECONDS + 0.25
      ? 0.038
      : storyBed;
  const creditsLift = interpolate(
    seconds,
    [STORY_END_SECONDS, STORY_END_SECONDS + 0.8],
    [nativeDuck, 0.14],
    clamp
  );
  const fadeOut = interpolate(
    seconds,
    [BROADCAST_DURATION_SECONDS - 2.2, BROADCAST_DURATION_SECONDS],
    [1, 0],
    clamp
  );
  return Math.max(nativeDuck, creditsLift) * fadeOut;
};

export const BroadcastSlateFilm = () => {
  const {fps} = useVideoConfig();
  return (
    <AbsoluteFill style={{background: COLORS.black, overflow: 'hidden'}}>
      <Background />
      {scenes.map((scene) => (
        <Sequence
          key={scene.key}
          from={secondsToFrames(scene.start)}
          durationInFrames={Math.max(1, secondsToFrames(scene.end - scene.start))}
          premountFor={fps}
        >
          {scene.node}
        </Sequence>
      ))}
      {scenes.slice(1).map((scene) => (
        <Sequence
          key={`transition-${scene.key}`}
          from={Math.max(0, secondsToFrames(scene.start) - 9)}
          durationInFrames={18}
          premountFor={fps}
        >
          <EditorialExposureCut />
        </Sequence>
      ))}

      <BroadcastCaptions />

      <Audio
        src={staticFile('assets/music.mp3')}
        trimAfter={BROADCAST_DURATION_IN_FRAMES}
        volume={musicVolume}
      />
      <Sequence
        from={secondsToFrames(INTRO_SECONDS)}
        durationInFrames={secondsToFrames(NATIVE_VO_START_SECONDS)}
        premountFor={fps}
      >
        <Audio
          src={staticFile('assets/brand-film-emotional-ctrl-c-v4.mp3')}
          trimAfter={secondsToFrames(NATIVE_VO_START_SECONDS)}
          volume={1}
        />
      </Sequence>
      <Sequence
        from={secondsToFrames(RESUME_SECONDS)}
        durationInFrames={secondsToFrames(VO_DURATION_SECONDS - ORIGINAL_RESUME_SECONDS)}
        premountFor={fps}
      >
        <Audio
          src={staticFile('assets/brand-film-emotional-ctrl-c-v4.mp3')}
          trimBefore={secondsToFrames(ORIGINAL_RESUME_SECONDS)}
          trimAfter={secondsToFrames(VO_DURATION_SECONDS)}
          volume={1}
        />
      </Sequence>
    </AbsoluteFill>
  );
};

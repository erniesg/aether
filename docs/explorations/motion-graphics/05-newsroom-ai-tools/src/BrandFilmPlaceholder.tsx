import type {ReactNode} from 'react';
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
import {
  EndScene,
  CtrlVScene,
  OpeningScene,
  PipelineScene,
  ReaderScene,
  RoutineScene,
  ScaleScene,
} from './scenes';
import {
  HeadlineStrip,
  Paper,
  PaperTransition,
  SceneTag,
  SmallLabel,
  Texture,
} from './primitives';
import {THEMES} from './theme';

const THEME = THEMES.kirigami;
export const BRAND_FILM_FPS = 30;

const emotionalVoiceDuration = 44.43425;
const replacementStartSeconds = 26.44;
const originalAfterReplacementSeconds = 30.48;
const sceneSixVideoDurationSeconds = 8.057;
const replacementEndSeconds =
  replacementStartSeconds + sceneSixVideoDurationSeconds;
const voEndSeconds =
  replacementEndSeconds +
  (emotionalVoiceDuration - originalAfterReplacementSeconds);
const creditsDurationSeconds = 6;

export const BRAND_FILM_CREDITS_START_SECONDS = voEndSeconds;
export const BRAND_FILM_DURATION_SECONDS =
  BRAND_FILM_CREDITS_START_SECONDS + creditsDurationSeconds;
export const BRAND_FILM_DURATION_IN_FRAMES = Math.ceil(
  BRAND_FILM_DURATION_SECONDS * BRAND_FILM_FPS
);

const secondsToFrames = (seconds: number) =>
  Math.round(seconds * BRAND_FILM_FPS);

const clamp = {
  extrapolateLeft: 'clamp' as const,
  extrapolateRight: 'clamp' as const,
};

const reveal = (frame: number, from: number, to: number) =>
  interpolate(frame, [from, to], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

const sceneOpacity = (frame: number, duration: number) => {
  const enter = reveal(frame, 0, 16);
  const exit = interpolate(frame, [duration - 12, duration], [1, 0], clamp);
  return Math.min(enter, exit);
};

type PlaceholderSceneProps = {
  number: string;
  label: string;
  copy: string;
  durationInFrames: number;
};

const PlaceholderMark = () => (
  <div
    style={{
      position: 'absolute',
      right: 66,
      top: 52,
      zIndex: 80,
      background: THEME.paper,
      color: THEME.ink,
      fontFamily: THEME.mono,
      fontSize: 17,
      fontWeight: 700,
      letterSpacing: '0.12em',
      padding: '10px 14px 8px',
      textTransform: 'uppercase',
    }}
  >
    Visual placeholder
  </div>
);

const EditorialQuestionScene = ({durationInFrames}: {durationInFrames: number}) => {
  const frame = useCurrentFrame();
  const opacity = sceneOpacity(frame, durationInFrames);
  const questionIn = reveal(frame, 0, 14);
  const cardIn = reveal(frame, 5, 20);

  return (
    <AbsoluteFill
      style={{
        background: 'transparent',
        color: THEME.paper,
        fontFamily: THEME.body,
        opacity,
        overflow: 'hidden',
        perspective: 1400,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 104,
          top: 214,
          width: 1020,
          opacity: questionIn,
          transform: `translateY(${(1 - questionIn) * 70}px)`,
        }}
      >
        <div
          style={{
            color: THEME.accent,
            fontFamily: THEME.mono,
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: '0.18em',
            marginBottom: 24,
            textTransform: 'uppercase',
          }}
        >
          THE ROUTINE BEGINS
        </div>
        <div
          style={{
            fontFamily: THEME.headline,
            fontSize: 112,
            fontWeight: 900,
            letterSpacing: '-0.065em',
            lineHeight: 0.88,
          }}
        >
          WHY ARE WE
          <br />
          <span style={{color: THEME.accent}}>STILL DOING THIS?</span>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          right: 110,
          top: 190,
          width: 610,
          height: 570,
          padding: '48px 44px',
          background: THEME.paper,
          boxShadow: `0 26px 55px ${THEME.shadow}`,
          color: THEME.ink,
          transform: `translateY(${(1 - cardIn) * 110}px) rotate(-2deg) scale(${0.94 + cardIn * 0.06})`,
          opacity: cardIn,
        }}
      >
        <SmallLabel style="kirigami">EDITORIAL WORKFLOW</SmallLabel>
        <div
          style={{
            height: 310,
            marginTop: 30,
            border: `5px solid ${THEME.ink}`,
            position: 'relative',
            overflow: 'hidden',
            background: THEME.backgroundAlt,
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 28,
              right: 28,
              top: 30,
              height: 26,
              background: THEME.accent2,
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 28,
              top: 96,
              width: 230,
              height: 160,
              border: `4px solid ${THEME.paper}`,
            }}
          >
            <div
              style={{
                height: 6,
                background: THEME.accent,
                margin: '65px 18px 0',
                transform: 'rotate(-13deg)',
              }}
            />
            <div
              style={{
                height: 6,
                background: THEME.accent,
                margin: '22px 18px 0',
                transform: 'rotate(9deg)',
              }}
            />
          </div>
          <div
            style={{
              position: 'absolute',
              right: 28,
              top: 108,
              width: 250,
              height: 16,
              background: THEME.paper,
              boxShadow: `0 34px 0 ${THEME.paper}, 0 68px 0 ${THEME.paper}, 0 102px 0 ${THEME.paper}`,
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: 22,
              left: 28,
              color: THEME.accent2,
              fontFamily: THEME.mono,
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: '0.1em',
            }}
          >
            SIGNAL → STORY → EDIT
          </div>
        </div>
        <div
          style={{
            marginTop: 24,
            color: THEME.accent,
            fontFamily: THEME.mono,
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          Visual placeholder • audio locked
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 104,
          bottom: 60,
          color: THEME.paper,
          fontFamily: THEME.mono,
          fontSize: 18,
          letterSpacing: '0.12em',
          opacity: 0.58,
          textTransform: 'uppercase',
        }}
      >
        BT / NEWSROOM AI TOOLS • PLACEHOLDER BOARD • AUDIO LOCK
      </div>
    </AbsoluteFill>
  );
};

const FinalMessageScene = ({durationInFrames}: {durationInFrames: number}) => {
  const frame = useCurrentFrame();
  const opacity = sceneOpacity(frame, durationInFrames);
  const messageIn = reveal(frame, 0, 18);
  const cardIn = reveal(frame, 8, 24);

  return (
    <AbsoluteFill
      style={{
        background: 'transparent',
        color: THEME.paper,
        fontFamily: THEME.body,
        opacity,
        overflow: 'hidden',
        perspective: 1400,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 108,
          top: 236,
          width: 1030,
          opacity: messageIn,
          transform: `translateY(${(1 - messageIn) * 60}px)`,
        }}
      >
        <SmallLabel style="kirigami" css={{color: THEME.accent2}}>
          NEWSROOM AI TOOLS
        </SmallLabel>
        <div
          style={{
            fontFamily: THEME.headline,
            fontSize: 114,
            fontWeight: 900,
            letterSpacing: '-0.065em',
            lineHeight: 0.88,
            marginTop: 28,
          }}
        >
          MORE TIME FOR
          <br />
          <span style={{color: THEME.accent}}>THE WORK THAT MATTERS.</span>
        </div>
      </div>
      <Paper
        style="kirigami"
        rotate={2}
        css={{
          position: 'absolute',
          right: 118,
          top: 214,
          width: 580,
          height: 530,
          padding: '44px 40px',
          opacity: cardIn,
          transform: `translateY(${(1 - cardIn) * 90}px) rotate(2deg)`,
        }}
      >
        <SmallLabel style="kirigami">HUMAN IN THE LOOP</SmallLabel>
        <div
          style={{
            border: `5px solid ${THEME.ink}`,
            height: 256,
            marginTop: 30,
            padding: 26,
          }}
        >
          <div
            style={{
              color: THEME.accent,
              fontFamily: THEME.headline,
              fontSize: 86,
              fontWeight: 900,
              lineHeight: 0.82,
            }}
          >
            ↗
          </div>
          <div
            style={{
              fontFamily: THEME.headline,
              fontSize: 36,
              fontWeight: 900,
              lineHeight: 0.95,
              marginTop: 22,
            }}
          >
            JOURNALISTS
            <br />
            MAKE THE CALL.
          </div>
        </div>
        <div
          style={{
            bottom: 38,
            color: THEME.accent,
            fontFamily: THEME.mono,
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: '0.1em',
            position: 'absolute',
            right: 38,
            textTransform: 'uppercase',
          }}
        >
          Visual placeholder • audio locked
        </div>
      </Paper>
    </AbsoluteFill>
  );
};

const DialogueVideoScene = ({durationInFrames}: {durationInFrames: number}) => {
  const frame = useCurrentFrame();
  const opacity = sceneOpacity(frame, durationInFrames);
  const revealIn = reveal(frame, 0, 18);

  return (
    <AbsoluteFill
      style={{
        background: THEME.backgroundAlt,
        color: THEME.paper,
        fontFamily: THEME.body,
        opacity,
        overflow: 'hidden',
      }}
    >
      <Video
        src={staticFile('assets/brand-film-scene-06-dialogue-v1.mp4')}
        volume={1}
        objectFit="cover"
        style={{
          width: '100%',
          height: '100%',
          filter: 'saturate(.82) contrast(1.04)',
        }}
      />
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(90deg, rgba(11,41,43,.86) 0%, rgba(11,41,43,.26) 48%, rgba(11,41,43,.05) 100%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 92,
          top: 70,
          color: THEME.accent2,
          fontFamily: THEME.mono,
          fontSize: 20,
          fontWeight: 700,
          letterSpacing: '0.18em',
          opacity: revealIn,
          textTransform: 'uppercase',
        }}
      >
        SCENE 06 • ORIGINAL VIDEO + NATIVE VO
      </div>
      <div
        style={{
          position: 'absolute',
          left: 92,
          bottom: 108,
          width: 850,
          color: THEME.paper,
          fontFamily: THEME.headline,
          fontSize: 56,
          fontWeight: 900,
          letterSpacing: '-0.04em',
          lineHeight: 1.03,
          opacity: revealIn,
          transform: `translateY(${(1 - revealIn) * 54}px)`,
        }}
      >
        This isn’t about automating journalism. It’s about removing the grunt
        work around it.
      </div>
    </AbsoluteFill>
  );
};

const IntroOverlay = () => {
  const frame = useCurrentFrame();
  const titleIn = reveal(frame, 4, 26);
  const subIn = reveal(frame, 23, 42);
  const fadeOut = interpolate(frame, [48, 72], [1, 0], clamp);

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 25% 20%, ${THEME.background} 0%, ${THEME.backgroundAlt} 75%)`,
        color: THEME.paper,
        fontFamily: THEME.body,
        opacity: fadeOut,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 30,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 104,
          top: 78,
          color: THEME.accent2,
          fontFamily: THEME.mono,
          fontSize: 21,
          fontWeight: 700,
          letterSpacing: '0.2em',
          opacity: subIn,
          textTransform: 'uppercase',
        }}
      >
        SPH STAFF AWARDS • INNOVATION AWARD
      </div>
      <div
        style={{
          position: 'absolute',
          left: 104,
          top: 300,
          width: 1400,
          fontFamily: THEME.headline,
          fontSize: 142,
          fontWeight: 900,
          letterSpacing: '-0.065em',
          lineHeight: 0.88,
          opacity: titleIn,
          transform: `translateX(${(1 - titleIn) * -120}px)`,
        }}
      >
        NEWSROOM
        <br />
        <span style={{color: THEME.accent}}>AI TOOLS</span>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 108,
          bottom: 86,
          width: 620,
          height: 5,
          background: THEME.accent2,
          opacity: subIn,
          transform: `scaleX(${subIn})`,
          transformOrigin: 'left center',
        }}
      />
    </AbsoluteFill>
  );
};

const CREDITS = [
  'Benjamin Cher',
  'Chloe Lim',
  'Daniel Buenas',
  'David Li Zuowei',
  'Ernie Chen',
  'Gareth Chung JK',
  'Ivan Tan',
  'Jeanette Lee SS',
  'Tessa Oh',
  'Vivien Ang CN',
  'Yeo Cheng Yong',
];

const CreditsScene = ({durationInFrames}: {durationInFrames: number}) => {
  const frame = useCurrentFrame();
  const fadeIn = reveal(frame, 0, 24);
  const titleIn = reveal(frame, 10, 36);
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 18, durationInFrames],
    [1, 0],
    clamp
  );
  const columns = [CREDITS.slice(0, 6), CREDITS.slice(6)];

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 0%, ${THEME.background} 0%, ${THEME.backgroundAlt} 78%)`,
        color: THEME.paper,
        fontFamily: THEME.body,
        opacity: fadeIn * fadeOut,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 104,
          top: 72,
          color: THEME.accent2,
          fontFamily: THEME.mono,
          fontSize: 20,
          fontWeight: 700,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
        }}
      >
        CREDITS • TEAM BEHIND BT / NEWSROOM AI TOOLS
      </div>
      <div
        style={{
          position: 'absolute',
          left: 104,
          top: 142,
          color: THEME.paper,
          fontFamily: THEME.headline,
          fontSize: 74,
          fontWeight: 900,
          letterSpacing: '-0.05em',
          opacity: titleIn,
          transform: `translateY(${(1 - titleIn) * 36}px)`,
        }}
      >
        More time for the work that matters.
      </div>
      <div
        style={{
          position: 'absolute',
          left: 104,
          right: 104,
          top: 290,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          columnGap: 82,
          padding: '30px 38px',
          background: THEME.paper,
          boxShadow: `0 24px 48px ${THEME.shadow}`,
          color: THEME.ink,
          transform: `translateY(${(1 - titleIn) * 56}px)`,
          opacity: titleIn,
        }}
      >
        {columns.map((column, columnIndex) => (
          <div key={columnIndex} style={{display: 'grid', gap: 15}}>
            {column.map((name, index) => {
              const personIn = reveal(
                frame,
                38 + (columnIndex * 6 + index) * 4,
                52 + (columnIndex * 6 + index) * 4
              );
              return (
                <div
                  key={name}
                  style={{
                    borderBottom: `2px solid ${THEME.background}`,
                    fontFamily: THEME.body,
                    fontSize: 26,
                    fontWeight: 800,
                    opacity: personIn,
                    paddingBottom: 8,
                    transform: `translateX(${(1 - personIn) * -28}px)`,
                  }}
                >
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
          left: 104,
          bottom: 58,
          color: THEME.paper,
          fontFamily: THEME.mono,
          fontSize: 21,
          letterSpacing: '0.1em',
          opacity: titleIn,
          textTransform: 'uppercase',
        }}
      >
        Video made with Codex and Seedance
      </div>
    </AbsoluteFill>
  );
};

const PLACEHOLDER_SCENES = [
  {
    number: '01',
    label: 'The daily loop',
    copy: 'Every day, the news changes. Somehow, the chores don’t.',
    start: 0,
    end: 5.78,
  },
  {
    number: '02',
    label: 'What readers see',
    copy: 'Readers see a market chart and understand the day in seconds. What they don’t see is the work behind it.',
    start: 5.78,
    end: 11.4,
  },
  {
    number: '03',
    label: 'Market close',
    copy: 'When the market closes, the routine begins.',
    start: 11.4,
    end: 13.54,
  },
  {
    number: '04',
    label: 'Break the loop',
    copy: 'Why are we still doing this?',
    start: 13.54,
    end: 15,
  },
  {
    number: '05',
    label: 'One click, a daily summary',
    copy: 'Newsroom AI Tools killed Ctrl+C, Ctrl+V with AI — turning one click into a daily financial summary.',
    start: 15,
    end: 20.72,
  },
  {
    number: '05B',
    label: 'Behind the scenes',
    copy: 'Behind the scenes, it monitors data and creates editable copy and charts for print and digital — with humans in the loop.',
    start: 20.72,
    end: replacementStartSeconds,
  },
  {
    number: '07',
    label: 'Scale it',
    copy: 'Now take that simple idea and scale it: earnings, statistical releases, property graphics — even social media.',
    start: replacementEndSeconds,
    end: replacementEndSeconds + (36.32 - originalAfterReplacementSeconds),
  },
  {
    number: '08',
    label: 'A new story',
    copy: 'Every day brings a new story. The work around it shouldn’t be the same old story.',
    start: replacementEndSeconds + (36.32 - originalAfterReplacementSeconds),
    end: replacementEndSeconds + (40.7 - originalAfterReplacementSeconds),
  },
  {
    number: '09',
    label: 'The work that matters',
    copy: 'Newsroom AI Tools: giving journalists more time for the work that matters.',
    start: replacementEndSeconds + (40.7 - originalAfterReplacementSeconds),
    end: voEndSeconds,
  },
] as const;

const PlaceholderVisual = ({
  scene,
  durationInFrames,
}: {
  scene: (typeof PLACEHOLDER_SCENES)[number];
  durationInFrames: number;
}) => {
  const props = {style: 'kirigami' as const, duration: durationInFrames};

  let visual: ReactNode;
  switch (scene.number) {
    case '01':
      visual = <OpeningScene {...props} />;
      break;
    case '02':
      visual = <ReaderScene {...props} />;
      break;
    case '03':
      visual = <RoutineScene {...props} />;
      break;
    case '04':
      visual = <EditorialQuestionScene durationInFrames={durationInFrames} />;
      break;
    case '05':
      visual = <CtrlVScene {...props} />;
      break;
    case '05B':
      visual = <PipelineScene {...props} />;
      break;
    case '07':
      visual = <ScaleScene {...props} />;
      break;
    case '08':
      visual = <EndScene {...props} />;
      break;
    case '09':
      visual = <FinalMessageScene durationInFrames={durationInFrames} />;
      break;
    default:
      visual = <EditorialQuestionScene durationInFrames={durationInFrames} />;
  }

  return (
    <AbsoluteFill>
      {visual}
      <AbsoluteFill
        style={{
          pointerEvents: 'none',
          zIndex: 120,
        }}
      >
        <SceneTag style="kirigami">
          {scene.number} • {scene.label}
        </SceneTag>
        <PlaceholderMark />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const musicVolume = (audioFrame: number) => {
  const seconds = audioFrame / BRAND_FILM_FPS;
  const level = interpolate(
    seconds,
    [0, 1.2, BRAND_FILM_CREDITS_START_SECONDS, BRAND_FILM_CREDITS_START_SECONDS + 0.7],
    [0, 0.08, 0.08, 0.12],
    clamp
  );
  const fadeOut = interpolate(
    seconds,
    [BRAND_FILM_DURATION_SECONDS - 3, BRAND_FILM_DURATION_SECONDS],
    [1, 0],
    clamp
  );
  return level * fadeOut;
};

export const BrandFilmPlaceholder = () => {
  const {fps} = useVideoConfig();
  const replacementStart = secondsToFrames(replacementStartSeconds);
  const replacementEnd = secondsToFrames(replacementEndSeconds);
  const creditsStart = secondsToFrames(BRAND_FILM_CREDITS_START_SECONDS);
  const durationInFrames = BRAND_FILM_DURATION_IN_FRAMES;

  return (
    <AbsoluteFill style={{background: THEME.backgroundAlt}}>
      <Texture style="kirigami" intensity={0.9} />
      {PLACEHOLDER_SCENES.map((scene) => (
        <Sequence
          key={scene.number}
          from={secondsToFrames(scene.start)}
          durationInFrames={secondsToFrames(scene.end - scene.start)}
          premountFor={fps}
        >
          <PlaceholderVisual
            scene={scene}
            durationInFrames={secondsToFrames(scene.end - scene.start)}
          />
        </Sequence>
      ))}

      <Sequence
        from={replacementStart}
        durationInFrames={replacementEnd - replacementStart}
        premountFor={fps}
      >
        <DialogueVideoScene durationInFrames={replacementEnd - replacementStart} />
      </Sequence>

      <Sequence from={0} durationInFrames={secondsToFrames(2.4)} premountFor={fps}>
        <IntroOverlay />
      </Sequence>

      <Sequence
        from={creditsStart}
        durationInFrames={durationInFrames - creditsStart}
        premountFor={fps}
      >
        <CreditsScene durationInFrames={durationInFrames - creditsStart} />
      </Sequence>

      {PLACEHOLDER_SCENES.map((scene) =>
        scene.start > 0 ? <PaperTransition key={`transition-${scene.number}`} style="kirigami" at={scene.start} /> : null
      )}
      <PaperTransition style="kirigami" at={replacementStartSeconds} />
      <PaperTransition style="kirigami" at={BRAND_FILM_CREDITS_START_SECONDS} />

      <Audio
        src={staticFile('assets/music.mp3')}
        trimAfter={durationInFrames}
        volume={musicVolume}
      />
      <Audio
        src={staticFile('assets/brand-film-emotional-ctrl-c-v4.mp3')}
        trimAfter={replacementStart}
        volume={1}
      />
      <Sequence
        from={replacementEnd}
        durationInFrames={durationInFrames - replacementEnd}
        premountFor={fps}
      >
        <Audio
          src={staticFile('assets/brand-film-emotional-ctrl-c-v4.mp3')}
          trimBefore={secondsToFrames(originalAfterReplacementSeconds)}
          volume={1}
        />
      </Sequence>
    </AbsoluteFill>
  );
};

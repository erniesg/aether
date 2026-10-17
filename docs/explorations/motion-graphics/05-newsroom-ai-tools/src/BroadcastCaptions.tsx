import type {Caption} from '@remotion/captions';
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const INTRO_SECONDS = 2.8;
const NATIVE_START_SECONDS = INTRO_SECONDS + 26.44;
const NATIVE_DURATION_SECONDS = 8.057;
const RESUME_SECONDS = NATIVE_START_SECONDS + NATIVE_DURATION_SECONDS;
const ORIGINAL_RESUME_SECONDS = 30.48;

const ms = (seconds: number) => Math.round(seconds * 1000);
const beforeNative = (seconds: number) => INTRO_SECONDS + seconds;
const afterNative = (seconds: number) =>
  RESUME_SECONDS + (seconds - ORIGINAL_RESUME_SECONDS);

const cue = (text: string, start: number, end: number): Caption => ({
  text,
  startMs: ms(start),
  endMs: ms(end),
  timestampMs: ms(start),
  confidence: 1,
});

export const BROADCAST_CAPTIONS: Caption[] = [
  cue('Every day, the news changes.', beforeNative(0), beforeNative(1.34)),
  cue('Somehow, the chores don’t.', beforeNative(2.9), beforeNative(4.3)),
  cue(
    'Readers see a market chart and understand the day in seconds.',
    beforeNative(5.78),
    beforeNative(8.12)
  ),
  cue(
    'What they don’t see is the work behind it.',
    beforeNative(8.96),
    beforeNative(10.5)
  ),
  cue(
    'When the market closes, the routine begins.',
    beforeNative(11.4),
    beforeNative(12.84)
  ),
  cue('Why are we still doing this?', beforeNative(13.54), beforeNative(14.62)),
  cue(
    'Newsroom AI Tools killed Ctrl+C, Ctrl+V with AI —',
    beforeNative(15),
    beforeNative(17.66)
  ),
  cue(
    'turning one click into a daily financial summary.',
    beforeNative(18.14),
    beforeNative(20)
  ),
  cue(
    'Behind the scenes, it monitors data',
    beforeNative(20.72),
    beforeNative(22.28)
  ),
  cue(
    'and creates editable copy and charts for print and digital —',
    beforeNative(22.28),
    beforeNative(24.52)
  ),
  cue(
    'with humans in the loop.',
    beforeNative(24.86),
    beforeNative(25.82)
  ),
  cue(
    'This isn’t about automating journalism.',
    NATIVE_START_SECONDS + 0.54,
    NATIVE_START_SECONDS + 3.25
  ),
  cue(
    'It’s about removing the grunt work around it.',
    NATIVE_START_SECONDS + 3.72,
    NATIVE_START_SECONDS + 7.2
  ),
  cue(
    'Now take that simple idea and scale it:',
    afterNative(30.48),
    afterNative(32.04)
  ),
  cue(
    'earnings, statistical releases, property graphics —',
    afterNative(32.34),
    afterNative(34.48)
  ),
  cue('even social media.', afterNative(34.82), afterNative(35.56)),
  cue('Every day brings a new story.', afterNative(36.32), afterNative(37.54)),
  cue(
    'The work around it shouldn’t be the same old story.',
    afterNative(38.22),
    afterNative(39.98)
  ),
  cue('Newsroom AI Tools:', afterNative(40.7), afterNative(41.72)),
  cue(
    'giving journalists more time for the work that matters.',
    afterNative(42.24),
    afterNative(44.14)
  ),
];

const ACCENT_WORDS = new Set([
  'changes.',
  'chores',
  'seconds.',
  'work',
  'routine',
  'why',
  'ctrl+c,',
  'ctrl+v',
  'one',
  'click',
  'humans',
  'automating',
  'removing',
  'grunt',
  'scale',
  'earnings,',
  'story.',
  'matters.',
]);

const clamp = {
  extrapolateLeft: 'clamp' as const,
  extrapolateRight: 'clamp' as const,
};

type CaptionMode =
  | 'standard'
  | 'percussion'
  | 'question'
  | 'ctrl'
  | 'one-click'
  | 'human'
  | 'speech'
  | 'scale'
  | 'story'
  | 'finale';

const modeFor = (text: string): CaptionMode => {
  const lower = text.toLowerCase();
  if (lower.startsWith('this isn’t') || lower.startsWith('it’s about removing')) return 'speech';
  if (lower.startsWith('why are we')) return 'question';
  if (lower.includes('killed ctrl+c')) return 'standard';
  if (lower.startsWith('turning one click')) return 'standard';
  if (lower.includes('humans in the loop')) return 'human';
  if (lower.startsWith('now take') || lower.startsWith('earnings,')) return 'scale';
  if (lower.startsWith('every day brings') || lower.includes('same old story')) return 'story';
  if (lower.startsWith('giving journalists')) return 'finale';
  if (lower.startsWith('every day,') || lower.startsWith('somehow,')) return 'percussion';
  return 'standard';
};

const ALREADY_ON_SCREEN = new Set([
  'Every day brings a new story.',
  'The work around it shouldn’t be the same old story.',
  'Newsroom AI Tools:',
]);

const KineticWords = ({
  text,
  enter,
  localFrame,
  fontSize,
  dark = false,
  accentColor = '#f26a48',
}: {
  text: string;
  enter: number;
  localFrame: number;
  fontSize: number;
  dark?: boolean;
  accentColor?: string;
}) => (
  <div style={{display: 'flex', flexWrap: 'wrap', columnGap: fontSize * 0.2, rowGap: fontSize * 0.08}}>
    {text.split(/\s+/).map((word, index) => {
      const wordIn = interpolate(localFrame, [index * 1.6, index * 1.6 + 7], [0, 1], {
        ...clamp,
        easing: Easing.out(Easing.cubic),
      });
      const accented = ACCENT_WORDS.has(word.toLowerCase());
      return (
        <span
          key={`${word}-${index}`}
          style={{
            display: 'inline-block',
            color: accented ? accentColor : dark ? '#101115' : '#e7e3dc',
            fontSize,
            fontWeight: 900,
            letterSpacing: '-0.055em',
            lineHeight: 0.94,
            opacity: wordIn * enter,
            transform: `translateY(${(1 - wordIn) * (index % 2 ? -30 : 34)}px) scaleY(${0.72 + wordIn * 0.28})`,
            transformOrigin: 'left bottom',
          }}
        >
          {word}
        </span>
      );
    })}
  </div>
);

export const BroadcastCaptions = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const nowMs = (frame / fps) * 1000;
  const active = BROADCAST_CAPTIONS.find(
    (caption) => nowMs >= caption.startMs && nowMs < caption.endMs
  );

  if (!active) return null;
  if (ALREADY_ON_SCREEN.has(active.text)) return null;

  const localFrame = frame - (active.startMs / 1000) * fps;
  const durationFrames = ((active.endMs - active.startMs) / 1000) * fps;
  const enter = interpolate(localFrame, [0, 7], [0, 1], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });
  const leave = interpolate(
    localFrame,
    [Math.max(8, durationFrames - 5), durationFrames],
    [1, 0],
    clamp
  );
  const opacity = Math.min(enter, leave);
  const mode = modeFor(active.text);

  if (mode === 'question') return null;

  if (mode === 'speech') {
    const bubbleWobble = interpolate(localFrame, [0, 5, 9], [0.88, 1.035, 1], clamp);
    const bubbleColor = active.text.startsWith('It') ? '#f26a48' : '#e7e3dc';
    return (
      <AbsoluteFill style={{pointerEvents: 'none', zIndex: 700}}>
        <div
          style={{
            position: 'absolute',
            left: 430,
            top: 330,
            width: 830,
            padding: '24px 30px 27px',
            boxSizing: 'border-box',
            border: '4px solid #101115',
            borderRadius: 24,
            background: bubbleColor,
            color: '#101115',
            fontFamily: 'Arial Black, Arial, Helvetica, sans-serif',
            filter: 'drop-shadow(12px 14px 0 rgba(8,10,13,.76))',
            opacity,
            transform: `translateY(${(1 - enter) * 38}px) scale(${bubbleWobble})`,
            transformOrigin: 'right center',
          }}
        >
          <KineticWords
            text={active.text}
            enter={enter}
            localFrame={localFrame}
            fontSize={40}
            dark
            accentColor={active.text.startsWith('It') ? '#e7e3dc' : '#f26a48'}
          />
        </div>
      </AbsoluteFill>
    );
  }

  if (mode === 'ctrl' || mode === 'one-click') {
    const hit = interpolate(localFrame, [0, 6, 11], [0.7, 1.08, 1], clamp);
    const copy = mode === 'ctrl' ? 'CTRL+C  ×  CTRL+V' : 'ONE CLICK';
    return (
      <AbsoluteFill style={{pointerEvents: 'none', zIndex: 700}}>
        <div
          style={{
            position: 'absolute',
            left: 86,
            bottom: 74,
            color: '#e7e3dc',
            fontFamily: 'Arial Black, Arial, sans-serif',
            fontSize: mode === 'ctrl' ? 86 : 112,
            fontWeight: 900,
            letterSpacing: '-0.065em',
            lineHeight: 0.82,
            opacity,
            textShadow: '0 8px 24px rgba(0,0,0,.82)',
            transform: `translateX(${(1 - enter) * -90}px) scale(${hit})`,
            transformOrigin: 'left bottom',
          }}
        >
          {copy}
          <span
            style={{
              display: 'inline-block',
              marginLeft: 22,
              color: '#f26a48',
              fontSize: mode === 'ctrl' ? 66 : 84,
              transform: `rotate(${(1 - enter) * -18}deg) scale(${0.6 + enter * 0.4})`,
            }}
          >
            {mode === 'ctrl' ? '✕' : '↗'}
          </span>
          <div
            style={{
              height: mode === 'ctrl' ? 13 : 8,
              width: mode === 'ctrl' ? 700 : 520,
              marginTop: 18,
              background: '#f26a48',
              transform: `scaleX(${enter}) rotate(${mode === 'ctrl' ? -2 : 0}deg)`,
              transformOrigin: 'left center',
            }}
          />
        </div>
      </AbsoluteFill>
    );
  }

  if (mode === 'finale') {
    const rise = interpolate(localFrame, [0, 9], [34, 0], {
      ...clamp,
      easing: Easing.out(Easing.cubic),
    });
    return (
      <AbsoluteFill style={{pointerEvents: 'none', zIndex: 700}}>
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 420,
            background:
              'linear-gradient(to top, rgba(3,6,11,.94) 0%, rgba(3,6,11,.72) 38%, rgba(3,6,11,.24) 72%, rgba(3,6,11,0) 100%)',
            opacity,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 96,
            bottom: 82,
            width: 1420,
            fontFamily: 'Arial Black, Arial, Helvetica, sans-serif',
            filter: 'drop-shadow(0 10px 24px rgba(0,0,0,.72))',
            opacity,
            transform: `translateY(${rise}px)`,
          }}
        >
          <KineticWords
            text={active.text}
            enter={enter}
            localFrame={localFrame}
            fontSize={62}
          />
        </div>
      </AbsoluteFill>
    );
  }

  if (mode === 'percussion' || mode === 'scale' || mode === 'story') {
    const positions: Record<string, {left: number; top?: number; bottom?: number; width: number; size: number}> = {
      percussion: {left: 86, top: 155, width: 1110, size: 78},
      scale: {left: 86, bottom: 74, width: 1380, size: 62},
      story: {left: 86, top: 180, width: 1260, size: 76},
    };
    const p = positions[mode];
    return (
      <AbsoluteFill style={{pointerEvents: 'none', zIndex: 700}}>
        <div
          style={{
            position: 'absolute',
            left: p.left,
            top: p.top,
            bottom: p.bottom,
            width: p.width,
            padding: mode === 'percussion' ? '18px 26px 20px' : mode === 'scale' ? '22px 28px' : 0,
            background: mode === 'percussion' ? 'linear-gradient(90deg, rgba(8,10,13,.80), rgba(8,10,13,.58) 76%, rgba(8,10,13,0))' : mode === 'scale' ? 'rgba(8,10,13,.72)' : undefined,
            borderLeft: mode === 'percussion' || mode === 'scale' ? '9px solid #f26a48' : undefined,
            filter: 'drop-shadow(0 8px 20px rgba(0,0,0,.68))',
            opacity,
            transform: `translateX(${(1 - enter) * -70}px)`,
          }}
        >
          <KineticWords text={active.text} enter={enter} localFrame={localFrame} fontSize={p.size} />
        </div>
      </AbsoluteFill>
    );
  }

  if (mode === 'human') {
    const ring = interpolate(localFrame, [0, 12], [0, 1], {...clamp, easing: Easing.out(Easing.cubic)});
    return (
      <AbsoluteFill style={{pointerEvents: 'none', zIndex: 700}}>
        <div
          style={{
            position: 'absolute',
            right: 90,
            bottom: 86,
            width: 500,
            height: 160,
            border: '5px solid #f26a48',
            borderRadius: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 42px',
            boxSizing: 'border-box',
            color: '#e7e3dc',
            background: 'rgba(8,10,13,.76)',
            fontFamily: 'Arial Black, Arial, sans-serif',
            fontSize: 43,
            fontWeight: 900,
            lineHeight: 0.94,
            opacity,
            transform: `scale(${0.7 + ring * 0.3}) rotate(${(1 - ring) * -8}deg)`,
          }}
        >
          <span style={{color: '#f26a48', marginRight: 16}}>↻</span>
          HUMANS IN THE LOOP
        </div>
      </AbsoluteFill>
    );
  }

  const words = active.text.split(/(\s+)/);

  return (
    <AbsoluteFill style={{pointerEvents: 'none', zIndex: 700}}>
      <div
        style={{
          position: 'absolute',
          left: 92,
          bottom: 70,
          width: 1240,
          display: 'flex',
          alignItems: 'stretch',
          opacity,
          transform: `translateY(${(1 - enter) * 34}px)`,
          filter: 'drop-shadow(0 6px 14px rgba(0,0,0,.72))',
        }}
      >
        <div
          style={{
            width: 9,
            background: '#f26a48',
            transform: `scaleY(${enter})`,
            transformOrigin: 'bottom center',
          }}
        />
        <div
          style={{
            background:
              'linear-gradient(90deg, rgba(8,10,13,.82), rgba(8,10,13,.46) 68%, rgba(8,10,13,0))',
            color: '#e7e3dc',
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: 34,
            fontWeight: 800,
            letterSpacing: '-0.025em',
            lineHeight: 1.12,
            padding: '18px 110px 17px 26px',
            maxWidth: 1210,
          }}
        >
          {words.map((word, index) => {
            const clean = word.trim().toLowerCase();
            const accented = ACCENT_WORDS.has(clean);
            return (
              <span
                key={`${word}-${index}`}
                style={{
                  color: accented ? '#f26a48' : '#e7e3dc',
                  display: word.trim() ? 'inline-block' : 'inline',
                  transform: accented ? `scale(${0.96 + enter * 0.04})` : undefined,
                  transformOrigin: 'left bottom',
                }}
              >
                {word}
              </span>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

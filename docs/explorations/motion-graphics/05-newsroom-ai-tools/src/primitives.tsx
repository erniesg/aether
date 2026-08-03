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
import {BEATS, FPS} from './timing';
import {THEMES, type StyleTheme, type VisualStyle} from './theme';

const clamp = {
  extrapolateLeft: 'clamp' as const,
  extrapolateRight: 'clamp' as const,
};

export const ease = (
  frame: number,
  from: number,
  to: number,
  output: [number, number] = [0, 1]
) =>
  interpolate(frame, [from, to], output, {
    ...clamp,
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

export const editorialEase = (
  frame: number,
  from: number,
  to: number,
  output: [number, number] = [0, 1]
) =>
  interpolate(frame, [from, to], output, {
    ...clamp,
    easing: Easing.bezier(0.45, 0, 0.55, 1),
  });

export const sceneOpacity = (
  frame: number,
  duration: number,
  fadeIn = 8,
  fadeOut = 8
) => {
  const entering = ease(frame, 0, fadeIn);
  const leaving = ease(frame, duration - fadeOut, duration, [1, 0]);
  return Math.min(entering, leaving);
};

export const nearestBeatEnergy = (seconds: number) => {
  const distance = Math.min(...BEATS.map((beat) => Math.abs(seconds - beat)));
  return Math.max(0, 1 - distance / 0.11);
};

export function Texture({
  style,
  intensity = 1,
}: {
  style: VisualStyle;
  intensity?: number;
}) {
  const theme = THEMES[style];
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const pulse = nearestBeatEnergy(frame / fps);
  const kirigami = style === 'kirigami';
  const newsprint = style === 'newsprint';

  return (
    <AbsoluteFill
      style={{
        background: kirigami
          ? `radial-gradient(circle at 50% 25%, ${theme.background} 0%, ${theme.backgroundAlt} 78%)`
          : newsprint
            ? `repeating-linear-gradient(0deg, rgba(17,17,15,.026) 0px, rgba(17,17,15,.026) 1px, transparent 1px, transparent 4px), ${theme.background}`
            : `radial-gradient(circle at 30% 20%, #d4c19f 0%, ${theme.background} 46%, ${theme.backgroundAlt} 150%)`,
      }}
    >
      <AbsoluteFill
        style={{
          opacity: intensity * (newsprint ? 0.16 : kirigami ? 0.09 : 0.2),
          background:
            'repeating-radial-gradient(circle at 18% 24%, rgba(0,0,0,.25) 0, rgba(0,0,0,.25) 0.65px, transparent 0.7px, transparent 4px)',
          transform: `translate(${pulse * 0.8}px, ${pulse * -0.5}px)`,
        }}
      />
      {style === 'scrapbook' ? (
        <>
          <div
            style={{
              position: 'absolute',
              left: -120,
              top: 90,
              width: 470,
              height: 120,
              background: '#d9c5a4',
              opacity: 0.38,
              transform: 'rotate(-9deg)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              right: -90,
              bottom: 70,
              width: 410,
              height: 90,
              background: '#745f4b',
              opacity: 0.18,
              transform: 'rotate(8deg)',
            }}
          />
        </>
      ) : null}
    </AbsoluteFill>
  );
}

export function Paper({
  children,
  style,
  color,
  rotate = 0,
  shadow = true,
  className,
  css,
}: {
  children?: ReactNode;
  style: VisualStyle;
  color?: string;
  rotate?: number;
  shadow?: boolean;
  className?: string;
  css?: CSSProperties;
}) {
  const theme = THEMES[style];
  const clipPath =
    style === 'scrapbook'
      ? 'polygon(0 2%, 4% 0, 9% 2%, 14% 0, 20% 1%, 27% 0, 33% 2%, 40% 0, 47% 1%, 55% 0, 62% 2%, 70% 0, 78% 1%, 86% 0, 94% 2%, 100% 0, 99% 96%, 95% 100%, 89% 98%, 82% 100%, 74% 98%, 67% 100%, 58% 98%, 50% 100%, 42% 98%, 34% 100%, 25% 98%, 16% 100%, 8% 98%, 0 100%)'
      : style === 'newsprint'
        ? 'polygon(0 0, 100% 0, 98.8% 100%, 1.2% 99%)'
        : 'polygon(0 0, 100% 0, 100% 100%, 0 100%)';

  return (
    <div
      className={className}
      style={{
        background: color ?? theme.paper,
        boxShadow: shadow ? `0 22px 48px ${theme.shadow}` : undefined,
        clipPath,
        color: theme.ink,
        position: 'relative',
        transform: `rotate(${rotate}deg)`,
        ...css,
      }}
    >
      {style === 'newsprint' ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0.08,
            pointerEvents: 'none',
            background:
              'repeating-linear-gradient(0deg, #111 0, #111 1px, transparent 1px, transparent 5px)',
          }}
        />
      ) : null}
      {children}
    </div>
  );
}

export function Tape({
  style,
  css,
}: {
  style: VisualStyle;
  css?: CSSProperties;
}) {
  const theme = THEMES[style];
  return (
    <div
      style={{
        position: 'absolute',
        width: 150,
        height: 38,
        background:
          style === 'kirigami'
            ? theme.accent2
            : style === 'newsprint'
              ? theme.accent
              : 'rgba(236, 213, 151, .78)',
        opacity: style === 'newsprint' ? 0.9 : 0.72,
        clipPath:
          'polygon(0 12%, 6% 1%, 13% 9%, 20% 0, 28% 8%, 36% 1%, 44% 9%, 52% 0, 60% 8%, 68% 2%, 76% 9%, 84% 0, 92% 8%, 100% 3%, 98% 88%, 91% 99%, 83% 91%, 75% 100%, 67% 91%, 59% 99%, 51% 91%, 43% 100%, 35% 92%, 27% 99%, 19% 91%, 11% 100%, 2% 90%)',
        ...css,
      }}
    />
  );
}

export function Photo({
  src,
  style,
  objectPosition = 'center',
  css,
  imageCss,
}: {
  src: string;
  style: VisualStyle;
  objectPosition?: string;
  css?: CSSProperties;
  imageCss?: CSSProperties;
}) {
  const theme = THEMES[style];
  return (
    <div
      style={{
        overflow: 'hidden',
        position: 'relative',
        border:
          style === 'kirigami'
            ? `12px solid ${theme.paper}`
            : style === 'newsprint'
              ? `5px solid ${theme.ink}`
              : `10px solid ${theme.paper}`,
        boxShadow: `0 24px 44px ${theme.shadow}`,
        ...css,
      }}
    >
      <Img
        src={staticFile(src)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition,
          filter:
            style === 'newsprint'
              ? 'grayscale(1) contrast(1.25) sepia(.12)'
              : style === 'scrapbook'
                ? 'saturate(.82) contrast(1.05) sepia(.08)'
                : 'saturate(.78) contrast(1.08)',
          ...imageCss,
        }}
      />
      {style === 'newsprint' ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'repeating-radial-gradient(circle, rgba(0,0,0,.14) 0, rgba(0,0,0,.14) .8px, transparent .9px, transparent 4px)',
            mixBlendMode: 'multiply',
            opacity: 0.34,
          }}
        />
      ) : null}
    </div>
  );
}

export function HeadlineStrip({
  children,
  style,
  dark = false,
  accent = false,
  css,
}: {
  children: ReactNode;
  style: VisualStyle;
  dark?: boolean;
  accent?: boolean;
  css?: CSSProperties;
}) {
  const theme = THEMES[style];
  const background = accent ? theme.accent : dark ? theme.ink : theme.paper;
  const color = dark || accent ? theme.paper : theme.ink;
  return (
    <Paper
      style={style}
      color={background}
      shadow
      css={{
        alignItems: 'center',
        display: 'flex',
        justifyContent: 'center',
        minHeight: 116,
        padding: '24px 48px 20px',
        ...css,
      }}
    >
      <div
        style={{
          color,
          fontFamily: style === 'newsprint' ? theme.headline : theme.headline,
          fontSize: 62,
          fontStyle: style === 'scrapbook' ? 'italic' : 'normal',
          fontWeight: 900,
          letterSpacing: style === 'newsprint' ? '-0.035em' : '0.08em',
          lineHeight: 1,
          textAlign: 'center',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}
      >
        {children}
      </div>
    </Paper>
  );
}

export function MarketSparkline({
  style,
  progress,
  width = 720,
  height = 300,
}: {
  style: VisualStyle;
  progress: number;
  width?: number;
  height?: number;
}) {
  const theme = THEMES[style];
  const path =
    'M 28 246 C 74 236, 92 252, 126 226 S 188 204, 221 218 S 286 186, 330 196 S 398 142, 438 164 S 492 117, 536 134 S 596 78, 636 104 S 680 50, 706 38';
  return (
    <svg width={width} height={height} viewBox="0 0 740 300">
      {[55, 115, 175, 235].map((y) => (
        <line
          key={y}
          x1="24"
          y1={y}
          x2="716"
          y2={y}
          stroke={theme.ink}
          strokeOpacity={0.16}
          strokeWidth={2}
          strokeDasharray={style === 'scrapbook' ? '11 9' : undefined}
        />
      ))}
      <path
        d={path}
        fill="none"
        pathLength={1}
        stroke={theme.accent}
        strokeWidth={style === 'kirigami' ? 13 : 9}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={1}
        strokeDashoffset={1 - progress}
      />
      <circle
        cx="706"
        cy="38"
        r={9 + progress * 7}
        fill={theme.accent2}
        opacity={progress}
      />
    </svg>
  );
}

export function SmallLabel({
  children,
  style,
  css,
}: {
  children: ReactNode;
  style: VisualStyle;
  css?: CSSProperties;
}) {
  const theme = THEMES[style];
  return (
    <div
      style={{
        color: theme.ink,
        fontFamily: theme.mono,
        fontSize: 24,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        ...css,
      }}
    >
      {children}
    </div>
  );
}

export function SceneTag({
  style,
  children,
}: {
  style: VisualStyle;
  children: ReactNode;
}) {
  const theme = THEMES[style];
  return (
    <div
      style={{
        background: style === 'kirigami' ? theme.accent2 : theme.ink,
        color: style === 'kirigami' ? theme.ink : theme.paper,
        fontFamily: theme.mono,
        fontSize: 18,
        fontWeight: 700,
        left: 66,
        letterSpacing: '0.16em',
        padding: '10px 14px 8px',
        position: 'absolute',
        textTransform: 'uppercase',
        top: 48,
        zIndex: 80,
      }}
    >
      {children}
    </div>
  );
}

export function PaperTransition({
  style,
  at,
}: {
  style: VisualStyle;
  at: number;
}) {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const center = at * fps;
  const start = center - 6;
  const mid = center;
  const end = center + 7;
  const enter = ease(frame, start, mid);
  const exit = ease(frame, mid, end, [1, 0]);
  const amount = Math.min(enter, exit);
  if (amount <= 0.001) return null;

  const theme = THEMES[style];
  if (style === 'kirigami') {
    return (
      <AbsoluteFill
        style={{
          zIndex: 100,
          perspective: 1200,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: '-5%',
            background: theme.paper,
            borderLeft: `18px solid ${theme.accent}`,
            transformOrigin: 'left center',
            transform: `rotateY(${interpolate(amount, [0, 1], [-92, 0])}deg)`,
            boxShadow: `22px 0 60px ${theme.shadow}`,
          }}
        />
      </AbsoluteFill>
    );
  }

  const direction = Math.floor(at * 10) % 2 === 0 ? 1 : -1;
  return (
    <AbsoluteFill style={{zIndex: 100, pointerEvents: 'none', overflow: 'hidden'}}>
      <div
        style={{
          position: 'absolute',
          left: direction === 1 ? '-8%' : undefined,
          right: direction === -1 ? '-8%' : undefined,
          top: '28%',
          width: `${50 + amount * 72}%`,
          height: style === 'newsprint' ? 210 : 168,
          background: style === 'newsprint' ? theme.ink : theme.paper,
          clipPath:
            'polygon(0 4%, 5% 0, 12% 5%, 20% 0, 28% 4%, 36% 0, 44% 5%, 52% 0, 60% 4%, 68% 0, 76% 5%, 84% 0, 92% 4%, 100% 0, 99% 94%, 92% 100%, 84% 95%, 76% 100%, 68% 96%, 60% 100%, 52% 95%, 44% 100%, 36% 96%, 28% 100%, 20% 95%, 12% 100%, 4% 95%, 0 100%)',
          transform: `rotate(${direction * -4}deg) translateX(${(1 - amount) * direction * -520}px)`,
          boxShadow: `0 22px 54px ${theme.shadow}`,
        }}
      />
      {style === 'newsprint' ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: theme.paper,
            fontFamily: theme.headline,
            fontSize: 98,
            fontWeight: 900,
            letterSpacing: '-0.04em',
            opacity: amount,
            textTransform: 'uppercase',
          }}
        >
          EDIT • VERIFY • PUBLISH
        </div>
      ) : null}
    </AbsoluteFill>
  );
}

export const composedTransform = ({
  x = 0,
  y = 0,
  rotate = 0,
  scale = 1,
  rotateX = 0,
  rotateY = 0,
}: {
  x?: number;
  y?: number;
  rotate?: number;
  scale?: number;
  rotateX?: number;
  rotateY?: number;
}) =>
  `translate3d(${x}px, ${y}px, 0) rotate(${rotate}deg) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(${scale})`;

export const beatJitter = (frame: number, style: VisualStyle, strength = 1) => {
  if (style === 'kirigami') return 0;
  const seconds = frame / FPS;
  const pulse = nearestBeatEnergy(seconds);
  return Math.sin(frame * 2.71) * pulse * strength;
};


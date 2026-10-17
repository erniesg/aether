import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

export const SCENE_01_NEWS_FPS = 24;
export const SCENE_01_NEWS_DURATION = 145;

type StoryPanel = {
  asset: string;
  x: number;
  y: number;
  width: number;
  height: number;
  startSeconds: number;
  durationSeconds: number;
  enterX: number;
  enterY: number;
  enterRotation: number;
  enterScale: number;
};

const stories: StoryPanel[] = [
  {
    asset: '01-zaobao.png',
    x: 368,
    y: 153,
    width: 514,
    height: 243,
    startSeconds: 0.18,
    durationSeconds: 0.48,
    enterX: -548,
    enterY: -5,
    enterRotation: -0.65,
    enterScale: 1.03,
  },
  {
    asset: '02-tamil.png',
    x: 1084,
    y: 193,
    width: 491,
    height: 233,
    startSeconds: 0.52,
    durationSeconds: 0.54,
    enterX: 526,
    enterY: 4,
    enterRotation: 0.55,
    enterScale: 1.035,
  },
  {
    asset: '03-berita-harian.png',
    x: 310,
    y: 426,
    width: 506,
    height: 230,
    startSeconds: 0.88,
    durationSeconds: 0.46,
    enterX: -540,
    enterY: 5,
    enterRotation: 0.45,
    enterScale: 1.025,
  },
  {
    asset: '04-straits-times.png',
    x: 1150,
    y: 468,
    width: 520,
    height: 221,
    startSeconds: 1.25,
    durationSeconds: 0.58,
    enterX: 556,
    enterY: -4,
    enterRotation: -0.4,
    enterScale: 1.03,
  },
  {
    asset: '05-business-times.png',
    x: 666,
    y: 700,
    width: 528,
    height: 212,
    startSeconds: 1.68,
    durationSeconds: 0.62,
    enterX: 0,
    enterY: 252,
    enterRotation: 0.35,
    enterScale: 1.025,
  },
];

const StoryWindow = ({story}: {story: StoryPanel}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const start = story.startSeconds * fps;
  const end = start + story.durationSeconds * fps;

  const arrival = interpolate(frame, [start, end], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const opacity = interpolate(frame, [start, start + 0.16 * fps], [0, 1], {
    easing: Easing.out(Easing.quad),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const translateX = story.enterX * (1 - arrival);
  const translateY = story.enterY * (1 - arrival);
  const rotation = story.enterRotation * (1 - arrival);
  const scale = 1 + (story.enterScale - 1) * (1 - arrival);

  return (
    <div
      style={{
        position: 'absolute',
        left: story.x,
        top: story.y,
        width: story.width,
        height: story.height,
        overflow: 'hidden',
        backgroundColor: '#efe7d8',
      }}
    >
      <Img
        src={staticFile(`assets/scene-01-news-headlines/${story.asset}`)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity,
          transform: `translate3d(${translateX}px, ${translateY}px, 0) rotate(${rotation}deg) scale(${scale})`,
          transformOrigin: '50% 50%',
          boxShadow: '0 10px 24px rgba(11, 17, 22, 0.32)',
        }}
      />
    </div>
  );
};

export const Scene01NewsHeadlines = () => {
  const frame = useCurrentFrame();
  const foregroundFrame = String(
    Math.min(frame + 1, SCENE_01_NEWS_DURATION),
  ).padStart(3, '0');

  return (
    <AbsoluteFill style={{backgroundColor: '#efe7d8'}}>
      {stories.map((story) => (
        <StoryWindow key={story.asset} story={story}/>
      ))}

      <Img
        src={staticFile(
          `assets/scene-01-news-headlines/foreground-webp/frame-${foregroundFrame}.webp`,
        )}
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
};

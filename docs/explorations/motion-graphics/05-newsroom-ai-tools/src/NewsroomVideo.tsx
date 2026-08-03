import {Audio} from '@remotion/media';
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {PaperTransition, Texture} from './primitives';
import {
  CtrlVScene,
  EndScene,
  HumanScene,
  OpeningScene,
  PipelineScene,
  ReaderScene,
  RoutineScene,
  ScaleScene,
} from './scenes';
import {CUTS, FPS, VIDEO_SECONDS, secondsToFrames} from './timing';
import {THEMES, type VisualStyle} from './theme';

export {FPS, type VisualStyle};

export const DURATION_IN_FRAMES = FPS * VIDEO_SECONDS;

type NewsroomVideoProps = {
  visualStyle: VisualStyle;
  label?: string;
};

const scene = (start: number, end: number) => ({
  from: secondsToFrames(start),
  duration: secondsToFrames(end - start),
});

const SCENES = {
  opening: scene(0, 3.4),
  reader: scene(3.14, 6.98),
  routine: scene(6.7, 9.8),
  ctrlV: scene(9.34, 14.98),
  pipeline: scene(14.44, 19.4),
  human: scene(18.94, 22.6),
  scale: scene(22.06, 27.4),
  end: scene(26.72, VIDEO_SECONDS),
};

export const NewsroomVideo = ({visualStyle}: NewsroomVideoProps) => {
  const theme = THEMES[visualStyle];
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const musicVolume = (audioFrame: number) => {
    const fadeIn = interpolate(audioFrame, [0, fps * 0.5], [0, 0.13], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    const outroLift = interpolate(
      audioFrame,
      [secondsToFrames(29.7), secondsToFrames(32.7)],
      [0.13, 0.25],
      {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}
    );
    const fadeOut = interpolate(
      audioFrame,
      [secondsToFrames(33.1), DURATION_IN_FRAMES - 1],
      [1, 0],
      {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}
    );
    return Math.max(fadeIn, outroLift) * fadeOut;
  };

  const edgeShade = interpolate(frame, [0, DURATION_IN_FRAMES], [0.18, 0.28], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        background: theme.background,
        color: theme.ink,
        fontFamily: theme.body,
        overflow: 'hidden',
      }}
    >
      <Texture style={visualStyle} />

      <Sequence
        from={SCENES.opening.from}
        durationInFrames={SCENES.opening.duration}
        premountFor={fps}
      >
        <OpeningScene style={visualStyle} duration={SCENES.opening.duration} />
      </Sequence>
      <Sequence
        from={SCENES.reader.from}
        durationInFrames={SCENES.reader.duration}
        premountFor={fps}
      >
        <ReaderScene style={visualStyle} duration={SCENES.reader.duration} />
      </Sequence>
      <Sequence
        from={SCENES.routine.from}
        durationInFrames={SCENES.routine.duration}
        premountFor={fps}
      >
        <RoutineScene style={visualStyle} duration={SCENES.routine.duration} />
      </Sequence>
      <Sequence
        from={SCENES.ctrlV.from}
        durationInFrames={SCENES.ctrlV.duration}
        premountFor={fps}
      >
        <CtrlVScene style={visualStyle} duration={SCENES.ctrlV.duration} />
      </Sequence>
      <Sequence
        from={SCENES.pipeline.from}
        durationInFrames={SCENES.pipeline.duration}
        premountFor={fps}
      >
        <PipelineScene style={visualStyle} duration={SCENES.pipeline.duration} />
      </Sequence>
      <Sequence
        from={SCENES.human.from}
        durationInFrames={SCENES.human.duration}
        premountFor={fps}
      >
        <HumanScene style={visualStyle} duration={SCENES.human.duration} />
      </Sequence>
      <Sequence
        from={SCENES.scale.from}
        durationInFrames={SCENES.scale.duration}
        premountFor={fps}
      >
        <ScaleScene style={visualStyle} duration={SCENES.scale.duration} />
      </Sequence>
      <Sequence
        from={SCENES.end.from}
        durationInFrames={SCENES.end.duration}
        premountFor={fps}
      >
        <EndScene style={visualStyle} duration={SCENES.end.duration} />
      </Sequence>

      {CUTS.map((at) => (
        <PaperTransition key={at} style={visualStyle} at={at} />
      ))}

      <AbsoluteFill
        style={{
          pointerEvents: 'none',
          background: `radial-gradient(circle at center, transparent 52%, rgba(8, 7, 6, ${edgeShade}) 125%)`,
          zIndex: 200,
        }}
      />

      <Audio src={staticFile('assets/music.mp3')} volume={musicVolume} />
      <Audio src={staticFile('assets/voiceover.mp3')} volume={1} />
    </AbsoluteFill>
  );
};

import {Composition, Folder, Still} from 'remotion';
import {
  STYLEBOARD_HEIGHT,
  STYLEBOARD_WIDTH,
  StyleboardPreview,
  type StyleboardVariant,
} from './styleboards';
import {
  DURATION_IN_FRAMES,
  FPS,
  NewsroomVideo,
  type VisualStyle,
} from './NewsroomVideo';
import {
  BRAND_FILM_DURATION_IN_FRAMES,
  BRAND_FILM_FPS,
  BrandFilmPlaceholder,
} from './BrandFilmPlaceholder';
import {
  STYLE_PREVIEW_DURATION,
  STYLE_PREVIEW_FPS,
  StylePreview,
  type StylePreviewVariant,
} from './StylePreview';
import {
  ROUTINE_SCREEN_DURATION,
  ROUTINE_SCREEN_FPS,
  RoutineScreenPreview,
} from './RoutineScreenPreview';
import {
  SCENE_01_NEWS_DURATION,
  SCENE_01_NEWS_FPS,
  Scene01NewsHeadlines,
} from './Scene01NewsHeadlines';
import {
  INTRO_CREDITS_DURATION_IN_FRAMES,
  INTRO_CREDITS_FPS,
  IntroCredits,
} from './IntroCredits';
import {
  BROADCAST_DURATION_IN_FRAMES,
  BROADCAST_FPS,
  BroadcastSlateFilm,
} from './BroadcastSlateFilm';

const styles: Array<{id: string; label: string; visualStyle: VisualStyle}> = [
  {
    id: 'NewsroomAI-Scrapbook',
    label: 'Mixed media scrapbook',
    visualStyle: 'scrapbook',
  },
  {
    id: 'NewsroomAI-Newsprint',
    label: 'Newsprint photomontage',
    visualStyle: 'newsprint',
  },
  {
    id: 'NewsroomAI-Kirigami',
    label: 'Kirigami pop-up',
    visualStyle: 'kirigami',
  },
];

const styleboards: Array<{id: string; variant: StyleboardVariant}> = [
  {id: 'Styleboard-A-PaperCollage', variant: 'paper-collage'},
  {id: 'Styleboard-B-NewsprintProof', variant: 'newsprint-proof'},
  {id: 'Styleboard-C-BroadcastSlate', variant: 'broadcast-slate'},
  {id: 'Styleboard-D-WireTerminal', variant: 'wire-terminal'},
  {id: 'Styleboard-E-ProductKeynote', variant: 'product-keynote'},
  {id: 'Styleboard-F-RedlineEdit', variant: 'redline-edit'},
];

const previewStyles: Array<{id: string; variant: StylePreviewVariant}> = [
  {id: 'NewsroomStylePreview-EditorialPaper', variant: 'editorial'},
  {id: 'NewsroomStylePreview-MinimalCinematic', variant: 'minimal'},
  {id: 'NewsroomStylePreview-DataStory', variant: 'data'},
];

export const RemotionRoot = () => {
  return (
    <Folder name="Newsroom-AI-Tools">
      <Folder name="Style-Previews">
        {previewStyles.map(({id, variant}) => (
          <Composition
            key={id}
            id={id}
            component={StylePreview}
            width={1920}
            height={1080}
            fps={STYLE_PREVIEW_FPS}
            durationInFrames={STYLE_PREVIEW_DURATION}
            defaultProps={{variant}}
          />
        ))}
      </Folder>
      {styleboards.map(({id, variant}) => (
        <Still
          key={id}
          id={id}
          component={StyleboardPreview}
          width={STYLEBOARD_WIDTH}
          height={STYLEBOARD_HEIGHT}
          defaultProps={{variant}}
        />
      ))}
      <Composition
        id="NewsroomAI-BrandFilm-Placeholder"
        component={BrandFilmPlaceholder}
        width={1920}
        height={1080}
        fps={BRAND_FILM_FPS}
        durationInFrames={BRAND_FILM_DURATION_IN_FRAMES}
      />
      <Composition
        id="NewsroomAI-BroadcastSlate-Final"
        component={BroadcastSlateFilm}
        width={1920}
        height={1080}
        fps={BROADCAST_FPS}
        durationInFrames={BROADCAST_DURATION_IN_FRAMES}
      />
      <Composition
        id="NewsroomAI-IntroCredits"
        component={IntroCredits}
        width={1920}
        height={1080}
        fps={INTRO_CREDITS_FPS}
        durationInFrames={INTRO_CREDITS_DURATION_IN_FRAMES}
      />
      <Composition
        id="Scene03-RoutineScreen-Preview"
        component={RoutineScreenPreview}
        width={1280}
        height={720}
        fps={ROUTINE_SCREEN_FPS}
        durationInFrames={ROUTINE_SCREEN_DURATION}
      />
      <Composition
        id="Scene01-NewsHeadlines-Animated"
        component={Scene01NewsHeadlines}
        width={1920}
        height={1080}
        fps={SCENE_01_NEWS_FPS}
        durationInFrames={SCENE_01_NEWS_DURATION}
      />
      {styles.map(({id, label, visualStyle}) => (
        <Composition
          key={id}
          id={id}
          component={NewsroomVideo}
          width={1920}
          height={1080}
          fps={FPS}
          durationInFrames={DURATION_IN_FRAMES}
          defaultProps={{visualStyle, label}}
        />
      ))}
    </Folder>
  );
};

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
];

export const RemotionRoot = () => {
  return (
    <Folder name="Newsroom-AI-Tools">
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

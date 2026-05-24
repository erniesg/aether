import React from 'react';
import { Composition } from 'remotion';
import { EventRecap, type EventRecapProps } from './EventRecap/EventRecap';
import { aie2026SampleBundle } from './EventRecap/data';

/**
 * Two compositions, same scene graph, different aspect ratios:
 *   EventRecapVertical   1080 × 1920   TikTok / Reels / Shorts
 *   EventRecapHorizontal 1920 × 1080   YouTube / LinkedIn video / X video
 *
 * Both run at 30fps for 60s = 1800 frames. The composition orchestrates
 * the scenes (see EventRecap.tsx) and adapts layout per orientation prop.
 */
const FPS = 30;
const DURATION_FRAMES = 60 * FPS;

const defaultPropsVertical: EventRecapProps = {
  bundle: aie2026SampleBundle,
  orientation: 'vertical',
};

const defaultPropsHorizontal: EventRecapProps = {
  bundle: aie2026SampleBundle,
  orientation: 'horizontal',
};

// Remotion's `Composition` is typed against `Record<string, unknown>`; we
// satisfy it by casting our typed default props through `unknown` so the
// generic still picks up the component's real prop shape at the call site.
const asLooseProps = <T,>(props: T) => props as unknown as Record<string, unknown>;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="EventRecapVertical"
        component={EventRecap as unknown as React.ComponentType<Record<string, unknown>>}
        durationInFrames={DURATION_FRAMES}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={asLooseProps(defaultPropsVertical)}
      />
      <Composition
        id="EventRecapHorizontal"
        component={EventRecap as unknown as React.ComponentType<Record<string, unknown>>}
        durationInFrames={DURATION_FRAMES}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={asLooseProps(defaultPropsHorizontal)}
      />
    </>
  );
};

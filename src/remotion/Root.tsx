import React from 'react';
import { Composition } from 'remotion';
import { EventRecap, type EventRecapProps } from './EventRecap/EventRecap';
import { aie2026SampleBundle } from './EventRecap/data';
import { SundanceDoc, type SundanceProps } from './variants/sundance-doc/Composition';

/**
 * Compositions:
 *   EventRecapVertical   1080 × 1920   TikTok / Reels / Shorts (legacy 60s)
 *   EventRecapHorizontal 1920 × 1080   YouTube / LinkedIn video (legacy 60s)
 *
 *   Variant-<slug>-Vertical    1080×1920  12s · 360 frames @ 30fps
 *   Variant-<slug>-Horizontal  1920×1080  12s · 360 frames @ 30fps
 *
 * Variants live in src/remotion/variants/<slug>/Composition.tsx and are
 * 12 seconds each (3 scenes × ~4s). Each variant pushes a distinct
 * aesthetic — see the handoff doc for the full list of 10 vibes.
 */
const FPS = 30;
const LEGACY_DURATION_FRAMES = 60 * FPS;
const VARIANT_DURATION_FRAMES = 12 * FPS;

const defaultPropsVertical: EventRecapProps = {
  bundle: aie2026SampleBundle,
  orientation: 'vertical',
};

const defaultPropsHorizontal: EventRecapProps = {
  bundle: aie2026SampleBundle,
  orientation: 'horizontal',
};

const variantVertical: SundanceProps = {
  bundle: aie2026SampleBundle,
  orientation: 'vertical',
};

const variantHorizontal: SundanceProps = {
  bundle: aie2026SampleBundle,
  orientation: 'horizontal',
};

// Remotion's `Composition` is typed against `Record<string, unknown>`; we
// satisfy it by casting our typed default props through `unknown` so the
// generic still picks up the component's real prop shape at the call site.
const asLooseProps = <T,>(props: T) => props as unknown as Record<string, unknown>;
const asLooseComponent = <P,>(c: React.ComponentType<P>) =>
  c as unknown as React.ComponentType<Record<string, unknown>>;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="EventRecapVertical"
        component={asLooseComponent(EventRecap)}
        durationInFrames={LEGACY_DURATION_FRAMES}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={asLooseProps(defaultPropsVertical)}
      />
      <Composition
        id="EventRecapHorizontal"
        component={asLooseComponent(EventRecap)}
        durationInFrames={LEGACY_DURATION_FRAMES}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={asLooseProps(defaultPropsHorizontal)}
      />

      {/* === Variant 1 · sundance-doc === */}
      <Composition
        id="Variant-sundance-doc-Vertical"
        component={asLooseComponent(SundanceDoc)}
        durationInFrames={VARIANT_DURATION_FRAMES}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={asLooseProps(variantVertical)}
      />
      <Composition
        id="Variant-sundance-doc-Horizontal"
        component={asLooseComponent(SundanceDoc)}
        durationInFrames={VARIANT_DURATION_FRAMES}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={asLooseProps(variantHorizontal)}
      />
    </>
  );
};

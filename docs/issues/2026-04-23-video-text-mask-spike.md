# Issue: Add a Video Text-Mask Spike

Date: 2026-04-23
Status: initial spike shipped
Priority: P2

## Problem

The repo already claims provider-agnostic image and video generation, but there is no concrete video slice yet. For the hackathon intro, we need a creator-facing motion effect that is visually strong, fast to prototype, and reusable for both moving and still assets.

## Shipped

- added `lib/providers/video/types.ts` with the first real `VideoGenProvider` contract and programmatic `sceneSpec`
- added `lib/video/textMask.ts` to normalize a text-mask scene that can sit over either a video or an image
- added `lib/video/hyperframes.ts` to emit a HyperFrames-compatible HTML composition from that shared scene spec
- added `scripts/video/emit-hyperframes-text-mask.ts` and `npm run video:text-mask`
- added `experiments/video/README.md` with the spike workflow

## Why this effect

- It is artifact-first: the output is a short intro visual, not a tool console.
- It respects the canvas direction because the effect can later become a canvas-native `MotionAsset`.
- It works for both media classes:
  - moving footage under the text for intros and bumpers
  - still hero imagery under the text for posters or title cards

## Important limitations

- Nothing is wired into the workspace shell yet.
- No video provider registry or live renderer adapter ships in this slice.
- The HyperFrames composition emitter outputs HTML; it does not install or run HyperFrames automatically.

## Remaining work

- add a real `lib/providers/video/registry.ts`
- decide whether the first renderer adapter should be HyperFrames, Remotion, or both
- add a canvas-native `MotionAsset` shape and provenance flow

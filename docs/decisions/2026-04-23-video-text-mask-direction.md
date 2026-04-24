# Decision: Text-Mask Video Direction

Date: 2026-04-23
Status: accepted for the spike branch

## Question

What is the fastest credible path for aether to prototype a creator-facing hackathon intro where oversized text masks an underlying video, while keeping the effect reusable for still images and compatible with the repo's provider-agnostic direction?

## What is true as of April 23, 2026

- Remotion's official docs now maintain agent skills for AI coding agents, and the page was last updated on April 22, 2026.[1]
- HyperFrames positions itself as an HTML/CSS/JS-first video system for AI agents and documents agent-skill installation, browser preview, and MP4 rendering through FFmpeg.[2]
- HyperFrames' own comparison guide explains why it prefers HTML + CSS + JS over React-first video authoring for agent-driven composition work, especially when GSAP and arbitrary DOM/CSS are involved.[3]

## Findings

### 1. The effect itself is renderer-agnostic

The visual trick is not specific to a video engine. It is:

1. one underlying media layer
2. one text-shaped mask
3. optional outline/glow text on top
4. simple intro motion

That means the durable abstraction is a typed scene spec plus a reusable SVG/CSS mask, not a one-off Remotion component.

### 2. The same mask works over video and images

Because the mask is just text-shaped alpha, the source underneath can be either:

- a looping video for an intro or bumper
- a still image for a poster-like title card

Conclusion: the effect should be modeled around `media.kind: 'video' | 'image'`, not around a video-only API.

### 3. HyperFrames is the fastest spike path

For this specific effect, HyperFrames has two practical advantages:

- HTML/CSS masks and outline text are native browser primitives.
- GSAP-driven intro motion maps directly to HyperFrames' documented authoring model.

Inference from the docs and this repo's current state: HyperFrames is the fastest spike vehicle because the repo has no video renderer yet, and this effect benefits more from DOM/CSS authoring than from a React component tree on day one.

### 4. Remotion still matters later

Remotion remains strategically useful:

- the repo architecture already names it as the safer deterministic adapter
- official agent skills exist now
- a later Remotion adapter can consume the same scene spec once the repo is ready for a renderer dependency

## Decision

1. Add a shared `text-mask` scene spec first.
2. Treat image and video as two source-media modes of the same effect.
3. Emit a HyperFrames-compatible HTML composition now for the spike branch.
4. Keep the scene spec renderer-agnostic so a Remotion adapter can follow without redesigning the effect.

## Why this fits aether

- It is creator-facing and artifact-first.
- It avoids an operator-style video dashboard.
- It moves toward the deferred `MotionAsset` stretch without forcing a full renderer decision into the main branch.

## Sources

1. Remotion agent skills docs: https://www.remotion.dev/docs/ai/skills
2. HyperFrames quickstart: https://hyperframes.heygen.com/quickstart
3. HyperFrames vs Remotion: https://hyperframes.heygen.com/guides/hyperframes-vs-remotion

# Double-Exposure Skills

These double-exposure effects are exposed in two layers:

- `tool`: the runnable generator command in `scripts/video/emit-hyperframes-double-exposure.ts`
- `skill`: a named creator-facing scene recipe in `lib/video/doubleExposureSkills.ts`

The current workspace capability rerun path is still image-only. Until the repo has a real video execution route, these effects are exposed as scene-spec skills plus a CLI tool instead of pretending they are live canvas buttons.

## Quick Start

List the available skills:

```bash
npm run video:double-exposure:skills
```

Emit one of the built-in skills with its default assets:

```bash
npm run video:double-exposure -- --skill echo-still
npm run video:double-exposure -- --skill lumen-video
npm run video:double-exposure -- --skill raw-effect-compare
```

You can still override any part of the skill:

```bash
npm run video:double-exposure -- \
  --skill echo-still \
  --subject ./my-portrait.png \
  --exposure ./my-forest-plate.jpg \
  --overlay-title "Northbound" \
  --output ./experiments/video/custom-double-exposure/index.html
```

## Skill Catalog

### `echo-still`

- Use when the intro should read like a premium poster frame.
- Best inputs: a high-contrast portrait on black, plus a still city, forest, shoreline, or industrial plate with a readable horizon line.
- Output: `experiments/video/double-exposure-image/index.html`

### `lumen-video`

- Use when the portrait should stay still but the interior needs quiet motion.
- Best inputs: a portrait on black plus a slow light-field, haze, abstract footage, or restrained city drift clip.
- Output: `experiments/video/double-exposure-video/index.html`

### `raw-effect-compare`

- Use during review or tuning.
- Starts with the untreated portrait and exposes the blend through the compare chip or the `D` key.
- Output: `experiments/video/double-exposure-compare/index.html`

## Asset Guidance

- Subject plate:
  - Prefer black or near-black background.
  - Prefer clear jawline, cheek, hair edge, or shoulder separation.
  - Head-and-shoulders crops read better than full-body plates for this effect.
- Exposure plate:
  - Strong large-scale shapes work better than noisy detail.
  - Avoid plates that introduce unwanted semantic clutter inside the face.
  - Bright sky, haze, water, trees, skyline edges, and architectural silhouettes usually read well.
- Motion plate:
  - Favor slow drift, bloom, fog, or light leaks.
  - Avoid literal busy footage unless the concept specifically needs it.

## Where To Edit

- Scene-spec contract: `lib/video/doubleExposure.ts`
- Named skills: `lib/video/doubleExposureSkills.ts`
- HTML/HyperFrames adapter: `lib/video/hyperframesDoubleExposure.ts`
- Generator tool: `scripts/video/emit-hyperframes-double-exposure.ts`
- Screenshot proof tool: `scripts/video/capture-double-exposure-screenshots.mjs`

## Promotion Path

If this graduates from spike to product surface:

1. Keep the named skills as the creator-facing intent layer.
2. Route them through a real video capability endpoint instead of the image-only rerun path.
3. Preserve the scene-spec boundary so the skill definition stays renderer-agnostic.

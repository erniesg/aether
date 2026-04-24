# Video Spike

This folder is for video-specific experiments that should stay outside the main canvas flow until they prove themselves.

## Text mask prototype

Generate a HyperFrames-compatible composition file from the shared text-mask scene spec:

```bash
npm run video:text-mask -- \
  --text "AETHER\\nHACKATHON" \
  --media ./assets/intro.mp4 \
  --kind video \
  --aspect 16:9 \
  --output ./experiments/video/hackathon-intro.html
```

For a still-image variant, switch `--kind image` and point `--media` to a JPEG or PNG. The same SVG/CSS mask logic is used in both cases.

## Double exposure prototype

Generate a reusable double-exposure composition from the shared scene spec:

```bash
npm run video:double-exposure -- \
  --subject ./experiments/video/double-exposure-assets/subject-portrait.png \
  --subject-fit contain \
  --exposure ./experiments/video/double-exposure-assets/city-static.png \
  --background ./experiments/video/double-exposure-assets/city-static.png \
  --atmosphere ./experiments/video/source-lab/cinematic-lightleak.mp4 \
  --output ./experiments/video/double-exposure-image/index.html
```

For the moving variant, switch `--exposure` to a video asset and optionally enable `--toggle` for an on/off compare control.

The effect is also exposed as named creator-facing skills. List them:

```bash
npm run video:double-exposure:skills
```

Then emit one directly:

```bash
npm run video:double-exposure -- --skill echo-still
npm run video:double-exposure -- --skill lumen-video
npm run video:double-exposure -- --skill raw-effect-compare
```

More detail lives in [double-exposure-skills.md](./double-exposure-skills.md).

## Why this is here

- The repo documents a video-provider seam, but no renderer is wired yet.
- HyperFrames is the fastest way to validate HTML/CSS/GSAP-driven motion in a spike branch.
- The core mask scene stays provider-agnostic, so a later Remotion adapter can consume the same scene spec.

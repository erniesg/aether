# Finger + Voice Demo Plan

Date: 2026-04-24
Target: hackathon story for "design without vision"

## Thesis

aether should demo as a creator-first canvas that can turn embodied intent into campaign assets. The creator sketches in the air, speaks constraints, and the canvas turns that multimodal input into a key visual, short motion intro, and linked social formats.

## Current Foundation

- Voice PTT is live with OpenAI Realtime and Gemini Live session support.
- Voice tools can focus formats, pan/zoom, remove backgrounds, switch tools, set brush color, set or adjust brush thickness, clear/confirm sketches, rerun pinned capabilities, and dispatch generation.
- The canvas has tldraw-native sketching, pinned capabilities, segmentation with SAM-style providers, clean-plate generation, key visual fanout, and export packs.
- Capability registries now separate primitive tools, workflows, and creator-facing skills so new agent-authored effects have a reviewable path.
- Video has a typed provider seam plus a live `/api/video/generate` route backed by deterministic HyperFrames HTML with audio.
- Air brush currently uses camera preview plus pointer/touch/mouse fallback. MediaPipe Hand Landmarker is the intended finger-tracking slice, but it is not installed or wired yet.

## 3-Minute Arc

### 0:00 - 0:25 · Design Without Vision

Open `/workspace/demo-ws`. Narration: "What if a creator could sketch a story with their fingers in the air?"

Show the single synthesis shell. Do not open a dashboard. Keep rails compact and the canvas dominant.

### 0:25 - 0:55 · Finger As Brush, Voice As Control

Voice commands:

- "Sketch mode."
- "Make the brush thicker."
- "Change color to yellow."
- "Write my name."
- "Confirm sketch."

Today this can be demonstrated with the tldraw sketch tool plus voice controls, or with the air-brush camera preview and pointer/touch/mouse fallback. True webcam finger tracking should use MediaPipe Hand Landmarker through `@mediapipe/tasks-vision` as the next input slice, not a separate product surface.

### 0:55 - 1:30 · Me Against Everest

Drop or capture a portrait, add an Everest reference, then run segmentation:

- Segment the creator portrait.
- Generate or place the Everest background.
- Composite a double-exposure key visual using the confirmed name sketch as a graphic mark.

Gemini video understanding is relevant for later review and validation because it can describe, segment, extract information from videos, and answer timestamped questions over video inputs.

Reference: https://ai.google.dev/gemini-api/docs/video-understanding

### 1:30 - 2:05 · Kinetic Intro

Prompt: "Introduce me as an AI Engineer based in Singapore. Use my hand-written name as the opening mark."

Safe implementation order:

- Deterministic Remotion/HyperFrames render first.
- Hosted video provider second through `lib/providers/video/*`.
- Audio/music provider third through a separate audio seam.

Veo 3.1 is available through Gemini API for video generation, and Lyria 3 exposes text/image-to-music generation through Gemini API. Seedance 2.0 belongs behind the same provider-agnostic video seam, not as a hardcoded route.

References:

- https://ai.google.dev/gemini-api/docs/video
- https://ai.google.dev/gemini-api/docs/music-generation
- https://docs.byteplus.com/api/docs/ModelArk/2291680

### 2:05 - 2:40 · Fan Out

Promote the key visual and switch to multiformat. Fan out to:

- IG post
- IG story
- X
- LinkedIn
- TikTok cover

Keep the demo on artifact-first review: thumbnails, artboards, safe zones, and visible outputs. Avoid raw ids, traces, or health checks unless `?debug=1`.

### 2:40 - 3:00 · Agent-Learned Skills

Pin the successful double-exposure / name-mark move as a capability. Explain the boundary:

- Existing tools/workflows can be learned and pinned immediately.
- New runtime primitives are authored in a branch/worktree with tests and review.
- Published team skills are versioned entries, not hidden prompt side effects.

## What Is Next

1. Add MediaPipe Hand Landmarker input that emits normalized index-finger strokes into the existing sketch brush path, while preserving the current pointer/touch/mouse fallback.
2. Add `/api/video/generate` over the new video provider registry.
3. Promote the double-exposure experiment into a deterministic scene-spec workflow.
4. Persist capabilities in Convex and add a publish-to-team action.
5. Add validation agents that review outputs for faces, brand collisions, safe-zone violations, and text legibility before export/scheduling.

## Recordable Path

### Local

```bash
npm test
npm run typecheck
PORT=3107 npx playwright test tests/e2e/voice-sketch.spec.ts tests/e2e/motion-artifact.spec.ts
npm run video:double-exposure:skills
npm run video:text-mask -- --text "AETHER\\nHACKATHON" --media ./experiments/video/source-lab/cinematic-intro.mp4 --kind video --output /tmp/aether-text-mask.html
npm run video:double-exposure -- --skill echo-still --output /tmp/aether-double-exposure.html
```

Open `http://localhost:3107/workspace/demo-ws`.

1. Keep the shell in `canvas`.
2. Click the camera icon in the floating toolbar to turn on air brush.
3. Approve camera permission if the browser asks.
4. If camera or hand inference is unavailable, keep the webcam/fallback preview visible and draw on the canvas with pointer/touch/mouse.
5. Click the voice chip and use these lines exactly:
   - "Sketch mode."
   - "Make the brush thicker."
   - "Change color to yellow."
   - "Write my name."
   - "Confirm sketch."
   - "Introduce me as an AI Engineer based in Singapore."
   - "Fan out to Instagram, X, LinkedIn, and TikTok."
6. After the intro line, wait for the motion artifact preview in the canvas shell. It is deterministic HyperFrames HTML with an embedded WAV audio track; no hosted video provider credentials are required.
7. Use `/export` in the composer after the fan-out run to download the pack and manifest.

### Fallbacks

- Voice unavailable: use the toolbar sketch tool, yellow swatch, large brush, then submit the exact intro and fan-out prompts in the bottom composer.
- Camera or MediaPipe unavailable: leave the air-brush fallback preview on screen and draw directly with pointer/touch/mouse.
- Image provider unavailable: add `?bypass=1` for direct provider bypass if credentials exist, or record the deterministic motion artifact plus seeded artboards while explaining live image generation is not connected in this environment.
- Video provider unavailable: omit `?videoProvider=...`; the route falls back to the local `hyperframes` provider and returns an HTML composition with sound.
- Audio blocked by browser autoplay: the artifact still contains a separate `<audio>` track for rendering/capture. Click inside the preview during recording if the browser needs a user gesture.

### Cloudflare Staging

No production deploy for the hackathon pass.

```bash
npm run cf-build
npm run deploy:stg
curl -I https://aether-stg.berlayar.ai/workspace/demo-ws
curl -s https://aether-stg.berlayar.ai/api/video/generate \
  -H 'content-type: application/json' \
  --data '{"scene":{"kind":"text-mask","text":"AETHER\\nHACKATHON"},"durationSec":4}' | head -c 400
```

Staging is demo-ready when the workspace returns `200`, `/api/video/generate` returns `"ok":true`, and the canvas shell can create the motion artifact without opening devtools.

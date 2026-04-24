# Build For What's Next Submission

Date: 2026-04-24
Target: 3-minute Built with Opus 4.7 demo

## Written Summary

aether is a creator-first canvas for making campaign systems from embodied intent. The demo asks: how might we design without vision? A creator turns on air brush, speaks brush changes, sketches a name mark with a finger or pointer fallback, then uses references to create a double-exposure key visual and a kinetic intro with sound. Claude Opus 4.7 acts as the creative operating layer: it interprets voice, sketch, references, and selected artboards; chooses generation workflows without exposing provider plumbing; records typed provenance; and turns a successful move into a reusable pinned capability. The result is not one asset or a faster menu. It is a canvas-native workflow where a mark becomes a story, a story becomes video, and one key visual fans out into platform-specific formats with global edits and local overrides.

## 3-Minute Script

0:00-0:20 - Open `/workspace/demo-ws`.
Say: "How might we design without vision? What if a creator could sketch a story with their fingers in the air?"

0:20-0:55 - Turn on air brush and voice.
Say:
- "Sketch mode."
- "Make the brush thicker."
- "Change color to yellow."
- "Write my name."
- "Confirm sketch."

Use MediaPipe finger input if stable. Keep the camera preview visible and use pointer fallback if landmark inference is not ready.

0:55-1:25 - Add portrait and Everest references.
Say: "Double exposure of Ernie against Mount Everest."
Use the air-brush capture icon or attached image refs so the motion/key visual uses creator material.
Show the key visual as an artifact on the canvas, not a provider console.

1:25-2:05 - Generate motion.
Say: "Introduce me, Ernie, as an AI Engineer based in Singapore."
Show the HyperFrames motion preview and sound badge.

2:05-2:35 - Fan out.
Say: "Fan out to Instagram, X, LinkedIn, and TikTok."
Show linked artboards and safe zones.

2:35-3:00 - Pin capability.
Say: "Claude did not just make one image. It learned a reusable creative move."

## Opus 4.7 Use

- Impact: removes the repetitive work of remaking one idea across every format, with an accessibility-led input that feels meaningfully new.
- Demo: combines voice-controlled brush state, finger/pointer drawing, reference-led key visual generation, deterministic motion with audio, and multiformat fanout.
- Opus depth: routes tools, reasons over multimodal context, authors reusable capability proposals, and records provenance for each creative action.
- Engineering depth: provider seams keep hosted models optional, HyperFrames is the deterministic fallback, and camera input remains instant even when slow AI work happens asynchronously.

## Fallback Recording Plan

- Camera or MediaPipe unstable: leave air brush preview visible and draw with pointer fallback.
- Voice unavailable: use toolbar sketch controls, then type the same prompts into the bottom composer.
- Hosted video unavailable: omit `providerId`; `/api/video/generate` uses deterministic HyperFrames HTML with generated WAV audio.
- Image provider unavailable: use attached references and seeded artboards, then show the deterministic motion artifact and fanout.
- Browser blocks audio autoplay: click inside the motion preview before recording the motion segment.

## Validation Path

```bash
npm test
npm run typecheck
PORT=3107 npx playwright test tests/e2e/voice-sketch.spec.ts tests/e2e/motion-artifact.spec.ts tests/e2e/air-brush.spec.ts
npm run video:double-exposure:skills
npm run video:text-mask -- --text "AETHER\\nHACKATHON" --media ./experiments/video/source-lab/cinematic-intro.mp4 --kind video --output /tmp/aether-text-mask.html
npm run video:double-exposure -- --skill echo-still --output /tmp/aether-double-exposure.html
npm run cf-build
```

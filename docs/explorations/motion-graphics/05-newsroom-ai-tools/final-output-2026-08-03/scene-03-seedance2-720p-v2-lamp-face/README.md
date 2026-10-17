# Scene 03 v2 - isolated lamp faces camera

## Recommended edit asset

- `S03-v2-lamp-face-scene-window-sfx-720p.mp4` - 5.208-second 720p cut with generated FX only.
- `S03-v2-lamp-face-scene-window-sfx-upscaled-1080p.mp4` - 1920 x 1080 Lanczos upscale of the recommended cut; AAC effects track preserved without re-encoding.
- `S03-v2-lamp-faces-camera-sfx-seedance2-720p.mp4` - untouched 7.059-second Seedance output.
- `S03-04-voiceover-extended-pause-reference.wav` - editorial timing reference with 1.6 seconds inserted before the final question. Do not use this as the generated FX track.

## Generation

- Replicate model: `bytedance/seedance-2.0`
- Prediction: `xy9kst0fysrmt0czs01tad2dd8`
- Seed: `304`
- Output: 1280 x 720, 24 fps, H.264 with 44.1 kHz stereo AAC
- Requested duration: 7 seconds
- Actual duration: 7.059 seconds

## Acceptance timing

- 0.00-0.90: stressed pineapple worker and monitor composition.
- 0.90-3.25: camera pushes and reframes left toward the lamp.
- 3.25: green monitor is fully outside the frame. Automated frame analysis reports zero green-like monitor pixels from this point onward.
- 4.40-4.80: lamp shade makes the decisive upward turn.
- 4.80 onward: illuminated shade faces directly into camera and holds.

## Voiceover retiming

The original final question begins at relative 2.14 seconds and ends at 3.22 seconds. Insert 1.6 seconds immediately before it:

- 0.00-1.44: "When the market closes, the routine begins."
- 1.44-3.74: pause and camera transition; the monitor exits completely at 3.25.
- 3.74-4.82: "Why are we still doing this?"
- 4.82-5.20: hold on the lamp facing camera.

This lands the end of the question on the lamp's direct camera-facing pose without speeding up the generated motion. All following voiceover and scenes move 1.6 seconds later.

## Typography

Composite `Open. Find. Copy. Paste. Rank. Chart. Draft. Check.` in Remotion during the opening monitor portion. Finish the sequence before the camera transition removes the monitor. Use frame-driven animation and a premounted `Sequence`; do not bake generative text into the Seedance plate.

## QC assets

- `acceptance-frames.png` samples the whole seven-second shot.
- `transition-detail-2.4-to-5.4.png` samples the monitor exit and lamp turn at 0.2-second intervals.
- `spectrogram.png` and `audio-analysis.txt` document native-audio checks.

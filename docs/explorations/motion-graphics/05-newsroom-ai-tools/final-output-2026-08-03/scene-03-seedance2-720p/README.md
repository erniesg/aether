# Scene 03 - Seedance 2 routine-to-lamp motion plate (720p)

## Selected outputs

- `S03-routine-lamp-sfx-seedance2-720p.mp4` - untouched 5.06-second Seedance output.
- `S03-routine-lamp-sfx-scene-window-720p.mp4` - 3.6-second derivative matching the approved Scene 03+04 voiceover window.
- `S03-native-sfx.wav` - extracted native sound-effects track.
- `contact-sheet.png` and `spectrogram.png` - visual and audio QC.

## Generation

- Provider/model: Replicate `bytedance/seedance-2.0`
- Prediction: `wdbj6k3a2srmy0czrzwtn88pac`
- Seed: `303`
- Resolution: 1280 x 720
- Frame rate: 24 fps
- Source duration: 5.062 seconds (requested duration: 5 seconds)
- Video: H.264
- Audio: AAC stereo, 44.1 kHz
- Full request and response: `seedance-request.json`, `seedance-response.json`

## Voiceover timing

The approved source interval is 11.400-15.000 seconds. Relative timings are:

- 0.000-1.440: "When the market closes, the routine begins."
- 0.940: the word "routine" begins.
- 2.140-3.220: "Why are we still doing this?"
- 3.220-3.600: visual tail.

`S03-voiceover-timing-reference.wav` was sent to Seedance only as `[Audio1]` timing reference. The generated soundtrack was explicitly constrained to sound effects only.

## Visual QC

- The shot begins on the stressed pineapple worker and pushes toward the lamp.
- The lamp lowers into a weary pose and becomes the ending subject.
- The monitor remains a clean bright-green insertion plane without generated typography.
- The image retains the dark layered paper-cutout newsroom style.

## Typography recommendation

Add `Open. Find. Copy. Paste. Rank. Chart. Draft. Check.` in Remotion, not in Seedance. Reveal the words sequentially on the green monitor starting at 0.94 seconds. Deterministic compositing gives exact spelling, timing, type treatment, and revision control; generative video is likely to corrupt or drift text. Keep every animation frame-driven with `useCurrentFrame()`, and premount the sequence.

## Audio QC

The native track is sparse and transient-led. Whisper tiny returned only a low-confidence `Haha.` hallucination (`avg_logprob -2.1751`); no credible intelligible dialogue was identified. The spectrogram does not show a sustained music bed.

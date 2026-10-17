# Scene 06 — Seedance 2 native dialogue v2 (1080p repair)

## Selected output

- `S06-pineapple-native-sg-dialogue-seedance2-1080p.mp4`
- Extracted audio: `S06-pineapple-native-sg-dialogue-seedance2-1080p.wav`
- Visual review: `contact-sheet.png`

## Generation

- Provider/model: Replicate `bytedance/seedance-2.0`
- Prediction: `8fshsxv7vdrmr0czrfwr76ctcc`
- Resolution: 1920 × 1080
- Frame rate: 24 fps
- Duration: 8.057 seconds
- Audio: AAC stereo, 44.1 kHz
- Source still used as both first and last frame to strengthen temporal locking.
- Full request: `seedance-request.json`

## Repair target

The 720p pilot allowed Seedance to interpret reflections on the glass-office background as scene motion, producing a traveling shadow/reflection artifact. The 1080p prompt treats the complete background as a frozen matte plate and restricts animation to the pineapple's mouth, eyes, slight head motion, and hands.

## Validation

- Output metadata confirms true 1920 × 1080 H.264 video.
- Local Whisper transcription exactly matches: “This isn't about automating journalism. It's about removing the grunt work around it.”
- No background music; the audio includes a 1.14-second silent pause between sentences and 1.48 seconds of trailing silence.
- Eight-frame visual review shows stable camera, set copy, glass/wall boundary, plants and lighting; the obvious traveling glass shadow from the pilot is absent.
- Minor sub-pixel texture shimmer remains possible because this is a generative image-to-video output rather than deterministic character compositing.

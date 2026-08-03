# Scene 01 - Seedance 2 paper-rail motion plate (720p)

## Selected output

- `S01-paper-rails-sfx-seedance2-720p.mp4`
- `S01-paper-rails-sfx-upscaled-1080p.mp4` (1920 x 1080 Lanczos upscale, original AAC audio preserved)
- Visual review: `contact-sheet.png`
- Audio review: `audio-analysis.txt` and `spectrogram.png`

## Generation

- Provider/model: Replicate `bytedance/seedance-2.0`
- Prediction: `z6qmxkfndnrmr0czryqv8fyym8`
- Resolution: 1280 x 720
- Frame rate: 24 fps
- Duration: 6.060 seconds (Replicate requested duration: 6 seconds)
- Video: H.264
- Audio: AAC stereo, 44.1 kHz
- Full request: `seedance-request.json`
- Terminal response: `seedance-response.json`

## Voiceover timing

The approved Scene 01 window is 0.000-5.780 seconds. Spoken copy ends at 4.300 seconds. Seedance accepts integer-second duration, so the motion plate was generated at six seconds and should be trimmed to the Scene 01 boundary in Remotion. The source voiceover was used only to determine timing and was not sent as reference audio.

## Validation

- Media metadata confirms true 1280 x 720 H.264 video with stereo AAC audio.
- The camera remains locked while the surrounding paper rails move and settle.
- The supplied frame contains five green windows, despite the initial four-window description. All five remain visible and spatially stable across the six-frame contact sheet.
- The generated audio is broadband and transient-led, consistent with paper/mechanical effects. It settles into silence from approximately 4.742 seconds through the end.
- A Whisper-tiny check produced only a low-confidence hallucination (`avg_logprob -2.62`, segment end incorrectly beyond the six-second source) rather than credible detected speech. No valid intelligible dialogue was identified.
- The spectrogram does not show sustained harmonic bands characteristic of a music bed; it shows short broadband events followed by the intended tail silence.

## Remotion compositing

Use exact PDF-derived crops as deterministic masked overlays after generation. Suggested first-pass placement:

1. Top-left: Only 1 in 10 young Singapore workers is engaged at work.
2. Top-right: No room for a fifth? The Big Four's iron grip on STI audits.
3. Middle-left: Tamil flourishing story.
4. Middle-right: Pelajar Cambodia story.
5. Bottom-wide: available for a repeated detail, a four-story montage, or Scene 01 typography.

The motion plate is suitable for compositing because the chroma windows do not need generative text reconstruction.

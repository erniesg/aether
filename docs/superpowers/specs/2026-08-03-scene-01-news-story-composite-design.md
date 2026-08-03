# Scene 01 News Story Composite Design

## Goal

Replace the five green placeholders in `S01-paper-rails-sfx-upscaled-1080p.mp4` with the five supplied newspaper stories while preserving the original six-second paper-rail animation, timing, resolution, and sound effects.

## Source Mapping

The five stories are mapped one-to-one to the five green windows in visual reading order:

1. Zaobao qiaopi memory
2. Tamil Murasu flourishing Tamil
3. Berita Harian missing student in Cambodia
4. The Straits Times young workers
5. The Business Times Big Four STI audits

## Considered Treatments

- **Recommended — headline-led crops:** crop each page around its masthead, lead headline, and strongest image. This maximizes recognition within the shallow, wide windows.
- **Full-page thumbnails:** preserves every page but makes headlines too small at 1080p.
- **Animated page pans:** adds movement within each window but competes with the existing rail motion during a six-second shot.

## Chosen Design

Use headline-led crops with cover scaling into each window. The original green is removed with a narrowly tuned chroma key, revealing the story composite below. A small expansion beneath the keyed edges prevents green seams. The foreground animation and its original AAC stereo track remain unchanged.

## Output

- Resolution: 1920×1080
- Frame rate: 24 fps
- Duration: source duration
- Video: H.264, high-quality delivery encode, yuv420p
- Audio: original AAC stereo track retained
- Location: beside the existing scene-01 source in a dedicated composite output folder

## Validation

Check the first, middle, and final frames for correct story placement, no visible chroma spill, preserved black/red/cream rails, and readable masthead/headline structure. Verify output duration, resolution, frame rate, codecs, and audio stream with `ffprobe`.

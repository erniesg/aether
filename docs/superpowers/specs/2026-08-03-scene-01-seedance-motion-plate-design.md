# Scene 01 Seedance motion plate design

## Objective

Generate a 720p Seedance 2 motion plate for Scene 01 of the News Room AI Tools film, synchronized to the approved voiceover scene duration and suitable for deterministic insertion of four supplied SPH story pages in Remotion.

## Inputs

- First frame: `/Users/erniesg/Downloads/sph/scene1.png` (1672 x 941, 16:9)
- Voiceover timing source: `newsroom-ai-tools-jane-emotional-ctrl-c-v4.mp3`
- Scene window: 0.000-5.780 seconds; speech ends at 4.300 seconds
- Story sources: the supplied young-workers, Big Four audits, Tamil flourishing, and Pelajar Cambodia PDFs
- Credential source: `/Users/erniesg/code/erniesg/keys/.env.sph`, variable `REPLICATE_API_KEY`

## Generation design

Use Replicate `bytedance/seedance-2.0` in first-frame image-to-video mode at 720p, 16:9, for 6 seconds. The generated clip will be trimmed to 5.780 seconds in Remotion. Do not send the voiceover as `reference_audios`: it is a timing reference only, and passing it would conflict with the requested SFX-only output.

The camera and the four green insertion windows remain fixed. The surrounding red, cream, teal, and black paper rails move with restrained horizontal press-like motion: sliding, overlapping, settling, and small fibrous flex. No zoom, pan, parallax, perspective change, extra text, new objects, or deformation of the chroma windows.

Generate synchronized effects only: layered paper swishes, soft cardstock scrapes, restrained printing-press movement, and light mechanical settling impacts. No dialogue, voiceover, speech, music, score, beat, singing, crowd, newsroom ambience, or electrical hum.

## Prompt

Animate the supplied first-frame layered paper-cutout newsroom composition as a six-second 16:9 motion plate. Keep the camera completely locked and preserve the exact framing, paper textures, palette, lighting, shadows, black rails, and four bright green rectangular insertion windows. The four green windows must remain perfectly flat, uniformly #00FF00, sharply bounded, rigid, unobstructed, and fixed in the same screen coordinates for the entire shot; do not warp, resize, rotate, cover, replace, shade, spill, or animate them. Animate only the surrounding red, cream, teal, and black paper strips with restrained horizontal printing-press choreography: staggered paper slides, slight cardstock flex, overlapping layers, and clean mechanical settling. Begin with immediate newsroom energy, create a brief coordinated change around the spoken pause near 1.4-2.9 seconds, then let the arrangement settle confidently after 4.3 seconds and hold through the end. Maintain temporal consistency and the handcrafted fibrous paper-cutout look. No camera movement, zoom, pan, tilt, parallax, perspective change, scene cut, added text, logos, people, extra windows, new objects, liquid motion, melting, tearing, flicker, or texture crawl. Audio: synchronized effects only - layered paper swishes, soft cardstock scrapes, restrained printing-press movement, and light mechanical settling impacts. No dialogue, voiceover, speech, words, music, score, beat, singing, crowd, newsroom ambience, or hum.

## Compositing

Insert the story crops after generation in Remotion, masked to the four green windows:

1. Top-left: Only 1 in 10 young Singapore workers is engaged at work.
2. Top-right: No room for a fifth? The Big Four's iron grip on STI audits.
3. Middle-left: Tamil flourishing story.
4. Middle-right: Pelajar missing-person Cambodia story.

This keeps multilingual headlines and publication typography exact. The keyed story layers follow deterministic transforms rather than relying on generative text rendering.

## Validation

- Output is a real 1280 x 720 H.264 MP4 with audio.
- Duration is at least 5.780 seconds and can be trimmed without losing the final settle.
- Four green windows remain usable for chroma/masked insertion across representative frames.
- Audio contains effects only, with no detectable speech or music.
- A contact sheet confirms stable framing, texture, and window geometry.

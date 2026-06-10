# Motion graphics samples

Four standalone HyperFrames compositions, 1080×1920 vertical (social-native). Each demonstrates a distinct variant from the event-recap research, but the patterns generalize to any aether use case.

| #   | Composition       | Purpose                                                 | Length |
| --- | ----------------- | ------------------------------------------------------- | ------ |
| 01  | atlas-reveal      | 4-lane atlas with staggered node entry — event recap   | 8s     |
| 02  | by-the-numbers    | Funnel of stats from raw signal to distilled structure  | 20s    |
| 03  | quote-cascade     | Three kinetic-typography techniques for speaker quotes  | 18s    |
| 04  | photo-mosaic      | Reveal grid then highlight the moment that travelled    | 8s     |

## Preview a composition

```bash
cd 01-atlas-reveal
npm run dev          # opens hyperframes studio on http://localhost:5173
```

## Validate

```bash
npm run check        # lint + validate + inspect
```

## Render to MP4

```bash
npm run render       # writes out/render.mp4
```

## Generic template library

These four compositions are also shipped as event-agnostic templates at
`lib/video/event-recap/` — pure `RecapVideoData => HyperFrames HTML`
functions with a registry, a `planRecapVariants()` template × format
fan-out (vertical 9:16 / square 1:1 / landscape 16:9), and an
`EventConfig` bridge. The generated fan-out for the AIE 2026 and
fictional DevSummit 2026 fixtures lives under
[template-previews/](./template-previews/) — see its
[NOTES.md](./template-previews/NOTES.md) for regeneration commands and
snapshot evidence.

## Design language

See [DESIGN.md](./DESIGN.md). Warm paper, mono type, single accent. Restraint over ornament — layout carries the meaning.

## What to look at

- **01 atlas-reveal** — does the 4-lane structure read in motion, or does it need labels earlier? Are the overlap edges legible?
- **02 by-the-numbers** — does the bar-shrinking funnel (4M → 872 → 13 → 4) land as a story, or is it just four stats?
- **03 quote-cascade** — which kinetic technique earns its keep? Mask reveal feels editorial, letter cascade feels technical, slam feels confident.
- **04 photo-mosaic** — does dimming-then-highlighting one tile communicate "this is the moment", or does it need a stronger gesture?

All four use the same design tokens, so any edits propagate cleanly.

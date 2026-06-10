# Template previews — generated evidence

Generated fan-out of the event-recap video template library
(`lib/video/event-recap/`): every template × format × fixture-event
combination, as standalone HyperFrames HTML documents plus frame
snapshots and per-event contact sheets.

## Regenerate

```bash
# 1. Render the 24 preview documents + manifest + index
npx tsx scripts/event-recap-video-previews.ts

# 2. Capture frame snapshots + contact sheets (Playwright chromium;
#    needs the GSAP CDN reachable, same pin the explorations use)
npx tsx scripts/event-recap-video-snapshots.ts
```

## What's here

| Path | What |
|---|---|
| `index.html` | Browsable table of every preview with canvas + duration |
| `manifest.json` | Machine-readable plan: the `planRecapVariants()` output per event, including any skipped entries with reasons |
| `aie-2026/`, `devsummit-2026/` | 12 previews each: 4 templates × 3 formats (`vertical` 1080×1920, `square` 1080×1080, `landscape` 1920×1080) |
| `snapshots/contact-sheet--<eventId>.png` | All 12 variants of one event on a single sheet — the at-a-glance review artifact |
| `snapshots/<eventId>--<templateId>--vertical.png` | Full frame of each template at the vertical reference format, timeline seeked to its hero moment |

Each preview is a self-contained document: open it in a browser and run
`window.__timelines.main.play()` in the console to watch the composition,
or `.seek(t)` to scrub.

## How to read the evidence

- **Genericity** — the DevSummit Berlin 2026 fixture is fictional and
  deliberately different along every parameterized axis (3 atlas lanes vs
  4, 6 mosaic tiles vs 9, different counts/quotes/accent word). Its sheet
  rendering correctly with zero AIE strings is the proof the templates are
  event-agnostic (also asserted in `lib/video/event-recap/templates.test.ts`).
- **Format fan-out** — the same data renders all three canvases. Height-
  dependent dimensions (paddings, the by-the-numbers figure ramp, the
  photo-mosaic grid) scale with canvas height; the vertical output is
  byte-identical to the hand-tuned explorations under `../0*-*/`.
- **Hero timestamps** — frames are seeked to the moment each composition
  is fully revealed: atlas-reveal 6.2s, by-the-numbers 4.2s (first funnel
  stage), quote-cascade 5.2s (first quote scene), photo-mosaic 7.2s.

## Caveats

- Snapshots inject IBM Plex Mono from Google Fonts at capture time so the
  frames show the intended face; the library output itself declares the
  family only (the HyperFrames compiler embeds fonts at render time, per
  `../DESIGN.md`).
- Frames are captured at deviceScaleFactor 0.5 to keep the repo light;
  per-format full-res frames live in the capture scratch dir
  (`$TMPDIR/recap-template-frames/`) after a run.
- The GSAP timeline is seeked, not played — frames show composed state at
  the hero timestamp, not motion. Motion review still needs a browser or
  the HyperFrames studio (`npm run dev` in any exploration dir).

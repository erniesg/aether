# Event Recap · Remotion composition

Produces the 60-second recap MP4 for any event that has a public bundle
at `/vibes/<eventId>/data`. Same React components power both the in-page
hero reel (rendered by `workers/aie2026-vibes.ts`) and the MP4 (rendered
here by `@remotion/renderer`), so design changes propagate to both
surfaces from one source.

## Run it

```bash
npm install                          # one-off: pulls @remotion/* + remotion 4.x
npm run recap:studio                 # opens the Remotion studio at :3000
npm run recap:render                 # writes out/aie2026/recap-9x16.mp4 + recap-16x9.mp4
npm run recap:render aie-ny-2025     # for a different event
```

Studio is the design loop: pick a composition (`EventRecapVertical` or
`EventRecapHorizontal`), scrub the timeline, hot-reload any scene file.

## Compositions

| id | dimensions | targets |
|----|------------|---------|
| `EventRecapVertical` | 1080 × 1920 | TikTok · Instagram Reels · YouTube Shorts |
| `EventRecapHorizontal` | 1920 × 1080 | YouTube · LinkedIn video · X video · web embed |

Both run at 30fps for 60s (1800 frames) and share the same scene graph
in `EventRecap.tsx` — each scene receives `orientation` and adapts its
own layout (font sizes, gaps, post-card width).

## Scene timeline

```
0:00 ─ TitleScene         3s   cold open · letter cascade · deep boom + airy pad
0:03 ─ StatScene         10s   4M counter + platform breakdown + secondary stats
0:13 ─ RankingScene       9s   6 themes bar-fill with stagger · tick × 6
0:22 ─ MomentScene       18s   real Melissa Chen tweet + Vivian video + pull-quote
0:40 ─ SponsorScene      12s   12 brand logos tier-staggered · chord swell
0:52 ─ OutroScene         8s   "you are the scene" + URL · final boom
```

Total 60s · 1800 frames.

## Layers

```
remotion/
  index.tsx                       # registerRoot()
  Root.tsx                        # registers both compositions
  EventRecap/
    EventRecap.tsx                # Series<Sequence> over all scenes + Watermark
    data.ts                       # types + sample bundle + fetchPublicBundle()
    theme.ts                      # palette + font stacks + frame allocations
    scenes/
      Title.tsx
      StatScene.tsx
      RankingScene.tsx
      MomentScene.tsx             # hero moment — XPostCard + pull-quote + lower-third
      SponsorScene.tsx
      Outro.tsx
    components/
      XPostCard.tsx               # real Video / Img · X icons · stat counters
      Watermark.tsx               # persistent corner badge + live timer
      LowerThird.tsx              # name strap · spring-in from left
      SponsorLogo.tsx             # SVG marks + monogram fallback
```

## Data flow

```
worker · /vibes/<eventId>/data       (cron-refreshed public bundle)
   │
   └─→ fetchPublicBundle()           (remotion/EventRecap/data.ts)
          │
          └─→ RecapBundle             (typed slice — refs, themes, voices,
                                       sponsors, heroMoment with media URL)
                │
                └─→ EventRecap composition
                       ├─→ EventRecapVertical    → out/<eventId>/recap-9x16.mp4
                       └─→ EventRecapHorizontal → out/<eventId>/recap-16x9.mp4
                              │
                              └─→ (production) uploaded to R2 at
                                  event-recap-<eventId>/recap-{9x16,16x9}.mp4
```

## Cron integration (planned)

The existing `refreshEventRecap()` pipeline already has the hook point.
Add a final step after the bundle persists:

```ts
import { renderMedia, selectComposition } from '@remotion/renderer';
import { uploadToR2 } from './r2';

const composition = await selectComposition({ ... });
const localMp4 = await renderMedia({ ... });
await uploadToR2(`event-recap-${eventId}/recap-9x16.mp4`, localMp4);
```

Worker serves the MP4 statically with `Cache-Control: public, max-age=3600`.
On-demand variants flip props (sponsor tier, music track, locale, scene
order) and render fresh from the same compositions.

## What it does *not* do yet

- Audio: scenes carry sound-cue annotations in the HTML mock, but the
  Remotion composition is silent. Wire `<Audio src=staticFile('audio/recap-60s.mp3')>`
  inside `EventRecap.tsx` once the score lands in `public/audio/`.
- Cascade / Voice / Montage scenes from the mock — current iteration
  focuses on Title · Stat · Ranking · Moment · Sponsor · Outro, which is
  enough to read as a full recap. The cascade and voice scenes are
  straightforward to add once the visual direction sticks.
- Provenance write-back (CLAUDE.md hard rule #8): each render should
  emit a `ToolRef` record to Convex. TODO in `scripts/render-recap.ts`.

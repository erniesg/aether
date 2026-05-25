# Handoff · 10 divergent recap-reel variations · 2026-05-25

You are taking over a Remotion-based event recap reel that is **currently
stuck in one visual lane**. The prior agent kept reaching for the
workspace's editorial restraint-aesthetic (Instrument Serif + JetBrains
Mono + accent orange on dark + minimal motion) and never stepped outside
of it. The reviewer's feedback was direct: "doesn't look exciting at
all", "you're confining yourself to the current styling". They are
right.

Your job: **ship 10 visually divergent variations of the recap reel** so
the team can compare aesthetics side-by-side and pick a direction — or
mix and match scenes across them.

---

## The mission in one sentence

For the AIE Singapore 2026 corpus (4M views, 872 refs, 18 captured
photos + 1 video, 5 voices, 12 sponsors), produce **ten 12-second
recap-reel variants**, each with a distinct visual personality, all
rendered to MP4 in both 9:16 and 16:9, all committed to the repo with
side-by-side stills and a README that compares them.

Twelve seconds. Not sixty. Iteration speed beats completeness.

---

## What already exists (start from here, don't rebuild)

Repository: `/Users/erniesg/code/erniesg/aether-recap-reel` (worktree on
branch `feat/aie-recap-reel`, pushed to GitHub).

| Path | What's there |
|------|--------------|
| `src/remotion/EventRecap/data.ts` | `RecapBundle` types + `aie2026SampleBundle` with real corpus stats + 5 voices + 12 sponsors + hero moment + `aie2026MediaPool` (18 photos + 1 video, all routed through `aether.berlayar.ai/vibes/aie2026/media?path=...` — LinkedIn CDN blocks headless Chrome direct, the proxy works) |
| `src/remotion/EventRecap/components/MediaBackdrop.tsx` | Cycles media pool with cross-fades + ken-burns (the only component worth reusing across variants) |
| `src/remotion/EventRecap/scenes/{Title,StatScene,RankingScene,MomentClip,VoiceMontage,SponsorScene,Outro}.tsx` | Existing scenes in the editorial style — useful as **reference**, do not import wholesale. Treat them as one variant among ten. |
| `src/remotion/Root.tsx` | Registers `EventRecapVertical` (1080×1920) + `EventRecapHorizontal` (1920×1080) compositions. Add ten more here, one per variant. |
| `scripts/render-recap.ts` | Fetches public bundle + renders all registered compositions. Use the same pattern. |
| `out/aie2026/recap-9x16-v2.mp4`, `recap-9x16.mp4`, `recap-16x9.mp4` | Current renders. Watch them first — the user already said "shitty". You'll see why. |
| `docs/mocks/recap-reel-stills/v2-*.png` | What the current editorial variant looks like as stills. |

Commands that work:
```bash
npm install                           # already run; deps are installed
npm run recap:studio                  # Remotion studio at :3000 — your live preview
npx remotion still <entry> <id> <out.png> --frame=N
npx remotion render <entry> <id> <out.mp4>
```

`npx tsc --noEmit` should be clean before you commit. (`src/remotion/Root.tsx`
casts `EventRecap` through `unknown` for the `Composition.component` type;
follow the same pattern if you create new wrapping comp types.)

---

## The blind spot you must NOT inherit

The prior work confused two surfaces:

1. **The published vibes page** at `/vibes/aie2026` — editorial,
   restrained, paper-texture, mono. Lives in `workers/aie2026-vibes.ts`.
   AGENTS.md restraint applies here.
2. **The share-out recap MP4** — meant for TikTok / Reels / Shorts /
   LinkedIn video / YouTube. AGENTS.md restraint **does not apply**.
   This needs to read as event footage at 1-second-attention-span
   speed. Energy, color, motion, music-driven cuts, big emotion.

Your ten variants are for surface 2. Treat surface 1 as inspiration for
exactly one variant (the editorial one), nothing more.

---

## The ten variants

For each: 12 seconds at 30fps = 360 frames. 3 scenes per variant, ~4
seconds each. Use the same `RecapBundle` data. Each variant gets its
own directory and two Composition registrations (vertical + horizontal).

Naming: `src/remotion/variants/<slug>/Composition.tsx` and scenes inside.
Composition IDs: `Variant-<slug>-Vertical` and `Variant-<slug>-Horizontal`.

### 1 · `sundance-doc` — Sundance documentary trailer

**Reference vibe**: *Free Solo* trailer, A24 doc cuts, Sundance
selections. Handheld feel, soft natural light grading, slow zoom on
faces, ambient pad music (silent for now — note the cue), big dramatic
pull-quote, letterbox bars (top + bottom 90px), film grain texture
overlay.

Type: italic serif, low-contrast white on dimmed photo. Lower-thirds
that fade in over 2s, not snap in.

Scenes: (1) cold open · 1.5s black, slow fade in to a photo with the
Vivian quote typing in over 3s; (2) montage · 3 ken-burns photos with
slow pans, 1.5s each; (3) reveal · 4M views + "what 872 refs travelled"
+ event title, all on slow drift, letterbox stays.

### 2 · `mrbeast-hyper` — TikTok hyper-cut

**Reference vibe**: MrBeast, Recess Therapy, viral TikTok captions. Cuts
on every beat (4-frame jump cuts during peaks). Big bold sans (Inter
Black or Anton), white outlines, shadow drops. Bright safety-yellow
accents. Numbers that punch in with a screen-shake effect (4-frame
translateX wobble). Emoji bursts (🇸🇬 ✅ 🔥) sprinkled aggressively.

Scenes: (1) hook · "BRO 🇸🇬 4M views?!" + a 0.3s flash of every photo;
(2) reveal · top 3 themes as huge bouncing pills with photo crops
behind; (3) outro · "tap to watch full recap →" with a finger emoji
pointing.

### 3 · `apple-keynote` — Apple keynote sizzle

**Reference vibe**: WWDC keynote intro, Apple Event sizzle reels. Pure
black background with single product-style spotlit photo at a time.
Clean San Francisco-style sans (Inter Display works). Slow ease curves
(spring damping high, stiffness low). White text only. Photos appear
as if lit from above, slight glow.

Scenes: (1) "Singapore." in big SF Display, photo of skyline-style
crop fades in behind; (2) "Four million views." with bar fills
underneath, dramatic pause; (3) "And it just keeps going." with a
sponsor wall rising elegantly.

### 4 · `synthwave-cyber` — Cyberpunk / synthwave

**Reference vibe**: *Stranger Things* opening, retro-futurism, late-80s
neon. Magenta (#ff0080) and cyan (#00fff0) gradient backdrops, scanline
overlay, chromatic aberration on text (cyan+magenta offsets at ±2px).
Bitmap-style font (VT323 or Press Start 2P). Grid floor perspective
trick if you can pull it off.

Scenes: (1) "AI ENGINEER//SG.2026" with CRT scan; (2) glitch-cut
montage with VHS noise frames between cuts; (3) "TRANSMISSION ENDS" +
URL ticker.

### 5 · `editorial-newspaper` — current variant, polished

**Reference vibe**: New York Times print, Bloomberg Businessweek, the
worker's `/vibes/aie2026` page. **This is the one variant where the
existing scenes apply.** Keep it for the comparison set so reviewers can
see why it doesn't read well as a share-out asset next to the others.

Use the existing OpeningMontage + StatScene + Outro, trimmed to 12s
total.

### 6 · `y2k-maximalist` — Y2K maximalist chaos

**Reference vibe**: early 2000s music videos, MTV bumpers, anything
with "WOW" stickers. Bouncing typography (every word a different font),
glitter/sparkle particles, swirling backgrounds, sticker bursts
("BREAKING!", "VIRAL!", "NEW!"). Gradient backgrounds (cyan-pink-yellow).

Scenes: (1) confetti burst + "AIE 26!!"; (2) 4M punches in with three
star-bursts around it; (3) photo collage spinning into frame.

### 7 · `vhs-doc` — VHS documentary

**Reference vibe**: *Adam Curtis* docs, VHS-tape aesthetic, lo-fi
archival. Heavy VHS texture (CSS `repeating-linear-gradient` scan lines
+ chroma noise), date-stamp overlay (`REC 05.18.2026`), wobble jitter
on photos, color desaturated.

Scenes: (1) "REC" badge + tracking-error glitch + first photo with
date stamp; (2) photos with VHS scan-line interruptions every 0.4s;
(3) "END REC" + sponsor names in monospaced typewriter scroll.

### 8 · `brand-sizzle` — Polished brand sizzle reel

**Reference vibe**: Stripe brand films, Linear launch videos, modern
SaaS keynote tags. Warm color grade (orange tint, lifted blacks). Big
sans-serif type with subtle parallax. Logos that elegantly morph into
b-roll. Smooth bezier curves (no springs).

Scenes: (1) sponsor wall reveals one-by-one then morphs into a photo;
(2) headline stat over slow-tracking b-roll; (3) hashtag end-card with
soft glow.

### 9 · `swiss-minimal` — Swiss minimalism / Helvetica

**Reference vibe**: Müller-Brockmann posters, Massimo Vignelli, modern
Pentagram brand work. Grid-based layout (12 columns visible during
build). All caps Inter / Helvetica. One single accent color (deep red
#d92d20 or electric blue #2563eb — pick one and stick with it). No
photos at full bleed — instead, photos clipped into geometric shapes
(circles, hard rectangles in the grid).

Scenes: (1) "AIE / SG / 26" stacked, grid lines visible; (2) numbers
as data-viz (proper bar chart, axis labels); (3) quote with grid-based
type hierarchy.

### 10 · `terminal-nerd` — AI engineer terminal aesthetic

**Reference vibe**: Hacker News, t3.chat, Vercel ship logs,
warp.dev. Monospaced everything (JetBrains Mono). Green-on-black
or amber-on-black terminal palette. ASCII art frames (`┏━━━┓`
borders). Type that reveals character-by-character with a blinking
cursor (`█`). Numbers tick up with a `tick-tick-tick` rhythm. Log-style
output: `> fetching corpus...`, `> 872 refs found`, `> rendering...`.

Scenes: (1) `$ aie2026 --recap` typing animation, then `LOADING...`
ASCII spinner; (2) data output as a fake table with refs / themes /
voices; (3) `> SHARE: aether.berlayar.ai/vibes/aie2026` closing.

---

## Definition of done

Per variant:
- [ ] `src/remotion/variants/<slug>/Composition.tsx` + scenes
- [ ] Two compositions registered in `Root.tsx`
- [ ] `out/variants/<slug>-9x16.mp4` and `<slug>-16x9.mp4` rendered
- [ ] Three stills committed to `docs/mocks/recap-variants/<slug>/` —
  cover frame, mid-frame, end frame
- [ ] Commit message: `feat(recap-variants): <slug> · <one-line vibe>`

Across all ten:
- [ ] `docs/mocks/recap-variants/README.md` with a side-by-side
  comparison table: name · vibe one-liner · cover thumbnail link ·
  MP4 link · one-sentence verdict on what works and what doesn't
- [ ] All commits on `feat/aie-recap-reel` (same branch — easier to
  diff)
- [ ] `npx tsc --noEmit` clean
- [ ] Final commit message lists all ten with their MP4 paths

---

## Working principles for this run

1. **Look at real reels first.** Before writing each variant, watch
   2-3 actual examples in that style. If you can't find references on
   the open web, search for "2026 conference recap [style]" or
   "[brand] sizzle reel" — your knowledge of what each aesthetic
   actually looks like is more important than the words above.
2. **Steal shamelessly from `MediaBackdrop`.** That component is the
   one solid piece of infrastructure. Almost every variant will layer
   real photos as backdrop. The variants differ in *what sits on top*
   and *how it transitions*.
3. **Music matters even if you can't add it.** Time your cuts as if
   there's a beat track at 110-128 BPM (3.5-4 frames per beat at
   30fps). Hyper variants cut on every beat; doc variants cut on every
   8th beat. Annotate the cue in the scene file's comment so the next
   slice can wire `<Audio>` cleanly.
4. **Iterate one render at a time.** Don't write all ten variants then
   render. Write one, render it, watch it (open the MP4), fix the
   obvious problems, commit. Then start the next. Twelve seconds
   renders in ~90 seconds — use that loop.
5. **Don't ask for permission on aesthetic choices.** The reviewer
   wants divergence. If you're tempted to play it safe, push harder
   into the variant's character. The whole point is to show extremes.

---

## What to skip

- Audio. Document the intended cue in comments. Don't try to source or
  wire a track this pass — that's a follow-up.
- Pipeline / cron integration. The render script already takes any
  composition id. Cron wiring is a follow-up too.
- Touching the worker / vibes page / mock HTML. Those are surface 1.
  Out of scope.
- Refactoring `EventRecap.tsx` or the existing six scenes. They
  represent variant 5 (editorial). Leave them alone; just trim a 12s
  version that registers as `Variant-editorial-newspaper-Vertical`.

---

## When you're done

Commit, push to `origin/feat/aie-recap-reel`, and write a short reply
(≤ 200 words) summarising: which two variants feel most production-
ready, which one was the biggest surprise (positive or negative), and
what you'd cut from the list of ten if you had to pick five.

Good luck. Push the aesthetic. The point is to make the reviewer say
"oh, *that* one" — not to make them ask for yet another iteration of
the same thing.

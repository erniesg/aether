# Storyboard A · Singapore Rising

**Shape**: documentary arc · 3-quote spine
**Duration**: 60s @ 30fps · 1800 frames
**Primary orientation**: 9:16 (16:9 derived with adjusted overlay positions)
**Aesthetic reference**: A24 doc trailer — letterbox 90px top/bottom, italic serif (Instrument Serif) for quotes, JetBrains Mono small caps for chrome, film grain ~20%, slow Ken Burns

**One-line thesis**: Singapore wasn't a passing tour stop — it was where the regional AI engineering scene crystallized in three days, with Vivian's challenge to government as its anchor.

**Audio plan (TODO when wired)**: ambient pad bed throughout; single sustained string note at thesis beats (B02 quote, B05 second quote, B08 closing quote); low piano figure under outro stats.

---

## Beat sheet

### B01 · Cold open · 0:00–0:06 · 180 frames
- **Purpose**: Hook with the most-watched human face in the corpus before any words
- **Hero**: B (Vivian close-up, face fills frame)
- **Crop mode**: static · focal on Vivian's eyes · full face guaranteed visible (face is 26%×53% of source — already enforced by face-aware-crop)
- **Layers**:
  - Frame 0–15: black, ambient pad enters
  - Frame 15–180: B fades in, Ken Burns scale 1.0 → 1.04, anchor on eyes
  - Frame 60–180: lower-third caption `VIVIAN BALAKRISHNAN` mono small caps, 18pt, fades in over 30 frames
  - Frame 120–180: date pill `AIE · SG · MAY 17–19` bottom-center, 14pt
- **Transitions**: in 0.5s fade from black · out 0.5s cross-fade
- **FX**: letterbox 90px, grain 20%, vignette
- **Rationale**: His face IS the most-shared single image of the conference. Don't earn it; lead with it.

### B02 · Thesis quote · 0:06–0:14 · 240 frames
- **Purpose**: Land the line that made 145 posts orbit one theme — and earn the rest of the reel
- **Hero**: F (Vivian wide self-portrait, audience visible)
- **Crop mode**: pan-h slow right→left across stage · scale held 1.02
- **Layers**:
  - Frame 180–420: F with horizontal pan
  - Frame 210–420: quote `"You cannot govern a technology / you have only been briefed on."` fades in, italic Instrument Serif 56pt, anchored center, with subtle drop-shadow for legibility on busy background. Two lines, hard break after "technology".
  - Frame 350–420: attribution `— MINISTER VIVIAN BALAKRISHNAN` mono small caps below quote, 14pt
- **Transitions**: in 0.3s cross-fade · out 5-frame white flash → 0.3s fade to B03 (marks thesis landing)
- **FX**: letterbox, grain 20%, sustained string note enters frame 210
- **Rationale**: This quote IS Melissa Chen's tweet's pull quote and it carried 2.16M views. Treat it as the recap's center of gravity. The white flash marks "everything before vs everything after."

### B03 · The room responded · 0:14–0:22 · 240 frames
- **Purpose**: Show humans, not stats — "4M views" means nothing without a room
- **Hero**: H (Linh's huge audience, 14 faces)
- **Crop mode**: pan-h left edge → right edge over 8s · faces sweep across frame
- **Layers**:
  - Frame 420–660: H with full-width horizontal pan
  - Frame 510–600: small overlay `1,247 BUILDERS · 18 COUNTRIES · 3 DAYS` upper-left, mono 16pt, fades in/out
- **Transitions**: in 0.3s cross-fade · out 0.3s cross-fade
- **FX**: letterbox, grain 25% (more grain on crowd = density), slight desaturation
- **Rationale**: After a thesis you owe the viewer the visible answer. A crowd pan does it pre-verbally.

### B04 · Builder cuts · 0:22–0:30 · 240 frames
- **Purpose**: Show the SCENE has depth — multiple speakers, not just one keynote
- **Hero**: D, then C (panel of 7 → crowd of 8 speakers)
- **Crop mode**: D static for 4s, hard cut to C with subtle Ken Burns in
- **Layers**:
  - Frame 660–780: D static, focal on densest face cluster
  - Frame 780–900: C with Ken Burns 1.0 → 1.05
  - Frame 720–780: small caption bottom-left `RACHAEL DE FOE · LINKEDIN`
  - Frame 840–900: caption updates to `SHERRY JIANG · LINKEDIN`
- **Transitions**: hard cut mid-beat at frame 780 (no fade) · out 0.3s cross-fade
- **FX**: letterbox, grain 20%
- **Rationale**: A hard cut mid-beat signals tempo change — proves the room had multiple highlights, not just one. Hard cut also gives a beat hit when audio is added.

### B05 · Sherry's claim · 0:30–0:38 · 240 frames
- **Purpose**: Second voice, second thesis — pair with Vivian's tension to make a sandwich
- **Hero**: C (Sherry's photo continues from B04)
- **Crop mode**: ken-burns-in · 1.0 → 1.08 zooming toward densest face cluster
- **Layers**:
  - Frame 900–1140: C with zoom-in pan
  - Frame 960–1140: quote `"Day 2 closed with proof / Singapore can host a serious AI builder room."` italic serif 44pt (smaller than B02 — secondary)
  - Frame 1080–1140: attribution `— SHERRY JIANG · @SHERRYPEEK`
- **Transitions**: in 0.3s cross-fade · out 0.5s cross-fade
- **FX**: letterbox, grain 20%, second string note enters frame 960
- **Rationale**: Vivian set tension ("you cannot govern…"); Sherry resolves it ("proof Singapore can host"). Two quotes form the arc.

### B06 · Sponsors honored · 0:38–0:44 · 180 frames
- **Purpose**: Name who funded the room — without making it an ad
- **Hero**: E (Saad Hamid's booth crowd, sponsor context)
- **Crop mode**: static · slight ken-burns-out 1.04 → 1.0 (revealing context)
- **Layers**:
  - Frame 1140–1320: E with de-zoom
  - Frame 1200–1320: sponsor strip lower-third `OPENAI · GOOGLE DEEPMIND · CURSOR · VERCEL · CONVEX · CEREBRAS · +6 MORE` mono 14pt, scrolls slowly L→R
- **Transitions**: in 0.3s cross-fade · out 0.3s cross-fade
- **FX**: letterbox, grain 15% (cleaner = sponsor frame)
- **Rationale**: Sponsors deserve a beat but not their own scene. Naming them over a face of someone who staffed a booth = respect without slickness.

### B07 · Codex receipts · 0:44–0:50 · 180 frames
- **Purpose**: Surface the technical headline — OpenAI Codex was the dominant tech storyline
- **Hero**: J (Gabriel's Codex talking-head)
- **Crop mode**: static · face top-third, room visible
- **Layers**:
  - Frame 1320–1500: J static
  - Frame 1380–1500: caption `OPENAI CODEX · 68 POSTS · 5 BUILDERS` bottom-right mono 16pt
- **Transitions**: in 0.3s hard cut · out 0.3s cross-fade
- **FX**: letterbox, grain 20%
- **Rationale**: Codex was *the* technical headline of AIE2026. A single beat with one builder's face does it.

### B08 · Local pride · 0:50–0:56 · 180 frames
- **Purpose**: Land the identity quote — this scene was Singapore showing up
- **Hero**: I (Lavanya's organizer portrait)
- **Crop mode**: static · subtle pan-v 50% → 45% (very gentle upward drift)
- **Layers**:
  - Frame 1500–1680: I with subtle drift
  - Frame 1560–1680: quote `"This was Singapore showing up — / not flown in. 65labs built the scene."` italic serif 42pt
  - Frame 1620–1680: attribution `— RACHAEL DE FOE`
- **Transitions**: in 0.3s cross-fade · out fade-to-white 0.5s
- **FX**: letterbox, grain 15%
- **Rationale**: Three quotes total (Vivian tension → Sherry proof → Rachael identity). This is the arc closer. Fade-to-white preps the outro flip.

### B09 · Outro · 0:56–1:00 · 120 frames
- **Purpose**: Stats earn the right to exist here — after the humans
- **Hero**: none — typographic only on dark
- **Layers**:
  - Frame 1680–1740: white card resolves to dark with grain
  - Frame 1700–1800: stats stack center `4M VIEWS · 872 POSTS · 12 SPONSORS · 1 SCENE`, mono 28pt, line-broken into 4 lines
  - Frame 1740–1800: URL bottom small `AETHER.BERLAYAR.AI / VIBES / AIE2026` mono 16pt
- **Transitions**: in fade from white 0.5s · out hold to end
- **FX**: minimal grain (clean end), no letterbox
- **Rationale**: After 56s of humans, the receipts feel earned, not slick. URL leaves the viewer with somewhere to go.

---

## Asset coverage

8 of 17 assets used. Unused: A (video) saved for 30s alt cut, G/K/L/M/N/O/P/Q reserved for variant cuts that emphasize different theme storyId mixes.

## Scene variant routing

How this storyboard maps to the 10 visual variants:

| Variant | How it consumes this storyboard |
|---|---|
| sundance-doc | This exact beat sheet, A24 grade |
| brand-sizzle | Same beats, warmer orange grade, 0.2s cross-fades, bolder Inter type for quotes (not italic serif) |
| editorial-newspaper | Drop B03 + B04, replace with single sustained pan of D — newsprint feel |
| apple-keynote | Keep B01, B02, B09 only — collapse to 24s pure-keynote tease |
| swiss-minimal | Replace ALL photos with single-photo-per-beat clipped into geometric shapes; same quote spine |
| vhs-doc | Add `REC ●` overlay top-left throughout; jitter on every Ken Burns |
| sundance + brand-sizzle | Most production-ready pair from prior comparison |

## What this storyboard explicitly is NOT

- Not a slideshow — every asset is named, with rationale for why it's at that beat
- Not all 16 photos — only 8 chosen for purpose; the rest are corpus, not content
- Not stat-led — stats appear once at the end, after we earned the right
- Not sponsor-led — sponsors get one beat in the middle, not the spine

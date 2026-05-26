# Storyboard C · One Voice

**Shape**: single-thread reverence · video-led · minimal chrome
**Duration**: 60s @ 30fps · 1800 frames
**Primary orientation**: 9:16 (16:9 secondary, kept letterboxed in 9:16 so the same cut serves both with subtle re-frame)
**Aesthetic reference**: Apple keynote · Pentagram brand films · the New Yorker video shorts — minimal type, pure black, the subject IS the story, no second voice, no infographic overlays

**One-line thesis**: Vivian's speech IS the recap. Everything else is footnote. Let him carry the room.

**Audio plan (TODO when wired)**: The 84-second Vivian video (asset A) IS the audio bed for the whole recap. We trim 84s → 60s. No music. No narrator. Only his voice, lifted clean from the source. B-roll cutaways stay silent under his speech.

**Pacing principle**: 5 long beats. NO beat shorter than 8s. No cut on the beat — cuts on **breath**, on the natural pauses in his speech. The opposite of TikTok hyper-cut.

---

## Beat sheet

### B01 · His face · 0:00–0:12 · 360 frames
- **Purpose**: Hold on his face. Let the viewer see who's about to speak. Let his voice land before any cut.
- **Hero**: A (Melissa Chen's video clip) — trim to opening 12s
- **Crop mode**: VIDEO playing inline, no static photo. Object-fit cover to 9:16, focal kept on Vivian's face throughout (the video already centers him). Slight ken-burns-in over the full 12s (scale 1.0 → 1.04) for cinematic feel.
- **Layers**:
  - Frame 0–360: A plays at 1× speed, audio on
  - Frame 60–180: lower-third caption `VIVIAN BALAKRISHNAN` mono small caps 18pt, fades in over 30 frames, holds 4s, fades out
  - Frame 180–300: caption updates to `MINISTER FOR FOREIGN AFFAIRS · SINGAPORE` same style
- **Transitions**: in 1s fade from black with audio fade-in · out NO cut (continues into B02)
- **FX**: letterbox 90px top/bottom only when in 9:16 source-fit lets gaps — otherwise no chrome
- **Rationale**: The first 12 seconds of his speech is where he establishes the premise ("I built…"). Don't cut. Don't overlay. Let the audience inhabit the room.

### B02 · The quote unfolds · 0:12–0:28 · 480 frames
- **Purpose**: His quote as he actually says it — not a pull-quote, the live delivery
- **Hero**: A continues, playing through the moment where he says the line
- **Crop mode**: video continues. Cut to a TIGHT crop on Vivian's eyes for the 8 frames around "you cannot govern" (face-aware zoom from scale 1.04 → 1.15 over 30 frames), then back to medium over 30 frames.
- **Layers**:
  - Frame 360–840: A plays, audio on
  - Frame 480–840: caption appears at bottom — NOT his quote, just the timecode mark: `0:00:14 — THE LINE` mono 14pt — signals "this is the part you've seen". Removes after 4s.
- **Transitions**: no cut · in/out continuity from B01
- **FX**: subtle vignette pulses with his voice's volume (audio-reactive — TODO when audio wires)
- **Rationale**: The visual restraint here is the point. Everyone has seen the pull-quote text. Show the speaking. The slight zoom-in on his eyes is the only chrome — it lets the viewer feel the weight without forcing it.

### B03 · The room hears it · 0:28–0:40 · 360 frames
- **Purpose**: Cut once — to the room. Show what 1,247 builders looked like hearing the line.
- **Hero**: H (Linh's huge audience crowd, 14 faces)
- **Crop mode**: static · NO Ken Burns · let the photo SIT. Crop holds the entire crowd's eyeline at the upper third.
- **Layers**:
  - Frame 840–1200: H static
  - Frame 840–1200: A's AUDIO continues underneath at -3dB (he's still talking, viewer hears his next sentence over the crowd photo)
  - Frame 900–1080: caption upper-left, very small, mono 12pt: `THE ROOM — 1,247 BUILDERS` — fades in/out gently
- **Transitions**: in 1s cross-fade from B02 video to H photo (the audio bridges the cut) · out 1s cross-fade
- **FX**: nothing
- **Rationale**: This is the ONLY photo in the entire recap. It has to do enormous work. Holding it static for 12 seconds with his voice over it = "this is the moment that mattered."

### B04 · Back to him · 0:40–0:52 · 360 frames
- **Purpose**: Return to his face for the closing of his speech — bookend
- **Hero**: A resumes (trim to ~52–64s of source video)
- **Crop mode**: video continues with a wider crop than B01 (scale 0.95 — slightly pulled back, signaling "we're stepping out")
- **Layers**:
  - Frame 1200–1560: A plays at 1× speed
  - No captions
- **Transitions**: in 1s cross-fade from B03 photo back to video · out video fades down audio over last 1s, image holds
- **FX**: vignette deepens over the final 60 frames
- **Rationale**: Returning to his face after the crowd shot mirrors the opening — the recap has a frame. He started us, he closes us. No new information needed.

### B05 · Silent outro · 0:52–1:00 · 240 frames
- **Purpose**: Pure typography. After his voice ends, give the viewer 8 seconds of silence to sit with it.
- **Hero**: typographic on pure black
- **Layers**:
  - Frame 1560–1620: video fades to black with audio fade-out (1s total)
  - Frame 1620–1700: text appears center, mono small caps 24pt, single line: `AIE · SINGAPORE · MAY 17–19 · 2026` — fades in over 30 frames
  - Frame 1700–1780: text replaces with `4,000,000 VIEWS · 872 POSTS · ONE ROOM` — mono small caps 18pt, three lines
  - Frame 1780–1800: text replaces with URL `AETHER.BERLAYAR.AI / VIBES / AIE2026` mono 16pt
- **Transitions**: in 1s fade from B04 · out hold
- **FX**: nothing — silence + dark + type
- **Rationale**: The silence is the asset. Most recaps end on a hype stinger. This one ends on quiet — which makes the viewer remember the speech, not the recap. The URL is the only call to action.

---

## Asset coverage

ONLY 2 assets used: A (video) + H (one photo). 15 of 17 assets unused — deliberately.

The premise of this storyboard is **restraint**. If the recap has a single thesis (Vivian's quote, Vivian's act), then the recap should be a single visual line too. Adding more faces = diluting.

## Why this shape works

- **Earns the 2.16M views** — Melissa Chen's tweet went viral on his actual speech, not on a remix. Honor that.
- **Works as a YouTube short, X long-post, or blog embed** — minimal type means it doesn't fight whatever surrounds it
- **Audio-led** — once we wire his speech, the whole reel is essentially "his words + 1 reaction shot + 8s of quiet". Maximum impact per minute.
- **Anti-listicle** — for premium contexts (sponsor decks, post-event press, his own team's repost) this reads as serious. The TikTok cut is wrong for those rooms.
- **Easiest to localize** — caption the speech, swap the trailing URL, done. No infographic overlays to re-translate.

## Why this shape FAILS for some contexts

- TikTok / Reels — would scroll past
- Anyone who hasn't heard of Vivian — needs more context-setting overlays
- Sponsor decks — sponsors get zero airtime here (deliberately — they get airtime on storyboard A or B)
- Anyone who wants stats — this storyboard has them in 8 seconds at the very end, not as a hook

## Scene variant routing

This storyboard maps to **no current variant directly** — it's actually a NEW variant. Closest cousins:
- `editorial-newspaper` (restraint) — but newspaper variant uses static photos, not video
- `apple-keynote` (minimalism) — but keynote variant has more typographic flourish

**Suggestion**: add an 11th variant called `single-voice` or `quiet` if this shape resonates. It would justify itself by being the only one that uses the heroMoment video as the spine, not as a 4-second clip.

## What this storyboard explicitly is NOT

- Not stat-driven
- Not multi-voice — Sherry, Rachael, Gabriel are absent intentionally
- Not sponsor-acknowledged — they go in a separate sponsor video or sidebar credit
- Not designed for autoplay-muted feeds — needs audio to be itself

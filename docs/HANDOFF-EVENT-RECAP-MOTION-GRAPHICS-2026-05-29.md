# HANDOFF — Event recap motion graphics

**Date:** 2026-05-29
**Repo:** `/Users/erniesg/code/erniesg/aether`
**User:** Project owner
**Branch at handoff:** `feat/event-recap-event-config`
**Pickup target:** Any general-purpose code agent with the HyperFrames skill installed and read access to this repo. Read this file end-to-end before doing anything else.

---

## Why this thread exists

Aether is a canvas-native creative system (full project context in `CLAUDE.md` and `AGENTS.md` — read both). The current work-stream is producing **shareable motion graphics for event recaps**, anchored to the AIE2026 (AI Engineer Singapore 2026) corpus already curated in this repo.

The arc started as a research question — what variants of motion graphic exist for event recap social sharing — and progressed into building actual compositions for Ernie to review.

---

## What's been done

### 1. Variant menu (research, in conversation history only)

A 5-tier menu of ~20 recap variants was synthesized from external research (Spotify Wrapped engineering writeups, kinetic-typography references, IEEE network-viz papers, Web Summit / SXSW conventions). The menu groups variants by surface (still cards → animated loops → vertical reels → landscape films → interactive microsite). If you need to recover it, re-derive from these source files:

- `docs/playbooks/event-recap/README.md` — playbook output spec
- `docs/playbooks/event-recap/references/aie2026-methodology.md` — methodology and copy templates
- `docs/playbooks/event-recap/references/aie2026-atlas-lanes.md` — atlas model (4 thematic lanes: keynote / program / tools / community)
- `outputs/event-recap-ai-engineer-singapore/archive.json` — 872 relevant posts, 13 story clusters, ~20 atlas clusters (ids up to atlas-21, with gaps), 4.05M observed views
- `lib/research/event-recap/fixtures/aie-2026.config.ts` — story definitions + lane mappings + curated phrase rules
- `workers/aie2026-vibes.ts:600-815` — current atlas SVG generation
- `app/events/[eventId]/EventRecapClient.tsx` — live recap UI (themes / posts / timeline / voices lenses)

### 2. Four motion graphic compositions — lint-clean, demo-ready HyperFrames

Located at `docs/explorations/motion-graphics/`. Each is a standalone HyperFrames project (independent `index.html` + `hyperframes.json` + `meta.json` + `package.json`):

| #   | Project          | Format          | What it demonstrates                                                              |
| --- | ---------------- | --------------- | --------------------------------------------------------------------------------- |
| 01  | atlas-reveal     | 1080×1920, 8s   | 4-lane atlas drawing in: hairlines, 13 nodes pop, 3 bridge edges trace, caption  |
| 02  | by-the-numbers   | 1080×1920, 20s  | Funnel arc 4.05M → 872 → 13 → 4. Bar shrinks across scenes, counter per slide    |
| 03  | quote-cascade    | 1080×1920, 18s  | 3 kinetic-typography techniques: mask reveal, letter cascade, word slam          |
| 04  | photo-mosaic     | 1080×1920, 8s   | 3×3 placeholder grid → 8 tiles dim → center highlights → caption fades in        |

**Current state of all four:**
- `npx hyperframes lint` — 0 errors 0 warnings
- `npx hyperframes inspect` — 0 layout issues across 9 timeline samples
- Snapshot PNGs at hero frames in each project's `snapshots/contact-sheet.jpg`

**The quotes in `03-quote-cascade` are illustrative, NOT verbatim.** They are:
- Q1 mask reveal: *"the harness / is the product."* — attributed to "openai · codex booth, aie singapore · day 1"
- Q2 letter cascade: *"every operator on stage treated the model as commodity infill."* — attributed to "aie singapore, stage observation · 16 may"
- Q3 word slam: *"Singapore can be the testbed for AI agents at scale."* — attributed to "vivian balakrishnan, keynote · capitol theatre"

These are paraphrased to demonstrate kinetic techniques. Before publishing, substitute verbatim quotes pulled from `archive.json`.

### 3. Design system declared

`docs/explorations/motion-graphics/DESIGN.md` is the visual-identity file required by the HyperFrames skill's Visual Identity Gate. Tokens:

- **Colors:** paper `#f4ede0` / ink `#1a1a1a` / graphite `#5a5550` / vermillion `#c8413a` (used **exactly once per scene**) / hairline `rgba(26,26,26,0.12)` / veil `rgba(244,237,224,0.55)`
- **Typography:** IBM Plex Mono only. Weights 300 / 400 / 700. `tracking: -0.02em` on 60px+. `font-variant-numeric: tabular-nums` on counters.
- **Motion:** 0.35–0.7s duration band. ≥3 distinct eases per scene. First animation offset 0.15–0.3s, never t=0. Stagger total under 600ms.
- **Forbidden:** gradients (especially text), shadows, rounded corners > 2px, neon/glow, multi-color palettes, banned fonts (Inter, Roboto, Syne, Poppins…).

**Every new composition in this directory MUST conform to DESIGN.md.** Drift = wrong answer.

### 4. Four preview servers spun up earlier this session

Likely still running unless Ernie killed them:
- http://localhost:3011 — atlas-reveal
- http://localhost:3012 — by-the-numbers
- http://localhost:3013 — quote-cascade
- http://localhost:3014 — photo-mosaic

Restart from the project dir with `npm run dev` if needed.

### 5. Review pass — 2026-05-30

A design+code review (lint + inspect + fresh snapshots, all re-read against DESIGN.md and the HyperFrames rules) tightened the four. Applied and re-verified:

- **Vermillion now appears exactly once per scene in all four** (this was the systemic drift): 01 header index → ink; 02 scene-1 `M` → ink (lone red is `100%`); 03 `testbed` → ink (lone red is the technique label — the slam pulse still targets the retained `.accent` class); 04 header `↓` + caption `↑` → ink (lone red is the keynote corner).
- **01** node-entrance stagger recompressed 1.32s → 0.48s (DESIGN.md 600ms budget), build pulled ~0.5s earlier, edge trace 1.1s → 0.8s, footer meta bottom-aligned (`flex-end`).
- **Compliance/cleanup:** `font-variant-numeric: tabular-nums` added to all four; dead CSS removed (02 `.accent-dot`, 03 `.q2/.q3 .word.accent`); 03 line-2 reveal 0.75s → 0.7s; 04 veil 0.6 → 0.55, duplicate `demo` tile → `expo`.

**Known gaps — not-yet-real, resolve before any production share:**
- **04** tiles are placeholders — no real imagery is wired.
- **03** quotes are illustrative paraphrases (see §2) — substitute verbatim post text from `archive.json`.
- **02** scope ratios (100/50/25/10%) are an illustrative funnel metaphor, not measured fractions.
- **01** bridge edges approximate lane connections; they are not anchored to exact node centers.

**Deferred — taste calls, ask the owner:** 02 pacing (20s) and scene-4 slam-vs-count and scope-bar relabel; 02 lower-third negative space; per-scene ambient "breathe" beats; 03 scene-transition typographic gesture; accent-hue test (cobalt/sage).

---

## Hard rules — do not break

From `CLAUDE.md` (loaded automatically into your context):
- Single synthesis-shell workspace — never split into per-step wizard routes
- Canvas is the substrate; other views are camera modes or overlays
- Strict UI taxonomy: input / output / metadata / tool / navigation — no mixing
- Restraint over labels — layout, mono font, paper texture carry meaning
- Provider-agnostic AI — no hardcoded default image or video model
- Typed provenance on every mutation
- Graph-first persistence (Convex)
- Red/green TDD

From the HyperFrames skill (`/Users/erniesg/.claude/skills/hyperframes/SKILL.md`):
- Standalone composition `index.html` does NOT use `<template>` — `<template>` is for sub-composition files only
- Never `repeat: -1` — compute finite repeats
- Build timelines synchronously — no async/await/setTimeout/Promise
- Layout before animation: write the end-state HTML+CSS first, then GSAP `from` tweens to animate IN to that state
- **NEVER use exit animations except on the final scene** — the transition IS the exit
- Use `tl.set(sel, vars, 0)` not `gsap.set(sel, vars)` for initial states on elements that need to persist across seeks
- Container `.scene-content` must fill the scene with padding+flex — never `position: absolute; top: Npx` on a content container

Current repo convention:
- **No tool/model attribution** in commits or PR bodies unless explicitly requested
- Commit at every milestone — not at the end of a multi-hour run
- Push to remote on feature branches each commit
- Demand evidence before claiming "done" — lint+inspect+snapshot or it didn't happen

---

## Open work — directions Ernie may take

Pick based on what Ernie asks next. Most likely directions, ranked by signal:

### A. Build more variants from the menu

Tier 1 (still PNG):
- **Speaker spotlight card** — headshot + reach bar + signature quote
- **Story tile pack** — one tile per AIE2026 cluster, 13 of them, batchable in a single composition

Tier 3 (9:16 reels, with sound):
- **Day-arc reel (45–60s)** — 3 acts: morning energy → keynote → afternoon → community close. Cuts to room audio
- **Single-story deep-dive (15s)** — one cluster, 3 image cuts + 1 voice quote + CTA. Repeatable per story → 13 reels in one pass

Tier 5 (interactive):
- **Personalized recap microsite** — `?handle=@x` → 7-slide Wrapped-style stack of "your AIE2026". Highest payoff, biggest lift. `archive.json` has author handles so data supports it.

### B. Swap content to non-event-recap use cases

Patterns generalize. Likely asks:
- `02-by-the-numbers` → product launch funnel (signups → activations → 30-day retention)
- `03-quote-cascade` → customer testimonials / book pull-quotes
- `04-photo-mosaic` → portfolio reveal / team gallery
- `01-atlas-reveal` → product feature taxonomy / org chart / content map

If Ernie asks for a non-event-recap variant, fork the project directory (e.g. `05-product-funnel/`), keep the file structure, swap the content + descriptors, preserve DESIGN.md tokens.

### C. Wire to live data

The four built compositions have hardcoded content. To go from "explorations" to "production":
- Build a generator script in `scripts/` that reads `outputs/event-recap-ai-engineer-singapore/archive.json` + `lib/research/event-recap/fixtures/aie-2026.config.ts` and emits HyperFrames compositions per story
- Pull real quotes by extracting top-engagement post text from archive.json
- Real reach/engagement numbers are in archive.json today
- Speaker headshot pipeline doesn't exist — discuss with Ernie before adding asset infrastructure

### D. Integrate with aether workspace

To bring these into the live product (this is the biggest scope):
- Add a "Motion recap" lens to `app/events/[eventId]/EventRecapClient.tsx`
- Create a `VideoGenProvider` adapter so the composition can be rendered via aether's existing provider abstraction (see `CLAUDE.md` tech-stack section)
- Wire composition selection into `components/share/VibesShareMenu.tsx`
- Snapshot a hero frame as the OG image when shared

### E. Iterate on existing four

Small-edit asks Ernie may bring:
- Tighter timing (compress 02 from 20s to 15s? compress 03 from 18s to 12s?)
- Different accent color (test cobalt or sage instead of vermillion)
- Sound design layer (every reel currently silent — needs room tone + percussion hits keyed to entrances)
- Stat formatting on scene 1 of 02 (now "4.05M" in ink, with the scope "100%" as the lone accent — explore "4,053,000", or moving the single accent onto a digit)

---

## Verification protocol

Before claiming any composition edit "done":

```bash
cd docs/explorations/motion-graphics/<comp>
npx hyperframes@0.6.52 lint            # MUST show 0 errors 0 warnings
npx hyperframes@0.6.52 inspect         # MUST show 0 layout issues
npx hyperframes@0.6.52 snapshot --at <hero-times> --describe false
# Read the resulting snapshots/contact-sheet.jpg via the Read tool. Do not skip.
```

For new compositions, scaffold by copying `01-atlas-reveal/` as a template — file structure and `package.json` scripts are identical across all four.

For multi-composition snapshots, always `cd` explicitly before `npx hyperframes@0.6.52 snapshot` — the CLI defaults the project directory based on cwd, and parallel Bash calls in the same agent session reset cwd between invocations. (Mistake made twice in the prior session; don't repeat.)

---

## What NOT to do

- Don't move the compositions out of `docs/explorations/motion-graphics/` without asking. Ernie agreed to that sandbox path.
- Don't add a default image or video provider hardcoded anywhere — aether's provider-agnostic rule.
- Don't auto-attach the illustrative quotes in `03-quote-cascade` to real speakers in a production share. Flag them or replace with verbatim post text from `archive.json`.
- Don't add tool/model co-author footers to commits unless explicitly requested.
- Don't claim "done" without running lint + inspect + snapshot AND reading the snapshot images. Ernie demands evidence.
- Don't introduce new fonts — IBM Plex Mono only per DESIGN.md.
- Don't use exit animations on any scene except the final one of a composition.

---

## First message to send Ernie

> I've read the handoff at `docs/HANDOFF-EVENT-RECAP-MOTION-GRAPHICS-2026-05-29.md`. Four motion graphic compositions are built and lint-clean at `docs/explorations/motion-graphics/` (01 atlas-reveal · 02 by-the-numbers · 03 quote-cascade · 04 photo-mosaic). Preview servers may still be on 3011–3014. What do you want next — more variants from the menu (speaker spotlight, day-arc reel, microsite), content swap to a non-event-recap use case, live-data wiring, workspace integration, or iteration on one of the existing four?

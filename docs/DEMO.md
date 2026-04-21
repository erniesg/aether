# DEMO.md — 3-minute arc

**Target URL:** `aether.berlayar.ai`
**Duration:** 3:00, with ~20s buffer for live jitter
**Seed data:** one workspace `demo-ws` preloaded with 3 product references, a brand token set (terra + deep-blue palette, Inter + Fraunces type pair), and a one-line brief ("launch hero for Q2 product drop").

## Beat sheet

### 0:00 — 0:20 · Open and orient

- Open `aether.berlayar.ai/workspace/demo-ws`.
- Narration: _"aether is a canvas-native creative system. This is one workspace — everything happens here."_
- On screen: the synthesis shell loads. Left rail shows an 8-icon column (collapsed-by-default lifecycle order). Right rail shows the active focus + version strip. Floating canvas toolbar at top-left. Prompt composer at the bottom with a `global · reading · product refs` chip.

### 0:20 — 0:50 · Compose + generate

- Click the `References` rail icon → the section inline-expands; 3 product thumbnails are visible. Pin two.
- Click the `Brand` icon → terra + deep-blue swatches are already the active brand.
- Narration: _"Two references, one brand system, one brief — that's the input set."_
- Type into the composer: `launch hero, neon-drenched product portrait, deep-blue ambient, tall format`.
- Press ⏎. Claude Opus 4.7 plans, calls the image-gen tool (provider chosen by env — demo uses Seedream 5 via Volcengine Ark).
- Result lands as a native Tldraw layer on the canvas within ~8s. A provenance card appears in the right rail ("generated · seedream-5 · 1.2s").

### 0:50 — 1:30 · Pin as capability (the hero beat)

- Right-rail hover reveals a `pin as skill` affordance on the generation card.
- Click pin → a small dialog: Claude has summarized the action as a `CapabilityDefinition` with params and a natural-language trigger (`"neon drench with ambient wash"`).
- Accept. The floating canvas toolbar now has a new icon chip for this skill.
- Narration: _"The tool just learned an aesthetic. I can re-apply it to any layer, no re-prompt."_
- Select a different layer (a product photo dragged onto the canvas from the rail). Click the pinned skill icon. Claude re-runs the same pipeline with the new input. A second layer appears with the effect applied.

### 1:30 — 2:10 · Fan out to multiformat

- Click the `lens` switcher on the canvas (bottom-right of the canvas area) → `multiformat`.
- The same canvas re-frames to show 3 linked artboards: IG post 1080², IG story 1080×1920, reel cover.
- Edit copy on the hero once in the composer ("Q2 drop — tonight"); the copy propagates across all three.
- On the story artboard, toggle `local` scope, nudge the CTA down off the platform safe zone. Switch scope back to global and edit the headline — story keeps its CTA position, post + reel both update.
- Narration: _"Global by default, local when you need it. No re-keying."_

### 2:10 — 2:40 · Export + provenance

- Click `export pack` in the header. A sidecar pane previews the pack — 3 PNGs + a `manifest.json` listing inputs, brand tokens, capability runs, and the pinned skill name.
- Download. Narration: _"Full provenance — every generation, every pinned skill, tied to the brief."_

### 2:40 — 3:00 · Stretch beat (if ready)

- Back on the canvas lens. Composer: `animate · subtle rim-light sweep, 4s loop`.
- Claude plans, video-gen adapter produces a short clip (Remotion deterministic if conservative, Seedance 2 if confident). It lands as a canvas-native `MotionAsset` next to the hero.
- Narration: _"Same canvas, same graph, motion lives here too."_

## If something breaks mid-demo

- **Image gen times out** → switch the env-selected provider to Gemini or OpenAI via a `?provider=gemini` URL param; re-run. The abstraction is the point.
- **Pin dialog flakes** → show the already-pinned skill from seed data re-running — still makes the capability point.
- **Multiformat fan-out lags** → talk over it; the cross-propagation demo is the story, not the render speed.
- **Video stretch won't cooperate** → drop it silently; export pack is a clean ending on its own.

## Recording

Record at 1920×1080, narrate over the top in a second pass. Keep the cursor slow and deliberate. No dev tools visible.

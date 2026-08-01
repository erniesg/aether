# News Room AI Anchor Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate, validate, and arrange the eleven shared 16:9 anchor frames that define the continuous-camera News Room AI Tools film.

**Architecture:** The approved design spec defines `F00`–`F10`. Each anchor is generated once with the built-in image generator, saved under a stable ID, and reused verbatim as the adjacent Seedance clips' shared boundary. Deterministic screen mattes and the storyboard are derived locally after the beauty plates are approved.

**Tech Stack:** Built-in image generation, ImageMagick, PNG/JPEG assets, Markdown manifests.

## Global Constraints

- Follow `docs/superpowers/specs/2026-08-02-newsroom-ai-continuous-camera-design.md` exactly.
- Output composition is 16:9 landscape with protected caption and interface safe areas.
- Hybrid style: black-and-white documentary cutouts plus precise flat layered paper geometry.
- Palette: warm cream, black, deep navy, teal, brick red, and small mustard accents.
- Generated frames contain no letters, headlines, charts, logos, UI, or pseudo-text.
- `CTRL+C`, `CTRL+V`, captions, product UI, and category labels are added later in Remotion.
- Blank screen/page surfaces must be rigid, unobstructed, and suitable for deterministic geometric mattes.
- Never generate separate copies of a shared boundary frame.

---

### Task 1: Generate the eleven beauty plates

**Files:**
- Create: `generated/newsroom-ai/continuous-camera/anchors/F00.png`
- Create: `generated/newsroom-ai/continuous-camera/anchors/F01.png`
- Create: `generated/newsroom-ai/continuous-camera/anchors/F02.png`
- Create: `generated/newsroom-ai/continuous-camera/anchors/F03.png`
- Create: `generated/newsroom-ai/continuous-camera/anchors/F04.png`
- Create: `generated/newsroom-ai/continuous-camera/anchors/F05.png`
- Create: `generated/newsroom-ai/continuous-camera/anchors/F06.png`
- Create: `generated/newsroom-ai/continuous-camera/anchors/F07.png`
- Create: `generated/newsroom-ai/continuous-camera/anchors/F08.png`
- Create: `generated/newsroom-ai/continuous-camera/anchors/F09.png`
- Create: `generated/newsroom-ai/continuous-camera/anchors/F10.png`
- Create: `generated/newsroom-ai/continuous-camera/manifest.md`

**Interfaces:**
- Consumes: Anchor descriptions and visual constraints from the approved design spec.
- Produces: Eleven stable PNG paths keyed by `F00`–`F10`, plus the final prompt recorded for every anchor.

- [ ] **Step 1: Generate a representative three-frame pilot**

Generate `F04`, `F05`, and `F08` first because they test exact key surfaces, the live-demo monitor, and the four-screen scale-out.

- [ ] **Step 2: Inspect the pilot at full resolution**

Verify flat replacement surfaces, camera direction, style cohesion, blank content regions, absence of pseudo-text, and sufficient caption-safe space.

- [ ] **Step 3: Correct pilot failures with one targeted revision each**

Revise only frames that violate a validation criterion. Preserve approved framing and palette.

- [ ] **Step 4: Generate the remaining eight anchors**

Generate `F00`, `F01`, `F02`, `F03`, `F06`, `F07`, `F09`, and `F10` with the validated visual grammar.

- [ ] **Step 5: Save every selected image under its stable anchor ID**

Copy each built-in output into `generated/newsroom-ai/continuous-camera/anchors/` without deleting the original generated file.

- [ ] **Step 6: Record prompts and intended clip mapping**

Write `manifest.md` with the prompt, role, replaceable surfaces, and adjacency mapping for every anchor.

- [ ] **Step 7: Commit the anchor set**

```bash
git add generated/newsroom-ai/continuous-camera/anchors generated/newsroom-ai/continuous-camera/manifest.md
git commit -m "feat: add newsroom continuous-camera anchors"
```

### Task 2: Validate continuity and compositing surfaces

**Files:**
- Create: `generated/newsroom-ai/continuous-camera/validation.md`

**Interfaces:**
- Consumes: The eleven anchor PNGs from Task 1.
- Produces: A pass/fail record covering dimensions, blank surfaces, camera direction, caption safety, and adjacent-scene reuse.

- [ ] **Step 1: Verify dimensions and file integrity**

Run:

```bash
magick identify generated/newsroom-ai/continuous-camera/anchors/F*.png
```

Expected: eleven readable landscape PNGs with identical pixel dimensions.

- [ ] **Step 2: Review each frame visually**

Record pass/fail for subject, composition, palette, generated text, hand anatomy, screen geometry, and safe areas.

- [ ] **Step 3: Verify the adjacency table**

Confirm `Scene 01 = F00 → F01` through `Scene 10 = F09 → F10`, with no duplicate boundary files.

- [ ] **Step 4: Save the validation report**

Write the findings and any accepted limitations to `validation.md`.

- [ ] **Step 5: Commit validation evidence**

```bash
git add generated/newsroom-ai/continuous-camera/validation.md
git commit -m "docs: validate newsroom anchor continuity"
```

### Task 3: Create review and matte-preparation artifacts

**Files:**
- Create: `generated/newsroom-ai/continuous-camera/storyboard.jpg`
- Create: `generated/newsroom-ai/continuous-camera/mattes/README.md`

**Interfaces:**
- Consumes: Validated anchors and the replacement-surface notes from `manifest.md`.
- Produces: One labeled storyboard and exact instructions for producing the Remotion screen masks after the user supplies demo footage.

- [ ] **Step 1: Build the labeled storyboard**

Run ImageMagick montage over `F00.png` through `F10.png`, preserving anchor order and adding filename labels.

- [ ] **Step 2: Document screen-matte targets**

Record the main monitor target in `F05`/`F06`, the print and phone targets in `F06`, and the four scale-out targets in `F08`. Do not guess final corner coordinates before the selected anchors are inspected.

- [ ] **Step 3: Review the storyboard as one camera journey**

Check that visual density, camera direction, and subject scale progress deliberately from `F00` through `F10`.

- [ ] **Step 4: Commit review artifacts**

```bash
git add generated/newsroom-ai/continuous-camera/storyboard.jpg generated/newsroom-ai/continuous-camera/mattes/README.md
git commit -m "feat: add newsroom anchor storyboard"
```

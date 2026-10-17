# SPH Innovation Award Scenes 03–06 Generation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate and validate 18 coherent 16:9 layered paper-cutout storyboard frames for scenes 03, 04, 04-2, 05, 05-2, and 06.

**Architecture:** Use the built-in image generator once per requested asset. Keep a shared visual-system block across all prompts, then add shot-specific composition and A/B/C variant direction. Preserve each final image in a dedicated workspace folder and maintain a prompt ledger for reproducibility.

**Tech Stack:** Built-in image generation, local filesystem, visual inspection.

## Global Constraints

- Generate exactly three 16:9 variants for each of six shots.
- Use premium layered paper sculpture with visible fibers, precise cut edges, and realistic stacked-paper shadows.
- Keep the shared palette deep navy, charcoal, warm cream, and restrained amber.
- Use exact visible copy **Newsroom AI Tools** in shot 05-2.
- Keep shots 04 and 06 monitor surfaces completely uniform bright chroma green.
- Do not add captions, speech bubbles, watermarks, extra characters, lamp faces, or unrelated props.
- Treat the supplied SGX photo only as shot 03's architectural reference and the supplied mascot image only as shot 04's identity reference.

---

### Task 1: Prepare the generation set

**Files:**
- Create: `generated/sph-innovation-award/scenes-03-06/prompts.md`
- Create: `generated/sph-innovation-award/scenes-03-06/manifest.md`

- [ ] **Step 1:** Create the output folder without altering existing generated assets.
- [ ] **Step 2:** Record all 18 normalized prompts with reference roles and exact copy.
- [ ] **Step 3:** Record the expected filename map: `03-a.png` through `06-c.png`, including `04-2-*` and `05-2-*`.

### Task 2: Generate the establishing and fatigue frames

**Files:**
- Create: `generated/sph-innovation-award/scenes-03-06/03-a.png`
- Create: `generated/sph-innovation-award/scenes-03-06/03-b.png`
- Create: `generated/sph-innovation-award/scenes-03-06/03-c.png`
- Create: `generated/sph-innovation-award/scenes-03-06/04-a.png`
- Create: `generated/sph-innovation-award/scenes-03-06/04-b.png`
- Create: `generated/sph-innovation-award/scenes-03-06/04-c.png`

- [ ] **Step 1:** Generate three SGX night variants using the SGX photo as architectural reference.
- [ ] **Step 2:** Generate three weary-newsroom variants using the mascot image as identity reference.
- [ ] **Step 3:** Inspect framing, identity, paper material, palette, and chroma-screen uniformity.

### Task 3: Generate the questioning lamp frames

**Files:**
- Create: `generated/sph-innovation-award/scenes-03-06/04-2-a.png`
- Create: `generated/sph-innovation-award/scenes-03-06/04-2-b.png`
- Create: `generated/sph-innovation-award/scenes-03-06/04-2-c.png`

- [ ] **Step 1:** Generate the three lamp close-ups with emotion expressed only through posture and material deformation.
- [ ] **Step 2:** Inspect for circular reflector, central bulb, articulated arms, visible hinges, oval base, and absence of facial features.

### Task 4: Generate the keyboard transformation frames

**Files:**
- Create: `generated/sph-innovation-award/scenes-03-06/05-a.png`
- Create: `generated/sph-innovation-award/scenes-03-06/05-b.png`
- Create: `generated/sph-innovation-award/scenes-03-06/05-c.png`
- Create: `generated/sph-innovation-award/scenes-03-06/05-2-a.png`
- Create: `generated/sph-innovation-award/scenes-03-06/05-2-b.png`
- Create: `generated/sph-innovation-award/scenes-03-06/05-2-c.png`

- [ ] **Step 1:** Generate three macro keyboard frames with legible `Ctrl`, `C`, and `V` keycaps.
- [ ] **Step 2:** Generate three physical paper-transformation frames reading exactly **Newsroom AI Tools**.
- [ ] **Step 3:** Inspect spelling, capitalization, key geometry, restrained transition treatment, and forbidden extra copy.

### Task 5: Generate the chroma-screen frames and validate the set

**Files:**
- Create: `generated/sph-innovation-award/scenes-03-06/06-a.png`
- Create: `generated/sph-innovation-award/scenes-03-06/06-b.png`
- Create: `generated/sph-innovation-award/scenes-03-06/06-c.png`
- Modify: `generated/sph-innovation-award/scenes-03-06/manifest.md`

- [ ] **Step 1:** Generate three near-full-frame, front-facing chroma-screen push-in endpoints.
- [ ] **Step 2:** Inspect all 18 files for 16:9 framing and continuity.
- [ ] **Step 3:** Check text-sensitive and chroma-sensitive frames at full resolution.
- [ ] **Step 4:** Regenerate only failed frames with one targeted correction.
- [ ] **Step 5:** Mark every accepted output and its prompt in the manifest.

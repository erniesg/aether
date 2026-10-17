# Newsroom Style Preview Renders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Render three short 16:9 motion samples so the user can select an overlay, placeholder, caption, intro, and credits style before the full edit is assembled.

**Architecture:** Add one parameterized Remotion preview composition with three explicit visual identities: editorial paper, minimal cinematic, and data-to-story broadcast. Each nine-second sample contains the same three beats—intro, placeholder scene with burned-in caption, and credits—so only the visual treatment changes.

**Tech Stack:** Remotion 4, React 19, TypeScript, H.264 MP4.

## Global Constraints

- Use placeholders instead of final footage.
- Captions remain inside a broadcast-safe lower-third region.
- Credits names are alphabetized by first name.
- Preview renders are 1920×1080, 30fps, and approximately nine seconds each.
- Existing full-film compositions and user assets must remain untouched.

---

### Task 1: Build parameterized style previews

**Files:**
- Create: `docs/explorations/motion-graphics/05-newsroom-ai-tools/src/StylePreview.tsx`
- Modify: `docs/explorations/motion-graphics/05-newsroom-ai-tools/src/Root.tsx`
- Modify: `docs/explorations/motion-graphics/05-newsroom-ai-tools/package.json`

**Interfaces:**
- Produces: `StylePreview({variant})` and three selectable Remotion compositions.

- [ ] Create the shared nine-second timeline and explicit palettes.
- [ ] Add distinct intro, placeholder, caption, transition, and credits treatments for all three variants.
- [ ] Register the three compositions and render scripts.
- [ ] Run `npm run typecheck` and list compositions.

### Task 2: Render and inspect outputs

**Files:**
- Create: `docs/explorations/motion-graphics/05-newsroom-ai-tools/renders/style-previews/editorial-paper.mp4`
- Create: `docs/explorations/motion-graphics/05-newsroom-ai-tools/renders/style-previews/minimal-cinematic.mp4`
- Create: `docs/explorations/motion-graphics/05-newsroom-ai-tools/renders/style-previews/data-story.mp4`

**Interfaces:**
- Produces: Three directly comparable MP4 previews.

- [ ] Render each composition with H.264.
- [ ] Extract representative frames and inspect layout, text clipping, and caption legibility.
- [ ] Report the three output paths for selection.

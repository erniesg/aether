# Scene 01 News Story Composite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the five supplied newspaper stories into the five green windows of the existing 1080p Scene 01 animation while preserving motion and audio.

**Architecture:** Render page one of each PDF to a lossless image, create one headline-led crop per detected green window, and assemble those crops into a 1920×1080 background plate. Chroma-key the original animated foreground over the plate and remux its original stereo audio into the H.264 delivery file.

**Tech Stack:** Poppler `pdftoppm`, ImageMagick, FFmpeg/ffprobe

## Global Constraints

- Output is 1920×1080 at 24 fps and matches the source duration.
- Preserve the original AAC stereo sound effects.
- Use headline-led crops and a one-story-per-window mapping.
- Preserve all non-green black, red, teal, and cream artwork.

---

### Task 1: Build, render, and validate the composite

**Files:**
- Create: `docs/explorations/motion-graphics/05-newsroom-ai-tools/final-output-2026-08-03/scene-01-news-composite/page-renders/*.png`
- Create: `docs/explorations/motion-graphics/05-newsroom-ai-tools/final-output-2026-08-03/scene-01-news-composite/news-background.png`
- Create: `docs/explorations/motion-graphics/05-newsroom-ai-tools/final-output-2026-08-03/scene-01-news-composite/S01-paper-rails-sfx-upscaled-1080p-news-composite.mp4`
- Create: `docs/explorations/motion-graphics/05-newsroom-ai-tools/final-output-2026-08-03/scene-01-news-composite/validation-contact-sheet.jpg`

**Interfaces:**
- Consumes: the five named PDFs in `/Users/erniesg/Downloads` and the existing Scene 01 MP4.
- Produces: one self-contained 1080p MP4 with H.264 video and preserved AAC stereo audio.

- [ ] **Step 1: Render source pages**

Run `pdftoppm -f 1 -singlefile -png -r 200` for each PDF and name outputs `01-zaobao.png` through `05-business-times.png`.

- [ ] **Step 2: Build the background plate**

Create five aspect-filling headline crops matching these midpoint green-window bounds: `514x243+368+153`, `491x233+1084+193`, `506x230+310+426`, `520x221+1150+468`, and `528x212+666+700`. Place them on a black 1920×1080 canvas in reading order.

- [ ] **Step 3: Render the chroma composite**

Loop the background plate for the source duration and use FFmpeg `chromakey` against pure green with `similarity=0.22` and `blend=0.00`. Erode the keyed alpha six times to remove compressed green fringes, overlay the cleaned foreground, and map its original audio stream. Encode H.264 with `libx264`, `-crf 16`, `-preset slow`, and `-pix_fmt yuv420p`; copy the existing AAC stream into the MP4.

- [ ] **Step 4: Verify media properties**

Run `ffprobe` and confirm 1920×1080, 24 fps, approximately 6.06 seconds, H.264 video, and AAC stereo audio.

- [ ] **Step 5: Verify representative frames**

Extract frames at 0.5, 3.0, and 5.5 seconds, assemble a contact sheet, and inspect for correct mapping, readable masthead/headline structure, no green seams, and intact foreground rails.

- [ ] **Step 6: Commit only the plan**

Run `git add docs/superpowers/plans/2026-08-03-scene-01-news-story-composite.md && git commit -m "docs: plan scene 01 news story composite"`. Leave generated video artifacts uncommitted unless the user requests otherwise.

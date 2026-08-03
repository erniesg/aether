# Scene 01 Seedance Motion Plate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce and validate one 720p Seedance 2 Scene 01 motion plate with synchronized effects-only audio, ready for deterministic story compositing in Remotion.

**Architecture:** Upload the approved first frame through the Replicate Files API, submit one `bytedance/seedance-2.0` prediction using the approved six-second prompt, and poll until terminal state. Download the returned MP4 into a dedicated final-output directory, then verify media metadata, audio content, representative frames, and chroma-window stability.

**Tech Stack:** Replicate HTTP API, `curl`, `jq`, FFmpeg/FFprobe, Poppler-rendered story sources, local PNG/MP4 artifacts.

## Global Constraints

- Use `/Users/erniesg/code/erniesg/keys/.env.sph` variable `REPLICATE_API_KEY`; never print its value.
- Model: Replicate `bytedance/seedance-2.0`.
- Resolution: `720p`; aspect ratio: `16:9`; requested duration: `6` seconds.
- Source frame: `/Users/erniesg/Downloads/sph/scene1.png`.
- Generate synchronized paper/mechanical effects only; no dialogue, voiceover, speech, music, score, beat, singing, ambience, or hum.
- Do not pass the voiceover MP3 in `reference_audios`; use its 5.780-second Scene 01 timing only.
- Preserve four rigid, uniformly green windows for later Remotion compositing.

---

### Task 1: Submit and retrieve the Seedance prediction

**Files:**
- Create: `docs/explorations/motion-graphics/05-newsroom-ai-tools/final-output-2026-08-03/scene-01-seedance2-720p/seedance-request.json`
- Create: `docs/explorations/motion-graphics/05-newsroom-ai-tools/final-output-2026-08-03/scene-01-seedance2-720p/seedance-response.json`
- Create: `docs/explorations/motion-graphics/05-newsroom-ai-tools/final-output-2026-08-03/scene-01-seedance2-720p/S01-paper-rails-sfx-seedance2-720p.mp4`

**Interfaces:**
- Consumes: `REPLICATE_API_KEY`, source PNG, approved prompt from the design spec.
- Produces: a terminal Replicate prediction record and its downloaded MP4.

- [ ] **Step 1: Load and validate credentials without printing them**

Run a shell that sources `.env.sph`, maps `REPLICATE_API_KEY` to the HTTP bearer token, and exits unless both the token and source PNG exist.

- [ ] **Step 2: Upload the source PNG**

POST the PNG as multipart form data to `https://api.replicate.com/v1/files`, retain the returned HTTPS file URL, and confirm the response identifies a PNG asset.

- [ ] **Step 3: Record and submit the exact request**

Write `seedance-request.json` with `image`, the approved prompt, `duration: 6`, `resolution: "720p"`, `aspect_ratio: "16:9"`, and `generate_audio: true`. POST its `input` object to `https://api.replicate.com/v1/models/bytedance/seedance-2.0/predictions`.

- [ ] **Step 4: Poll to a terminal state**

GET the prediction URL at a short interval until `succeeded`, `failed`, or `canceled`. Save the terminal response to `seedance-response.json`; stop with a non-zero exit if the state is not `succeeded`.

- [ ] **Step 5: Download the output**

Resolve the output URL from the terminal response and download it to `S01-paper-rails-sfx-seedance2-720p.mp4`. Require a non-empty file.

### Task 2: Validate the motion plate

**Files:**
- Create: `docs/explorations/motion-graphics/05-newsroom-ai-tools/final-output-2026-08-03/scene-01-seedance2-720p/contact-sheet.png`
- Create: `docs/explorations/motion-graphics/05-newsroom-ai-tools/final-output-2026-08-03/scene-01-seedance2-720p/audio-analysis.txt`
- Create: `docs/explorations/motion-graphics/05-newsroom-ai-tools/final-output-2026-08-03/scene-01-seedance2-720p/README.md`

**Interfaces:**
- Consumes: `S01-paper-rails-sfx-seedance2-720p.mp4` from Task 1.
- Produces: metadata evidence, representative-frame review, effects-only audio analysis, and a concise provenance record.

- [ ] **Step 1: Verify media metadata**

Use FFprobe to require 1280 x 720 H.264 video, an audio stream, and duration of at least 5.780 seconds.

- [ ] **Step 2: Build representative-frame evidence**

Extract frames across the shot and assemble `contact-sheet.png`. Inspect it for a locked camera, stable paper texture, and four usable green windows.

- [ ] **Step 3: Analyze the generated audio**

Run silence/level analysis and a local speech transcription check. Save results in `audio-analysis.txt`; require no intelligible speech and report whether the sound is consistent with paper/mechanical effects rather than music.

- [ ] **Step 4: Record provenance and validation**

Write `README.md` with model, prediction ID, dimensions, frame rate, duration, audio format, prompt/request filenames, validation findings, and the 5.780-second Remotion trim target.

- [ ] **Step 5: Report the reviewed output**

Return the local MP4 and contact sheet paths, note any visible chroma-window instability or unwanted audio, and state whether the clip is ready for deterministic story insertion.

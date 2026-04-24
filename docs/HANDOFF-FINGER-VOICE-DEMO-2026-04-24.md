# Handoff Prompt: Finger + Voice Demo Completion

Date: 2026-04-24 SGT
Repo: `/Users/erniesg/code/erniesg/aether`
Goal: make the hackathon demo recordable end-to-end.

## Prompt For The Next Agent

You are picking up the aether hackathon build after worktree consolidation. Your job is to keep working autonomously until the finger+voice demo is complete enough to record.

Read first, in order:

1. `AGENTS.md`
2. `CLAUDE.md`
3. `docs/DEMO-FINGER-VOICE.md`
4. `docs/progress/feat-finger-voice-foundation.md`
5. `docs/decisions/2026-04-24-capability-factory.md`
6. `docs/decisions/2026-04-23-video-text-mask-direction.md`
7. `docs/ARCHITECTURE.md`
8. `git status --short --branch`

## Product Frame

aether is a creator-first canvas tool, not an operator dashboard. Keep everything in the single synthesis-shell workspace. The demo story is:

> “How might we design without vision? What if a creator could sketch a story with their fingers in the air, and aether turned that into video, key visuals, and every campaign format?”

The canvas is the substrate. Rails feed the canvas. Debug details stay out of the primary surface.

## Consolidated State

Main now includes:

- Voice PTT with OpenAI Realtime and Gemini Live session support.
- Voice tools for focus, pan/zoom, remove background, select/sketch, set brush color, set brush size, adjust brush thickness, clear/confirm sketch, rerun capability, and dispatch generation.
- tldraw-native sketching, segmentation, clean plates, export packs, fanout, and pinned capabilities.
- Capability entry metadata and registries: `tool | workflow | skill`, with version, scope, and status.
- `/api/capability/factory` for reviewed agent-authored capability requests.
- Draft spatial provider and `/api/spatial` for placeholder gaussian-splat / particle-field style previews.
- Video provider seam in `lib/providers/video/*`.
- HyperFrames-compatible text-mask and double-exposure scene specs, scripts, named double-exposure skills, and minimal demo media.

Do not merge worktrees wholesale. The useful pieces from `phase/39-capability-factory-foundation` and `spike/video-text-mask` were selectively lifted. Those branches still contain destructive changes against current voice/export/segmentation work.

## Current Validation Baseline

These passed before handoff:

- `npm test` -> 75 files, 369 tests passing.
- `npm run typecheck` -> passing.
- `PORT=3107 npx playwright test tests/e2e/voice-sketch.spec.ts` -> passing.
- `npm run video:double-exposure:skills` -> passing.
- `npm run video:text-mask -- --text "AETHER\\nHACKATHON" --media ./experiments/video/source-lab/cinematic-intro.mp4 --kind video --output /tmp/aether-text-mask.html` -> passing.
- `npm run video:double-exposure -- --skill echo-still --output /tmp/aether-double-exposure.html` -> passing.

Use a clean `PORT` for Playwright. The default `localhost:3000` can be occupied by another Next server and return a false 404.

## Primary Goals

### Goal 1: Camera Air Brush

Add a creator-facing air-brush mode in the existing canvas shell.

Requirements:

- It must use browser camera permission through `getUserMedia`.
- It must not create a new route or dashboard.
- It must feed the existing sketch/brush state where possible.
- Voice commands must still control brush color and thickness.
- Provide a demo-safe fallback if hand-landmark inference is unavailable: the creator can still record using pointer/touch/mouse while the webcam preview is visible.
- Keep the UI progressive: one toolbar chip or compact overlay, not a full camera console.

Suggested implementation:

- Add a small `AirBrushOverlay` or `AirBrushInput` component under `components/canvas/`.
- Add a bounded input abstraction in `lib/canvas/airBrush.ts` that emits normalized `{ x, y, pressure?, state }` points.
- Map those points to tldraw draw strokes or synthetic pointer events.
- Add unit tests for point normalization and fallback behavior.
- Add a component/e2e smoke test that toggles air-brush mode without requiring a real webcam.

Red/green:

- Red: failing unit/component test for air-brush activation and point normalization.
- Green: implementation passes with mocked `getUserMedia` and no camera device.

### Goal 2: Video Generation Route

Add a deterministic video generation path over the new video seam.

Requirements:

- Add `/api/video/generate` or equivalent route over `lib/providers/video/*`.
- First provider should be deterministic Remotion/HyperFrames-style HTML generation or a local scene-spec emitter.
- Do not hardcode Seedance/Veo as the default.
- The route should accept at least `text-mask` and `double-exposure` scene requests.
- Output can be HTML composition first; mp4 rendering can be a follow-up if time is tight.

Red/green:

- Red: route test expecting a text-mask scene request to return an artifact URL/path or HTML payload metadata.
- Green: route returns deterministic output and provider metadata without external credentials.

### Goal 3: Canvas Motion Artifact

Make generated motion visible from the workspace.

Requirements:

- A successful text-mask or double-exposure generation must land in the workspace as an artifact-first preview.
- Prefer canvas-native placement if fast; otherwise show a compact sidecar/lens preview inside the same shell.
- Do not introduce a video dashboard.
- Record typed provenance for the motion action.

Red/green:

- Red: component or e2e test asserting a motion run creates a visible artifact preview.
- Green: the generated artifact is visible and referenced in the action log/provenance.

### Goal 4: Demo Script Seed

Create a reliable local demo path for recording.

Requirements:

- Add or update a doc/script that gives exact commands and clicks for recording.
- Include fallback path if live image/video providers fail.
- Include exact voice lines:
  - “Sketch mode.”
  - “Make the brush thicker.”
  - “Change color to yellow.”
  - “Write my name.”
  - “Confirm sketch.”
  - “Introduce me as an AI Engineer based in Singapore.”
  - “Fan out to Instagram, X, LinkedIn, and TikTok.”

Red/green:

- Red: doc checklist missing a command or fallback.
- Green: one person can follow it without reading code.

## Stretch Goals

- Use Gemini video understanding for validation of generated video artifacts.
- Add validation agents for safe zones, face/brand collisions, text legibility, and platform readiness.
- Promote private pinned skills to team-published skills in Convex.
- Add scheduling only if every core demo beat is already recordable.

## Hard Requirements

- Preserve the single synthesis-shell workspace.
- Keep the canvas as the substrate.
- Keep prompt composer at the bottom.
- Provider-agnostic AI: no hardcoded default image/video/voice model.
- Artifact-first review: thumbnails/previews/outputs in primary UI; raw ids/traces only under debug.
- No production deploy.
- Do not run destructive git commands.
- Do not merge worktrees wholesale.
- Keep tests updated with red/green discipline.

## Validation Before Handoff Back

Run:

```bash
npm test
npm run typecheck
PORT=3107 npx playwright test tests/e2e/voice-sketch.spec.ts
npm run video:double-exposure:skills
npm run video:text-mask -- --text "AETHER\\nHACKATHON" --media ./experiments/video/source-lab/cinematic-intro.mp4 --kind video --output /tmp/aether-text-mask.html
npm run video:double-exposure -- --skill echo-still --output /tmp/aether-double-exposure.html
```

If you add new e2e coverage, run that too. If any command cannot run, document why and what remains risky.

## Demo-Complete Definition

The demo is recordable when:

1. The workspace loads on a clean local port.
2. A creator can turn on voice and sketch mode.
3. Air-brush input or the demo fallback visibly creates a name mark on the canvas.
4. Voice can change brush color and thickness.
5. A portrait/reference can be segmented or composited into a key visual.
6. A kinetic/text-mask or double-exposure motion artifact can be generated deterministically.
7. The key visual can fan out to campaign formats.
8. Export/provenance still works.
9. The run can be completed without opening devtools or an operator dashboard.

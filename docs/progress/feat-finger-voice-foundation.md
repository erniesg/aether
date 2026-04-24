# Finger + Voice Foundation Progress

Date: 2026-04-24

## Where We Are

- `main` is the consolidation base. It already contains voice PTT, Gemini Live support, voice sketch controls, SAM-style segmentation, clean plates, export packs, fanout, and pinned capabilities.
- `spike/design-capability-factory` only has uncommitted docs left; its safe concept is now captured in `docs/decisions/2026-04-24-capability-factory.md`.
- `phase/39-capability-factory-foundation` had useful registry, factory, and spatial-draft ideas. Those have been selectively lifted; the branch itself still should not be merged wholesale because it deletes newer mainline voice/sketch and segmentation analyze/plate work.
- `spike/video-text-mask` had useful double-exposure/text-mask scene modules and demo assets. Those have been selectively lifted; the branch itself still should not be merged wholesale because it deletes current brand/export/voice paths.

## Shipped In This Pass

- Expanded voice sketch controls with relative brush thickness (`adjust_brush_size`) and a broader voice palette.
- Added typed capability entries (`tool | workflow | skill`) with version, scope, and status metadata.
- Added tool, workflow, and skill registries so agent-authored effects have a publishable shape.
- Added a provider-agnostic video seam with Remotion, Volcengine, and Replicate registry slots.
- Added `/api/capability/factory` plus a draft spatial provider and `/api/spatial` route for reviewed agent-authored tool requests.
- Added HyperFrames-compatible text-mask and double-exposure scene specs, CLI emitters, named double-exposure skills, and minimal demo media.
- Added the air-brush camera preview and pointer/touch/mouse fallback path.
- Added MediaPipe Hand Landmarker as a lazy client-side air-brush enhancement. Landmark 8 now maps into the existing normalized brush point path with smoothing, dead-zone handling, and stroke end on hand loss. Pointer fallback remains available and CI does not require a webcam.
- Added air-brush capture into the existing composer reference path, so a webcam frame can drive the same `/api/video/generate` motion input as dropped or pasted image refs.
- Documented the embodied finger + voice demo arc and capability factory guardrails.
- Added the Build For What's Next submission script with the 3-minute recording arc, Opus 4.7 judging map, and fallback plan.

## Next Build Slices

1. Human validation: record a 10-second local clip of MediaPipe index-finger drawing; if it is unstable, record the pointer fallback with the camera preview visible.
2. Provenance hardening: add explicit action-log evidence for motion `inputs.refs` and `outputRefs` beyond the current run metadata coverage.
3. Replicate Seedance 2.0 adapter: implement it behind `lib/providers/video/*` only after HyperFrames remains green.
4. Convex capability persistence: move definitions from in-memory store to graph persistence and add publish-to-team.
5. Validation agents: artifact-first review for face/brand collisions, safe zones, text legibility, and platform format readiness.

## Validation

- `npm test`: 79 files, 379 tests passing.
- `npm run typecheck`: passing.
- `PORT=3107 npx playwright test tests/e2e/voice-sketch.spec.ts`: passing.
- `PORT=3107 npx playwright test tests/e2e/motion-artifact.spec.ts`: passing.
- `npm run video:double-exposure:skills`: passing.
- `npm run video:text-mask -- --text "AETHER\\nHACKATHON" --media ./experiments/video/source-lab/cinematic-intro.mp4 --kind video --output /tmp/aether-text-mask.html`: passing.
- `npm run video:double-exposure -- --skill echo-still --output /tmp/aether-double-exposure.html`: passing.
- `npm run cf-build`: passing.
- `npm run deploy:stg`: passing. Current staging version: `941d9ff6-f2dc-4bf1-8e5f-387a51aa2abe`.
- `PORT=3107 npx playwright test tests/e2e/air-brush.spec.ts`: passing after rerun with local-server permission. Covers toolbar activation, preview/fallback visibility, and captured camera frame to motion refs.

Note: running Playwright on the default port reused an unrelated existing `localhost:3000` server and returned a 404 for `/workspace/demo-ws`; use a clean `PORT` when validating locally.

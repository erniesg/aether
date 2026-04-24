# MediaPipe Finger Tracking

Date: 2026-04-24
Status: open
Owner: next demo agent

## Problem

The air-brush demo currently shows a webcam preview and supports pointer/touch/mouse drawing while the preview is visible. That is demo-safe, but it is not true finger tracking. The "sketch with fingers in the air" claim should be backed by camera hand-landmark inference when possible, with the existing fallback kept intact for recording and CI.

## Decision

Use MediaPipe Hand Landmarker through the `@mediapipe/tasks-vision` package. Do not use the older global MediaPipe Hands script or make MediaPipe visible as a primary creator-facing provider choice.

Official reference: https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js

## Implementation Shape

- Add the dependency only when implementing the slice.
- Keep all MediaPipe code client-only and lazy-load it after the creator enables air brush.
- Keep the existing camera preview and pointer fallback available if permission, model load, WASM, or inference fails.
- Add a pure helper such as `lib/canvas/handLandmarks.ts` that maps MediaPipe landmarks into the existing `AirBrushPoint` shape.
- Start with index-finger tip landmark 8 as the drawing point.
- Use confidence and hand-presence thresholds before emitting points.
- Add smoothing and a small dead zone so the stroke does not jitter.
- Avoid blocking the initial workspace load. If frame inference causes UI jank, throttle `detectForVideo` or move it to a worker.

## Red / Green

Red first:

- Unit test: a mocked 21-point hand landmark result maps landmark 8 to the expected normalized canvas point.
- Unit test: missing/low-confidence hand results emit no drawing point and keep fallback mode.
- Unit test: smoothing/dead-zone keeps tiny landmark jitter from creating noisy strokes.
- Component test: air brush can render with a mocked MediaPipe loader and show camera-landmark mode without real camera inference.
- E2E smoke: fake camera flags do not break the air-brush preview/fallback path.

Green:

- `npm test`
- `npm run typecheck`
- `PORT=3107 npx playwright test tests/e2e/voice-sketch.spec.ts tests/e2e/motion-artifact.spec.ts`

## Acceptance

- No webcam or MediaPipe model is required for CI.
- With a real camera and adequate light, moving the index finger draws on the canvas.
- If MediaPipe fails, the creator can still draw with pointer/touch/mouse while the air-brush preview remains visible.
- Voice brush color and thickness changes affect MediaPipe-origin strokes and fallback strokes through the same sketch path.
- The primary UI still reads as creator-facing air brush, not a model/provider settings panel.

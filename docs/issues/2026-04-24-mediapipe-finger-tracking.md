# MediaPipe Finger Tracking

Date: 2026-04-24
Status: open
Owner: next demo agent

## Problem

The air-brush demo currently shows a webcam preview and supports pointer/touch/mouse drawing while the preview is visible. That is demo-safe, but it is not true finger tracking. The "sketch with fingers in the air" claim should be backed by camera hand-landmark inference when possible, with the existing fallback kept intact for recording and CI.

The refined demo target is blind signature capture: the creator closes their eyes, writes `陈恩娇` in the air, and the screen recording visibly follows the name correctly live. The live trace is the artifact that becomes a visual reference; post-capture cleanup may improve it, but must not be what makes the demo look correct.

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
- Add a short preflight calibration for drawing hand, virtual writing plane, origin, neutral jitter, pinch thresholds, palm span, and typical stroke speed.
- Add a stroke state machine with `hover`, `armed`, `pendingStroke`, `painting`, `betweenStrokes`, and `handoff` states.
- Keep hover/preview separate from committed tldraw pointer events.
- Use `pendingStroke` so tiny pinch/tremor movements do not dispatch real `pointer_down` dots.
- Stabilize drift so the full `陈恩娇` trace stays in frame during closed-eyes writing.
- Disable or gate open-palm completion by default; voice owns done/send-this.
- Avoid blocking the initial workspace load. If frame inference causes UI jank, throttle `detectForVideo` or move it to a worker.

## Red / Green

Red first:

- Unit test: a mocked 21-point hand landmark result maps landmark 8 to the expected normalized canvas point.
- Unit test: missing/low-confidence hand results emit no drawing point and keep fallback mode.
- Unit test: smoothing/dead-zone keeps tiny landmark jitter from creating noisy strokes.
- Unit test: micro-pinch below calibrated duration/distance does not dispatch `pointer_down`.
- Unit test: real movement after calibrated intent threshold dispatches exactly one stroke start.
- Unit test: open palm does not call `onEndAirBrush` unless an explicit feature flag enables it.
- Component test: air brush can render with a mocked MediaPipe loader and show camera-landmark mode without real camera inference.
- E2E smoke: fake camera flags do not break the air-brush preview/fallback path.
- E2E synthetic trace: blind signature mode keeps a multi-stroke name trace in frame and commits it as a composer reference on voice done.

Green:

- `npm test`
- `npm run typecheck`
- `PORT=3107 npx playwright test tests/e2e/voice-sketch.spec.ts tests/e2e/motion-artifact.spec.ts`

## Acceptance

- No webcam or MediaPipe model is required for CI.
- With a real camera and adequate light, moving the index finger draws on the canvas.
- Human validation: with a real camera and adequate light, the creator can close their eyes and write `陈恩娇`; the screen recording visibly follows the name live without relying on delayed cleanup.
- If MediaPipe fails, the creator can still draw with pointer/touch/mouse while the air-brush preview remains visible.
- Voice brush color and thickness changes affect MediaPipe-origin strokes and fallback strokes through the same sketch path.
- The primary UI still reads as creator-facing air brush, not a model/provider settings panel.

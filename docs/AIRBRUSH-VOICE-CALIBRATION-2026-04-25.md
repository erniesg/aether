# Airbrush + Voice Calibration Recommendations

Date: 2026-04-25
Worktree: `/Users/erniesg/code/erniesg/aether-airbrush-voice-calibration`
Branch: `feat/airbrush-voice-calibration`

## Core Recommendation

Treat airbrush as a calibrated interaction state machine, not as direct MediaPipe landmark-to-tldraw pointer dispatch.

The current implementation is close enough to prove the concept, but the problems the creator is feeling are systemic:

- start intent is inferred too early from raw pinch frames;
- tiny pinch/start movements can still become real tldraw strokes;
- stroke completion and tool handoff are mixed with an unreliable open-palm gesture;
- calibration is global constants, not user/session-specific;
- voice is the intended handoff channel, but the Gemini Live path has been unproven in real use.

## Current Implementation Review

Relevant files:

- `lib/canvas/airBrush.ts`
- `components/canvas/AirBrushOverlay.tsx`
- `components/canvas/CanvasSubstrate.tsx`
- `components/canvas/VoiceOrb.tsx`
- `lib/voice/gemini-live-client.ts`
- `app/api/voice/session/route.ts`
- `docs/HANDOFF-VOICE-REALTIME-2026-04-24.md`

### Airbrush

`lib/canvas/airBrush.ts` uses fixed constants for confidence, smoothing, dead zone, hand span, index extension, and pinch ratio. It has useful gates, including pinch hysteresis, but these are global defaults. They cannot adapt to a creator's hand size, camera distance, neutral tremor, stroke speed, handedness, or preferred writing posture.

`components/canvas/AirBrushOverlay.tsx` debounces pen-down by two accepted pinch frames. This reduces first-frame pinch jitter, but it still emits a real `start` as soon as the second accepted frame arrives. There is no pending-stroke phase with minimum length/duration, so a short accidental pinch can still become a dot.

The overlay also still has the open-palm "done" gesture. The handoff doc says the creator explicitly wanted voice to own `end_air_brush` because gesture-based ending was unreliable between strokes. Open palm should be disabled by default or gated behind a debug/experimental flag.

The draw/erase mapping is hardcoded as right hand draws, left hand erases. That is useful for a demo but brittle for real calibration; drawing and erase hand should be session choices.

`components/canvas/CanvasSubstrate.tsx` correctly awaits `captureSketchAsReference()` in `finishAirBrushAndCapture`, and voice dispatch points to that helper. This is the right handoff path: `end_air_brush` should finish capture before `run_generate` fires.

### Voice

The voice tool dispatcher path is structurally correct: `VoiceOrb` receives a function call, dispatches it, captions the result, and sends the tool result back to the provider.

The problematic area is the Gemini Live runtime path. The handoff doc records that Gemini reached `voice · listening` but did not produce visible user transcripts, assistant transcripts, or tool calls in practice.

As of current Gemini docs, `gemini-3.1-flash-live-preview` is a valid current Live model with function calling support. The route currently maps `gemini-3.1-flash-live-preview` down to the 2.5 default through `STALE_GEMINI_LIVE_MODEL_ALIASES`, which is now suspect and should be removed or inverted after a live test.

The current Gemini config uses 16kHz PCM input and 24kHz output expectations, which matches current Live API docs. Its VAD config mirrors Google's example, but if the observed symptom remains "outgoing audio, no transcript/tool call", the next step should be raw Live event logging plus a manual VAD A/B test.

## Research Takeaways

External findings that matter for this product:

- MediaPipe Hand Landmarker gives normalized 21-point hand landmarks and handedness, with configurable detection/presence/tracking confidence. It is a pose stream, not a direct drawing device.
- Air-writing research repeatedly calls out that mid-air writing differs from paper writing because pen lifts are less obvious, tactile/visual feedback is missing, and users lose spatial orientation.
- Webcam-based air-writing work with MediaPipe usually preprocesses: smoothing, normalization, stroke/sequence formation, and often single-stroke simplification.
- Interactive input filtering has a known jitter/lag tradeoff. A fixed smoothing factor is the wrong shape for air drawing; velocity-adaptive smoothing such as the One Euro filter is a better fit.
- Mid-air interaction studies show users misread feedback boundaries and move too quickly/out of tracking range; slower guided calibration and explicit state feedback improve control.

Sources:

- Gemini Live overview: https://ai.google.dev/gemini-api/docs/live-api
- Gemini 3.1 Flash Live Preview model page: https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-live-preview
- Gemini Live tool use: https://ai.google.dev/gemini-api/docs/live-api/tools
- Gemini Live capabilities / VAD: https://ai.google.dev/gemini-api/docs/live-guide
- MediaPipe Hand Landmarker web guide: https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js
- Camera-based air-writing with MediaPipe: https://www.mdpi.com/2079-9292/12/4/995
- Air-writing recognition / interpolation: https://www.mdpi.com/1424-8220/21/24/8407
- One Euro filter paper: https://direction.bordeaux.inria.fr/~roussel/publications/2012-CHI-one-euro-filter.pdf
- Mid-air haptic interaction user feedback: https://www.mdpi.com/2076-3417/9/23/5123

## Proposed Interaction Model

Use these states:

1. `setup`
2. `calibrating`
3. `hover`
4. `armed`
5. `pendingStroke`
6. `painting`
7. `betweenStrokes`
8. `handoff`
9. `committed`

Only `painting` should dispatch real tldraw pointer events. Everything before that should render a creator-facing cursor/ghost preview, not alter the canvas.

### Pending Stroke Rule

When pinch closes:

- capture a pre-roll buffer of the last 150-250ms hover points;
- enter `pendingStroke`, not `painting`;
- promote to `painting` only after pinch is stable for roughly 100-150ms and either distance or velocity crosses calibrated intent threshold;
- if pinch opens before threshold and total distance/duration is below minimum, discard it as jitter;
- allow intentional dots only through a stronger signal: voice "dot", longer dwell, or explicit dot mode.

This directly targets the unwanted dot problem.

### Filtering

Replace fixed smoothing with velocity-adaptive smoothing:

- stronger smoothing during hover/slow motion;
- lighter smoothing during fast stroke motion;
- preserve raw timestamps for resampling;
- simplify/fit a stroke before commit if needed.

The implementation can start with a small One Euro filter for x/y and a calibrated dead zone.

### Handoff

Voice should own "done / send this / generate from this".

Open palm should not end the session by default. It conflicts with natural between-stroke resets, especially for Chinese characters.

## Blind Signature Mode For `陈恩娇`

The target demo is live blind capture: the creator closes their eyes, writes the whole name `陈恩娇` in the air, says "done", and the screen recording visibly follows the name correctly as it is being written. The live trace is the artifact. Post-capture cleanup can improve the reference, but it must not be the thing that makes the demo look correct.

This means calibration is not a separate visible writing lesson. It is a short preflight that makes live tracking reliable:

1. Choose and lock the drawing hand.
2. Define a stable virtual writing plane and origin from a comfortable hand position.
3. Capture neutral hover jitter, palm span, pinch thresholds, and typical stroke speed.
4. Arm blind signature mode by voice: "start my name".
5. During the closed-eyes pass, render live ink immediately but keep each new stroke in `pendingStroke` until it crosses calibrated intent.
6. On voice "done", commit the full live trace as the reference and attach provenance.

Blind signature mode must optimize for live screen legibility:

- no visible guide boxes during the public capture;
- no delayed reveal that hides tracking failures;
- no open-palm ending gesture;
- no accidental dots from tiny pinch or hand tremor;
- preserve pen lifts well enough for Chinese character structure;
- keep the name in frame by stabilizing drift against the calibrated writing plane.

Internally, it is still useful to segment by character and stroke after capture, but that segmentation is for reference packaging, undo, and provenance. It should not be required for the screen recording to look like the creator wrote `陈恩娇` live.

## Implementation Plan

Recommended order:

1. Gate or remove open-palm end gesture.
2. Add `AirBrushCalibrationProfile` and derive thresholds from calibration samples.
3. Add an `airBrushStrokeMachine` that owns hover/armed/pending/painting/end.
4. Move tldraw dispatch behind committed state-machine events.
5. Add `陈恩娇` blind signature mode with preflight calibration and live trace stabilization.
6. Fix Gemini Live model handling and add raw event diagnostics for `?voice-debug=1`.
7. Add live/contract tests for `end_air_brush` followed by `run_generate`.

### Full Slice Path

Ship this as two tightly coordinated tracks that meet at the existing canvas/composer handoff:

1. Voice realtime correctness
   - Remove stale Gemini Live model remapping for `gemini-3.1-flash-live-preview`.
   - Keep OpenAI Realtime and Gemini Live behind the same `VoiceProvider` contract.
   - Add raw `?voice-debug=1` event capture for setup, outgoing audio, VAD/activity, transcripts, tool calls, tool results, close/error.
   - Update Gemini message handling for current server event shapes, including multiple parts in a single server content event.
   - Verify transcript display, greeting/readiness, `end_air_brush`, and `run_generate` against a real Gemini session.

2. Voice tool-call sequencing
   - Keep the existing tool list bounded for the demo.
   - Require `end_air_brush` to await capture before returning success.
   - Verify the model can call `end_air_brush` and then `run_generate` in the same spoken flow.
   - Keep status visible in the composer line during capture and generation.

3. Airbrush state-machine foundation
   - Disable open-palm completion by default.
   - Split raw landmark evaluation from stroke state.
   - Introduce `pendingStroke` so micro-pinches do not create real tldraw dots.
   - Add velocity-adaptive filtering and calibrated dead-zone handling.
   - Keep pointer fallback running through the same state machine.

4. Blind signature mode
   - Add a short preflight that locks hand, virtual writing plane, origin, jitter, pinch, and speed.
   - Arm capture by voice: "start my name".
   - Render live ink during closed-eyes writing; do not rely on delayed cleanup.
   - Stabilize drift so the full `陈恩娇` trace stays in frame.
   - Commit the full live trace as a reference when voice says "done".

5. Reference/provenance handoff
   - Capture the blind signature as a first-class reference through the existing composer path.
   - Store provenance for calibration profile, raw/filtered stroke events, capture bounds, voice `end_air_brush`, and subsequent `run_generate`.
   - Keep debug/provenance disclosed; primary UI remains creator-facing.

6. Demo validation
   - Record the actual closed-eyes pass and inspect the screen capture.
   - Acceptance is visual: the live trace must plausibly read as `陈恩娇` without post-hoc reveal.
   - Fallback is pointer/touch only if camera/MediaPipe fails, not if calibration is merely poor.

## Issue Mapping

Existing GitHub issues are close but should be updated before assigning agent work:

- `#45 Webcam finger sketching — hand-tracked ink capture into canvas`
  - Update acceptance from generic "Chinese name legibly" to live closed-eyes `陈恩娇` tracking.
  - Add `pendingStroke`, calibrated writing plane, drift stabilization, and no open-palm completion.
  - Keep it focused on airbrush interaction quality.
- `#46 Voice-first multimodal scene workflow orchestration for the demo arc`
  - Add realtime voice correctness as a blocker: transcript, greeting/readiness, visible tool result, and sequential `end_air_brush` -> `run_generate`.
  - Add Gemini Live model/event handling and `?voice-debug=1` diagnostics.
  - Keep provider-agnostic wording so OpenAI Realtime remains valid.
- `#37 Use canvas drawings as generation references`
  - Reference only if the blind signature commit path changes the composer reference contract.
- `#36 Voice-controlled brush and tool styling`
  - Reference only for brush color/size continuity; do not expand it into the realtime/tool-call repair.

Recommendation: do not open a new umbrella unless you want a single demo-tracking issue. The cleanest issue update is to comment on `#45` and `#46` with this refined acceptance, then keep implementation PRs linked to those two issues.

## Test Plan

Add red/green tests for:

- micro-pinch below min duration/distance does not dispatch `pointer_down`;
- real movement after calibrated intent threshold dispatches one stroke;
- intentional dots require dwell or voice dot command;
- open palm does not call `onEndAirBrush` unless a flag enables it;
- calibration profile changes pinch/dead-zone/smoothing thresholds;
- `end_air_brush` awaits capture before `run_generate`;
- Gemini Live message handler processes multiple server content parts in one event.

Baseline verification run on the same commit in the original checkout:

```text
./node_modules/.bin/vitest run \
  tests/unit/air-brush.test.ts \
  tests/component/air-brush-overlay.test.tsx \
  tests/unit/gemini-live-client.test.ts \
  tests/unit/api-voice-session.test.ts \
  tests/unit/voice-tools.test.ts \
  tests/component/voice-orb.test.tsx \
  tests/component/voice-orb-provider-selection.test.tsx
```

Result: 7 files passed, 62 tests passed.

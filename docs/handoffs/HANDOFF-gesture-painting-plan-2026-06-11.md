# HANDOFF — Gesture-controlled painting: recovery plan + next slice (2026-06-11)

Branch: `claude/gesture-painting-plan` · PR target: `feat/social-canvas-buildout`

## Current state

The mainline (`main`, `feat/social-canvas-buildout`, this branch) contains **none of the
gesture-painting stack**. The canvas surface today is `components/canvas/TldrawCanvas.tsx` +
`CanvasSubstrate.tsx` with the floating toolbar, segmentation overlays, voice orb
(`lib/voice/*`, OpenAI Realtime + Gemini Live adapters), and the eyes-closed sketch capture
(`components/canvas/EyesClosedHandle.tsx`, `lib/canvas/sketchSnapshot.ts`).

All hand-tracked painting work lives **unmerged** on `origin/feat/airbrush-voice-calibration`
(head `9f4e69c`, 2026-04-25):

- `lib/canvas/airBrush.ts` — pure landmark-frame → brush-point evaluator (pinch gate with
  hysteresis, index-extension gate, open-palm "done" detector, pointer fallback, rejection
  reasons + metrics for diagnostics).
- `lib/canvas/airBrushStrokeMachine.ts` — pure stroke state machine
  (`hover → armed → pendingStroke → painting → betweenStrokes → handoff`) with pen-down
  debounce, dead-zone filtering, and velocity-adaptive smoothing.
- `lib/canvas/airBrushCalibration.ts` — jitter-sample → calibration profile (dead zone,
  min stroke distance/duration, gain, bounds) + point stabilizer.
- `components/canvas/AirBrushOverlay.tsx`, `lib/canvas/mediaPipeHandLandmarker.ts` — the
  impure webcam/MediaPipe/UI layer.
- Tests: `tests/unit/air-brush.test.ts`, `air-brush-calibration.test.ts`,
  `air-brush-lasso-erase.test.ts`; e2e specs for air-brush + voice.

That branch is based on an April snapshot and has diverged massively from current mainline
(~735 changed files vs `main`), so a branch merge is not viable.

## Historical evidence

- **Issue #45 (OPEN)** — webcam finger sketching: fingertip path → smoothed stroke events →
  canvas sketch artifact. Defines the red/green acceptance for a pure `fingerSketch`
  interpreter.
- **Issue #27 (OPEN)** — pointer/touch gesture shortcuts on the canvas (pinch/swipe/long-press);
  distinct from webcam hand tracking.
- **Issues #36, #46, #107, #128 (CLOSED)** — voice-controlled brush styling, voice workflow
  orchestration, sketch→semantic-component planning, eyes-closed capture. The eyes-closed lane
  shipped; the webcam airbrush lane did not merge.
- **`docs/AIRBRUSH-VOICE-CALIBRATION-2026-04-25.md`** (on the branch) — the key handoff. It
  prescribes exactly the pending-stroke state machine with hysteresis and velocity-adaptive
  smoothing, and records the observed failure modes.
- **Commit trail** (Apr 24–25): `7d5618a` live finger painting → `7343b45` pinch-to-draw +
  voice end → `9351365` open-palm done + pen-down debounce → `3655b50` arm open-palm only
  after first stroke → `f025fe6` "Stabilize pinch-gated airbrush" → `9f4e69c` final handoff.
  The churn (including an applied-then-reverted-then-reapplied fix, `5ad5557`/`ae37a43`)
  shows the team iterating on *reliability*, not features.

## Root-cause hypotheses (why it was hard)

1. **Accidental dots on pinch warm-up.** Treating the first pinched frame as pen-down commits
   ink before the gesture is confirmed. Fix prescribed and implemented: a `pendingStroke`
   state that only promotes after minimum distance *or* duration+partial-distance.
2. **Open-palm "done" conflicts with natural between-stroke poses.** Relaxing the hand
   between strokes looks like an open palm; single-frame detection fired `end_air_brush`
   spuriously. Mitigations on the branch: pinch-rejection inside `detectOpenPalm`, arming the
   gesture only after the first stroke, caller-side debounce, voice as primary end signal.
3. **Fixed global calibration constants.** Hand size, camera distance, and tremor vary per
   session; constants tuned for one setup fail in another. `airBrushCalibration.ts` derives
   per-session thresholds from observed jitter samples.
4. **Process: the whole stack (camera + MediaPipe + voice + UI + state machine) was developed
   on one branch.** The deterministic core was never landed on mainline independently, so when
   the branch went stale the entire investment was stranded.

## Selected next slice

**Port the deterministic gesture-to-brush intent core to mainline, with tests.** Three pure
modules, verbatim from `origin/feat/airbrush-voice-calibration`, no UI / webcam / MediaPipe /
voice runtime:

- `lib/canvas/airBrush.ts`
- `lib/canvas/airBrushStrokeMachine.ts`
- `lib/canvas/airBrushCalibration.ts`

Plus tests (colocated, matching current `lib/canvas/*.test.ts` convention):

- `lib/canvas/airBrush.test.ts` — ported from the branch's `tests/unit/air-brush.test.ts`.
- `lib/canvas/airBrushCalibration.test.ts` — ported from `air-brush-calibration.test.ts`.
- `lib/canvas/airBrushStrokeMachine.test.ts` — **new** dedicated characterization suite. The
  branch had only two stroke-machine cases; the documented failure modes (warm-up dots,
  pending-stroke cancellation, intent switch mid-stroke, dead-zone jitter, velocity-adaptive
  smoothing, calibration-driven reconfiguration) get explicit coverage here.

Why this slice: it is the smallest high-confidence step toward reliable gesture painting —
it un-strands proven, pure, reviewable code; it locks in the reliability semantics with
characterization tests so future UI/MediaPipe work has a stable contract; and it carries zero
runtime/product risk (nothing imports these modules yet).

## Tests / evidence plan

- `npx vitest run lib/canvas` (focused) and the three new files individually.
- `npm run typecheck`.
- `git diff --check`.
- Evidence in `docs/handoffs/gesture-painting-evidence-2026-06-11/notes.md` (commands +
  results). No UI is touched, so no screenshots.

## Follow-up slices (not in this PR)

1. Port `airBrushLassoErase.ts` + test (erase intent geometry).
2. Re-introduce the impure layer against the now-stable core: `mediaPipeHandLandmarker.ts`,
   then `AirBrushOverlay.tsx` wired into `CanvasSubstrate` behind a toolbar entry, recording
   typed provenance per CLAUDE.md rule 8.
3. Issue #27's pointer-gesture interpreter (`lib/canvas/gestures.ts`) as an independent pure
   module.
4. Session calibration UX (capture jitter samples → `createAirBrushCalibrationProfile`) and
   voice-primary end signal per the calibration handoff.

## Caveats

- The ported code is the branch's final (`9f4e69c`) iteration — already its most stable — but
  it has only been validated against April's demo setup; real-webcam validation of thresholds
  remains a human gate before any UI slice ships.
- `airBrush.ts` includes debug-snapshot helpers (`recordAirBrushDebugEvent`,
  `window.__AETHER_AIR_BRUSH_DEBUG__`) that are window-guarded and import-safe in Node; they
  are kept verbatim to avoid divergence from the branch.
- Nothing on mainline imports these modules yet; that is intentional for this slice.

# Evidence — gesture-painting deterministic core port (2026-06-11)

Branch: `claude/gesture-painting-plan` · Plan: `docs/handoffs/HANDOFF-gesture-painting-plan-2026-06-11.md`

## What changed

Ported verbatim from `origin/feat/airbrush-voice-calibration` (head `9f4e69c`):

- `lib/canvas/airBrush.ts` (707 lines) — pure landmark→brush-point evaluator
- `lib/canvas/airBrushStrokeMachine.ts` (279 lines) — pure stroke state machine
- `lib/canvas/airBrushCalibration.ts` (109 lines) — calibration profile + stabilizer
- `lib/canvas/airBrush.test.ts` — ported from the branch's `tests/unit/air-brush.test.ts`
  (relocated to the colocated `lib/canvas/*.test.ts` convention used on this branch)
- `lib/canvas/airBrushCalibration.test.ts` — ported from `tests/unit/air-brush-calibration.test.ts`

New code written for this slice:

- `lib/canvas/airBrushStrokeMachine.test.ts` — 13 new characterization tests for the
  documented failure modes: warm-up pinch dots, duration-only holds, distance vs
  duration+partial-distance promotion, single end event, dead-zone jitter,
  velocity-adaptive smoothing, mid-stroke intent flip, hover re-arm, reset/handoff,
  runtime reconfiguration.

No UI, no MediaPipe runtime, no voice wiring. Nothing on this branch imports these
modules yet — intentional; the next slice wires the impure layer against this contract.

## Verification

All run on the VM in `/home/ubuntu/code/erniesg/aether-gesture-painting`, 2026-06-11.

```
$ npx vitest run lib/canvas/airBrush.test.ts lib/canvas/airBrushStrokeMachine.test.ts lib/canvas/airBrushCalibration.test.ts
 Test Files  3 passed (3)
      Tests  36 passed (36)

$ npx vitest run lib/canvas
 Test Files  14 passed (14)
      Tests  122 passed (122)

$ npm run typecheck
> tsc --noEmit
(clean — exit 0)

$ git diff --check
(clean — exit 0)
```

No screenshots: no UI surface is touched by this slice.

## Caveats

- Thresholds in the ported modules were tuned against the April 2026 demo setup;
  real-webcam human validation remains the gate before any UI slice ships.
- `npm install` produced unrelated `package-lock.json` churn (npm-version `libc`
  field differences); reverted, not committed.

# Handoff: Blind Signature Airbrush + Realtime Voice Tool Calls

Date: 2026-04-25
Branch: `feat/airbrush-voice-calibration`
Worktree: `/Users/erniesg/code/erniesg/aether-airbrush-voice-calibration`

## Goal

Make the demo path work end to end:

1. Creator says a natural phrase like "aether draw", "start my name", or "let me write my name".
2. Voice mode triggers the right canvas tool call without requiring an exact incantation.
3. Creator closes their eyes and writes `陈恩娇` in the air.
4. The screen capture visibly follows the name correctly live, not after a delayed cleanup.
5. Creator says a natural phrase like "done", "aether stop", "send this", or "use that".
6. Voice calls `end_air_brush`, waits for the sketch to become a composer reference, then calls `run_generate` when the creator asks to create from it.

This is a creator-facing canvas interaction, not an operator/debug surface. Keep raw provider events, ids, and diagnostics in `?voice-debug=1`.

## Product Contract

Natural language drives bounded function calls. The creator should not need to remember exact phrases.

Intent examples:

- Start capture: "aether draw", "start my name", "let me write my name", "I'm going to write my Chinese name".
- Stop capture: "done", "aether stop", "send this", "that's it", "use this".
- Generate from capture: "make something from that", "generate from my name", "turn that into a key visual", "introduce me as an AI engineer based in Singapore".

Implementation consequence: add a bounded start tool if one does not exist. The current tool list has `end_air_brush` and `run_generate`, but there is no symmetric voice tool that reliably enters airbrush / blind signature capture. Recommended tool:

```ts
start_air_brush({
  mode?: 'standard' | 'blind_signature',
  targetText?: string
})
```

For this demo, map the name intent to:

```json
{ "mode": "blind_signature", "targetText": "陈恩娇" }
```

Keep `end_air_brush` as the stop/commit tool. Do not use open palm as the primary end signal.

## Existing Context

Read these first:

- `AGENTS.md`
- `docs/AIRBRUSH-VOICE-CALIBRATION-2026-04-25.md`
- `docs/HANDOFF-VOICE-REALTIME-2026-04-24.md`
- GitHub issue #45: Webcam finger sketching
- GitHub issue #46: Voice-first multimodal scene workflow

Relevant files:

- `lib/canvas/airBrush.ts`
- `components/canvas/AirBrushOverlay.tsx`
- `components/canvas/CanvasSubstrate.tsx`
- `components/canvas/VoiceOrb.tsx`
- `lib/voice/tools.ts`
- `lib/voice/gemini-live-client.ts`
- `lib/voice/realtime-client.ts`
- `app/api/voice/session/route.ts`
- `components/composer/ComposerStatus.tsx`

## Current Problems

Airbrush:

- Global constants cannot adapt to the creator's camera setup, hand, tremor, speed, or closed-eyes writing plane.
- Two-frame pinch warmup still allows accidental dots because a real pointer down is emitted too early.
- Open-palm done is still live in code, but it conflicts with natural between-stroke resets.
- Right hand draw / left hand erase is hardcoded.
- The live screen trace must be correct during the blind writing, not merely cleaned after capture.

Voice:

- The dispatch path is structurally right, but Gemini Live has been observed reaching `voice · listening` without transcript or tool calls.
- `app/api/voice/session/route.ts` currently maps `gemini-3.1-flash-live-preview` down to a 2.5 model alias. Current Gemini docs list 3.1 Flash Live Preview as a valid current Live model with function calling.
- `end_air_brush` awaits capture correctly in `CanvasSubstrate`, but there is no voice start tool for airbrush capture.

## Implementation Path

### Slice 1: Realtime Voice Correctness

Red tests first:

- Gemini session route preserves `gemini-3.1-flash-live-preview` instead of remapping it down.
- Gemini Live client handles setup, input transcript, output transcript, audio, tool calls, and multiple server content parts.
- Voice orb captions transcript and function result.
- Tool dispatch sends tool results back to the provider.

Implementation:

- Remove stale 3.1 -> 2.5 remap.
- Keep OpenAI Realtime and Gemini Live provider-agnostic behind `VoiceProvider`.
- Expand `?voice-debug=1` logging for raw incoming Live events, outgoing audio chunk mime/size, VAD/activity, close/error.
- Verify real session manually with Gemini and OpenAI if credentials are available.

Acceptance:

- Click voice, receive visible ready/greeting state.
- Speak any sentence, see `you: ...` within about 1s after finishing.
- Say "done" while airbrush is active; see `end_air_brush` result in the composer status line.
- Say a generation request; `run_generate` fires with the exact spoken prompt.

### Slice 2: Natural-Language Tool Map

Red tests first:

- "aether draw" / "start my name" emits `start_air_brush`.
- "done" / "send this" emits `end_air_brush`.
- "make something from that" after capture emits `run_generate`.
- `end_air_brush` resolves before `run_generate` when both are triggered in one spoken turn.

Implementation:

- Add `start_air_brush` to `VOICE_TOOL_DEFINITIONS`.
- Add a CanvasSubstrate dispatcher that activates airbrush and sets mode metadata.
- Keep the public UI copy creator-facing: air brush / blind signature / voice ready.
- Do not expose provider or raw tool payloads outside debug/provenance.

Acceptance:

- The creator can say "aether draw" to enter blind signature capture.
- The model can use different natural phrases and still call the same bounded tools.

### Slice 3: Airbrush State Machine

Red tests first:

- Micro-pinch below calibrated duration/distance does not dispatch `pointer_down`.
- Real movement after intent threshold dispatches exactly one stroke start.
- Open palm does not call `onEndAirBrush` by default.
- Pointer fallback and MediaPipe both use the same state-machine behavior.

Implementation:

- Introduce an `AirBrushStrokeMachine` with states: `hover`, `armed`, `pendingStroke`, `painting`, `betweenStrokes`, `handoff`.
- Keep hover/preview separate from committed tldraw pointer events.
- Add pre-roll buffer for 150-250ms of hover points.
- Promote `pendingStroke` to `painting` only after stable pinch plus calibrated movement/velocity threshold.
- Replace fixed smoothing with velocity-adaptive filtering.

Acceptance:

- No dots from tiny thumb/index tremor.
- The first visible stroke begins where the creator intended, not at pinch jitter.

### Slice 4: Blind Signature Mode

Red tests first:

- Calibration profile stores drawing hand, writing plane, origin, neutral jitter, pinch thresholds, and speed.
- Blind signature mode keeps the live trace in frame using the calibrated plane.
- Voice "done" commits the live trace as a composer reference with provenance.

Implementation:

- Add a short preflight inside the same canvas shell. It should feel like arming the canvas, not a settings screen.
- Lock the writing plane and origin before eyes-closed capture.
- During the closed-eyes pass, draw live ink immediately but keep new stroke starts pending until intent is clear.
- Do not show guide boxes in the public demo capture.
- On `end_air_brush`, commit the full trace through the existing composer reference path.

Acceptance:

- Human validation: with real camera/lighting, close eyes and write `陈恩娇`; the screen recording visibly follows the name live.
- Post-capture cleanup may improve the reference, but the demo cannot depend on delayed reveal.

## Test Commands

Use the dependency-installed checkout or install deps in this worktree.

```bash
./node_modules/.bin/vitest run \
  tests/unit/air-brush.test.ts \
  tests/component/air-brush-overlay.test.tsx \
  tests/unit/gemini-live-client.test.ts \
  tests/unit/api-voice-session.test.ts \
  tests/unit/voice-tools.test.ts \
  tests/component/voice-orb.test.tsx \
  tests/component/voice-orb-provider-selection.test.tsx
```

Add focused Playwright coverage after the state machine and start tool exist.

## GitHub Issues

Update or work against:

- #45 for blind signature / airbrush tracking.
- #46 for realtime voice / tool-call orchestration.

Do not spread this into a generic dashboard or pipeline surface. The work belongs in the existing synthesis-shell canvas.

# Handoff: Fix real-time voice for aether (Gemini Live)

Date: 2026-04-24 SGT
Repo: `/Users/erniesg/code/erniesg/aether`
Branch: `main`, local WIP only — do not push.
Current tip: `5ad5557` (revert of a broken 16kHz/two-hand-gesture change).

## What's working and what is not

Working:
- MediaPipe air brush drawing with thumb+index **pinch** to start/end a stroke (`lib/canvas/airBrush.ts`, `components/canvas/AirBrushOverlay.tsx`).
- Voice tool list (`lib/voice/tools.ts`) now includes `end_air_brush`. Dispatcher in `components/canvas/CanvasSubstrate.tsx` (`finishAirBrushAndCapture`) awaits `captureSketchAsReference` then toggles air brush off. This is the path a working voice session should hit when the creator says "I'm done".
- Voice caption strip always visible (`components/composer/ComposerStatus.tsx`, `renderVoiceLine`). When the voice session is active the strip should show transcripts and tool-call results even during a generation run.
- `voice · listening` state transitions visibly in the UI.

Broken / unproven:
- **Gemini Live real-time voice does not produce any user transcript in practice.** The strip reaches `voice · listening` but never shows `you: ...` or `aether: ...`. The creator reports this reproducibly. No tool calls fire either.
- No greeting plays when the session connects. The creator expects an "I'm ready" audio cue.
- No reliable end-to-end path for "speak → transcript visible → tool call → result visible." Everything after `listening` is silent from the user's perspective.

A previous attempt (`ae37a43`) pinned the recorder's `AudioContext` to 16kHz on the theory that Gemini expects 16kHz PCM. It was reverted in `5ad5557` because it didn't fix the symptom and introduced unrelated regressions in drawing smoothness. Do not assume 16kHz is the right rate without reading the current Gemini Live docs and measuring.

## What the next agent should do

**Your goal: make Gemini Live real-time voice actually work end-to-end so the creator can speak a prompt, see their transcript, hear Aether respond, and have `end_air_brush` + `run_generate` chain fire.** Treat this as a product correctness problem, not a demo dressing problem. Do not hide failures behind pleasant-sounding UI.

Research first. Do not guess at audio formats, sample rates, VAD config, or tool-call wire formats from memory — consult the current `@google/genai/web` docs and the Gemini Live reference. Common things that trip this integration up:

- **Input audio format.** Gemini Live has a specific expected mime type and sample rate for `sendRealtimeInput({ audio })`. The current recorder sends `audio/pcm;rate=${context.sampleRate}` at whatever the default AudioContext produces. Verify what Gemini actually expects and whether resampling is required. Don't assume 16kHz unprompted — check the docs.
- **Activity detection.** Gemini Live's server-side VAD may need explicit `realtimeInputConfig.automaticActivityDetection` settings. If VAD never triggers the model never responds. Check whether the current config is correct or whether manual activity signals are required.
- **Transcription toggles.** The current setup already sends `inputAudioTranscription: {}` and `outputAudioTranscription: {}`. Confirm these are still the right shape for the current SDK version and that the model being used supports them.
- **Model name.** Check which Gemini Live model the `/api/voice/session` route returns. Not every `gemini-*` model supports Live. If the model doesn't support Live, setup "succeeds" silently but no events ever come back.
- **Session auth / credential freshness.** The session fetch is in `lib/voice/session-client.ts`. Confirm the ephemeral credential flow in `app/api/voice/session/route.ts` is returning a token that actually scopes to Live.
- **Silent onmessage drops.** `gemini-live-client.ts` `handleMessage` routes on specific message shapes. If the SDK emits messages the handler doesn't understand (e.g. audio blobs, turn metadata), they're dropped. Log every raw `onmessage` during diagnosis.

Then write a diagnostic path before changing behavior:

1. Add a dev-only `?voice-debug=1` mode that logs every incoming Gemini message and every outgoing chunk's size + mime type. Do not expose this in production UI. Use the same `window.__AETHER_VOICE_DEBUG__` pattern the air-brush overlay uses.
2. Open a fresh session with debug on and confirm what the server actually sends. That tells you whether the problem is:
   - Audio never reaching the server (nothing comes back).
   - Audio reaching but VAD silent (setup ACK only).
   - Transcripts arriving but the UI not rendering them.
3. Only then write the fix.

Acceptance criteria for this work:

- [ ] Creator clicks the voice orb. Within ~500ms Aether plays a short greeting ("I'm ready to create with you" or similar) so the creator knows the session is live without needing eyes on the strip.
- [ ] Creator speaks any sentence. Their own transcript appears in the `ComposerStatus` voice strip as `you: <sentence>` within ~1s of them finishing.
- [ ] When creator says "I'm done", Gemini calls `end_air_brush`. The strip shows `✓ end_air_brush · captured sketch as reference`. The air-brush chip closes. The composer gains a ref.
- [ ] When creator says "Introduce me as an AI engineer based in Singapore", Gemini calls `run_generate` with that exact prompt. The generation kicks off and the generation strip shows progress — the voice line stays visible the whole time.
- [ ] If Gemini drops the connection mid-session, the strip shows the error clearly; the orb returns to `idle`.

Out of scope for this pass:

- Do not reintroduce the open-palm "done" gesture. The creator has explicitly asked to rely on voice for that signal. Keep the gesture removed from `AirBrushOverlay` (it is still present in code but trivially disableable — gate it behind a flag or delete it cleanly).
- Do not change the MediaPipe pinch-to-draw logic.
- Do not extend the voice tool list. The current set (`focus_format`, `pan_zoom`, `remove_background`, `select_tool`, `set_brush_color`, `set_brush_size`, `adjust_brush_size`, `clear_sketch`, `confirm_sketch`, `end_air_brush`, `run_capability`, `run_generate`) is what the demo needs.

## Product rules that apply

From `CLAUDE.md` and `AGENTS.md`:

- Single synthesis-shell workspace. No provider-selection modal as primary surface.
- Restraint over labels. Don't fill the strip with prose when the system is fine.
- Creator-facing diagnostics, not an admin dashboard. `?voice-debug=1` is a dev tool, not a product surface.
- Provider-agnostic interfaces. Keep the fix inside `lib/voice/gemini-live-client.ts` and the session route. Don't leak Gemini specifics into `VoiceOrb` or `CanvasSubstrate` dispatchers.
- Red/green TDD. Write a failing test in `tests/unit/voice-*` or `tests/component/voice-orb.test.tsx` that captures the desired end-to-end contract before touching the client.

## Files you will almost certainly touch

- `lib/voice/gemini-live-client.ts` — recorder sample rate, message handling, optional greeting trigger on `setupComplete`.
- `lib/voice/session-client.ts` — model / credential flow.
- `app/api/voice/session/route.ts` — model selection, credential scoping.
- `components/canvas/VoiceOrb.tsx` — only if connect lifecycle needs adjusting.
- `components/composer/ComposerStatus.tsx` — only if the transcript rendering needs to distinguish partial from final.
- `tests/unit/voice-*.ts`, `tests/component/voice-orb*.tsx` — new end-to-end contract tests.

Files you should **not** touch in this pass:

- `lib/canvas/airBrush.ts` and `components/canvas/AirBrushOverlay.tsx` — leave air-brush logic alone. Draw smoothness regressed the last time these were edited under voice changes.
- `components/canvas/CanvasSubstrate.tsx` — the `finishAirBrushAndCapture` helper is correct. Don't reshape it.

## Commands

```bash
# dev
PORT=3003 npm run dev

# typecheck + tests
npx tsc --noEmit
npx vitest run tests/unit/voice-tools.test.ts tests/unit/voice-realtime-client.test.ts tests/unit/api-voice-session.test.ts tests/component/voice-orb.test.tsx tests/component/voice-orb-provider-selection.test.tsx

# e2e (uses a stub, still useful for smoke)
PORT=3107 npx playwright test tests/e2e/voice-sketch.spec.ts
```

Commit each meaningful step. Do not push. Do not amend published commits.

## Context dump

The hackathon demo arc is in `docs/DEMO-FINGER-VOICE.md`. The handoff that produced the current air-brush state is `docs/HANDOFF-FINGER-VOICE-DEMO-NEXT-2026-04-24.md`. Recent commit history (newest first):

```
5ad5557 Revert "fix(voice + air-brush): 16kHz mic for Gemini Live, two-hand done gesture"
ae37a43 fix(voice + air-brush): 16kHz mic for Gemini Live, two-hand done gesture  [reverted]
3655b50 fix(air-brush): arm open-palm only after first stroke, keep voice caption visible during runs
9351365 feat(air-brush): open-palm done gesture + pen-down debounce
7343b45 feat(air-brush): pinch-to-draw and voice-driven end_air_brush
7d5618a feat(air-brush): live finger painting with practical acceptance gate
```

The creator's direct framing of the problem:
- Voice doesn't greet when turned on.
- No transcript of what they said appears.
- Tool calls don't fire.
- They want to rely on voice for `end_air_brush` because gesture detection was unreliable between strokes.

Your job is to make that true.

# Handoff Prompt: Finger + Voice Demo Final Push

Date: 2026-04-24 SGT
Repo: `/Users/erniesg/code/erniesg/aether`
Goal: make the 3-minute "Build For What's Next" submission maximally demoable, resilient, and judge-legible.

## Prompt For The Next Agent

You are continuing the aether hackathon build. Work autonomously, but preserve the product contract in `AGENTS.md` and `CLAUDE.md`: aether is a creator-first canvas tool, not an operator dashboard. Keep the single synthesis shell, canvas substrate, bottom prompt composer, progressive controls, provider-agnostic AI, and typed provenance.

Read first:

1. `AGENTS.md`
2. `CLAUDE.md`
3. `docs/DEMO-FINGER-VOICE.md`
4. `docs/HANDOFF-FINGER-VOICE-DEMO-2026-04-24.md`
5. `docs/HANDOFF-FINGER-VOICE-DEMO-NEXT-2026-04-24.md`
6. `docs/progress/feat-finger-voice-foundation.md`
7. `docs/decisions/2026-04-24-capability-factory.md`
8. `docs/decisions/2026-04-23-video-text-mask-direction.md`
9. `git status --short --branch`

Do not print or commit secrets. `.dev.vars` currently has local Volcengine and Replicate credentials present, but values must stay private. If Cloudflare needs secrets, use `wrangler secret put --env staging ...` manually or document the missing secret without exposing values.

## Current Working State

Already implemented in this pass:

- Camera air-brush chip in the floating canvas toolbar.
- `getUserMedia` camera preview with pointer/touch/mouse fallback.
- MediaPipe Hand Landmarker is installed and lazily wired on the client after air brush is enabled. Landmark 8 maps to the normalized air-brush point path with smoothing, dead-zone filtering, and stroke end on hand loss.
- Air-brush helper tests cover normalized point math, fallback mode, MediaPipe landmark translation, jitter suppression, and stroke lifecycle.
- Air-brush capture adds the current camera frame into the existing bottom-composer reference path, so webcam capture can drive motion generation like pasted/dropped refs.
- Voice sketch controls already verified: select sketch, brush color, brush thickness, clear/confirm.
- `/api/video/generate` returning deterministic HyperFrames HTML compositions.
- Generated motion artifacts include a separate generated WAV audio track.
- Motion artifact preview appears inside the canvas shell, not a route/dashboard.
- Prompt `"Introduce me as an AI Engineer based in Singapore."` routes to video-gen.
- Composer references now feed motion generation:
  - text-mask uses first ref as image media
  - double-exposure uses first ref as subject and second ref as exposure
- Browser coverage now proves composer references reach `/api/video/generate`:
  - one image ref becomes text-mask `scene.media`
  - two image refs become double-exposure `scene.subject` and `scene.exposure`
- Browser coverage now proves air-brush capture reaches `/api/video/generate`:
  - captured camera frame becomes text-mask `scene.media`
- Staging deployed and remotely smoke-tested:
  - `https://aether-stg.berlayar.ai/workspace/demo-ws`
  - Cloudflare version `2683491a-0baf-4cfb-a1b6-ae471851aff9`

## Important Caveats

- MediaPipe finger tracking is wired, but the human validation gate is still open: record a 10-second local clip of index-finger drawing. If it is unstable, use pointer fallback with the camera preview visible.
- Volcengine and Replicate video providers are registered but still stubbed. The only working video provider is local `hyperframes`.
- Replicate hosts `bytedance/seedance-2.0`, and local `REPLICATE_API_TOKEN` appears configured, but a real Replicate video adapter still needs to be implemented behind the provider seam.
- Do not make Seedance, Veo, or any hosted model the hardcoded default. HyperFrames must stay the deterministic fallback.

## Research Notes For Winning

Public listings name these Built with Opus 4.7 judges: Boris Cherny, Cat Wu, Thariq Shihipar, Lydia Hallie, Ado Kukic, Jason Bigman from the Claude team. Treat this as public-copy context, not official ground truth unless confirmed on the Cerebral Valley page.

Patterns from Built with Opus 4.6 winner coverage:

- The strongest projects were domain-expert workflows, not generic demos.
- Winners showed a workflow that feels impossible or unnamed before the current tools.
- Opus use was specific and surprising: agent orchestration, governed skills, live direction, multimodal reasoning, and resilient fallbacks.
- One winning writeup emphasized that the fast loop should never wait on the slow AI loop. For aether: canvas interaction must stay instant; Opus plans, validates, fans out, and authors reusable capabilities asynchronously.

## Strategic Demo Thesis

Use this line as the spine:

> How might we design without vision? What if a creator could sketch a story with their fingers in the air, and aether turned that into video, key visuals, and every campaign format?

Tie it directly to "Build For What's Next":

> aether is not a faster menu. It is an interface from a few years out: intent in, embodied mark plus voice plus references, and Claude turns that into a reusable creative capability that fans out across formats.

Position Opus 4.7 as the creative operating layer:

- Interprets multimodal intent: voice, sketch, references, selected artboards.
- Chooses tools/workflows without exposing provider plumbing.
- Records typed provenance for every action.
- Turns a successful move into a pinned capability.
- Fans one key visual into platform-specific formats with scoped global/local edits.

## Demo Arc Target

3 minutes max.

1. Eyes closed / accessibility hook:
   - "How might we design without vision?"
   - Turn on air brush and voice.
2. Embodied mark:
   - Voice lines exactly:
     - "Sketch mode."
     - "Make the brush thicker."
     - "Change color to yellow."
     - "Write my name."
     - "Confirm sketch."
   - Use pointer fallback if hand tracking is not ready.
3. Key visual:
   - Double exposure of Ernie against Mount Everest.
   - Use reference/capture inputs, not a generic stock output.
4. Motion:
   - "Introduce me, Ernie, as an AI Engineer based in Singapore."
   - Show HTML motion artifact with sound/audio.
5. Fanout:
   - "Fan out to Instagram, X, LinkedIn, and TikTok."
   - Show linked artboards and safe zones.
6. Payoff:
   - Pin the successful move as a capability.
   - "Claude did not just make one image. It learned a reusable creative move."

## Next Build Slices

### Slice 1: Human Validate MediaPipe Finger Tracking

MediaPipe is wired and covered without requiring a webcam in CI. The remaining gate is physical validation:

- Record a 10-second local clip of index-finger drawing.
- If tracking is unstable, record the pointer fallback while keeping the camera preview visible.
- Do not expose MediaPipe model/provider choice in primary creator-facing UI.

### Slice 2: Provenance / Action-Log Hardening

Current code passes composer refs and air-brush captures into motion generation. It has e2e proof for file-attached refs and capture refs flowing into `/api/video/generate`; harden the action record next:

- Add explicit UI copy-free evidence in the preview/action log: first ref used as motion source.
- Add provenance `outputRefs` / `inputs.refs` coverage for motion actions beyond the current run metadata.

Acceptance:

- A pasted image ref can drive a text-mask motion preview.
- Two pasted refs can drive double-exposure subject/exposure inputs.
- A captured air-brush camera frame can drive a text-mask motion preview.
- The action log records this as `video-gen`, `artifactKind: video`, provider/model, and output refs.

Latest validation already run:

```bash
npm test
npm run typecheck
PORT=3107 npx playwright test tests/e2e/voice-sketch.spec.ts tests/e2e/motion-artifact.spec.ts tests/e2e/air-brush.spec.ts
npm run cf-build
npm run deploy:stg
curl -I https://aether-stg.berlayar.ai/workspace/demo-ws
curl -s https://aether-stg.berlayar.ai/api/video/generate \
  -H 'content-type: application/json' \
  --data '{"scene":{"kind":"text-mask","text":"AETHER\\nHACKATHON"},"durationSec":4}' | head -c 700
AETHER_BASE_URL=https://aether-stg.berlayar.ai npx playwright test tests/e2e/motion-artifact.spec.ts tests/e2e/air-brush.spec.ts tests/e2e/voice-sketch.spec.ts
```

### Slice 3: Replicate Seedance 2.0 Adapter

Only do this after deterministic HyperFrames remains green.

Implement `lib/providers/video/replicate.ts` behind `VideoGenProvider`.

Requirements:

- Use `REPLICATE_API_TOKEN` only from env.
- Support a model override defaulting to `bytedance/seedance-2.0` only inside the Replicate adapter or env, never in UI components.
- Accept text prompt plus optional image/video/audio refs if the Replicate model schema supports them.
- Poll prediction status until succeeded/failed/canceled.
- Return `VideoGenResult` with `videoUrl`, `posterUrl` if available, duration, latency, and raw only for debug.
- Route must still fall back to HyperFrames when Replicate is unavailable.

Red/green:

- Red: contract test mocks Replicate prediction create/get and expects request shape for `bytedance/seedance-2.0`.
- Green: `/api/video/generate` with `providerId: 'replicate'` returns a hosted video URL under mocked Replicate responses.
- Human gate: only run live Replicate once the mock contract passes and budget is acceptable.

### Slice 4: Submission Recording Polish

`docs/SUBMISSION-BUILD-FOR-WHATS-NEXT.md` now contains:

- 100-200 word written summary.
- 3-minute script with timestamps.
- Opus 4.7 use bullets mapped to judging criteria.
- Fallback recording plan.

Winning emphasis:

- Impact: creators and teams avoid the grind of manually remaking the same idea for every format; accessibility angle makes the interface meaningfully new.
- Demo: eyes-closed embodied input, voice-controlled brush, motion with sound, double-exposure key visual, multiformat fanout.
- Opus 4.7: capability authoring, tool routing, provenance, multimodal context, agent-managed reusable skills.
- Depth: provider seams, tests, Cloudflare deploy, deterministic fallback, graph/provenance architecture.

## Validation Commands

Run before handoff back:

```bash
npm test
npm run typecheck
PORT=3107 npx playwright test tests/e2e/voice-sketch.spec.ts tests/e2e/motion-artifact.spec.ts tests/e2e/air-brush.spec.ts
npm run video:double-exposure:skills
npm run video:text-mask -- --text "AETHER\\nHACKATHON" --media ./experiments/video/source-lab/cinematic-intro.mp4 --kind video --output /tmp/aether-text-mask.html
npm run video:double-exposure -- --skill echo-still --output /tmp/aether-double-exposure.html
npm run cf-build
```

If deploying staging:

```bash
npm run deploy:stg
curl -I https://aether-stg.berlayar.ai/workspace/demo-ws
curl -s https://aether-stg.berlayar.ai/api/video/generate \
  -H 'content-type: application/json' \
  --data '{"scene":{"kind":"text-mask","text":"AETHER\\nHACKATHON"},"durationSec":4}' | head -c 400
AETHER_BASE_URL=https://aether-stg.berlayar.ai npx playwright test tests/e2e/motion-artifact.spec.ts
AETHER_BASE_URL=https://aether-stg.berlayar.ai npx playwright test tests/e2e/air-brush.spec.ts tests/e2e/voice-sketch.spec.ts
```

## Demo-Complete Acceptance Criteria

- Workspace loads on clean local and staging URLs.
- Voice can switch sketch mode, change brush color, change brush thickness, and confirm sketch.
- Air-brush mode is visible and usable without physical webcam inference.
- A capture/reference can become an input to motion generation.
- Deterministic motion artifact has visible animation and an audio track.
- Hosted video provider path is either working behind Replicate/Volcengine or explicitly marked as optional fallback.
- Key visual can fan out to campaign formats.
- Export/provenance still works.
- The demo never opens devtools, raw JSON, or an operator dashboard.

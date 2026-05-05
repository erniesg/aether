# Storyboard Canvas State E2E Verification - 2026-05-05

Branch: `codex/storyboard-canvas-state-e2e`

## Scope

- Integrated a storyboard lens into the existing creator canvas shell.
- Preserved canvas, voice, generation, multilingual overlay, and publish preview state across storyboard/canvas toggles.
- Verified local Whisper and command planning against the running local stack.
- Verified live Replicate `openai/gpt-image-2` hero-seeded fanout with 8/8 frames and visual QA pass.

The ad hoc live generation was run with `persistRun:false` because this local environment has real X publisher credentials configured and the handoff runner that normally controls the post-now flow is missing.

## Artifact Paths

- Local Whisper response: `test-results/live-smoke-2026-05-05T090000Z/transcribe-response.json`
- Voice command response: `test-results/live-smoke-2026-05-05T090000Z/command-response.json`
- Live generate request: `test-results/live-generate-2026-05-05T090500Z/generate-request.json`
- Live generate events: `test-results/live-generate-2026-05-05T090500Z/events.ndjson`
- Live generate summary: `test-results/live-generate-2026-05-05T090500Z/summary.json`
- Live visual QA: `test-results/live-generate-2026-05-05T090500Z/visual-qa.json`
- Live downloaded frames: `test-results/live-generate-2026-05-05T090500Z/images/`
- Storyboard/canvas toggle screenshot: `test-results/e2e-storyboard-view-state--9854b-e-canvas-storyboard-toggles-chromium/storyboard-state-preserved.png`

## Live Results

- `/api/voice/transcribe`: 200, `local-whisper`, `mlx-community/whisper-small-mlx`.
- `/api/voice/command`: 200, product `Eight Sleep Pod`, `publishMode: auto-post`, `targetPlatforms: ['x']`.
- `/api/generate`: 200 SSE, request included `notifyMode: auto-post`, `targetPlatforms: ['x']`, `providerId: replicate`, `model: openai/gpt-image-2`.
- Generation mode: `hero-seeded-fanout`.
- Hero count: `2`.
- Frames: `8/8` completed, `0` failed.
- Visual QA: all 8 frames passed.
- Persistence/publishing: intentionally disabled for the ad hoc direct run with `persistRun:false`.

## Runner Blocker

The handoff references `test-results/audio-driven-live-e2e-runner.mjs`, but it is absent from this worktree and from git history:

- `find . -name 'audio-driven-live-e2e-runner.mjs' -print`: no results.
- `git ls-files | rg 'audio-driven-live-e2e-runner|audio-driven-live'`: no results.
- `git log --all --name-only --pretty=format: | rg 'audio-driven-live-e2e-runner|live-e2e'`: no results.
- `find /Users/erniesg/code/erniesg -name 'audio-driven-live-e2e-runner.mjs' -print`: no results.

Because of that, the exact requested command `node --check test-results/audio-driven-live-e2e-runner.mjs` cannot pass in this checkout, and the exact controlled live post-now runner could not be executed.

## Checks

Passed:

- `npm test -- tests/component/async-push-to-talk.test.tsx tests/unit/voice-command.test.ts`
- `npm test -- tests/component/publish-preview.test.tsx tests/component/publish-section.test.tsx tests/component/text-overlay-bridge.scoped-edits.test.tsx`
- `npm test -- lib/publisher/payload.test.ts lib/publisher/discord-actions.test.ts tests/unit/dispatch-text-overlay-apply.test.ts`
- `npm test -- tests/unit/api-publish.test.ts tests/unit/api-publish-schedule.test.ts tests/unit/api-auto-mode-post-now.test.ts tests/unit/api-campaigns-overlay.test.ts`
- `npm test -- lib/text-overlay/compose.test.ts lib/text-overlay/scoped-edits.test.ts`
- `npm test -- tests/unit/api-generate.stream.test.ts`
- `NEXT_PUBLIC_CONVEX_URL= AETHER_ALLOW_OFFLINE_CONVEX=1 npx playwright test tests/e2e/storyboard-view-state.spec.ts --project=chromium`

Blocked:

- `node --check test-results/audio-driven-live-e2e-runner.mjs` because the file does not exist in this checkout.
- The exact audio-driven live E2E with controlled post-now, because it depends on the missing runner.


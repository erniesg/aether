# Repo Video Motion First Slice Notes

- Plan: `docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md`
- Spec: `docs/specs/2026-06-23-repo-video-system/README.md`
- Branch: `codex/social-03-repo-facts`

## Implemented Slice

- Motion project primitives with frame math, workflow mode, drafts, timeline
  clips, exports, graph nodes, and provenance.
- Repo facts to launch/feature/social/demo motion projects.
- GitHub PR/code-change evidence provider contract and GitHub CLI provider.
- Motion component registry for hook, app frame, agent trace, proof, diff,
  mechanism, evidence, captions, voice lines, transitions, and CTA.
- Story-to-timeline compiler with captions, planned voice clips, transitions,
  and linked format scopes.
- Review-plan artifact for plan/draft review, full-auto action queues, editable
  component slots, and scoped regeneration requests.
- Timeline lens scaffold inside the single aether workspace shell.
- Draft motion tool registry and reusable workflow entries for repo launch,
  feature/social, website/app capture, PR explainers, caption overlays, motion
  graphics, and Remotion/HyperFrames portability.
- Agent motion workflow planner that turns a workflow id, mode, and source refs
  into gated tool/artifact plans for review mode or saved full-auto execution.
- Agent motion workflow router that picks the reusable workflow from intent and
  source refs, then returns the same review/full-auto plan.
- Agent motion workflow starter that turns a repo source into a routed workflow,
  materialized motion project, editable review plan, and explicit source/evidence
  requests when more material is needed.
- Site/app motion starter that turns a live URL into a capture-first editable
  motion project using extracted page claims, stack hints, timeline tracks, and
  review-plan component slots.
- Agent capture planner that turns capture-first motion projects into
  screenshot, DOM snapshot, interaction-trace, optional recording, and
  computer-use fallback requests with viewport and provenance receipts.
- Browser capture provider boundary that executes capture requests through an
  injected runner and normalizes screenshot, snapshot, trace, or recording
  receipts into typed capture artifacts without hardcoding a default provider.
- Playwright browser capture runner that can execute the browser capture
  boundary locally, write screenshot/DOM/trace files, return Playwright video
  paths, and wrap itself as a `browser-capture` provider when explicitly
  configured.
- Capture-result application that turns screenshot or recording receipts into
  selected demo assets, editable `app-frame` timeline props, review-plan slots,
  and completed capture graph nodes while keeping DOM/trace receipts as
  provenance.
- Render handoff planning that converts an editable timeline into Remotion or
  HyperFrames render requests, expected MP4/poster/subtitle/transcript/manifest
  outputs, and a planned render graph node without hardcoding a renderer.
- Opt-in motion render provider registry for Remotion and HyperFrames adapters.
- Render-result application that turns MP4, poster, subtitle, transcript, and
  manifest receipts into ready export asset refs while merging provider
  provenance into the render graph node.
- Voiceover handoff planning that converts voice-line timeline clips into
  narration requests with expected audio, word-timing, and transcript receipts.
- Opt-in motion voice provider registry for TTS and alignment adapters without
  hardcoding a vendor.
- Voice-result application that turns audio, word-timing, and transcript
  receipts into editable voice/caption timeline props and a completed voice
  graph node.

## Verification Commands

```bash
./node_modules/.bin/vitest run tests/unit/capability-registry.test.ts
./node_modules/.bin/vitest run lib/motion/componentRegistry.test.ts lib/motion/reviewPlan.test.ts lib/motion/workflowPlan.test.ts lib/motion/workflowRouter.test.ts lib/motion/capturePlan.test.ts lib/motion/captureApply.test.ts lib/motion/renderPlan.test.ts lib/motion/renderApply.test.ts lib/motion/voicePlan.test.ts lib/motion/voiceApply.test.ts lib/motion/start.test.ts
./node_modules/.bin/vitest run lib/providers/capture/browser.test.ts lib/providers/capture/playwright.test.ts lib/providers/capture/registry.test.ts
./node_modules/.bin/vitest run lib/providers/video/render-registry.test.ts
./node_modules/.bin/vitest run lib/providers/voice/registry.test.ts
./node_modules/.bin/vitest run tests/component/timeline-lens.test.tsx tests/component/view-switcher.test.tsx tests/component/view-switcher.focus-mode.test.tsx
npm run typecheck
git diff --check
```

## Browser Checkpoint

Validated `http://127.0.0.1:3000/workspace/demo-ws` in the in-app browser after
the timeline-lens commit:

- `timeline` tab opens inside the same synthesis shell.
- Input and output rails remain mounted.
- Bottom prompt composer remains visible and usable.
- Browser console had zero errors for the checked path.

## Research Follow-Up

Before locking component art direction, run an authenticated corpus pass over X,
YouTube, and product pages for current launch/demo videos from Anthropic,
OpenAI, Cursor, Linear, Screen Studio, Runway, Pika, HeyGen, Arcade, Clueso,
Descript, and HyperFrames daily skill launches. Tag each clip for hook, capture,
agent trace, proof, captions, voice, effects, transition language, CTA, and
export format.

The current implementation has the data and workflow seams to ingest that
corpus, but it does not yet include the corpus artifact, Remotion Player preview,
real render adapters, voice providers, or app capture execution.

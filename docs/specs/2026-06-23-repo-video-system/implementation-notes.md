# Repo Video Motion First Slice Notes

- Plan: `docs/superpowers/plans/2026-06-23-repo-video-motion-first-slice.md`
- Spec: `docs/specs/2026-06-23-repo-video-system/README.md`
- Branch: `codex/social-03-repo-facts`

## Implemented Slice

- Motion project primitives with frame math, workflow mode, drafts, timeline
  clips, exports, graph nodes, and provenance.
- Repo facts to launch/feature/social/demo motion projects.
- Local repo facts to launch/feature/social/demo motion projects from
  filesystem paths.
- GitHub PR/code-change evidence provider contract and GitHub CLI provider.
- Motion component registry for hook, app frame, agent trace, proof, diff,
  mechanism, evidence, captions, voice lines, transitions, and CTA.
- Story-to-timeline compiler with captions, planned voice clips, transitions,
  and linked format scopes.
- Review-plan artifact for plan/draft review, full-auto action queues, editable
  component slots, and scoped regeneration requests.
- Preview-plan artifact for the agent/UI to show storyboard beats, draft
  options, editable timeline rows, regeneration actions, and Remotion/HyperFrames
  source readiness without exposing raw source code in the creator-facing plan.
- Timeline lens scaffold inside the single aether workspace shell, now able to
  render preview-plan story, drafts, editable component controls, scoped
  regeneration actions, engine readiness, and timeline rows without leaking raw
  beat, clip, source, or provenance ids in the primary UI.
- Draft motion tool registry and reusable workflow entries for repo launch,
  feature/social, website/app capture, PR explainers, caption overlays, motion
  graphics, and Remotion/HyperFrames portability. PR explainers now include
  voice and timeline-revision gates without adding capture as source evidence.
- Agent motion workflow planner that turns a workflow id, mode, and source refs
  into gated tool/artifact plans for review mode or saved full-auto execution.
- Agent motion workflow router that picks the reusable workflow from intent and
  source refs, then returns the same review/full-auto plan.
- Agent motion workflow starter that turns a repo source into a routed workflow,
  materialized motion project, editable review/preview plans, and explicit
  source/evidence requests when more material is needed.
- Agent-native `/api/motion/start` route that accepts direct `sourceRefs` or
  `repoPath`, `repoUrl`, `siteUrl`, and `prRef` shorthands, then returns the
  routed workflow, editable motion project, review plan, preview plan, capture
  plan, and requested input blockers.
- Agent-native `/api/motion/revise` route that accepts an editable motion
  project plus scoped story, component, timing, or replacement operations, then
  returns the updated project with refreshed review/preview plans and capture
  status while rejecting unsafe timeline edits.
- Agent-native `/api/motion/render` route that accepts an editable motion
  project plus Remotion/HyperFrames render options, returns source/output
  handoffs when no renderer is configured, returns timeline blockers before
  resolving providers, and applies completed render receipts back into export
  slots when an opt-in provider is available.
- Local repo motion starter that turns an absolute, relative, `~/`, or
  `file://` repo ref into the same editable repo motion project without calling
  GitHub.
- PR motion starter that turns a GitHub PR URL or `owner/repo#number` ref into
  an editable code-change explainer project through a configured
  `CodeChangeProvider`, derives app profile facts from the PR repo, materializes
  timeline/voice/caption clips, and falls back to reviewable evidence requests
  when no provider is configured.
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
- Runner-backed Remotion and HyperFrames render provider factories that execute
  injected runners, fail closed without configuration, reject wrong-engine
  requests, and normalize file receipts against the render plan.
- Render execution orchestration that builds a provider request from the motion
  project, calls the selected provider, keeps timeline blockers reviewable, and
  applies render receipts back into editable exports.
- Local command render runners that invoke Remotion or HyperFrames command
  plans through an injected executor, write VTT/transcript/manifest sidecars,
  verify planned MP4/poster files, and return file-backed receipts.
- Timeline-to-source compilation that turns render requests into Remotion entry
  TSX, HyperFrames `index.html`, and source manifest files, then attaches those
  files to render requests so command runners can write them before invoking an
  engine.
- Component-aware render source adapters that preserve motion component ids,
  named Remotion renderer functions, HyperFrames component classes, and reusable
  effect tokens in source manifests for beat-level regeneration.
- Structured timeline revisions that apply review-mode and agent-driven copy,
  prop, timing, and component replacement tweaks across the editable project and
  current draft while rejecting unsafe overlaps or unregistered components.
- Image-to-video clip planning that turns asset-backed visual timeline clips
  into provider-neutral generation requests with planned graph provenance, plus
  an opt-in image-to-video provider registry with no default model.
- Image-to-video result application that updates editable timeline and draft
  visual clips with generated clip receipts while keeping source visual refs
  and completing the image-to-video graph node with provider provenance.
- Voiceover handoff planning that converts voice-line timeline clips into
  narration requests with expected audio, word-timing, and transcript receipts.
- Opt-in motion voice provider registry for TTS and alignment adapters without
  hardcoding a vendor.
- Voice-result application that turns audio, word-timing, and transcript
  receipts into editable voice/caption timeline props and a completed voice
  graph node.

## Verification Commands

```bash
./node_modules/.bin/vitest run tests/unit/capability-registry.test.ts --pool=forks
./node_modules/.bin/vitest run tests/unit/api-motion-start.test.ts
./node_modules/.bin/vitest run tests/unit/api-motion-revise.test.ts
./node_modules/.bin/vitest run tests/unit/api-motion-render.test.ts
./node_modules/.bin/vitest run lib/motion/componentRegistry.test.ts lib/motion/reviewPlan.test.ts lib/motion/previewPlan.test.ts lib/motion/revise.test.ts lib/motion/prMotion.test.ts lib/motion/localRepoMotion.test.ts lib/motion/workflowPlan.test.ts lib/motion/workflowRouter.test.ts lib/motion/capturePlan.test.ts lib/motion/captureApply.test.ts lib/motion/imageToVideoPlan.test.ts lib/motion/imageToVideoApply.test.ts lib/motion/renderPlan.test.ts lib/motion/renderSource.test.ts lib/motion/renderApply.test.ts lib/motion/renderExecution.test.ts lib/motion/voicePlan.test.ts lib/motion/voiceApply.test.ts lib/motion/start.test.ts
./node_modules/.bin/vitest run lib/research/local-repo-facts.test.ts lib/research/repo-facts.test.ts
./node_modules/.bin/vitest run lib/providers/capture/browser.test.ts lib/providers/capture/playwright.test.ts lib/providers/capture/registry.test.ts
./node_modules/.bin/vitest run lib/providers/video/render-registry.test.ts lib/providers/video/local-render.test.ts lib/providers/video/command-render.test.ts lib/providers/video/generation-registry.test.ts
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

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
- Preview-plan artifact for the agent/UI to show the video plan, storyboard
  beats, draft options, editable timeline rows, regeneration actions, and
  Remotion/HyperFrames source readiness without exposing raw source code in the
  creator-facing plan.
- Prepared preview sources now carry the runtime host contract. HyperFrames
  HTML mounts as a sandboxed same-shell iframe, while Remotion source bundles
  mount a same-shell `@remotion/player` host from the editable timeline JSON
  without exposing raw generated TSX in the creator-facing surface.
- Source-material profile artifact for repo/app starts: repo facts now produce
  creator-facing stack/script/route signals, capture candidates, and storyboard
  hints. Local repos with app scripts can produce local-app screenshot, DOM
  snapshot, and screen-recording requests; GitHub repos with homepage URLs can
  produce hosted capture candidates.
- Timeline lens scaffold inside the single aether workspace shell, now able to
  render preview-plan video-plan scenes, story, drafts, editable component
  controls, scoped regeneration actions, engine readiness, and timeline rows
  without leaking raw beat, clip, source, or provenance ids in the primary UI.
- Selected timeline clips can now be edited for copy, reusable effect preset,
  start time, and duration; timing edits reuse the same typed revision endpoint
  and preserve server-side overlap validation.
- Preview plans now include a creator-facing visual generation summary for
  image-to-video: ready clip requests show component, prompt, duration, and
  output shape, while missing key visuals appear as reviewable blockers.
- Preview plans now include a compact image-to-video node plan inside that
  visual generation summary, so agents and creators can see the source visual,
  generation, review, and timeline-update dependency chain without opening a
  separate graph surface.
- Preview plans now include a reusable motion design kit for launch,
  feature/social, demo capture, and PR explainer videos, exposing creator-facing
  component roles, effect presets, editable surfaces, rhythm guidance, and
  verification artifacts without showing raw registry ids in the timeline lens.
- Preview plans now include a project-aware production queue, so the timeline
  lens can show review/full-auto next actions, ready work, blockers, and
  optional image-to-video generation without turning the surface into a route
  log.
- Motion rail video starter for repo, PR, site URL, or local path sources with
  review/full-auto mode and target presets for X vertical, LinkedIn feed,
  website demo, and multi-format launch packs.
- Draft motion tool registry and reusable workflow entries for repo launch,
  feature/social, website/app capture, PR explainers, caption overlays, motion
  graphics, and Remotion/HyperFrames portability. PR explainers now include
  voice, timeline-revision, and export-pack gates without adding capture as
  source evidence.
- HyperFrames `pr-to-video` source research now confirms the PR evidence
  package Aether should mirror: `gh`-backed PR JSON, full diff, text brief,
  people/avatars, narrator script, audio metadata, section plan, caption groups,
  scene files, contact-sheet proof, and final MP4 render.
- HyperFrames and iart motion-skill reference refreshes confirm that Aether's
  reusable workflow skills should stay narrow and installable: `pr-to-video`,
  product launch, website/app capture, captions, overlays, and motion graphics
  each need their own trigger, artifact contract, verification loop, and
  review/full-auto policy.
- Agent motion workflow planner that turns a workflow id, mode, and source refs
  into gated tool/artifact plans for review mode or saved full-auto execution.
- Agent workflow plans now include an executable run plan: ordered review or
  full-auto steps, motion API routes, tool ids, input/output artifacts, and
  verification artifacts are carried through the same start result.
- Concrete motion projects now derive their own production queue across plan,
  drafts, capture, image-to-video, voice, sync, render, and export, with each
  step marked complete, ready, blocked, review, or optional plus provider needs
  and full-auto advance flags.
- Agent workflow plans now include a deterministic `SKILL.md` draft for the
  routed motion workflow, including route-derived tool names, review/full-auto
  policy, start shorthands, sample launch copy, and required verification
  artifacts so a known video workflow can be pinned without re-drafting through
  a generic skill prompt.
- Workflow skill drafts now attach catalog-backed recipes with agent tasks,
  draft variations, reusable component slots, regeneration scopes, generation
  lanes, and review surfaces, so `pr-to-video`, repo launch, feature/social,
  site capture, caption overlay, motion graphic, and Remotion/HyperFrames port
  workflows are discoverable as reusable skills before a project starts.
- Workflow skill recipes now include reusable reference patterns for actual
  product-video work: launch hooks, real product capture, screen zoom callouts,
  caption-led social cuts, proof receipts, code-diff explainers, before/after
  feature beats, agent process traces, image-to-video inserts, voice/caption
  sync, multi-format export packs, and reusable motion-system primitives.
  Generated `SKILL.md` drafts and the timeline lens expose those labels so
  agents can run them and creators can review them.
- Workflow skill contracts on video workflows now expose review/full-auto modes,
  reviewable artifacts, scoped regeneration targets, and verification artifacts
  directly in registry metadata and agent workflow plans.
- Agent-native `/api/motion/workflows` route that lists reusable video workflow
  skills and filters them by source kind, render engine, or run mode before an
  agent starts a motion project; responses now include workflow recipes for
  video plan review, draft variation selection, component regeneration, and
  full-auto policy, plus installable `SKILL.md` drafts for pinning a workflow
  skill before a concrete source is started.
- Agent motion workflow router that picks the reusable workflow from intent and
  source refs, then returns the same review/full-auto plan.
- Agent motion workflow starter that turns a repo source into a routed workflow,
  materialized motion project, editable review/preview plans, and explicit
  source/evidence requests when more material is needed.
- Agent execution handoffs now sit beside ready start results: they include
  concrete JSON request templates with `project` placeholders for full-auto,
  capture, image-to-video, voice, sync, preview-source, source-edit, render,
  and export-pack gates. Local repo handoffs include required capture request
  ids plus the request-scoped `playwright-local` runner config.
- The workspace timeline lens now receives those agent handoffs and renders a
  compact agent-actions strip inside the creator shell: next action, review or
  full-auto mode, API route labels, expected receipts, and local-runner
  availability are visible without exposing raw JSON placeholders or capture
  request ids.
- Timeline capture actions now reuse the same request-scoped runner handoff:
  when the `/api/motion/capture` action template includes
  `captureRunner.kind = "playwright-local"`, the creator-facing capture buttons
  submit that runner with the selected capture request ids so local app launch
  and Playwright capture can run without a global default provider.
- Capability setup now turns the guarded computer-use fallback into an
  actionable timeline card when capture is unresolved and no capture provider
  is available. The card carries creator approval, redaction manifest, approved
  window scope, expected screenshot / recording / trace / redaction receipts,
  and stop conditions without exposing request JSON in the creator-facing
  shell. Setup cards now also carry dry-run proof labels for capture, local app
  launch, computer-use, visual sourcing/generation, voice, sync, and render, so
  review/full-auto setup can ask for concrete receipts before advancing.
- The reusable motion primitive layer now includes cursor callouts,
  split-screen before/after comparisons, presenter bubbles, and contact-sheet
  render proof components. Reference grammar, design kits, and workflow skill
  recipes expose those as reviewable and regenerable slots, so actual product
  demos, launch videos, PR explainers, and social cuts can move between
  full-auto execution and creator review without leaving the timeline lens.
- Remotion and HyperFrames source generation now emit explicit adapters for
  those product-video primitives, preserving component ids, edit controls,
  source manifest entries, and `EDIT.md` regeneration scopes instead of falling
  back to generic proof cards.
- Caption overlay, motion-graphic, and Remotion/HyperFrames port workflows now
  create editable source-set `MotionProject` starts instead of stopping at
  planned-only. Uploads, references, captures, and engine source bundles can now
  enter the same review/full-auto timeline, preview, source-edit, render, and
  export loop.
- The motion rail now exposes `caption-overlay`, `motion-graphic`, and `port`
  intents, using the existing `upload:`, `reference:`, `remotion:`, and
  `hyperframes:` source-set syntax to start those workflows from the creator
  shell.
- Agent-native `/api/motion/start` route that accepts direct `sourceRefs` or
  `repoPath`, `repoUrl`, `siteUrl`, and `prRef` shorthands, then returns the
  routed workflow, editable motion project, review plan, preview plan, capture
  plan, agent request templates, and requested input blockers.
- Agent-native `/api/motion/capture` route that accepts an editable motion
  project plus selected capture request ids, returns provider-required
  screenshot/DOM/trace/recording handoffs when no capture runner is configured,
  returns a guarded computer-use fallback contract with approval, safe scope,
  redaction, expected receipts, and apply-route metadata, returns deduped
  local-app launch handoffs for runnable repo captures, and applies completed
  capture receipts back into demo beats and `app-frame` timeline clips when an
  opt-in provider is available. A request-scoped `captureRunner.kind =
  "playwright-local"` option now instantiates the local Playwright provider
  explicitly, writes artifacts under the aether workspace, can opt into trusted
  local app launch, and returns that runner in the provider inventory without
  making it a global default. A request-scoped `captureRunner.kind =
  "computer-use-local"` option now requires explicit creator approval and an
  applied redaction manifest, normalizes supplied desktop/browser receipts into
  typed screenshot, recording, snapshot, or trace artifacts, preserves
  redaction provenance, and applies visual receipts into the editable timeline
  without registering a default desktop-control provider.
- Agent-native `/api/motion/voice` route that accepts an editable motion
  project plus selected voice request or clip ids, returns provider-required
  narration/word-timing/transcript handoffs when no voice provider is
  configured, returns timeline blockers before provider resolution, and applies
  completed audio/timing receipts back into voice and caption clips when an
  opt-in provider is available.
- Agent-native `/api/motion/sync` route that accepts an editable motion project
  and returns beat markers, caption/voice timing links, transition cues, sound
  cues, blockers, and refreshed review/preview plans for final sync review.
- Agent-native `/api/motion/image-to-video` route that accepts an editable
  motion project plus selected generation request or clip ids, returns
  provider-required image-to-video handoffs when no generation provider is
  configured, returns timeline or visual-source blockers before provider
  resolution, and applies generated video receipts back into the same timeline
  clips while preserving source visual provenance.
- Agent-native `/api/motion/regenerate` route that accepts an editable motion
  project, clip id, regeneration scope, and prompt, then returns a planned
  scoped regeneration request plus refreshed review/preview state for agents or
  the timeline lens.
- Agent-native `/api/motion/revise` route that accepts an editable motion
  project plus scoped story, component, timing, or replacement operations, then
  returns the updated project with refreshed review/preview plans and capture
  status while rejecting unsafe timeline edits.
- Agent-native `/api/motion/preview-source` route that accepts an editable
  motion project plus a Remotion or HyperFrames engine, returns a source-ready
  preview package with source file contents, runtime mount target, edit-link
  labels, refreshed preview plan, and timeline blockers without requiring a
  render provider.
- Agent-native `/api/motion/render` route that accepts an editable motion
  project plus Remotion/HyperFrames render options, returns source/output
  handoffs when no renderer is configured, returns timeline blockers before
  resolving providers, and applies completed render receipts back into export
  slots when an opt-in provider is available.
- Agent-native `/api/motion/export-pack` route that accepts an editable motion
  project and returns per-platform export readiness, missing artifact kinds,
  canvas drop candidates, blockers, and a pack manifest when every target has
  render receipts.
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
  screenshot, DOM snapshot, interaction-trace, optional recording, local-app
  launch, and computer-use fallback requests with viewport, setup,
  app-launch readiness, and provenance receipts.
- Browser capture provider boundary that executes capture requests through an
  injected runner and normalizes screenshot, snapshot, trace, or recording
  receipts into typed capture artifacts without hardcoding a default provider.
- Playwright browser capture runner that can execute the browser capture
  boundary locally, write screenshot/DOM/trace files, return Playwright video
  paths, invoke an injected local-app launch callback before capture, clean up
  app sessions after capture, and wrap itself as a `browser-capture` provider
  when explicitly configured.
- Trusted local app-launch callback for capture agents that spawns the planned
  repo command in cwd, waits for HTTP readiness, fails on early process exit,
  and cleans up the app process after Playwright capture without auto-registering
  a provider globally.
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
- Export-pack planning that turns editable export slots into ready/missing
  platform artifacts, canvas drop candidates, blockers, and manifest metadata
  for fully rendered packs.
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
- Sync planning that turns editable timeline tracks into beat markers,
  caption/voice timing links, transition cues, sound cues, provider
  requirements, and blockers until voice and word-timing receipts exist.
- Editable render source contracts that add `EDIT.md` and manifest
  `editContract` metadata to Remotion and HyperFrames source bundles, so agents
  can target individual clips, controls, source files, and regeneration scopes
  after a render handoff.
- Source-bundle round-trip edits now apply edited timeline JSON, `SCRIPT.md`,
  `STORYBOARD.md`, and `EDIT.md` back into the graph-backed `MotionProject`.
  Script edits update the story and linked text/caption/voice clips; storyboard
  edits update narration, timing, component templates, and effect props; and
  `EDIT.md` now exposes editable control values that can update component props
  directly.
- Preview plans now include a capability setup contract for provider-backed
  execution. The timeline lens renders capture, local-app launch, visual source,
  image-to-video, voice/timing, sync, and render readiness as creator-facing
  rows, while `/api/motion/full-auto` passes configured provider inventory into
  that contract so full-auto can pause on an actionable setup step instead of a
  generic missing-provider state.
- Setup dry-run proof is now persisted as `setup` execution-history receipts.
  Preview capability setup consumes those receipts to mark the matching runner
  or provider card configured and move the next setup action; computer-use
  approval/redaction/safe-scope proof also satisfies the capture fallback card
  without completing the production capture gate.
- Production plans now surface completed capture, render, and export
  verification receipts as first-class step metadata. Full-auto capture
  results can create completed capture graph nodes, render receipts appear as
  creator-facing proof labels, and the timeline lens shows compact receipt
  labels in the production queue without exposing raw ids.
- Editable motion projects now carry saved execution history for capture and
  render gates. Capture and render result application appends receipt history
  entries to the same `MotionProject`, preview plans summarize saved steps and
  receipt counts, and the timeline lens exposes a compact saved-receipts trail
  for review or full-auto runs.
- Saved full-auto execution now chains configured providers through
  image-to-video, voice synthesis, timeline sync, and Remotion/HyperFrames
  render. When render receipts provide MP4, poster, subtitles, transcript, and
  manifest outputs for every target, the same production plan marks export
  complete and returns a ready export-pack manifest.
- Saved full-auto execution can now use the same request-scoped
  `captureRunner.kind = "playwright-local"` contract as the capture route, so a
  trusted agent can launch a local repo app, collect capture receipts, and
  continue the saved queue without registering a global capture provider.
- Workflow skill launch kits now expose review objects for PR/repo evidence,
  draft variations, component regeneration handles, teaser targets, and export
  packs. The generated `SKILL.md` instructions include those objects, the
  workflows API returns them, and the timeline lens shows one source, draft,
  regeneration, teaser, and export handle in the creator-facing shell.
- The provider-neutral motion component registry now includes granular code
  visual primitives for PR/release videos: code diff, code highlight, code
  scroll, and code typing. Remotion source generation emits named renderer
  functions for those primitives; HyperFrames source generation emits stable
  component classes, so agents can regenerate one code visual without rewriting
  the whole video.
- Preview plans now carry a source-edit review contract for rendered motion
  projects: the `/api/motion/source-edit` route, `EDIT.md`, `SCRIPT.md`,
  `STORYBOARD.md`, timeline JSON, file-role guidance, component edit controls,
  source-file labels, and regeneration scopes. The timeline lens shows that
  contract as a creator-facing edit source inside the same shell instead of
  sending creators to a separate source editor or raw render bundle.
- The timeline lens now includes a source-backed playable preview shell for
  renderable Remotion/HyperFrames source bundles: creators can scrub time,
  see the composition and entry source, focus editable components, and open the
  existing linked clip edit controls while both workspace rails remain mounted.
  Preview plans now also carry a typed runtime target for Remotion `Player` or
  a HyperFrames iframe, with source-host requirements and edit-link labels.
  `/api/motion/preview-source` now returns the source package needed to mount
  those targets, and the timeline lens now exposes a creator-facing prepare
  action that calls that route with the selected draft and engine. The
  workspace stores the returned source package and the timeline lens shows a
  source-ready runtime host with file counts, entry/timeline paths, fps, and
  edit links without exposing raw TSX/HTML contents. HyperFrames packages now
  mount their prepared HTML in a sandboxed same-shell iframe. The actual
  `@remotion/player` embed remains follow-up work once runtime dependencies
  are configured.
- The timeline lens now opens a progressive advanced node lens from the
  visual-generation strip while the graph route remains unavailable. The lens
  keeps the surface creator-facing by showing visual source, image-to-video,
  voice/caption, sync, render, and export cards with input labels, output
  labels, provider status, receipt labels, and scoped regenerate actions
  instead of raw graph ids or request payloads.
- 2026-06-24 second reference pass folded into the spec: HyperFrames launch
  videos and pipeline docs reinforce capture/design/script/storyboard/voice/
  build/validate artifacts; the catalog informs provider-neutral component
  classes; timeline editing must remain source-backed; and the user's
  `pr-to-video` daily skill launch copy is represented as a workflow example
  rather than as renderer copy.

## Next Slices

1. Use `research-corpus-and-next-slices.md` as the next planning anchor:
   add a typed research corpus fixture, runner setup cards, playable preview,
   progressive generation node lens, and computer-use capture workflow in that
   order.
2. Extend the provider-neutral component registry beyond the current launch,
   proof, code, terminal, caption, social, UI reveal, data, transition, and
   outro set into richer device/avatar/logo/flowchart primitives as concrete
   video recipes demand them.
3. Add configured provider wiring and UI controls for trusted local app launch,
   browser/computer-use capture, voice providers, image-to-video providers, and
   real Remotion/HyperFrames render runners in the creator environment.

## Verification Commands

```bash
./node_modules/.bin/vitest run tests/unit/capability-registry.test.ts --pool=forks
./node_modules/.bin/vitest run tests/unit/capability-registry.test.ts lib/motion/workflowPlan.test.ts
./node_modules/.bin/vitest run tests/unit/api-motion-workflows.test.ts
./node_modules/.bin/vitest run lib/motion/workflowSkillCatalog.test.ts lib/motion/workflowSkill.test.ts
./node_modules/.bin/vitest run tests/unit/api-motion-start.test.ts
./node_modules/.bin/vitest run tests/unit/api-motion-capture.test.ts
./node_modules/.bin/vitest run tests/unit/api-motion-voice.test.ts
./node_modules/.bin/vitest run tests/unit/api-motion-sync.test.ts
./node_modules/.bin/vitest run tests/unit/api-motion-image-to-video.test.ts
./node_modules/.bin/vitest run tests/unit/api-motion-regenerate.test.ts
./node_modules/.bin/vitest run tests/unit/api-motion-revise.test.ts
./node_modules/.bin/vitest run tests/unit/api-motion-preview-source.test.ts
./node_modules/.bin/vitest run tests/unit/api-motion-render.test.ts
./node_modules/.bin/vitest run tests/unit/api-motion-export-pack.test.ts
./node_modules/.bin/vitest run lib/motion/componentRegistry.test.ts lib/motion/reviewPlan.test.ts lib/motion/previewPlan.test.ts lib/motion/revise.test.ts lib/motion/prMotion.test.ts lib/motion/localRepoMotion.test.ts lib/motion/workflowPlan.test.ts lib/motion/workflowRouter.test.ts lib/motion/capturePlan.test.ts lib/motion/captureApply.test.ts lib/motion/imageToVideoPlan.test.ts lib/motion/imageToVideoApply.test.ts lib/motion/renderPlan.test.ts lib/motion/renderSource.test.ts lib/motion/renderApply.test.ts lib/motion/renderExecution.test.ts lib/motion/exportPackPlan.test.ts lib/motion/voicePlan.test.ts lib/motion/voiceApply.test.ts lib/motion/syncPlan.test.ts lib/motion/start.test.ts
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

The first accessible research matrix now lives in
`research-corpus-and-next-slices.md`. It should seed that authenticated pass,
not replace it.

The current implementation has the data and workflow seams to ingest that
corpus, but it does not yet include the corpus artifact, a mounted Remotion
Player or HyperFrames iframe preview, real renderer dependency execution in the
app process, configured voice providers, creator UI controls for trusted runner
execution, or authenticated desktop/computer-use recording execution.

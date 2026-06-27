# Repo-to-video motion system

- Date: 2026-06-23
- Status: active implementation
- Branch: `codex/social-03-repo-facts`
- Scope: reusable launch, feature, demo, and social video generation from any repo or app source

## Summary

aether should treat video as an editable canvas artifact, not as a separate
operator dashboard or one-shot generation endpoint. The right primitive is a
repo-aware `MotionProject`: a graph-backed object that contains the brief,
story beats, assets, timeline clips, generated media, voiceover, captions,
effects, exports, and typed provenance for every decision.

The creator-facing surface is a timeline lens inside the single synthesis
shell. The agent-facing surface is a reusable capability stack that can inspect
a repo, write the launch script, collect or generate visuals, capture product
demos, synthesize voiceover, sync the edit, render a pack, and iterate on the
timeline. A node graph can exist, but it should be progressive disclosure for
advanced image-to-video and render pipelines, not the first screen.

## Proof boundary

Direct `x.com` pages were not readable through the text-fetch path used during
this research pass. This plan is based on official product pages, accessible
demo/product-video tooling pages, indexed social snippets, and the repo's
existing aether motion code. Before locking the component library, run one
authenticated X and YouTube collection pass over launch/demo posts from
Anthropic, OpenAI, Cursor, Linear, Screen Studio, Runway, Pika, HeyGen, Arcade,
Clueso, and Descript.

## Reference refresh: 2026-06-24

- HyperFrames now exposes installable agent skills through
  `npx skills add heygen-com/hyperframes`, with workflow folders for
  `pr-to-video`, `product-launch-video`, `website-to-video`, captions, overlays,
  and engine portability in `https://github.com/heygen-com/hyperframes/tree/main/skills`.
- The HyperFrames `pr-to-video` skill treats a PR as code-change evidence, not a
  site scrape: it ingests PR JSON and diffs through `gh`, then produces narrator
  scripts, audio metadata, section plans, captions, scene compositions, contact
  sheets, and final MP4 renders.
- `iart-ai/motion-skills` confirms the broader skill-pack shape Aether should
  mirror: small workflow-specific skills, installable packs, and a
  render-and-verify loop for visual artifacts.
- Clueso, Arcade, Screen Studio, and Descript all reinforce the product-video
  primitive set: capture or upload real product footage, rewrite/script it,
  add voice/captions/zoom effects, keep outputs editable, and export/share in
  multiple formats.

## Reference refresh: 2026-06-24, second pass

- HyperFrames positions itself as HTML, CSS, media, and seekable animations
  rendered into deterministic MP4, with AI skills that plan, write HTML, wire
  animations, add media, lint, preview, and render. Aether should keep
  Remotion and HyperFrames as engine adapters over the same `MotionProject`,
  not as separate product modes.
- The HyperFrames showcase and launch-video docs are a strong reference for
  Aether's source artifact layout: capture assets, `DESIGN.md`, `SCRIPT.md`,
  `STORYBOARD.md`, voice/timing receipts, beat compositions, snapshots, renders,
  and a source handoff. Aether now mirrors the editable parts through
  render-source bundles and should expose those bundle artifacts inside the
  timeline lens.
- The HyperFrames catalog gives the concrete component taxonomy Aether should
  grow toward: code diff/highlight/scroll/typing blocks, caption styles, social
  overlays, shader and CSS transitions, HTML-in-canvas device/UI reveals,
  terminal/code snippets, data visuals, grain/vignette/shimmer/parallax effects,
  and logo/outro blocks. Aether should map these to provider-neutral component
  ids first, then let HyperFrames/Remotion adapters render them.
- HyperFrames timeline editing deliberately writes back to inspectable source
  attributes such as `data-start`, `data-duration`, `data-track-index`, and
  media offsets. Aether should keep timeline edits graph-backed and versionable:
  each edit must update `MotionProject` plus source/edit manifests, rather than
  creating hidden editor state.
- The launch copy the user pasted belongs in the reusable workflow example
  layer, not hardcoded in a renderer:
  "This week we're launching new skills for HyperFrames..." maps to
  `daily-skill-launch-pr-to-video`, with source kind `pr`, components
  `hook-card`, `agent-trace`, `proof-card`, `command-card`, captions, and CTA.

## Research matrix: 2026-06-24

See `research-corpus-and-next-slices.md` for the current external research
matrix and next implementation slices. It maps HyperFrames skills,
`iart-ai/motion-skills`, Screen Studio, Clueso, Arcade, Descript, Anthropic
computer-use, and Remotion into Aether component groups, review/full-auto
behavior, provider seams, and the remaining authenticated X/video corpus pass.

## Architecture decision

Aether should ship workflow skills, not one giant "video generator." The unit
of reuse is a narrow, installable, agent-native workflow such as
`pr-to-video`, `repo-launch-video`, `feature-social-video`, `website-to-video`,
`caption-overlay-video`, or `remotion-hyperframes-port`. Each workflow skill
must define:

- accepted source refs and shorthands: repo URL/path, PR ref, site/app URL,
  captures, uploads, and references
- review artifacts: video plan, draft variations, storyboard, timeline,
  component plan, render proof, export pack
- full-auto policy: which gates may auto-advance after receipts are saved and
  which require provider setup, capture proof, or creator approval
- regeneration targets: story beat, component, capture, code proof, visual,
  caption, voice line, timing, effect, format, and whole video
- source artifacts: `DESIGN.md`, `SCRIPT.md`, `STORYBOARD.md`, timeline JSON,
  engine source, `EDIT.md`, manifest, snapshots, subtitles, transcript, and
  provenance manifest
- verification loop: lint/typecheck when source is generated, frame snapshots
  or contact sheets, MP4 probe, poster check, subtitle/transcript presence, and
  manifest completeness

The creator sees this as one timeline/canvas lens with a video plan, draft
cards, editable components, source material, generation nodes, render proof, and
export pack. The agent sees the same object as JSON contracts and source files.
Graph and node views remain progressive disclosure for advanced image-to-video,
capture, render, and provenance debugging.

## Remaining implementation plan

1. **Expose edit contracts in review mode.** Surface the new `EDIT.md` and
   `editContract` in `MotionPreviewPlan` and the timeline lens as an "edit
   source" artifact: script changes, component props, timing/effects, and
   regenerate scopes per clip.
2. **Add workflow-skill launch packaging.** Let `pr-to-video` and future daily
   skill drops produce a reviewable launch-kit object: sample social copy,
   install command, teaser format, source PR evidence, and export targets.
3. **Map HyperFrames catalog primitives.** Extend `componentRegistry` and
   reference patterns for code animation, terminal, caption, social overlay,
   shader transition, device/UI reveal, data visual, and logo/outro classes.
   Keep the ids provider-neutral and let engine adapters decide exact source.
4. **Add source-bundle import/export.** Allow an agent to round-trip a rendered
   source bundle: edit `SCRIPT.md`, `STORYBOARD.md`, timeline JSON, or
   `EDIT.md`, then apply structured revisions back into `MotionProject`.
5. **Provider-backed capture execution.** Wire opt-in Playwright/browser
   capture through a trusted agent runner so repo/app starts can launch local
   apps, take screenshots, record flows, save DOM/trace receipts, and feed
   `app-frame` clips.
6. **Render verification receipts.** Store snapshots/contact sheets, MP4 probe
   metadata, poster proof, subtitles, transcripts, and manifest checks as first
   class graph nodes before export.
7. **Full-auto orchestration.** Add a saved run executor that advances through
   ready gates, pauses on missing provider/capture/approval, and writes every
   artifact receipt back to the same project instead of returning a transient
   route response.

## Existing aether foundation

- `docs/DESIGN-SOCIAL-CANVAS.md` already defines video as material from the
  same workspace inputs, compiled from a motion brief, rendered offline, and
  dropped back on canvas.
- `components/header/ViewSwitcher.tsx` and `components/workspace/TimelineLens.tsx`
  now expose the `timeline` lens inside the single synthesis shell. The lens can
  render a creator-facing video plan, story beats, draft variations, editable
  motion kit, component controls, scoped regeneration actions, engine readiness,
  capability setup, computer-use approval/redaction setup, compact agent
  actions, and timeline rows without exposing raw provenance/debug ids or
  request bodies in the primary surface. Setup cards now include dry-run proof
  labels for the receipts needed before full-auto continues, and saved setup
  dry-run receipts advance capability readiness without pretending the final
  capture or render gate has completed; `graph` remains reserved for advanced
  provenance/generation editing.
- `components/rail/sections/MotionSection.tsx` now starts video projects from
  repo, PR, site URL, or local path sources with review/full-auto mode and
  target presets for X vertical, LinkedIn feed, website demo, or a multi-format
  launch pack.
- `lib/motion/brief.ts`, `lib/motion/compile.ts`, and `scripts/render-motion.ts`
  already turn a narrow quote-based `MotionBrief` into a HyperFrames project.
- `lib/motion/project.ts`, `storyboard.ts`, `repoMotion.ts`,
  `localRepoMotion.ts`, `siteMotion.ts`, `prMotion.ts`, `timeline.ts`,
  `componentRegistry.ts`, `designKit.ts`, `reviewPlan.ts`, `previewPlan.ts`,
  `workflowPlan.ts`, `workflowRouter.ts`, and `start.ts` now cover the first
  repo-to-motion-project slice: sourced claims, story beats, draft variations,
  timeline tracks, reusable motion kit suggestions, editable component slots,
  scoped regeneration requests, creator-facing preview plans, workflow routing,
  agent-readable workflow gates, executable run-plan steps, deterministic
  workflow-skill manifest drafts, and the start artifact an agent can hand to
  the creator for review or full-auto progression. Start results now also carry
  an agent execution handoff with concrete request templates for setup dry-runs,
  full-auto, capture, image-to-video, voice, sync, source edits, render proof,
  and export pack gates. The timeline lens renders those templates as
  creator-facing agent actions, including local-runner availability and
  expected receipts. The main full-auto request template now also carries
  provider placeholders for image-to-video, voice, and render, while
  hiding placeholder JSON bodies. Agents can materialize those templates into
  executable request bodies from the current project, selected providers, and
  edited source files; unresolved placeholders are reported instead of being
  silently left for ad hoc replacement. The handoff runner can now execute a
  chosen template sequence, carry the updated project between responses, and
  return per-template receipts for setup dry-runs and full-auto gates; agents
  can call `/api/motion/agent-handoff` to run that sequence through the
  whitelisted motion routes. Computer-use capture setup is now a guarded
  handoff template: it requires an approved `computer-use-local` runner with an
  applied redaction manifest and supplied capture receipts before setup
  receipts are saved. Agents can also call a separate computer-use capture
  handoff to apply approved screenshots, recordings, traces, and redaction
  provenance into the editable timeline, or choose a guarded full-auto
  computer-use handoff that runs the saved gates with those approved capture
  receipts instead of the browser runner. GitHub repo URLs, local repo paths,
  and site/app URL sources can now create editable project starts; PR sources can
  create editable code-change explainer starts when a code-change provider is
  configured. Real screen capture and recording remain provider execution work.
  Component regeneration actions are now also agent handoff templates, so the
  same boundary can stage scoped capture, caption, timing, effect, proof, code,
  or copy revisions from the reviewable draft board.
- `lib/motion/productionPlan.ts` now derives a concrete production queue from an
  editable motion project: plan, drafts, capture, image-to-video, voice, sync,
  render, and export steps are marked complete, ready, blocked, review, or
  optional with provider needs, blockers, route/tool handoffs, and full-auto
  advance flags.
- `lib/motion/sourceProfile.ts` now turns repo facts into creator-facing source
  material: stack/script/route signals, capture candidates, and storyboard
  hints. Local repos with runnable app scripts can now produce local-app
  screenshot, DOM snapshot, and screen-recording requests from the start result;
  GitHub repos with homepage URLs can produce hosted capture candidates.
  Timeline preview shows this as a source-material strip instead of a repo
  inspection surface.
- `app/api/motion/start/route.ts` now exposes that starter through an
  agent-native JSON boundary: callers can pass `sourceRefs` directly or use
  `repoPath`, `repoUrl`, `siteUrl`, or `prRef` shorthands and receive the
  routed workflow, editable project, review plan, preview plan, capture plan,
  agent handoff request templates, and requested input blockers.
- `app/api/motion/capture/route.ts` now exposes screenshot, DOM snapshot,
  interaction trace, and optional screen-recording capture through an
  agent-native JSON boundary: callers send an editable project and selected
  capture request ids, then receive provider-required handoffs, source blockers,
  or completed capture receipts applied back into demo story beats and
  `app-frame` timeline clips. Local-app capture requests also surface deduped
  app launch handoffs with command, cwd, target URL, and readiness metadata so
  agents can start the app before capture when a runner is configured. Callers
  can now opt into a request-scoped `playwright-local` runner that writes
  capture receipts inside the aether workspace, optionally launches the local
  app through the trusted readiness poller, and appears in the preview/provider
  inventory for that request. The route returns a guarded computer-use fallback
  contract with approval, safe scope, redaction labels, expected screenshot /
  recording / trace receipts, and the capture apply route; callers can also
  submit a request-scoped `computer-use-local` receipt runner that requires
  creator approval plus an applied redaction manifest, preserves redaction
  receipts, and applies visual captures into timeline clips. It does not
  register a default desktop-control provider. The timeline setup cards now
  surface that computer-use path as an approval/redaction action when capture is
  otherwise unresolved, with explicit dry-run proof labels for approval,
  redaction, safe scope, and capture receipts.
- `app/api/motion/voice/route.ts` now exposes voiceover and caption-sync
  handoffs through an agent-native JSON boundary: callers send an editable
  project plus voice request or clip ids and receive provider-required
  narration requests, timeline blockers, or completed audio, word-timing, and
  transcript receipts applied back into voice and caption timeline clips.
- `app/api/motion/sync/route.ts` now exposes timeline sync planning through an
  agent-native JSON boundary: callers send an editable project and receive beat
  markers, caption/voice timing links, transition cues, sound cues, blockers,
  and refreshed review/preview plans before render.
- `app/api/motion/image-to-video/route.ts` now exposes the advanced
  image-to-video generation lane through an agent-native JSON boundary:
  callers send an editable project plus generation request or clip ids and
  receive provider-required generation handoffs, visual-source/timeline
  blockers, or completed generated video receipts applied back into the same
  timeline clips while preserving source visual asset provenance.
- `app/api/motion/regenerate/route.ts` now exposes scoped component
  regeneration through an agent-native JSON boundary: callers send an editable
  project, selected clip, scope, and prompt, then receive a planned regeneration
  request plus refreshed review and preview plans without implying that a
  provider has already executed the change.
- `app/api/motion/revise/route.ts` now exposes structured review edits through
  the same agent-native boundary: callers send an editable `MotionProject` plus
  story, component-prop, retime, or component-replacement operations and receive
  the updated project, review plan, preview plan, and capture status while the
  core revision validator rejects unsafe overlaps or unknown components.
- `app/api/motion/render/route.ts` now exposes the Remotion/HyperFrames render
  handoff through an agent-native JSON boundary: callers send an editable
  project plus engine/provider options and receive either a provider-ready
  source/output request, timeline blockers, or completed render receipts applied
  back into the editable export slots. The route lists configured providers and
  does not register a default renderer.
- `app/api/motion/export-pack/route.ts` now exposes export-pack readiness
  through an agent-native JSON boundary: callers send an editable project and
  receive ready/missing platform artifacts, canvas drop candidates, blockers,
  and a pack manifest only when every target has render receipts.
- `app/api/motion/full-auto/route.ts` now runs the saved production queue across
  configured providers: capture, visual-source selection, image-to-video,
  voice, sync, render, and export readiness can complete in one run when
  provider receipts are available. It can also use the request-scoped
  `playwright-local` capture runner for trusted repo/app capture before
  continuing the saved queue, while missing providers or review gates still
  pause with the same creator-facing plan state.
- `lib/motion/capturePlan.ts` now converts capture-first projects into
  provider-ready screenshot, DOM snapshot, interaction trace, optional screen
  recording, local-app launch, and computer-use fallback requests with explicit
  viewport, artifact, setup, app-launch readiness, and provenance expectations.
- `lib/providers/capture/browser.ts` now provides a provider-agnostic browser
  capture boundary: an injected runner can execute the request and Aether
  normalizes the result into typed screenshot/snapshot/trace/recording
  artifacts. It is not auto-registered as the default capture provider.
- `lib/providers/capture/playwright.ts` now supplies an explicit local
  Playwright runner/factory for that boundary: it can run browser steps, save
  screenshots, DOM snapshots, interaction traces, and Playwright video paths as
  file-backed capture receipts when a caller opts into it. It can also call an
  injected app-launch callback before opening the target page, then clean up the
  app session after capture.
- `lib/providers/capture/local-app-launch.ts` now provides that trusted local
  app-launch callback for agent-run capture contexts: it spawns a configured
  command in the repo cwd, polls HTTP readiness, fails if the app exits early,
  and terminates the process after Playwright capture. It is opt-in and is not
  registered automatically from the API route.
- `lib/motion/captureApply.ts` now converts capture results back into the
  editable motion project: visual receipts become demo beat assets and
  `app-frame` timeline props, while every receipt completes the capture graph
  node with typed provenance.
- `lib/motion/renderPlan.ts` now turns an editable timeline into a
  provider-neutral render handoff: engine, composition id, track refs, expected
  MP4/poster/subtitle/transcript/manifest outputs, dimensions, and render graph
  node provenance.
- `lib/motion/renderApply.ts` now converts completed render receipts back into
  editable export assets and the render graph node, so MP4, poster, subtitle,
  transcript, and manifest outputs can return to the canvas/project model.
- `lib/motion/exportPackPlan.ts` now turns editable export slots into a
  creator/agent-readable export pack plan: per-platform readiness, missing
  artifact kinds, video canvas-drop candidates, pack blockers, and a manifest
  descriptor for fully rendered packs.
- `lib/providers/video/render-registry.ts` now defines an opt-in render
  provider registry for Remotion and HyperFrames adapters without registering a
  default renderer.
- `lib/providers/video/local-render.ts` now provides opt-in runner-backed
  Remotion and HyperFrames render providers: engine execution stays injected,
  while Aether normalizes returned files against planned output receipts.
- `lib/motion/renderExecution.ts` now orchestrates the render loop for agents:
  build a render plan/request, call the chosen provider, persist the planned
  render graph node, and apply returned receipts back into editable exports.
  The render request builder is reusable so API routes can return source files
  and expected outputs even before a provider is configured.
- `lib/providers/video/command-render.ts` now supplies concrete local command
  runners for Remotion and HyperFrames: they run engine CLI commands for video
  and poster artifacts, write subtitle/transcript/manifest sidecars, verify
  planned files exist, and return file-backed render receipts.
- `lib/motion/renderSource.ts` now compiles editable timeline render requests
  into provider-neutral source bundles: Remotion entry TSX, HyperFrames
  `index.html`, and source manifests. The generated source now preserves
  component ids and reusable effect tokens for hook, proof, app-frame, trace,
  CTA, caption, and transition clips. Render execution attaches those source
  files to each request, and command runners write them before invoking the
  selected engine.
- `lib/motion/revise.ts` now applies structured timeline revisions for
  review-mode and agent-driven tweaks: story copy, clip props, retiming, and
  component replacement update both the editable project and draft timelines,
  reject unsafe overlaps or unknown components, and persist revision graph
  provenance.
- `lib/motion/imageToVideoPlan.ts` and
  `lib/providers/video/generation-registry.ts` now cover the first advanced
  generation graph slice: asset-backed visual clips become provider-neutral
  image-to-video requests with a planned graph node and opt-in provider
  registry.
- `lib/motion/imageToVideoApply.ts` now converts completed image-to-video
  receipts back into editable timeline and draft clips, preserving the original
  source visual while completing the image-to-video graph node with provider
  provenance.
- `lib/motion/voicePlan.ts` now converts voice-line timeline clips into
  provider-neutral narration requests with expected audio, word-timing, and
  transcript artifacts so captions and render duration can sync against real
  voice receipts later.
- `lib/providers/voice/*` now defines an opt-in voice synthesis provider
  contract and registry without hardcoding a TTS vendor.
- `lib/motion/voiceApply.ts` now converts voice synthesis receipts back into
  editable voice and caption timeline clips, attaching audio, word-timing, and
  transcript asset refs for later render/caption sync.
- `lib/motion/syncPlan.ts` now turns editable timeline tracks into an
  agent-readable sync plan: beat markers, caption/voice timing links,
  transition cues, sound cues, provider requirements, and blockers until voice
  and word-timing receipts exist.
- `lib/motion/fullAutoExecution.ts` now executes ready full-auto gates as a
  saved run, stops on missing providers, blockers, approvals, or max-step
  limits, and reports advanced gates plus receipt counts without creating a
  separate run-history surface.
- `lib/motion/previewPlan.ts` now carries the production queue into the
  creator-facing timeline lens and API responses, giving agents and creators the
  same next action for review mode or full-auto runs without exposing raw route
  calls as the primary surface.
- `lib/motion/previewPlan.ts` also carries a compact image-to-video node plan:
  source visuals, image-to-video generation, generated-clip review, and timeline
  update dependencies are available to agents and shown in the timeline lens as
  progressive disclosure rather than as a separate graph page.
- `docs/explorations/motion-graphics/` already contains reusable HyperFrames
  composition patterns: atlas reveal, by-the-numbers, quote cascade, and photo
  mosaic.
- `lib/tool/registry.ts`, `lib/capability/types.ts`, and
  `lib/workflow/registry.ts` now register draft agent-native motion tools and
  reusable video workflows for repo launch, feature/social, website capture,
  PR explainers, caption overlays, motion graphics, and
  Remotion/HyperFrames portability. The PR-to-video workflow now includes
  voice, timeline-revision, and export-pack gates while staying
  code-change-sourced rather than capture-sourced.
- `lib/motion/workflowSkillCatalog.ts` now gives those workflow skills
  agent-readable recipes: trigger phrases, agent tasks, draft variations,
  component slots, regeneration scopes, generation lanes, review surfaces, and
  review/full-auto policies. This turns the HyperFrames-style `pr-to-video`
  launch pattern into a reusable discovery contract for repo, PR, site,
  feature/social, caption, motion-graphic, and engine-port workflows.
- Workflow skill launch kits now carry concrete review objects: source evidence
  receipts, draft/teaser targets, component regeneration handles, and export
  pack proof objects. The timeline lens surfaces those objects inside the same
  creator shell so review mode can pause on them and full-auto mode still
  leaves editable handles after a run.
- `lib/motion/referencePatterns.ts` now records reusable product-video patterns
  that came out of the launch/demo research pass: launch hooks, real product
  capture, screen zoom callouts, caption-led social cuts, proof receipts,
  code-diff explainers, before/after feature beats, agent traces,
  image-to-video inserts, voice/caption sync, multi-format packs, and reusable
  motion systems. Workflow recipes carry those patterns into API discovery and
  generated `SKILL.md` drafts, so agents know which motion moves to assemble and
  creators can review them before render.
- The reusable component catalog now breaks PR/release code visuals into
  distinct editable primitives: code diff, code highlight, code scroll, and
  code typing. Remotion source emits named renderer functions for each one, and
  HyperFrames source emits stable component classes so review mode can
  regenerate one code visual rather than reworking the full draft.
- Preview plans now expose a source-edit contract for generated motion projects:
  the `/api/motion/source-edit` route, editable `EDIT.md`, `SCRIPT.md`,
  `STORYBOARD.md`, timeline JSON, file roles, component control labels, source
  file labels, and regeneration scopes. The timeline lens renders this inside
  the creator shell so source-backed edits remain reviewable without exposing
  full generated source code as the primary surface.
- Preview plans now expose a render-proof summary that turns saved render
  receipts into reviewable output artifacts: ready/missing MP4, poster,
  subtitles, transcript, and manifest rows, provider labels, edit/rerender
  actions, and export blockers. The timeline lens shows those proof artifacts
  beside the edit source contract without exposing raw render refs.
- Render-proof MP4 receipts now carry canvas drop targets with asset URL,
  dimensions, MIME type, and motion-project provenance. The timeline lens can
  hand those targets to `dropVideoOnCanvas`, placing rendered videos back onto
  the tldraw canvas as native video material.
- Preview plans now expose a canvas-material plan for editable video planning:
  motion-project, story-beat, image-to-video generation-node, render-proof, and
  export-pack cards with creator-facing labels, statuses, and action handles.
  The timeline lens can hand that plan to `dropMotionCanvasMaterialPlanOnCanvas`,
  placing ordinary editable tldraw geo cards back onto the canvas with motion
  provenance.
- Preview plans now also expose a capability setup surface for full-auto
  readiness: capture providers, local-app launch runners, visual sourcing,
  image-to-video, voice/timing, sync blockers, and Remotion/HyperFrames render
  runners are normalized into creator-facing `configured`, `needs provider`,
  `needs runner`, or `blocked` rows. The full-auto route passes configured
  provider inventory into that preview plan so agents and creators see the same
  next setup action before trying to advance saved gates. Setup dry-run
  receipts are now stored in execution history and can move the next capability
  setup card; `/api/motion/full-auto` can save setup-only dry-run receipts for
  local app, computer-use, visual sourcing, image-to-video, voice, and render
  readiness without executing the expensive provider gate, while production
  gates still require real capture, voice, generation, sync, or render
  artifacts. Start handoffs now expose matching setup dry-run templates so an
  agent can run readiness checks before choosing review or full-auto execution.
- `app/api/motion/workflows/route.ts` now exposes those workflow skills through
  an agent-native discovery boundary. Agents can list video workflow skills,
  filter by source kind, engine, or run mode, and receive accepted start
  shorthands, review gates, reusable tool ids, workflow-skill contracts, and
  workflow recipes before creating a motion project. Discovery responses also
  include an installable `SKILL.md` draft per workflow, so a `pr-to-video` style
  skill can be pinned before a concrete repo, PR, or site source is started.
- `lib/canvas/dropVideo.ts` already drops rendered videos onto the tldraw canvas.
- `lib/providers/video/*` currently covers video understanding, render
  provider contracts, command render runners, and image-to-video provider
  planning/registry, while `lib/providers/voice/*` covers voice provider
  contracts. Text-to-video, TTS execution, image-to-video provider execution,
  engine dependency/project scaffolding, and higher-fidelity visual component
  libraries remain future adapter work.
- `convex/schema.ts` already has `sourceItem.kind = repo`, `creatorReference`
  support for video, and `asset` storage, but `asset.kind` lacks first-class
  video, audio, subtitle, poster, and motion-project variants.

## Source scan

| Source | Relevant pattern | Implication for aether |
| --- | --- | --- |
| [HyperFrames pr-to-video launch note](https://x.com/search?q=%22Nobody%20reads%20pull%20requests%22%20%22pr-to-video%22&src=typed_query) | HyperFrames is shipping workflow-specific skills and positioned `pr-to-video` as an agent-written PR explainer installed through `npx skills add heygen-com/hyperframes`. | Treat workflow routing as product surface, not implementation detail: repo launch, website/app capture, PR explainers, overlays/captions, motion graphics, and engine portability should be separate reusable workflows over shared timeline primitives. |
| [iart-ai/motion-skills](https://github.com/iart-ai/motion-skills) | Open-source motion skills are packaged as installable workflow folders with `SKILL.md`, references, and deliver-and-verify loops for contact sheets, frame checks, and encoded video probes. | Aether workflow plans should emit concrete skill manifests and verification requirements, not just prose prompts, so a known workflow can be pinned and replayed agent-natively. |
| [Claude Code](https://claude.com/product/claude-code) | Product narrative is "ask agent, watch it read files, edit, run commands, and preview results" across terminal, IDE, desktop, browser, and Slack. | Add agent-trace video components: prompt chip, file-read stack, diff card, terminal run, preview pane, done state. |
| [Screen Studio](https://www.screen.studio/) | Product demos depend on auto zoom, cursor smoothing, vertical export, captions, transcript, brand presets, sound cleanup, and social export. | Capture and editing matter as much as generation. Add cursor zoom, click rings, keypress overlays, screen crop, captions, and format fanout. |
| [Arcade](https://www.arcade.software/) | AI turns product interactions into on-brand demos, videos, and visual stories from browser, desktop, and Figma capture. | Repo video should show the actual product, not generic stock motion. The capture pipeline needs browser and app-state inputs. |
| [Clueso](https://www.clueso.io/) | Rough screen recordings become product videos and docs; brand fonts, colors, and logos apply across videos. | Store brand motion tokens once and reuse them across every timeline and export. |
| [Revid](https://www.revid.ai/) | Viral social videos are generated from idea to script, scene plan, voices, templates, subtitles, and publish-ready outputs. | Agent workflow needs explicit script, scene, visual style, voice, caption, and platform-pack nodes. |
| [Descript](https://www.descript.com/) | Text and transcript editing remain central even with AI video generation; manual precision and timeline editing coexist. | aether should expose transcript/caption/script edits as timeline edits, not only prompt retries. |
| [Runway](https://runwayml.com/) | Generation spans text/image-to-video, controllable motion, characters, voices, and real-time video agents. | Video generation should be adapter-based clips inside a timeline, not a hardcoded provider or whole-video dependency. |
| [Pika](https://pika.art/) | AI video effects and MCP-style agent access package creative effects as reusable skills. | Treat effects as pinned capabilities with schemas, thumbnails, and provenance. |
| [HeyGen](https://www.heygen.com/) | Product image plus script can become avatar ads, talking photos, translated voice/lip-sync, captions, and B-roll. | Voice, avatars, product placement, translation, and captions need separate providers and editable clips. |
| [Remotion Player](https://www.remotion.dev/docs/player/) and [renderMedia](https://www.remotion.dev/docs/renderer/render-media) | React components can preview video in app; server render can take composition props, frame ranges, concurrency, and artifacts. | Use Remotion for editable React-native timeline preview and deterministic export, alongside existing HyperFrames compositions. |
| [React Flow](https://reactflow.dev/) | Node/edge graphs are good for custom node pipelines, selection, ports, and advanced flow editing. | Use for advanced generation graphs after the timeline primitive exists. Avoid making it the default creator surface. |
| [tldraw custom shapes](https://tldraw.dev/docs/shapes) | Custom shapes can represent domain objects on the canvas. | Add motion-project, timeline preview, generated clip, and export-pack shapes on the canvas. |
| [iart-ai motion-skills](https://github.com/iart-ai/motion-skills) | Public index of 50 open-source motion-agent skills across 14 installable packs for TikTok/Reels/Shorts, YouTube, e-commerce, ads, data animation, explainers, maps, web animation, motion design, kinetic typography, WebGL, Manim, and related workflows. It describes skills as `SKILL.md` plus references, with a deliver-and-verify loop and scripts for frame/contact-sheet/MP4 checks. | Borrow the pack grammar and verification loop, not the repo as a runtime dependency. Make workflow skills, still-frame proof, contact sheets, MP4 probes, and reusable motion components first-class in aether. |
| [HeyGen HyperFrames](https://github.com/heygen-com/hyperframes) | HyperFrames is an HTML-native deterministic video renderer for agents. Its README installs skills with `npx skills add heygen-com/hyperframes`, describes a plan/write/animate/lint/preview/render production loop, lists product launches, PR walkthroughs with animated code diffs, social videos, docs/PDF/website videos, and exposes a registry with app showcase, social overlays, captions, transitions, code-diff/code-highlight/code-typing blocks, and design-system-to-video `frame.md`. The live skills directory now includes workflow folders such as `pr-to-video`, `product-launch-video`, and `website-to-video`; `pr-to-video` is a GitHub PR evidence workflow, not a website scrape. | Keep Aether workflow routing explicit: repo/app launch, website capture, PR/code-change explainer, caption/overlay, motion graphic, and Remotion/HyperFrames portability should be distinct capabilities over shared timeline/render primitives. Add catalog-backed component suggestions and design-token-to-frame translation before final render. |

## Research refresh: launch-video component stack

The current external signal is that the useful unit is a workflow skill, not a
single video model call. HyperFrames' `pr-to-video` launch note matters because
it frames PRs as an input type with its own evidence rules, while product pages
from Claude Code, Screen Studio, Arcade, Clueso, Descript, Runway, Pika, and
HeyGen show that successful app videos combine real product capture, agent
activity proof, scripted narration, captions, brand presets, and manual edit
points.

For aether this means the agent should always produce these reviewable artifacts
before final render:

- Video plan: source, audience, platform, hook, beat order, capture needs,
  voice/caption plan, and export pack.
- Draft variations: primary, proof-first, demo-first, and short-form cuts.
- Component plan: hook card, product/app frame, agent trace, proof/evidence
  card, diff/mechanism card for PRs, captions, voice lines, transitions, CTA.
- Capture plan: screenshots first, real recording only when interaction,
  animation, canvas gesture, or native app behavior needs motion proof.
- Sync plan: narration duration, captions, beat markers, effects, transitions,
  music bed, SFX, and format-safe crop overrides.
- Render proof: still frames/contact sheet, MP4 metadata probe, poster, subtitle
  file, transcript, and provenance manifest.

Full-auto mode can advance through those artifacts without stopping, but it
must still persist them so the creator can review, branch, regenerate a single
component, or roll back. Review mode pauses at each artifact and exposes the
same state in the canvas/timeline shell.

## Workflow skill contract

Workflow-specific launch skills should advertise the reviewable artifacts and
edit handles they produce, not just the tools they call. That keeps
`pr-to-video`, repo launch, website capture, caption overlays, motion graphics,
and engine-port workflows interchangeable while preserving their different
evidence rules.

Each video workflow entry should expose:

- Run modes: `review` and/or `full-auto`.
- Review artifacts: video plan, draft variations, component plan, capture plan,
  sync plan, render proof, and export pack as applicable.
- Regeneration targets: story beat, component, capture, code proof, caption,
  voice line, timing, effect, or explicit whole-video reset.
- Verification artifacts: contact sheet, MP4 probe, poster, subtitles,
  transcript, and provenance manifest.

The agent plan returned to the UI should include that contract directly. Review
mode uses it to pause at the right canvas/timeline gates. Full-auto mode uses it
to continue without stopping while still saving every artifact and regeneration
handle for later review.

## Component taxonomy

These are the reusable blocks the research suggests aether will need.

### Social hook and structure

- Hook card: 0-2 seconds, one promise or product name, optional progress bar.
- Problem beat: compact statement of the pain, gap, or before-state.
- Proof beat: repo facts, benchmark numbers, screenshots, issue/PR stats,
  testimonials, or real product state.
- Demo beat: product in use, agent action trace, capture zoom, or feature flow.
- Payoff beat: after-state, generated output, pack preview, or user result.
- CTA beat: launch link, waitlist, repo, case study, or "thread below".

### Product demo and screen capture

- Browser frame, app frame, device frame, terminal frame, and IDE frame.
- Cursor path, auto zoom, drag zoom, click rings, hover callouts, keypress tags.
- Before/after split, branch compare, diff reveal, test result reveal.
- Screen crop and safe-zone presets for 16:9, 9:16, 1:1, and 4:5.

### Capture, app-use, and recording

This system needs capture tools, but they should feed the canvas and timeline
instead of becoming a screen-recorder dashboard.

- Browser automation: open URLs, authenticate when allowed, click through flows,
  capture DPR 2 screenshots, DOM snapshots, route metadata, cursor targets, and
  viewport-safe crops.
- App automation: launch local dev servers, desktop apps, simulators, or Figma
  files when the product cannot be represented by a website alone.
- Deterministic screenshot-demo path: prefer clean final-state screenshots plus
  synthetic cursor, click ripple, zoom, and captions for editable product demos.
- Screen recording path: use real recording when the product interaction,
  animation, latency, canvas gesture, or native app behavior matters.
- Computer-use fallback: drive the real desktop only when browser/API capture is
  insufficient, then convert the take into editable timeline clips, screenshots,
  cursor metadata, and transcript notes.
- Capture receipts: each screenshot, recording, app step, crop, and coordinate
  target must carry source URL/app/repo, viewport, timestamp, command/session,
  and permission provenance.

For app launch videos, the agent should usually gather stills and state
captures first, show the creator a video plan and draft variations, then record
or use computer control only for the beats that need live motion.

### Agent-native coding story

- User prompt chip.
- Agent activity stack: read, search, edit, run, test, render, commit.
- File tree highlight.
- Diff card with added/removed line focus.
- Terminal command/result card.
- Browser or app preview pane.
- Evidence card: tests passed, artifact rendered, PR opened, export done.

### Repo and app proof

- Repo fact card: stack, languages, releases, test count, routes, components.
- Feature map: product surfaces, capabilities, workflows, output formats.
- Claim receipt: text claim with source ref from README, docs, code, or issue.
- Timeline of shipped milestones.
- Customer or creator quote card, with attribution and source preservation.

### PR and code-change explainers

PR-to-video is a separate repo workflow, not a product capture workflow. The
source is a pull request and its diff, commits, files, reviews, comments, and
contributors. The output is a short code-change explainer for changelogs,
feature reveals, bug fixes, refactors, and release notes.

- PR hook: headline, archetype, audience, base/head refs, merged state.
- File tree and changed-file map: touched areas, language/module grouping.
- Diff hunk card: 4-12 readable lines, before/after, add/remove focus.
- Code animation block: diff, morph, typing, highlight, scroll, terminal/test.
- Mechanism beat: invented diagram showing runtime behavior, not just code.
- Evidence beat: tests, benchmarks, line deltas, shipped/approved state.
- Contributor/credit beat: real author, committers, reviewers, optional avatars.
- CTA beat: read PR, upgrade, pull release, watch changelog, review follow-up.

### Visual generation and B-roll

- Image-to-video clip from a key visual, product image, moodboard, or screenshot.
- Parallax still, depth pan, photo mosaic, atlas reveal, feature carousel.
- Generated cinematic B-roll as optional clips with provider provenance.
- Avatar or talking-photo clip when the app needs spokesperson or localization.
- Product placement clip from product image plus script.

### Voice, captions, and sound

- Script line, narration clip, word-level caption clip, subtitle export.
- Transcript text editor linked to timeline timing.
- Music bed, ducking, beat markers, whoosh/click/success stingers.
- Audio-reactive highlight and effect sync markers.
- Voice translation and localized captions as linked variants.

### Export pack

- MP4, GIF, poster still, thumbnail, subtitle file, transcript, source manifest.
- Platform presets: X, LinkedIn, YouTube Shorts, TikTok, Instagram Reels,
  Product Hunt, website hero, pitch deck embed.
- Linked multiformat edits: global script/timing edits propagate, local crop,
  caption, and safe-zone overrides stay scoped.

## Product shape inside aether

### Creator-facing surface

- Left rail, input taxonomy: repos, sites, app URLs, screenshots, captures,
  references, brand tokens, product facts, competitor videos, social examples.
- Canvas, making substrate: motion project card, video poster, storyboard beat
  cards, captured clips, generated B-roll, export pack previews.
- Video plan lens, output taxonomy: a creator-readable plan with story beats,
  selected components, rough timings, voice/caption plan, needed captures, and
  receipt coverage before any expensive generation.
- Draft variations, output taxonomy: primary, proof-first, and demo-first cuts
  that can be promoted, edited, or regenerated before render.
- Timeline lens, tool taxonomy: tracks and clips for script, screen, B-roll,
  text, captions, voice, music, effects, transitions, and exports.
- Right rail, output/metadata taxonomy: selected clip settings, provenance,
  render states, export pack, and debug drawer under `?debug=1`.
- Bottom composer: scoped commands such as "make this a 30s X launch video",
  "replace scene 3 with the paillette search flow", or "tighten captions".
- Mode control: review mode pauses at plan, draft, capture, voice, timeline, and
  export gates; full-auto mode advances through those same gates but still saves
  every draft, receipt, component choice, and scoped regeneration point.
- Regeneration control: regenerate a selected beat, clip, component, proof card,
  caption pass, or effect. Whole-video regeneration is available only as an
  explicit reset, not the default iteration move.

### Agent-facing capability stack

- `repo_to_launch_brief`: inspect repo/site/readme/docs/screenshots and emit
  grounded claims with source refs.
- `pr_to_video_brief`: inspect a GitHub PR through `gh`, collect PR JSON, full
  diff, files, commits, reviews, comments, line stats, and contributors, then
  emit a grounded code-change brief. This does not use browser capture.
- `write_video_script`: turn app facts plus target platform into script beats.
- `compose_storyboard`: choose scene templates, target durations, and assets.
- `capture_product_demo`: run the app, capture browser or desktop flows, and
  return screenshots, recordings, app-state receipts, cursor coordinates, click
  targets, and crop/safe-zone metadata.
- `find_or_generate_visuals`: collect references, posters, screenshots, B-roll,
  and image-to-video candidates.
- `synthesize_voiceover`: create narration clips and word timings.
- `sync_motion_timeline`: align voice, captions, beat markers, effects,
  transitions, and scene durations.
- `render_motion_pack`: preview, render, posterize, subtitle, and export.
- `revise_motion_project`: make structured timeline edits from natural language.
- `pin_motion_capability`: save a reusable template or effect into the toolbar.

## Core data model

Names are provisional, but the boundaries should be stable.

```ts
type MotionProject = {
  id: string;
  workspaceId: string;
  title: string;
  sourceRefs: ProvenanceRef[];
  brief: MotionBriefV2;
  story: StoryBeat[];
  workflowMode: 'review' | 'full-auto';
  currentDraftId: string;
  drafts: MotionDraft[];
  tracks: TimelineTrack[];
  graphNodes: MotionGraphNode[];
  exports: MotionExport[];
  createdAt: number;
  updatedAt: number;
};

type MotionDraft = {
  id: string;
  label: string;
  angle: string;
  status: 'planned' | 'generating' | 'ready' | 'approved' | 'rejected';
  story: StoryBeat[];
  tracks: TimelineTrack[];
  provenance: ProvenanceRef[];
};

type MotionBriefV2 = {
  projectKind: 'launch' | 'feature' | 'demo' | 'social' | 'case-study' | 'pr';
  appProfile: AppProfile;
  audience: string;
  platformTargets: PlatformTarget[];
  claims: ClaimReceipt[];
  tone: string;
  brandMotion: BrandMotionTokens;
};

type StoryBeat = {
  id: string;
  role: 'hook' | 'problem' | 'proof' | 'demo' | 'payoff' | 'cta';
  narration: string;
  targetSeconds: number;
  selectedAssetIds: string[];
  templateId?: string;
  provenance: ProvenanceRef[];
};

type TimelineTrack = {
  id: string;
  kind: 'screen' | 'broll' | 'text' | 'caption' | 'voice' | 'music' | 'sfx' | 'effect' | 'transition';
  clips: TimelineClip[];
};

type TimelineClip = {
  id: string;
  assetId?: string;
  componentId?: string;
  startFrame: number;
  durationFrames: number;
  inFrame?: number;
  outFrame?: number;
  props: Record<string, unknown>;
  linkedVariantScope?: 'global' | 'format-local';
  provenance: ProvenanceRef[];
};

type MotionGraphNode = {
  id: string;
  kind: 'repo-ingest' | 'pr-ingest' | 'script' | 'storyboard' | 'capture' | 'visual-search' | 'image-to-video' | 'voice' | 'sync' | 'render';
  inputRefs: string[];
  outputRefs: string[];
  providerId?: string;
  status: 'planned' | 'running' | 'done' | 'failed';
  provenance: ProvenanceRef[];
};
```

## Provider split

Do not widen the current video provider into a single vague interface. Split
the contracts by job so providers stay interchangeable and testable.

- `VideoUnderstandingProvider`: already exists.
- `VideoGenerationProvider`: text-to-video, image-to-video, product placement,
  avatar, talking photo, and generative B-roll.
- `VideoRenderProvider`: Remotion and HyperFrames deterministic renders.
- `CodeChangeProvider`: GitHub PR, diff, commit, review, and contributor
  evidence collection via `gh` or connector-backed APIs.
- `ScreenCaptureProvider`: browser, desktop, and app-flow captures.
- `AppUseProvider`: browser/app/computer-use actions that can collect capture
  inputs, but never render final videos directly.
- `VoiceProvider`: TTS, voice cloning where allowed, translation, word timings.
- `MusicProvider`: licensed beds, generated beds, SFX, beat detection.
- `CaptionProvider`: transcription, alignment, translation, subtitle export.

Every provider returns typed provenance, duration, dimensions, mime type,
usage/cost hints, and source asset refs. No provider is a default in code.

The capture split is intentional: capture providers collect real product
evidence, while render providers turn editable timeline data into MP4s. A raw
recording can become a clip, but the preferred demo artifact is still
frame-driven Remotion/HyperFrames output with editable screenshots, cursor
paths, captions, callouts, and timing.

The code-change split is just as important: a PR video should never scrape a
website or invent repo facts. It should ingest PR data once, bake those facts
into a motion project, and build synthetic code/mechanism scenes from grounded
diff hunks and receipts.

## Motion-skills assessment

The `iart-ai/motion-skills` repo is useful as a craft/reference corpus, not as
an aether dependency. The current root repository is an index with a showcase,
14 installable packs, and a useful description of skill anatomy: a skill is a
`SKILL.md` plus references/scripts that teaches one workflow and includes a
deliver-and-verify loop. The verified packs are organized by audience and
medium: TikTok/Reels/Shorts, text-message stories, YouTube, e-commerce, ads,
data animation, explainers, maps, web animation, motion design, kinetic type,
freelance/studio work, WebGL, and Manim.

The important import is the structure:

- Skills are workflow-sized, not model-sized.
- Skills carry references and scripts, so the agent can verify rendered output.
- Packs can be audience-specific while sharing motion fundamentals.
- Visual artifact skills should define how to freeze a frame, build a contact
  sheet, inspect layout, and probe encoded media.

Adopt these as internal aether skills/capabilities with our vocabulary,
provenance, graph persistence, and canvas/timeline surfaces. Do not expose them
as a pile of raw agent instructions or a separate skill console.

## HeyGen HyperFrames assessment

The HeyGen HyperFrames skill pack is directly relevant because it treats HTML,
CSS, media, and seekable animations as deterministic video source that agents
can author. The README's installed-skill path is a production loop: plan the
video, write valid HTML, wire seekable animation, add media, lint, preview, and
render. Its examples include product launch videos, feature announcements, PR
walkthroughs with animated code diffs, narration, and captions, social videos,
docs/PDF/website explainers, and reusable automated motion graphics.

The current registry also shows the component inventory Aether should be able
to map into its own component registry: app showcase, X/Instagram/TikTok/YouTube
social overlays, caption variants, shader and mechanical transitions, device
VFX, code snippets, code diff, code typing, code highlight, flowcharts, and
parallax stills. The `frame.md` direction is especially relevant: translate a
web design system into video-frame rules before the agent composes.

The current `pr-to-video` skill also confirms the product boundary for PR
explainers. It accepts a PR URL, `owner/repo#N`, or "this PR"; ingests PR facts
and a full diff through `gh`; produces `capture/pr.json`, `diff.patch`,
`tokens.json`, `visible-text.txt`, `people.json`, and optional contributor
avatars; then gates narrator scripts, audio, visual section planning, grouped
timeline specs, captions, scene HTML, contact-sheet review, and final MP4
render. That is the evidence model Aether should mirror behind
`CodeChangeProvider`, while still exposing the creator-facing review as a
video plan, drafts, timeline rows, regeneration controls, and export pack.

For aether, the important import is not the exact HyperFrames file layout. It
is the workflow and verification boundary: PR/code-change videos, product
launches, website capture, caption overlays, and motion graphics should share
the same MotionProject, timeline, caption, voice, component registry, render,
and export-pack primitives while choosing the correct evidence provider.

## Review and full-auto gates

The agent should be able to run in either mode against the same graph:

1. Brief gate: grounded repo/app claims, missing facts, and source receipts.
2. Video plan gate: target platform, hook, beats, component choices, capture
   needs, voice plan, music/sync plan, and export formats.
3. Draft gate: primary, proof-first, demo-first, and short-form variations with
   approximate timings and storyboard frames.
4. Capture gate: screenshots, recordings, coordinates, app state, and any
   computer-use notes before expensive rendering.
5. Timeline gate: editable tracks and clips, captions, voice, transitions,
   effects, and scoped regeneration handles.
6. Verification gate: stills/contact sheet for hook, reveal/demo, CTA, plus MP4
   spec probe after render.

Full-auto mode advances through these gates and saves artifacts; review mode
stops at each gate for creator approval. Regeneration should target a selected
beat, component, capture, caption pass, voice line, transition, or effect before
falling back to whole-video regeneration.

## Timeline first, node graph second

Recommended approach:

1. Build the timeline primitive first. It gives the creator editability,
   deterministic rendering, and a stable preview.
2. Store execution and generation lineage as a graph, but disclose it as
   provenance, debug, or advanced editing.
3. Introduce a node editor only when image-to-video, capture, voice, and render
   chains need manual rewiring.

This keeps aether creator-first. A node-only first version would quickly look
like an operator workbench; an AI-video-only first version would be fast but
would produce hard-to-edit outputs.

## Phased implementation

### Phase 0: corpus and taxonomy

- Collect 20-30 launch/demo/social videos from X, YouTube, product pages, and
  app websites.
- Tag each with hook, screen capture, agent trace, product proof, B-roll,
  voice, captions, effects, pacing, CTA, and platform format.
- Add screenshots or thumbnails to a local research artifact, not `outputs/`
  unless the files are intentionally archived.
- Outcome: component inventory and two reference moodboards on canvas.

### Phase 1: MotionBrief v2 from repos

- Extend repo facts into app profile, launch claims, feature map, and receipts.
- Generate `MotionBriefV2` and `StoryBeat[]` without rendering.
- Start with aether, accrue, tong, and paillette fixtures.
- Tests: repo facts to claims, claims to story beats, no invented numbers,
  source refs preserved.

### Phase 1A: PR-to-video evidence model

- Add PR/code-change facts as a sibling to repo/app facts.
- Ingest PR JSON, diff hunks, changed files, commits, reviews, comments,
  approvals, test/CI evidence, and contributors through a provider seam.
- Add code-change story beats: hook, problem/change, diff, mechanism, evidence,
  impact, credits, CTA.
- Tests: PR facts to story beats, large PR file-list pagination, no fabricated
  diff hunks, mechanism beats never cite screenshots as evidence.

### Phase 2: component registry

- Create a registry for motion components with schema, thumbnail, supported
  aspect ratios, render engines, input asset kinds, and edit controls.
- Port current HyperFrames patterns into registry entries.
- Add Remotion components for app frame, terminal frame, diff card, captions,
  and product CTA.
- Tests: schema validation, prop defaults, static frame render checks.

### Phase 3: timeline lens

- Add `MotionProject`, `TimelineTrack`, and `TimelineClip` persistence.
- Enable the existing `timeline` lens in the single synthesis shell.
- Embed Remotion Player for preview; use HyperFrames preview only for legacy
  HTML compositions.
- Add tldraw shapes for motion project, video poster, beat card, and export pack.
- Tests: create project, edit text/timing, reorder clips, undo, provenance.

### Phase 4: capture and app-use lane

- Add provider contracts for browser screenshots, app-flow capture, screen
  recording, and computer-use fallback.
- Start with deterministic screenshot-driven product demos: DPR 2 captures,
  route/app receipts, cursor target coordinates, and safe-zone crops.
- Store captures as canvas assets and timeline-ready clips with provenance.
- Tests: provider availability, artifact metadata, coordinate mapping, no
  hardcoded browser/app provider, debug details hidden by default.

### Phase 5: render pipeline

- Add `VideoRenderProvider` adapters for Remotion and HyperFrames.
- Render MP4, poster still, subtitles, transcript, and manifest.
- Register outputs as assets and drop them onto the canvas.
- Tests: render contract, frame-range smoke, poster generation, manifest refs.

### Phase 6: agent-native workflow

- Register motion tools as reusable capabilities.
- Let the bottom composer create and revise motion projects from instructions.
- Add human validation gates before final render/export.
- Tests: mocked end-to-end path from repo URL to timeline preview to export.

### Phase 7: image-to-video and advanced graph

- Add `VideoGenerationProvider` adapters behind config.
- Model generated clips as timeline assets with prompts, seed, source image,
  provider, duration, dimensions, and safety/rights metadata.
- Add optional React Flow graph for advanced users and debug views.
- Tests: adapter contract with fixture responses, graph node provenance,
  timeline insertion and replacement.

### Phase 8: multiformat launch pack

- Add linked format variants: 16:9, 9:16, 1:1, 4:5.
- Add global edits plus local crop/caption/safe-zone overrides.
- Export platform packs with manifests.
- Tests: format fanout, local override isolation, caption fit, poster previews.

## First build slice

The smallest useful slice is not image-to-video. It is:

1. `MotionBriefV2` and `StoryBeat[]` for repo-to-launch videos.
2. A registry with 5 components: hook card, app frame, agent trace, proof card,
   and CTA.
3. A screenshot-driven demo capture contract with route/app receipts and cursor
   coordinate metadata.
4. A simple timeline preview backed by Remotion Player.
5. One render path to MP4 and poster.
6. One fixture each for aether, tong, paillette, and accrue.

The next adjacent slice after this is PR-to-video: PR evidence ingestion,
diff/mechanism storyboard beats, code-change components, and the same editable
timeline/render/export path.

That slice proves the core loop: point aether at a repo, let the agent write
the script and assemble an editable video, then let the creator tweak text,
timing, assets, and export format before rendering.

## Example app directions

- aether: agent writes from repo evidence, shows canvas generation, promotes a
  key visual, fans out formats, pins a capability, exports a pack.
- tong: city-specific Tokyo launch, using cheki, tickets, physical ephemera,
  and memory artifacts instead of generic language-app screens.
- paillette: open-access art search, provenance, museum moodboard, visual
  comparison, exportable showcase.
- accrue: repo/product credibility video using grounded app claims and a
  feature narrative, not generic finance-product B-roll.

## Validation gates

- Unit: brief/schema transforms, story beat generation, no invented numbers,
  provider availability, component registry validation.
- Component: timeline lens creates clips, edits timing/text, shows provenance,
  preserves the bottom composer.
- Render: key-frame screenshots have non-overlapping text, captions fit,
  poster renders, audio duration matches timeline, no blank frames.
- E2E: repo URL to editable timeline to MP4/poster/export manifest.
- Human: watch first aether and one non-aether rendered video before widening
  the component set.

## Open decisions

- Remotion should likely own in-app editable timeline preview. HyperFrames
  should remain useful for compact HTML motion components and existing
  explorations.
- React Flow should not ship as the default editing surface. Use it when there
  is a real advanced need to rewire generation chains.
- The first corpus pass should decide whether aether needs a dedicated
  "agent trace" visual language or whether repo/app proof components are enough.
- Voice cloning, avatars, and talking photos need consent and rights policy
  before becoming default tools.

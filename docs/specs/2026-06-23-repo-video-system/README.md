# Repo-to-video motion system

- Date: 2026-06-23
- Status: planning
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

## Existing aether foundation

- `docs/DESIGN-SOCIAL-CANVAS.md` already defines video as material from the
  same workspace inputs, compiled from a motion brief, rendered offline, and
  dropped back on canvas.
- `components/header/ViewSwitcher.tsx` and `components/workspace/TimelineLens.tsx`
  now expose the `timeline` lens inside the single synthesis shell; `graph`
  remains reserved for advanced provenance/generation editing.
- `lib/motion/brief.ts`, `lib/motion/compile.ts`, and `scripts/render-motion.ts`
  already turn a narrow quote-based `MotionBrief` into a HyperFrames project.
- `lib/motion/project.ts`, `storyboard.ts`, `repoMotion.ts`, `siteMotion.ts`,
  `timeline.ts`, `componentRegistry.ts`, `reviewPlan.ts`, `workflowPlan.ts`,
  `workflowRouter.ts`, and `start.ts` now cover the first
  repo-to-motion-project slice: sourced claims, story beats, draft variations,
  timeline tracks, editable component slots, scoped regeneration requests,
  workflow routing, agent-readable workflow gates, and the start artifact an
  agent can hand to the creator for review or full-auto progression. Repo and
  site/app URL sources can now create editable project starts; real screen
  capture and recording remain provider execution work.
- `lib/motion/capturePlan.ts` now converts capture-first projects into
  provider-ready screenshot, DOM snapshot, interaction trace, optional screen
  recording, and computer-use fallback requests with explicit viewport,
  artifact, and provenance expectations.
- `lib/providers/capture/browser.ts` now provides a provider-agnostic browser
  capture boundary: an injected runner can execute the request and Aether
  normalizes the result into typed screenshot/snapshot/trace/recording
  artifacts. It is not auto-registered as the default capture provider.
- `lib/providers/capture/playwright.ts` now supplies an explicit local
  Playwright runner/factory for that boundary: it can run browser steps, save
  screenshots, DOM snapshots, interaction traces, and Playwright video paths as
  file-backed capture receipts when a caller opts into it.
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
- `lib/providers/video/render-registry.ts` now defines an opt-in render
  provider registry for Remotion and HyperFrames adapters without registering a
  default renderer.
- `lib/providers/video/local-render.ts` now provides opt-in runner-backed
  Remotion and HyperFrames render providers: engine execution stays injected,
  while Aether normalizes returned files against planned output receipts.
- `lib/motion/renderExecution.ts` now orchestrates the render loop for agents:
  build a render plan/request, call the chosen provider, persist the planned
  render graph node, and apply returned receipts back into editable exports.
- `lib/providers/video/command-render.ts` now supplies concrete local command
  runners for Remotion and HyperFrames: they run engine CLI commands for video
  and poster artifacts, write subtitle/transcript/manifest sidecars, verify
  planned files exist, and return file-backed render receipts.
- `lib/motion/imageToVideoPlan.ts` and
  `lib/providers/video/generation-registry.ts` now cover the first advanced
  generation graph slice: asset-backed visual clips become provider-neutral
  image-to-video requests with a planned graph node and opt-in provider
  registry.
- `lib/motion/voicePlan.ts` now converts voice-line timeline clips into
  provider-neutral narration requests with expected audio, word-timing, and
  transcript artifacts so captions and render duration can sync against real
  voice receipts later.
- `lib/providers/voice/*` now defines an opt-in voice synthesis provider
  contract and registry without hardcoding a TTS vendor.
- `lib/motion/voiceApply.ts` now converts voice synthesis receipts back into
  editable voice and caption timeline clips, attaching audio, word-timing, and
  transcript asset refs for later render/caption sync.
- `docs/explorations/motion-graphics/` already contains reusable HyperFrames
  composition patterns: atlas reveal, by-the-numbers, quote cascade, and photo
  mosaic.
- `lib/tool/registry.ts`, `lib/capability/types.ts`, and
  `lib/workflow/registry.ts` now register draft agent-native motion tools and
  reusable video workflows for repo launch, feature/social, website capture,
  PR explainers, caption overlays, motion graphics, and
  Remotion/HyperFrames portability.
- `lib/canvas/dropVideo.ts` already drops rendered videos onto the tldraw canvas.
- `lib/providers/video/*` currently covers video understanding, render
  provider contracts, command render runners, and image-to-video provider
  planning/registry, while `lib/providers/voice/*` covers voice provider
  contracts. Text-to-video, TTS execution, generated clip application, and
  timeline compilation into engine source files remain future adapter work.
- `convex/schema.ts` already has `sourceItem.kind = repo`, `creatorReference`
  support for video, and `asset` storage, but `asset.kind` lacks first-class
  video, audio, subtitle, poster, and motion-project variants.

## Source scan

| Source | Relevant pattern | Implication for aether |
| --- | --- | --- |
| [HyperFrames pr-to-video launch note](https://x.com/search?q=%22Nobody%20reads%20pull%20requests%22%20%22pr-to-video%22&src=typed_query) | HyperFrames is shipping workflow-specific skills and positioned `pr-to-video` as an agent-written PR explainer installed through `npx skills add heygen-com/hyperframes`. | Treat workflow routing as product surface, not implementation detail: repo launch, website/app capture, PR explainers, overlays/captions, motion graphics, and engine portability should be separate reusable workflows over shared timeline primitives. |
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
| [iart-ai motion-skills](https://github.com/iart-ai/motion-skills) | Public index of motion-agent skills. The useful packs for aether are `launch-video`, `product-demo-video`, `short-form-video`, `remotion-video`, `beat-sync-editing`, `shot-composition`, and `motion-art-direction`. | Borrow the agent workflow grammar and verification loop, not the repo as a runtime dependency. Make plan, still-frame proof, contact sheet, MP4 probe, and reusable skill packs first-class in aether. |
| [HeyGen HyperFrames](https://github.com/heygen-com/hyperframes) | HyperFrames now ships workflow skills including `product-launch-video`, `website-to-video`, `pr-to-video`, `embedded-captions`, `graphic-overlays`, `motion-graphics`, and `remotion-to-hyperframes`. `pr-to-video` reads PR facts through `gh`, not site capture. | Mirror the workflow router in aether: product/app launch, website/app capture, PR/code-change explainer, footage caption/overlay, motion graphic, and Remotion/HyperFrames portability should be distinct capabilities with shared timeline/render primitives. |

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
an aether dependency. The root repository is an index with a showcase and
verification scripts. The reusable material lives in the linked skill-pack
repos:

- `ad-video-skills/launch-video`: hook, tease, reveal, feature montage, end-card
  arc; music/drop-first timing; multi-aspect export checks.
- `ecommerce-video-skills/product-demo-video`: screenshot-driven app demos with
  Playwright capture, browser/device frames, synthetic cursor paths, click
  ripples, zooms, callouts, captions, and screen transitions.
- `tiktok-video-skills/short-form-video`: hook, retention, pattern interrupts,
  loop seams, and 9:16 safe areas.
- `motion-design-skills/remotion-video`: frame-driven Remotion composition,
  zod props, `Sequence`, `Series`, still-frame verification, and deterministic
  rendering.
- `motion-design-skills/beat-sync-editing`,
  `motion-design-skills/shot-composition`, and
  `motion-design-skills/motion-art-direction`: edit-timing plans, safe areas,
  motion personality, focal hierarchy, and transition language.

Adopt these as internal aether skills/capabilities with our vocabulary,
provenance, graph persistence, and canvas/timeline surfaces. Do not expose them
as a pile of raw agent instructions or a separate skill console.

## HeyGen HyperFrames assessment

The HeyGen HyperFrames skill pack is directly relevant because it has moved
from generic "HTML to video" guidance into workflow-specific skills. Its router
keeps product launch, website capture, PR explainer, captioning existing
footage, graphic overlays, motion graphics, and Remotion-to-HyperFrames
portability separate.

The `pr-to-video` workflow adds a useful model for aether:

- Treat GitHub PRs as a first-class input beside repos, URLs, screenshots, and
  app captures.
- Use `gh`/GitHub evidence to create PR JSON, a full diff patch, a bounded text
  brief, and optional contributor avatars.
- Pick a narrative archetype: changelog, feature reveal, fix explainer, or
  refactor walkthrough.
- Alternate code beats with mechanism beats. Code beats show real hunks; the
  mechanism beat explains runtime behavior through an invented diagram.
- Gate plan, storyboard/script, visual design, frame build, validation, preview,
  and render separately.

For aether, the important import is not the exact HyperFrames file layout. It
is the workflow boundary: PR/code-change videos should share the same
MotionProject, timeline, caption, voice, component registry, render, and export
pack primitives, while sourcing evidence from `CodeChangeProvider` instead of
`ScreenCaptureProvider`.

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

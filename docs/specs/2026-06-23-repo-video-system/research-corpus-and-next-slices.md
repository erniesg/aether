# Repo video research matrix and next slices

- Date: 2026-06-24
- Status: active plan
- Scope: turn repo, PR, app, site, upload, and reference sources into editable launch, feature, demo, PR explainer, and social videos

## Proof boundary

This pass used accessible official product pages, public GitHub repositories,
and the existing Aether motion implementation. Direct X corpus review still
needs an authenticated browser pass because public text fetches do not reliably
expose video posts, playback, or attached media. Treat this file as the
implementation plan for the next product slices, not as the final taste corpus.
The typed seed corpus lives in `lib/motion/referenceCorpus.ts`.

## Research signals

| Source | Observed primitive | Aether implication |
| --- | --- | --- |
| HyperFrames skills repo, `heygen-com/hyperframes/skills` | Narrow installable workflows: `pr-to-video`, `product-launch-video`, `website-to-video`, captions, overlays, media, registry, and Remotion-to-HyperFrames portability. | Keep Aether workflows as small reusable skills over one `MotionProject`, not one generic video generator. |
| HyperFrames local skill guidance | HTML source of truth, `data-start`, `data-duration`, `data-track-index`, layout before animation, deterministic GSAP timelines, lint/validate/contact-sheet checks. | Source bundles need stable edit contracts and validation receipts, not opaque rendered MP4s. |
| `iart-ai/motion-skills` | Skill packs encode motion craft for agents and ship deliver-and-verify loops: render frame, screenshot, inspect, contact sheet, probe MP4. | Every Aether motion skill should include verifier artifacts and self-review steps before export. |
| Screen Studio | Real screen recordings become polished product demos with auto zoom, cursor smoothing, vertical exports, manual timeline zoom edits, webcam/audio, transcript, subtitles, presets, GIF/MP4 export. | Add first-class cursor, zoom, crop, transcript, device frame, and export-preset tracks to capture-backed projects. |
| Clueso | Raw screen recordings become product videos and docs; AI rewrites scripts, swaps voiceovers, adds smart zooms/captions/templates, then creators customize flow, voice, visuals, and export/share. | Review/full-auto gates should be symmetric: AI drafts everything, creator can edit script, voice, flow, visuals, and docs before export. |
| Arcade | Product story starts from actual product and brand, then fans out into interactive demos, videos, visuals, branching, hotspots/callouts, voiceovers, custom links, downloads, and analytics. | Aether should keep "video" compatible with future interactive demo artifacts: hotspots and callouts are timeline nodes with optional link/action metadata. |
| Descript | AI co-editor can write/edit scripts, apply layouts and transitions, generate B-roll/social video, edit from transcript, add captions, avatars, regenerate speech, and use a timeline for precision edits. | Script and transcript must remain editable sources, not derived text. Regenerating one line should update voice, captions, mouth/avatar, and timeline links. |
| Anthropic computer use | Agents can perceive screens, move cursors, click, type, and automate workflows, but the capability is explicitly experimental and should start with low-risk tasks. | Browser/computer-use capture needs an explicit trusted runner setup, permission gate, scrubbed receipts, and safe fallbacks before full-auto capture. |
| Remotion docs | Remotion is agent-friendly, component-based, previewable, renderable, and has product surfaces for Player, Timeline, Recorder, captions, and parametrized videos. | Remotion should be an adapter and in-app preview surface over provider-neutral component ids, not a separate video product mode. |

## Component taxonomy to support

The current registry already covers many launch and PR primitives. The research
adds pressure for these groups to become explicit, reusable, and regenerable:

- **Product capture:** app frame, device frame, browser chrome, desktop window,
  mobile mirror, canvas capture, before/after capture, crop, and safe-zone
  variants.
- **Attention guidance:** cursor path, cursor size, click pulse, hotspot,
  zoom segment, pan segment, spotlight, mask reveal, keyboard shortcut, and
  manual zoom override.
- **Script and speech:** script beat, transcript segment, voice line, word
  timing, caption group, translation/localization variant, filler-word edit,
  regenerate speech, avatar/presenter bubble.
- **Proof and developer evidence:** repo claim card, PR diff card, code
  highlight, terminal command, CI/test receipt, agent trace, render proof,
  source manifest, contact sheet, MP4 probe.
- **Visual generation:** key visual, image-to-video node, generated B-roll,
  data visual, diagram/flowchart, static-to-motion insert, branded background,
  intro/outro, logo motion.
- **Interactive/demo layer:** hotspot, branch choice, chapter marker, custom
  link target, embed target, analytics marker. These can render as video now
  and later become interactive exports.
- **Format and distribution:** X vertical, LinkedIn feed, website demo,
  YouTube widescreen, GIF, poster, subtitles, transcript, export pack, share
  link manifest.

## Current Aether state

Aether now has the right backbone:

- `MotionProject` carries source refs, claims, story beats, timeline tracks,
  graph nodes, drafts, export slots, execution history, and typed provenance.
- Start routes accept repo URL/path, PR, site URL, upload/reference/source-set
  shorthands and return review plans, preview plans, capture plans, handoff
  templates, and requested inputs.
- Capture, image-to-video, voice, sync, render, source-edit, export-pack, and
  full-auto routes are agent-native JSON boundaries over the same project.
- The timeline lens shows creator-facing plans, drafts, timeline rows,
  production queue, saved receipts, edit source, image-to-video node chain,
  source-backed playable preview controls, component focus, setup cards,
  advanced generation node lens, component controls, scoped regeneration,
  drop-to-canvas actions, and full-auto action wiring.
- Remotion and HyperFrames source generation preserve component ids and edit
  contracts in source bundles.

## Gaps that still matter

1. **Authenticated taste corpus.** Aether still needs a saved corpus of X,
   YouTube, product-site, and launch-post examples tagged for hook, capture,
   caption, voice, effect, transition, CTA, proof, platform, and format.
2. **Runner setup as creator material.** The trusted local app, browser,
   desktop/computer-use, voice, image-to-video, and render runners need a
   creator-facing setup card with permission, expected receipt, and dry-run
   proof before full-auto.
3. **Real preview runtime.** The timeline lens now has a source-backed preview
   shell with frame scrubbing, component focus, and explicit Remotion Player /
   HyperFrames iframe runtime targets. The preview-source route now returns the
   source package for those targets, but Aether still needs the real mounted
   Player or iframe once runtime dependencies are configured.
4. **Node graph for generation lanes.** The timeline now opens a progressive
   generation node lens for visual sources, image-to-video, voice, sync,
   render, and export dependencies. It still needs richer replace-source
   actions and deeper provider receipt wiring before it can cover every
   advanced generation workflow.
5. **Computer-use recording lane.** Aether can plan and locally run browser
   capture, but desktop/computer-use recording needs explicit low-risk
   workflows, permission boundaries, redaction, and receipt review.
6. **Interactive-demo compatibility.** Hotspots, chapters, branches, and share
   links should be stored now so a video project can later export as an
   interactive demo without rebuilding the story.
7. **Corpus-driven component gaps.** Device/avatar/logo/flowchart/social proof
   primitives should be added based on tagged examples, not speculative UI.

## Next implementation slices

### Slice A: Research corpus artifact

Add a typed `MotionReferenceCorpus` and saved example fixture under the repo
video spec. It should store source URL, platform, source kind, observed video
format, transcript or shot notes, component tags, style tags, and Aether
component ids. The first fixture can use accessible pages; authenticated X
videos become a follow-up import.

Acceptance evidence:

- Unit tests validate required source URL, tags, component ids, and proof
  boundary labels.
- Spec fixture includes at least HyperFrames, iart, Screen Studio, Clueso,
  Arcade, Descript, Anthropic computer use, and Remotion docs.

### Slice B: Runner setup cards in the timeline lens

Convert provider setup rows into actionable creator cards: enable local app
launch, run browser capture dry-run, add voice provider, add image-to-video
provider, add Remotion/HyperFrames renderer, or choose review-only. Each card
must show expected receipts, permission scope, and whether full-auto can
continue after it completes.

Acceptance evidence:

- Timeline tests cover setup cards without exposing raw provider ids or request
  JSON.
- Full-auto tests prove the next actionable card changes after each receipt.

### Slice C: Playable preview and source-backed edits

Mount a preview player inside the timeline lens for source bundles. Remotion
uses `Player`; HyperFrames uses the compiled HTML preview frame. Selecting a
component should focus the timeline row and expose edit controls for script,
caption, timing, effect, crop, zoom, or regenerate component.

Status: partially implemented. The timeline lens now includes a source-backed
preview shell with frame scrubbing, selected component focus, source file
summary, linked clip edit controls, and a typed runtime target for Remotion
`Player` or a HyperFrames iframe. `/api/motion/preview-source` now returns the
source-ready package for those targets, and the timeline lens can request that
package from the selected draft/engine. The actual mounted preview runtime
remains follow-up work.

Acceptance evidence:

- Component tests prove the player is same-shell and rails stay mounted.
- Source-edit route tests prove `SCRIPT.md`, `STORYBOARD.md`, timeline JSON,
  and `EDIT.md` round-trip into `MotionProject`.

### Slice D: Advanced generation node lens

Add a progressive node lens for visual search, image-to-video, voice, sync,
render, and export dependencies. The primary timeline stays artifact-first;
the node lens is for creators and agents who need to regenerate a node,
replace a source asset, or inspect why full-auto paused.

Status: partially implemented. The node lens now opens from the timeline,
keeps the graph route unavailable, and shows creator-facing node cards for
visual sources, image-to-video, voice and captions, timeline sync, render
proof, and export pack dependencies. Replace-source actions and richer
provider-specific receipts remain follow-up work.

Acceptance evidence:

- Node lens only appears from the timeline or debug affordance, not as a new
  route.
- Tests verify each node has input refs, output refs, provider status, receipt
  labels, and a creator-facing regenerate action.

### Slice E: Computer-use capture workflow

Add a `computer-use-capture` workflow skill and provider contract that records
desktop/browser actions as a safe capture source. It must require explicit
permission, redact secrets, save screenshots/video/trace receipts, and stop on
unknown external actions.

Acceptance evidence:

- Route tests cover permission missing, redaction manifest required, and
  receipt application.
- The timeline lens shows captured artifacts, not raw traces, unless
  `?debug=1`.

## Review vs full-auto behavior

- **Review mode:** AI proposes the video plan, drafts, captures, scripts,
  generation nodes, voice, sync, render proof, and export pack. The creator
  can pick variations, edit clips, regenerate a component, approve provider
  setup, and export.
- **Full-auto mode:** AI advances through any gate with configured provider
  receipts and no missing permission. It pauses at source uncertainty,
  provider setup, unsafe capture/computer-use, unknown claims, or failed
  verification. The pause state is shown as a creator-facing next action, not
  an execution log.

## Design constraint

Everything above must remain inside Aether's single synthesis shell. The
timeline, node lens, setup cards, preview player, source-edit contract, and
export pack are canvas/timeline material. Raw traces, request JSON, provider
ids, and health checks belong behind debug disclosure only.

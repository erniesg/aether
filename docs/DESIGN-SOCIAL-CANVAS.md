# Design: the social canvas build-out

Date: 2026-06-10 · Branch: `feat/social-canvas-buildout`
Audience: anyone implementing the next slices of aether.

## Who this is for, restated

Creators, freelancers, agencies, small businesses, brands. The job: turn **any
starting material** — an idea, a product, a brand, a pile of social signals —
into a themed pack of socials across formats, with video in the same flow.

Three entry paths, one workspace (hard rule 1: never split routes):

| Path | Material | What exists | What's missing |
|---|---|---|---|
| **Start from brand/product** | URL, assets, claims | brand ingest, offer/campaign profiles, brand-aware generation | nothing structural — polish only |
| **Start from signals/research** | event recaps, vibes runs (event \| brand \| product \| topic) | full research pipeline + `/events/[eventId]` + `/vibes` pages | **no seam into the canvas** — research output never becomes workspace input |
| **Start anew** | a prompt | seeded artboards + composer + fan-out | layered editing after the first render |

The build-out closes the two structural gaps (signals seam, layered editing)
and gives video a real lane.

## 1. Signals → canvas seam

### Product shape

Research output is **input material**, so it lands in the left rail (taxonomy
rule 3) — not a new lens, not a new route. The Research section gains a
**recaps** group: one row per researched subject (event, brand, product,
topic), each row a label + post-count chip, expanding to its themes
(progressive disclosure, rule 5). Each theme row has one action: **pull**.

Pulling a theme converts its strongest evidence into pinned references:

```
EventTheme                    → cluster identity (ref.clusterId = storyId|themeId)
EventPost.media[]             → ReferenceRecord previewUrl/fullUrl
EventPost author + platform   → ReferenceRecord.attribution (always preserved)
EventTheme.label + keywords   → ref.title + tags
reachScore ordering           → top-N selection (default 6 per theme)
```

References are the existing currency — they already flow into clusters,
prompt context, and the composer's active-input-set. No new pipeline; the
seam is one adapter + one rail affordance. A "pull all" on the subject row
imports every theme. Re-pulling dedupes on `fullUrl` (store already does).

This works identically for events and brands/products because the vibes
planner already types subjects as `event | brand | product | topic`
(`lib/research/vibes/plan.ts`) and everything downstream is EventTheme/
EventPost shaped regardless of subject kind.

### Slice acceptance (TDD)

- `lib/research/recap-to-references.ts`: pure adapter, unit-tested —
  theme+posts → `ReferenceRecord[]`, ordered by reachScore, capped, deduped,
  attribution always present, media-less posts skipped.
- Rail: recaps group renders subjects from the events store; pull adds
  references via `addReference`; summary chip counts pulled refs.
  Component test drives the click path.

## 2. Layered image editing

### Evaluation: segment-then-infill vs layer-by-layer

**A — decompose (segment → infill background).** Take any image already on
canvas — generated hero, imported reference, scraped event photo. SAM3
produces subject mask + alpha cutout (shipped). A provider `edit()` call
infills the masked hole, producing a clean **background plate**. The single
image is replaced by a **layer group**: background plate + subject cutout,
independently movable/editable, provenance on each.

- Works on *all three entry paths* (imported material especially — matches
  the demo thesis: SAM3 for imported-image editing).
- One segmentation + one infill call; photographic coherence is free because
  both layers share one source.
- Uniquely good for multi-format: the background plate can be extended per
  aspect ratio while the subject stays pinned to its safe zone — true native
  variants instead of naive crops.

**B — layer-by-layer build.** Generate background, then subject with
transparent ground, compose upward. Maximum control, fully parametric — but
coherent lighting across independently generated layers is the hard problem,
provider transparent-output support is uneven, and it costs N calls before
anything is on canvas.

**Decision: A is the primary path; B arrives later as a composer mode on the
same layer model.** The data model must not care where a layer came from —
that is the real deliverable. A layer group is a frame-scoped tldraw group of
image shapes with typed roles:

```
LayerRole = 'background' | 'subject' | 'overlay'
```

Text overlays (AetherTextShape) already behave as the `overlay` role; this
formalizes the stack beneath them.

### Provider gap

`ImageGenProvider.edit?(req: ImageEditRequest{ sourceUrl, maskUrl })` is
declared in `lib/providers/image/types.ts` but **no adapter implements it**.
Implement `edit` on at least two adapters (OpenAI images/edits with mask;
Replicate FLUX-fill class) behind the existing registry — no hardcoded
default model (rule 7). Mask semantics normalized at the adapter boundary
(subject mask in → provider-specific mask convention out).

### Slice acceptance (TDD)

- Contract tests: `edit()` on two adapters — mask + prompt produce an
  `ImageGenResult`; unavailable env reports unavailability, never throws raw.
- `lib/canvas/decomposeToLayers.ts`: orchestration — segment (cutout) →
  infill (edit with subject mask, fill-behind prompt) → returns
  `{ background, subject, bbox }`; unit-tested with mocked providers.
- Canvas: "split layers" action on a selected image replaces it with the
  group (subject positioned by bbox, background beneath), records
  provenance, undo restores the original. Component-level test for the
  action wiring.

## 3. Video in the narrative

Motion is not a separate product (rule 2) — it is another output the same
inputs feed. The four HyperFrames compositions
(`docs/explorations/motion-graphics/`) are recap-shaped but content-hardcoded.

### Product shape

A **motion brief** is assembled from workspace material — recap themes,
pulled references, brand palette/voice, or auto-mode variations — and
compiled into a HyperFrames composition. Rendering happens offline
(HyperFrames CLI); the rendered MP4 + poster register as a workspace asset
and land on canvas inside a 9:16 frame like any other artifact, with
provenance pointing at the brief.

This slice scopes to one composition wired end-to-end:

- `lib/motion/brief.ts`: `MotionBrief` type + builders from
  (a) an event recap bundle and (b) brand + references. Unit-tested.
- `lib/motion/compile.ts` + `scripts/render-motion.ts`: brief → HyperFrames
  project dir (data-injected variant of an exploration composition) →
  render → `outputs/motion/<id>/`.
- Canvas placement of the rendered asset (poster card until playback).

Timeline editing, audio reactivity, more compositions: explicitly out of
scope here.

## Non-goals (this build-out)

- No new routes or lenses; everything lands in the existing shell.
- No posting/scheduling changes (Q5 owns that).
- No in-app video editor.
- No speculative provider options — two `edit` adapters, registry-resolved.

## Sequence

1. Signals seam (smallest, unblocks demo narrative: research → canvas).
2. Layer decomposition (provider `edit` first, then orchestration, then UI).
3. Motion brief + one wired composition.

Each slice ships red → green with its own commits; `npm run typecheck`,
`npm test` (scoped), and the relevant component/e2e specs are the gate.

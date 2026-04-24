# Handoff — Phase 41 spatial wire

Date: 2026-04-24
Branch: `phase/41-spatial-wire`
Worktree: `/Users/erniesg/code/erniesg/aether-phase41-spatial-wire`
Based on: `phase/39-capability-factory-foundation` (PR #42)

## What this slice does

1. Reconciles the two parallel spatial efforts that were both touching
   `lib/providers/spatial/*`:
   - the draft seam on `phase/39-capability-factory-foundation` (PR #42)
   - the real Replicate + Modal providers that the autonomous agent landed on
     `claude/issue-49-20260423-1939` (PR #50)
2. Wires the capability factory's `author-tool` lane to pick a real provider
   when one is connected, falling back to the local draft preview otherwise.
3. Unblocks PR #42's CI by adding `esbuild` as a direct devDependency — the
   missing peer that was breaking `opennextjs-cloudflare build`.

## What changed

### Providers (`lib/providers/spatial/*`)

- `types.ts` — unified contract. `SpatialBuildResult` now carries optional
  `sceneUrl`, `sceneFormat` (`'ply' | 'splat' | 'ksplat'`), and
  `gaussianCount` so production providers can return their raw splat asset
  while keeping `previewImageUrl` as the canvas thumbnail.
- `replicate.ts` (new) — `jd7h/splatter-image` via Replicate, satisfies the
  same `build()` shape as draft. Falls back to a locally rendered preview
  data URL when the model omits one.
- `modal.ts` (new) — POSTs to a user-supplied `SPATIAL_MODAL_URL` (same
  escape hatch the SAM 3 segmentation stack uses). Supports text prompts.
- `registry.ts` — lists all three providers, resolves in this order:
  1. model-hint match
  2. `SPATIAL_PROVIDER` env
  3. `replicate-splat`, `modal-splat` in declaration order
  4. `draft` (always available)
  Draft is last so real providers win when their keys are present, but the
  local demo still works without any API keys at all.

### Factory route (`app/api/capability/factory/route.ts`)

- Added `pickSpatialProvider()` — inspects `listSpatialProviders()` and picks
  the best available provider for the spatial `author-tool` lane.
- The `draftInvocation.providerId` and `draftCapability.runTemplate.providerId`
  now reflect the picked provider (`draft`, `replicate-splat`, or
  `modal-splat`) instead of a hardcoded `'draft'`.
- Response now includes `spatialProviders: SpatialProviderStatus[]` so the UI
  can show which providers are available/unavailable.

### UI surfaces (unchanged here, but worth naming)

The `draftInvocation.providerId` is threaded through to
`runSpatialOnCanvas(...)` in `components/workspace/WorkspaceShell.tsx:1030-1039`,
then to `/api/spatial` as `providerId`. `/api/spatial` calls
`resolveSpatialProvider(providerId, model)`, which routes to the matching
adapter. No UI changes were needed in this slice.

### CI fix

- `package.json` — added `"esbuild": "^0.27.0"` to devDependencies.
  `@opennextjs/cloudflare` 1.19+ imports `esbuild` directly but does not
  declare it as a dep. Without a direct pin, CI's `npm install` fails to
  resolve it.

## How to test live capability building

All commands from the worktree:

```bash
cd /Users/erniesg/code/erniesg/aether-phase41-spatial-wire
```

### 1. Local demo without any API keys (exercises the full factory loop)

Default behaviour — uses the `draft` provider, which synthesises an SVG
preview locally.

```bash
npm run dev
# open http://localhost:3000/workspace/<wsId>
```

In the workspace:
1. Drop any image onto the canvas (drag-drop, paste, or file upload).
2. Click the image to select it.
3. In the bottom prompt composer, type: `turn this image into a gaussian splat`
4. Hit enter.

What you should see:
- A **capability request** hits `/api/capability/factory` with
  `artifactKind: 'spatial'`, `publishScope: 'team'`.
- The factory plan returns `action: 'author-tool'` (no published spatial tool
  exists yet), creates a GitHub issue labelled `claude-run` + `route-human`,
  and returns a `draftCapability` + `draftInvocation`.
- The UI stores the new capability in the workspace definitions list and
  fires `runSpatialOnCanvas(...)`, which calls `/api/spatial` with
  `providerId: 'draft'`.
- A generated SVG particle-field preview is placed on the canvas next to
  your source image (`lib/spatial/canvas.ts`).
- The new capability appears in the **floating toolbar** as a Sparkles icon
  (`components/canvas/FloatingToolbar.tsx:320-332`) and in the **Action Log**
  right-rail section as a completed run (`components/rail/ActionLog.tsx`).
  Click the Sparkles icon on the toolbar to rerun the capability against
  the currently selected image.

### 2. Connect a real provider (ships a real splat asset)

```bash
# In .dev.vars (gitignored):
REPLICATE_API_TOKEN=r8_...
# optional — pin a specific model version
SPATIAL_REPLICATE_VERSION=<version-hash>

npm run dev
```

Same workspace flow. This time the factory will route
`providerId: 'replicate-splat'`, the `/api/spatial` response carries a
`sceneUrl` pointing at the raw `.ply` / `.splat` asset, and the preview
shown on canvas is whatever the model returned (falling back to the
local SVG renderer if the model omits a preview).

Model selection stays provider-agnostic — override at request time via
`providerId` / `model` body fields, or set `SPATIAL_PROVIDER=modal-splat`
to route to a self-hosted Modal endpoint instead.

### 3. Rerun a capability

Once a capability is pinned, reruns go through `/api/capability/rerun`,
which carries the originating `definitionId` + `entryRef` into provenance
(`lib/capability/types.ts`, `convex/runs.ts`). Toolbar click → spatial rerun
on the currently selected image.

### 4. Pin a successful run as a skill

After any successful `image-gen` or `spatial-gen` run, hover its row in the
Action Log (right rail). A pin icon appears at the top-right of the row.
Clicking it opens `PinDialog` (`components/capability/PinDialog.tsx`) which
turns the run into a `CapabilityDefinition` that lives in the workspace
toolbar for future reruns.

### 5. Check automated tests

```bash
npm test -- lib/providers/spatial/ tests/unit/api-capability-factory.test.ts
npm run typecheck
```

Covered:
- Registry resolution order (draft fallback, real-provider preference,
  `SPATIAL_PROVIDER` env override, unknown-id error).
- Replicate adapter contract (happy path, no-preview fallback, error mapping).
- Modal adapter contract (request shape, response mapping, error mapping).
- Factory route picks the real provider when `REPLICATE_API_TOKEN` is set.

## Where skills and tools live (short map)

| Surface | File | Role |
|---|---|---|
| Published tools | `lib/tool/registry.ts` | The canonical primitives — `image-gen`, `spatial-gen` (draft), etc. Versioned. |
| Published workflows | `lib/workflow/registry.ts` | Orchestrated tool chains (currently just `image-render-basic`). |
| Published skills | `lib/skill/registry.ts` | Creator-facing named recipes over a tool or workflow (e.g. `hero-image-draft`). |
| In-session capabilities | `lib/store/runs.ts` (`useCapabilityDefinitions`, `addDefinition`) | The user's pinned definitions. Backed by in-memory today; Convex-backed once `capabilityDefinition` in `convex/schema.ts` is wired. |
| Provenance | `convex/runs.ts`, `lib/store/runs.ts` | Every run records `entryRef` (kind+id+version) and `definitionId` so reruns name exactly what executed. |
| Toolbar surfacing | `components/canvas/FloatingToolbar.tsx:320` | Pinned capabilities render as Sparkles icons next to the voice slot. |
| Pin affordance | `components/rail/ActionLog.tsx:87` + `components/capability/PinDialog.tsx` | Hover a successful run → pin it as a capability. |
| Factory entry point | `/api/capability/factory` | The route that decides: invoke existing, author a skill, author a new tool. New-tool requests open a GitHub issue labelled `route-human` + `claude-run`. |
| Human review | `.github/workflows/route-human-review.yml` + `lib/review/discordHumanReview.ts` | `route-human` label fires a Discord notification to channel `1496938045876731955` (needs `DISCORD_WEBHOOK_URL` or `DISCORD_BOT_TOKEN` secret). |
| Autonomous agent | `claude.yml` + `claude-run` label | The GitHub-side managed agent that picks up capability request issues and opens PRs (this is how PR #50 was authored). |

## Verification run

- `npm run typecheck` — clean
- `npm test` — 348/348 passing (4 new tests in this slice)

## Merge strategy

Two options for getting this to `main`:

### A. Supersede PR #42 with this branch (simpler)

`phase/41-spatial-wire` is a direct descendant of `phase/39-capability-factory-foundation`
with additive changes. Retarget PR #42 to `phase/41-spatial-wire` and merge
in one go, then open a new PR from `phase/41-spatial-wire` → `main`.

### B. Merge as stacked PR

Keep PR #42 as-is, open a new PR from this branch targeting
`phase/39-capability-factory-foundation`. Merge #42 first, then this one.
This is cleaner provenance but slower.

Either way, **PR #50 can close with a note** ("real providers merged via
phase/41-spatial-wire") — all of its provider logic is preserved.

## Constraints honoured

- No hardcoded default spatial provider in code paths (still provider-agnostic).
- Draft path stays lock-free (no external services required) for local demos.
- Red/green TDD: registry + contract tests written before provider code landed.
- Creator-first canvas surface unchanged (no operator-dashboard drift).

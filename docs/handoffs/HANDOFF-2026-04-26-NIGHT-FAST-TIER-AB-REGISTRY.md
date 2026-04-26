# Handoff — Fast-tier hero + auto-post + SAM3 A/B + tools registry (2026-04-26 night)

Picking up from `HANDOFF-PROMPT-NEXT-AGENT.md`. Four of the six prioritised
slices shipped this session; two remain for the next agent.

## Per-slice verdict

| # | slice | verdict | evidence |
|---|---|---|---|
| 0 | Wire `buildLayoutAwarePrompt` into hero render (fast tier) | **READY** | 2 new auto-mode tests; all 22 auto-mode tests pass |
| 1 | Schedule real posts on `notifyMode='auto-post'` | **READY** | 4 new auto-mode tests; lap-end ping lists scheduled IDs |
| 2 | Vision-then-segment + one-shot SAM3 A/B | **READY (no LLM smoke)** | 13 segment-subjects tests + 10 describe-image tests + 2 dual-path auto-mode tests; SAM3-AB.md doc deferred (needs real images) |
| 3 | SLOW TIER — Layer extraction + inpaint + reposition | **NOT STARTED** | scoped 3-4 hr, see "Next slices" below |
| 4 | Tool discoverability refactor | **READY** | registry under `lib/agent/agent-tools/`; 4 new registry tests + multi.test passes; one-line "add a tool" experience |
| 5 | WorkspaceShell integration | **NOT STARTED** | `AutoModeToggle` + `AutoModePanel` standalone since Apr 26 day; 1944-line WorkspaceShell.tsx still untouched |
| 6 | Postiz adapter + posting | **DEFERRED** | publisher seam now wired through auto-post; `lib/providers/publisher/postiz.ts` exists but slice spec says enable via Postiz UI integrations + bearer key |

## Stats

- **4 commits this session**: `5808a24`, `f309023`, `1b851d1`, `272b0e2`
- **Vitest: 1081 passing | 1 skipped** (151 files; was 1046 passing before this session, +35 tests)
- **TypeScript: 3 pre-existing test warnings** (`endCall is possibly undefined` in auto-mode.test.ts — unrelated to this session's changes)
- **Net new files**: 8
  - `lib/agent/segment-subjects.ts` + test
  - `lib/agent/describe-image.ts` + test
  - `lib/agent/agent-tools/{types,index,search-signals,cluster-references,generate-image,analyze-video,get-current-datetime}.ts` + index test

## What shipped — per-slice notes

### Slice 0 — Layout-aware fast-tier hero (`5808a24`)

`runOneVariation` now pre-composes a layout-aware blob via
`buildLayoutAwarePrompt` (the existing module from issue #105) and
instructs Claude to pass it verbatim to `generate_image`. The blob bakes
in:

- safe zones — top headline + bottom caption bands as `mustSurviveAllCrops`
- multi-aspect crop guidance for 1:1 / 4:5 / 9:16 / 16:9
- a no-on-image-text directive (overlays land separately)

In parallel mode the variation's mood seed (e.g. `'warm dawn — soft golden
palette, low contrast, hopeful'`) feeds the component's mood keywords, so
each variation's layout-aware Mood line carries its assigned seed without
per-format re-render. Sequential mode keeps the priorMoodNotes
negative-guidance line for distinctness while the layout-aware structure
stays verbatim.

**Smoke that's still missing**: re-run the idol-drama smoke (use
`/tmp/auto-body.json` from prior handoff), inspect the hero, confirm the
existing `cropHeroToFormats` `partial` results become `fitted` for 4:5 and
9:16. ~$0.30, ~150s. The unit tests prove the prompt is wired in; smoke
proves the model honours it.

### Slice 1 — Real `scheduledPost` rows on auto-post (`f309023`)

`runAutoMode` now, when `notifyMode === 'auto-post'`:

1. Resolves the publisher seam with `preferredId: 'preview'` (the
   always-available adapter).
2. Iterates ready variations × envelope-declared platforms.
3. Calls `publisher.schedule(post)` and `recordScheduledPost(...)` per row.
4. Includes the resulting IDs in the lap-end Discord ping body
   (`scheduled_posts: <id1>, <id2>`).

`AutoModeResult.scheduledPostIds: string[]` is the new return field; UI
right rail can use it.

Per-variation fail-soft: a publisher reject or unknown platform skips that
one row, never aborts the lap. Skipped entirely when no `workspaceId`
(preview publisher requires one to scope storage).

The `postiz` adapter is the natural follow-up once IG OAuth is configured
in the Postiz Cloud Run UI; today the seam routes to preview.

### Slice 2 — Vision-then-segment + one-shot SAM3 A/B (`1b851d1`)

Replaces the single combined-prompt segmentation
(`'faces, products, brand logos, text'`) with two parallel paths whose
masks are persisted side-by-side for A/B inspection:

**One-shot (no LLM)** — `lib/agent/segment-subjects.ts` fans out 12 SAM3
calls in parallel against `ONE_SHOT_PROMPTS`:
- `face` → `face` kind
- `person` → `subject`
- `jacket` / `shirt` / `pants` / `shoes` → `apparel`
- `jewelry` / `bag, accessory` → `accessory`
- `product` → `product`
- `brand logo, mark` / `text, typography` → `logo`
- `background` → `background`

Per-prompt fail-soft. Returns `SegmentSubjectsResult { width, height,
masks[], matched, prompted }` where each mask carries `label`,
`componentKind`, `bbox` (pixel-space), `confidence`.

**Vision-guided (one Claude vision call)** —
`lib/agent/describe-image.ts` calls Claude 4.7 vision for a structured
inventory:

```ts
{
  faces: [{ name?, description }],
  products: [{ name, description }],
  brands: [{ name, description }],
  otherComponents: [{ name, kind: 'apparel' | 'accessory' | 'pose' | 'environment-prop' }],
  smallObjectGroups: [{ groupName, members[] }],
  background: { description }
}
```

`descriptionToSegmentPrompts(desc)` converts that to the same
`SegmentSubjectsPrompt[]` shape the one-shot path uses, then the same
`segmentSubjects` function fans out to SAM3. Auto-skipped when
`ANTHROPIC_API_KEY` is absent.

**Selection logic** — vision-guided wins as primary input to
`applyTextOverlay` when both succeed AND the vision-guided set surfaced
masks; one-shot otherwise; empty otherwise (planner runs without
forbidden regions).

**Persistence** — `campaignVariation` now carries
`masksOneShot` + `masksVisionGuided` (both `v.optional(v.any())`) on
`convex/schema.ts`, the `insertVariation` mutation, and
`lib/convex/http.ts` `ServerVariationInsert`.

**Per Ernie 2026-04-26 granularity rule** — each foreground component
gets its own mask; small co-located items of the same class are grouped
(jewelry, water-droplets) so the user doesn't end up managing 100 tiny
shapes. Faces / products / brands are first-class because they map to the
existing `ForbiddenRegion` safety taxonomy — text overlays never render
across them.

**Deferred per scope**:
- Agent-tool exposure of `describe_image` / `segment_subjects` in
  `multi.ts` — slice #4 refactor target; one new file per tool now that
  the registry is in place.
- `docs/handoffs/auto-mode-evidence/SAM3-AB.md` side-by-side mask
  thumbnails — needs real LLM smoke evidence (vision + 12 SAM3 calls per
  hero, ~1.5s + $0.01 per smoke). Defer to Ernie running a smoke and
  saving the masksOneShot + masksVisionGuided JSON to inspect.

### Slice 4 — Tool discoverability refactor (`272b0e2`)

Five tools moved from inline definitions in `multi.ts` to one-file-per-tool
in `lib/agent/agent-tools/`. Each file exports an `AgentTool { tool,
dispatch, summarizeOutput? }`. `listAgentTools()` is the single source of
truth; `multi.ts` consumes it to build the SDK Tool list, the dispatch
table, the summarizer table, and the system prompt's "you can call these
tools" section.

**Adding a tool** is now: drop a file in `lib/agent/agent-tools/` + add
one line to `listAgentTools()`. No edit to `multi.ts` required.

**Acceptance** — zero new capability. The full auto-mode test surface +
`multi.test.ts` (8 tests covering ledger writes, SSE parsing, ref-image
attachment, error paths) all pass. `/api/agent` shape is unchanged.

## Next slices in priority order

### Slice 3 — SLOW TIER — Layer extraction + inpainted bg + reposition (~3-4 hr)

The big architectural shift. Per the fast-vs-slow tier reframe, this runs
in the background while the user already has the fast-tier output. Three
sub-pieces:

1. **`/api/inpaint` route** — accept `{ sourceImage, mask, prompt }` →
   PNG bytes. Adapter selection mirrors `/api/generate`: env-driven
   default, per-request override. Use **gpt-image-2**
   (`OPENAI_API_KEY` present, already DEFAULT_MODEL in
   `lib/providers/image/openai.ts`) or **Seedream**
   (`VOLCENGINE_ARK_API_KEY` present) — both already wired. Skip
   Replicate.
2. **`lib/canvas/extractLayers.ts`** — pure module: takes the SAM3 masks
   from slice #2 (`SegmentSubjectsResult.masks`) and the source PNG,
   applies each mask to produce a cutout PNG per component. Server-side
   image op via `sharp` (likely needs adding to deps) OR client-side via
   canvas `globalCompositeOperation='destination-in'`. One layer per
   mask. Each layer carries `kind` (`face` / `product` / `logo` / etc.)
   and a `safety` field (`faceProtect`, `brandProtect`) so the
   text-overlay planner refuses to render across.
3. **Per-format anchor reproject** + **drop-on-canvas helper** — extend
   `lib/canvas/cropToFormat.ts` with `projectLayerToCrop`; when a face
   layer's reproject would clip, prefer pushing the crop off-axis to
   keep the face whole. Drop helper extends `dropImageOnCanvas` to drop
   N tldraw image shapes per artboard with `props.crop` set per layer.

Smoke evidence required: a 4:5 + a 9:16 export each showing the same
hero composed from the same layers, just re-projected. Plus a
brand-aware case (visible logo, caption clearly avoids it in every
format).

**Recommended approach**: aim for a small first slice that proves the
pipeline (1 foreground subject + 1 background, no transform editing
yet). Full edit/move/scale/rotate UI is the iteration after.

The agent-tools registry is now in place, so `inpaint` becomes one new
file in `lib/agent/agent-tools/inpaint.ts` exporting `{ tool, dispatch }`.

### Slice 5 — WorkspaceShell integration (~1 hr)

`components/canvas/AutoModeToggle.tsx` and
`components/rail/sections/AutoModePanel.tsx` are already built but not
wired. `WorkspaceShell.tsx` is **1944 lines** — read it carefully before
editing. Acceptance from the original handoff:

- AutoModeToggle drops in next to the FloatingToolbar in canvas chrome.
- Drop-on-canvas of a URL or file with toggle on triggers `POST
  /api/auto-mode/run`.
- AutoModePanel renders in the right rail when `lens === 'output'`,
  subscribed to `useQuery(api.campaigns.get, { campaignId })` + a list
  query for recent campaigns.
- Per-variation card opens the lap's clientRunIds in the existing
  capability-run viewer.

This needs UI smoke testing (the user types into the composer, drops on
canvas, confirms lap fires and right-rail subscribes correctly). Best
done by an agent that can `npm run dev` and exercise the browser.

### Slice 2 follow-up — Add `describe_image` + `segment_subjects` to the agent registry

Now trivial thanks to slice #4: drop two files in
`lib/agent/agent-tools/`:

- `describe-image.ts` — wraps `describeImage` from `lib/agent/describe-image.ts` as a local handler. No HTTP route needed (Anthropic SDK call).
- `segment-subjects.ts` — wraps `segmentSubjects` as an HTTP local handler that batches `/api/segment` calls.

Then add both to `listAgentTools()`. No edit to `multi.ts`. Lets Claude
ad-hoc call these tools when a creator's brief implies they're needed
(e.g. "describe this hero" → `describe_image`).

### Slice 6 — Postiz adapter completion

The publisher seam routes to `'preview'` today (slice #1). To enable real
posting:

1. Ernie logs into Postiz Cloud Run UI (`https://postiz-1047564447300.asia-southeast1.run.app/auth`) and adds each platform via Integrations.
2. Generate a Postiz API key in user settings.
3. `lib/providers/publisher/postiz.ts` already exists; verify env wiring:
   - `POSTIZ_API_KEY=<bearer>`
   - `POSTIZ_INTEGRATION_INSTAGRAM=<id>` (per platform)
4. `PUBLISHER_PROVIDER=postiz` in env or per-call override flips the
   default.

`recordScheduledPost({ provider: 'postiz', ... })` already accepts this;
the seam is provider-agnostic.

## Smoke commands (unchanged from prior handoff)

```bash
# Validation paths — no LLM cost
curl -sS -X POST http://localhost:3002/api/auto-mode/run \
  -H "Content-Type: application/json" -d '{}'

# Full lap (one variation, ~150s, ~$0.30)
curl -sS -X POST http://localhost:3002/api/auto-mode/run \
  -H "Content-Type: application/json" \
  -d '{"trigger":{"kind":"text","payload":"<your-trigger>"},
       "variationCount":1,"notifyMode":"review","concurrency":"sequential",
       "maxIterationsPerVariation":3}'

# Test suite
npx vitest run --reporter=dot
npx tsc --noEmit -p tsconfig.json
```

## Hard rules — checked

- Single synthesis-shell workspace ✅ (no new routes; UI components are still drop-ins, slice #5 will wire them in)
- Strict UI taxonomy ✅ (no UI changes this session)
- Provider-agnostic AI ✅ (publisher seam routes to preview by default; postiz / social-auto-upload via env; segmentation routes through existing `/api/segment`)
- Typed provenance ✅ (every mutation still goes through `recordRun*`; `agentRunIds[]` cross-link variations to capabilityRun rows)
- Graph-first persistence ✅ (campaignVariation gets `masksOneShot`, `masksVisionGuided`, `scheduledPostIds` flow through the lap result)
- Red/green TDD ✅ (35 new tests across the four slices; each behavior change has a failing test ahead of the impl)

## Convex deployment note (carried over from prior handoff)

`.env.local` still points at `oceanic-dolphin-808.convex.cloud` (NOT
`careful-ermine-104`). New schema fields (`masksOneShot`,
`masksVisionGuided`) apply when an agent runs `npx convex deploy` against
the active deployment. **Do not deploy without Ernie's authorisation** —
the prior handoff flagged this as an artifact of CLI auth alignment.

---

**Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>**

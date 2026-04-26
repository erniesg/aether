# Handoff Prompt — Auto Mode next slices

Copy everything between the `---` lines below into a new Claude Code session
(`cd ~/code/erniesg/aether && claude`) or paste into Claude.ai with the repo
attached. The agent will pick up where the previous session left off.

---

You are picking up an aether/Berlayar hackathon push for **Ernie**
(`hello@ernie.sg`). Hackathon-mode, exhausted, low patience for "API responds,
UX unverified" claims. Direct tone, evidence over claims. Conventional commit
prefixes. `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

## Read these first (in this order)

1. `CLAUDE.md` — repo guardrails (hard rules #1-9 — single shell, strict
   taxonomy, provider-agnostic, typed provenance, etc.)
2. `AGENTS.md` — product identity + UI philosophy
3. `docs/handoffs/HANDOFF-2026-04-26-AUTO-MODE-FULL-PIPELINE.md` — what
   shipped Apr 26 night + designed-but-not-shipped architecture for vision/
   layer/tool-discovery
4. `docs/handoffs/HANDOFF-2026-04-26-LATE-EVENING-AUTO-MODE-V1-SHIPPED.md`
   — earlier in the day; deferred stash + Postiz + DNS state
5. `docs/handoffs/HANDOFF-2026-04-26-EVENING-AUTO-MODE-MANAGED-AGENTS.md`
   — original handoff with infra inventory (GCP, Convex, Modal, Cloudflare)

## Current state (verified Apr 26 night)

- Auto Mode lap demo-ready: `/api/auto-mode/run` end-to-end (research →
  hero → multi-format crops → segmentation-aware multilingual overlays →
  Convex persistence → Discord lifecycle pings).
- Last successful campaign: `ns7dbezt4tcxmm8h7kjwzprpnd85kdhc` on
  `oceanic-dolphin-808.convex.cloud` (NOT careful-ermine-104 — see §"Convex
  deployment" in the full-pipeline handoff).
- Hero render evidence: `docs/handoffs/auto-mode-evidence/v1-hero-final-2.png`
- Postiz fixed via Temporal Cloud — `https://postiz-1047564447300.asia-southeast1.run.app/auth`
  HTTP 200, hydration clean.
- Vitest: 1046 passing | 1 skipped (148 files).

## Next slices in priority order

### 1. Lap-end → actually schedule when notifyMode='auto-post' (1-2 hr)

**Gap right now:** Auto Mode produces a `scheduleWhenLocal` SUGGESTION but
never creates a `scheduledPost` row. The lap-end Discord ping says "POSTS
SCHEDULED" in auto-post mode but nothing is actually scheduled.

**Acceptance:**
- When `notifyMode === 'auto-post'`, after `setCampaignStatus(... completed)`,
  iterate the ready variations and call the publisher seam (`recordScheduledPost`
  in `lib/convex/http.ts` already exists, plus `lib/providers/publisher/registry.ts`).
- One scheduledPost row per variation × platform.
- For now use `provider: 'preview'` (the always-available adapter); the
  `postiz` adapter is the natural follow-up once IG is configured in Postiz.
- Lap-end ping in auto-post mode then lists the actual scheduled post IDs.
- New unit test: in auto-post mode, scheduledPost rows are written.

**Files to touch:** `lib/agent/auto-mode.ts` (post-status step),
`lib/agent/auto-mode.test.ts` (new test).

### 2. Vision-then-segment with one-shot SAM3 A/B (~45-60 min)

**Important caveat:** SAM3 is text-promptable directly — `/api/segment` accepts
a `prompt: string`. You DO NOT need Claude vision to run SAM3. The vision
step gives RICHER content-specific prompts ("wet leather jacket on man's
head") instead of the generic "person, jacket, background", but the
one-shot path is fully functional alone.

User wants to A/B compare:
- **One-shot**: `/api/segment` with a generic prompt like
  `'subject, foreground, background, text, brand'` — fast, no extra LLM call.
- **Two-stage**: Claude 4.7 vision describes the hero first → SAM3 with the
  vision-derived prompts → richer per-subject masks. Adds ~$0.005 + 1s.

**Acceptance:**
- New tools in `lib/agent/multi.ts`: `describe_image(imageUrl)` (Claude 4.7
  vision via Anthropic SDK with image content blocks; local-handler tool,
  no HTTP route) and `segment_subjects(imageUrl, prompts[])` (HTTP wrapper
  around `/api/segment` — note: passes prompts as comma-joined string since
  the route's `prompt` param is a single string, not an array).
- `runPostHeroPipeline` in `lib/agent/auto-mode.ts` runs BOTH paths in
  parallel via Promise.allSettled and stores both mask sets on the
  variation:
    - `formatCrops` (existing)
    - `masksOneShot` (SAM3 with generic prompt)
    - `masksVisionGuided` (vision → SAM3 with derived tokens)
- Each mask set gets converted to ForbiddenRegions and run through
  `applyTextOverlay` separately so we can compare layer placements.
- Document the comparison in `docs/handoffs/auto-mode-evidence/SAM3-AB.md`
  with side-by-side mask thumbnails (overlaid red rectangles on the hero).

**Files to add:** `lib/agent/multi.ts` (2 new tool specs),
`convex/schema.ts` (extend campaignVariation with the two mask fields),
`docs/handoffs/auto-mode-evidence/SAM3-AB.md`.

### 3. Layer extraction + inpainted bg + editable shapes per format (~3-4 hr)

User's bigger architectural ask. Each variation should fan out into editable
canvas shapes:
- one inpainted background plate
- one cutout per foreground subject (alpha-channel masked PNG)
- one tldraw shape per layer with bbox + transform + z-index, re-projected
  per format (4:5 / 9:16 / 16:9)

Use **gpt-image-2** (already our DEFAULT_MODEL in lib/providers/image/openai.ts;
OPENAI_API_KEY present) or **Seedream** (VOLCENGINE_ARK_API_KEY present) for
the inpaint adapter — already wired, no new provider integration needed.
Skip Replicate.

**Acceptance:**
- New `/api/inpaint` route accepting `{ sourceImage, mask, prompt }` →
  PNG bytes. Adapter selection mirrors `/api/generate`: env-driven default,
  per-request override.
- New `lib/canvas/extractLayers.ts` pure module: takes the SAM3 masks and
  the source PNG, applies each mask to the source to get a cutout PNG.
  Server-side image op via `sharp` (add to deps if not present) OR
  client-side via canvas drawImage + globalCompositeOperation='destination-in'.
- `runPostHeroPipeline` now also writes a `layers: array(any)` field on
  campaignVariation: `[{ id, kind, bbox, transform, zIndex, src }]`.
- Per-format anchor reproject: `lib/canvas/cropToFormat.ts` already gives
  normalized crop coords; layer reposition is
  `(layerBbox - cropTopLeft) / cropDims`. Add a helper `projectLayerToCrop`.
- Drop helper in the canvas: `lib/canvas/dropLayersOnArtboard.ts` — given
  a list of layers + an artboard format, drops one tldraw image shape per
  layer. Probably extend `dropImageOnCanvas`.
- Smoke evidence: a 4:5 + a 9:16 export each showing the same hero
  composed from the same layers, just re-projected.

**This is the big one.** Document the architecture exhaustively before
coding. Aim for a small first slice that proves the pipeline (e.g., 1
foreground subject + 1 background, no transform editing yet) — full
edit/move/scale/rotate UI is the iteration after.

### 4. Tool discoverability refactor (~30 min)

Move agent tools out of hardcoded multi.ts into a registry:

```
lib/agent/agent-tools/
  index.ts                 // listAgentTools() — single source of truth
  search-signals.ts        // { tool: Anthropic.Messages.Tool, dispatch: ToolDispatchSpec }
  cluster-references.ts
  generate-image.ts
  analyze-video.ts
  current-datetime.ts
  describe-image.ts        // from slice #2
  segment-subjects.ts      // from slice #2
  inpaint.ts               // from slice #3
```

`multi.ts` becomes:
```ts
import { listAgentTools } from '@/lib/agent/agent-tools';
const tools = listAgentTools();
const ALL_TOOLS = tools.map(t => t.tool);
const TOOL_SPECS = Object.fromEntries(tools.map(t => [t.tool.name, t.dispatch]));
const SYSTEM_PROMPT_TOOL_LIST = tools.map(t => `- ${t.tool.name}: ${t.tool.description}`).join('\n');
```

**Acceptance:** zero new capability; `/api/agent` smoke result identical
shape; `multi.test.ts` still passes; one-line "add a tool" experience —
drop a file in `lib/agent/agent-tools/`, no edit to multi.ts.

### 5. WorkspaceShell integration (~1 hr)

`components/canvas/AutoModeToggle.tsx` and
`components/rail/sections/AutoModePanel.tsx` are already built but not
wired. WorkspaceShell.tsx is 1944 lines — read it carefully before
editing.

**Acceptance:**
- AutoModeToggle drops in next to the FloatingToolbar in canvas chrome.
- Drop-on-canvas of a URL or file with toggle on triggers
  `POST /api/auto-mode/run`.
- AutoModePanel renders in the right rail when `lens === 'output'`,
  subscribed to `useQuery(api.campaigns.get, { campaignId })` + a list
  query for recent campaigns.
- Per-variation card opens the lap's clientRunIds in the existing
  capability-run viewer.

### 6. Posting to other platforms (Postiz already has all 7 keys)

**All 7 platform OAuth client_id/secret pairs are loaded into Postiz
Cloud Run** as env vars (verified Apr 26 night): INSTAGRAM_*,
FACEBOOK_*, X_*, LINKEDIN_*, TIKTOK_*, PINTEREST_*, YOUTUBE_*. Backed
by Secret Manager.

**To enable posting to any of those platforms via Postiz:** Ernie
logs into the Postiz UI at
`https://postiz-1047564447300.asia-southeast1.run.app/auth`, adds
each platform via Integrations, completes the per-platform OAuth dance.
Postiz then handles posting to all 7 from a single API surface — that's
what `lib/providers/publisher/postiz.ts` (when authored) would call.

**`postiz` adapter for the publisher seam (~1-2 hr) — separate slice:**
- Add `lib/providers/publisher/postiz.ts` implementing the
  PublisherProvider contract.
- Postiz exposes a REST API; auth is via `Authorization: Bearer <api-key>`
  (generate in Postiz user settings).
- Then the auto-post path in slice #1 above just calls
  `recordScheduledPost({ provider: 'postiz', ... })` and the seam
  handles the platform-specific posting.

**IG production app review (Berlayar AI-IG, App ID 2176290403206401)**
is only needed if you bypass Postiz and call IG Graph API directly.
For now, **don't** — Postiz handles it. Skip the multi-day app review.

## Hard rules — never break

1. Single synthesis-shell workspace — no per-step wizard routes.
2. Strict UI taxonomy: left rail = input, right rail = output+metadata,
   canvas chrome = tool, header = navigation.
3. Prompt composer at bottom with explicit scope chip.
4. Progressive disclosure (collapsed by default).
5. Restraint over labels (mono + paper carry meaning).
6. Provider-agnostic AI (no hardcoded default model).
7. Typed provenance on every action (entryRef → capabilityRun).
8. Graph-first persistence (Convex is the truth; derived state never
   in payload).
9. Red/green TDD — failing test first, then minimal code.

## Smoke commands

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

## Git hygiene

- Stay on `main`. Don't force-push.
- Commit after each functional unit (not at end of session).
- Conventional commit prefixes: `feat:`, `fix:`, `test:`, `docs:`, `chore:`,
  `refactor:`.
- Every commit ends with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- Don't run `npx convex deploy` unless the user authorizes — it pushed to
  oceanic-dolphin-808 last time because the CLI is authed there, not to
  `careful-ermine-104` (the URL in pre-Apr 26 .env.local).

## Final report checklist

When you're done, write a follow-up handoff doc covering:
- Per-task verdict: READY / PARTIAL / BLOCKED
- Smoke results with evidence files
- Vitest pass count delta + tsc state
- What needs the user's hand vs what an agent can do next

---

Done. The agent will read the references above, pick up the priority list,
and start with slice #1 (auto-post → real scheduledPost).

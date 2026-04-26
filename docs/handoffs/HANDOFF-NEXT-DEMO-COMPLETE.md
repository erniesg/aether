# Handoff — Deliver the full demo (2026-04-26 night, third session)

You are picking up an aether/Berlayar hackathon push for **Ernie**
(`hello@ernie.sg`). Hackathon-mode, exhausted, low patience for "API
responds, UX unverified" claims. **Direct tone. Evidence over claims.
End-to-end smoke before declaring done.** Conventional commit prefixes
(`feat:`/`fix:`/`test:`/`docs:`/`chore:`/`refactor:`). Every commit ends
with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

## The demo we're building toward

Quote from Ernie's pitch:

> All that a user has to do is drop in a reference or prompt afresh.
> Opus takes these inputs, turns them into semantically meaningful
> creative components. The generated key visual is automatically
> propagated into desired formats — with automated multilingual
> translations too, in the 4 official languages of Singapore.
> Everything — key visual, text, meaning — is adaptive. Smart placement
> keeps text free of brand names and people's faces. Everything is
> editable so creatives remain in control — changes can propagate
> globally or be locally scoped.
>
> Aether turns Opus 4.7 into a collaborator, a multiplier for creative
> force. You can type, or talk to it. But that's not all.
>
> A lot of creative work is upfront — in conceptualising. So I built
> Aether to turbocharge the research process by turning simple inputs
> into a complete campaign and research plan. Claude Managed Agents
> fan out the competitor analysis, and we cluster like visuals
> together, labelled. You can then riff off your desired concept and
> hit generate. Then get your multiformat, multilingual adaptations
> for free as before.
>
> Great work means nothing if the world doesn't get to see it, so
> Aether helps you distribute too. When ready, Aether will ping the
> human-in-the-loop for signoff and scheduling to post. Upon approval,
> posts are scheduled with Claude Managed Agents with agents
> monitoring the conversation regularly, always ready to jump in.
>
> If you're feeling yolo, just turn on auto-mode and let Opus cook.

## Where each promise stands today

| pitch line | status | gap |
|---|---|---|
| drop in a reference or prompt | ✓ API; ✗ UI | Slice #5 not wired into WorkspaceShell.tsx |
| Opus → semantic creative components | ✓ | `lib/types/semantic-component.ts` + buildLayoutAwarePrompt |
| auto-propagate to desired formats | PARTIAL | 1:1 fitted; 4:5/9:16/16:9 'partial' (safe zones clip) — slice #3 fixes |
| multilingual (4 SG) | ✓ | en-SG, zh-Hans-SG, ms-SG, ta-SG translations work end-to-end |
| smart placement free of faces/brands | ✗ BLOCKED | SAM3 needs fetchable URL; gpt-image-2 returns data URL → masks empty in every real lap → text-overlay planner runs without forbidden regions. Task A1 below. |
| everything editable | ✗ | UI not wired; bg/contrast not surfaced per-shape |
| local vs global edit propagation | ✗ | open design, not built |
| Managed Agents fan out competitor analysis | ✗ | auto-mode is single-agent today; this is the headline new feature |
| cluster like visuals, labelled | ✗ surface | `cluster_references` tool exists, NOT invoked in lap; no moodboard UI |
| riff off concept and generate | ✗ | no "pick cluster → generate" path |
| ping human-in-the-loop for signoff | ✓ code; ✗ runtime | `notifyDiscord` works; `DISCORD_WEBHOOK_URL` env is **NOT SET** so all pings go to console only |
| schedule posts to platforms | ✓ persists; ✗ posts | scheduledPost rows write to in-memory storage today (Convex schema mismatch — Task A4); Postiz service alive but per-platform OAuth not done |
| monitoring loop | ✗ | not built |
| auto-mode "Opus cooks" | ✓ | text/URL/PDF/image-file triggers; sequential or parallel concurrency |

## Read these first (in this order)

1. `CLAUDE.md` — repo guardrails (single shell, strict UI taxonomy,
   provider-agnostic, typed provenance, graph-first persistence,
   red/green TDD).
2. `AGENTS.md` — product identity + UI philosophy.
3. `docs/handoffs/HANDOFF-2026-04-26-NIGHT-MULTIMODAL-V1.md` — second
   session of the day; URL/PDF/image-file ingestion + multi-image
   refs + smoke evidence.
4. `docs/handoffs/HANDOFF-2026-04-26-NIGHT-FAST-TIER-AB-REGISTRY.md`
   — first session of the day; layout-aware fast tier, auto-post,
   SAM3 A/B (built), tools registry.
5. `docs/handoffs/auto-mode-evidence/eightsleep-smoke-2026-04-26/` —
   real lap evidence: heroes (`url-hero-3.png`), composed multilingual
   mockups (`composed/multilingual-grid-1x1.png`), ingestion JSON.
6. `docs/handoffs/HANDOFF-2026-04-26-EVENING-AUTO-MODE-MANAGED-AGENTS.md`
   — earlier handoff that scopes the Managed Agents pattern Ernie
   referenced in the pitch.

## Critical Ernie feedback from the third session (THIS IS WHY WE'RE HERE)

These four items are why the prior smoke was "ok-but-not-good-enough":

### F1 — heroes are GENERIC bedrooms, not the actual product

The url-hero-{1,2,3}.png all show generic premium bedroom interiors.
None features the **eightsleep Pod** (a thin mattress cover with cooling
tech). Why:
- the og:image we used as primary reference (`Homepage_c0dril.png`) IS
  itself a generic bedroom photo from eightsleep's marketing — the Pod
  is a thin top layer that's barely visible
- gpt-image-2 with image refs synthesizes the *vibe* not the *thing*
- our prompt + agent had no concept of what the Pod physically looks like

**Fix**: vision-describe the reference images BEFORE generation and
weave the description into the prompt. If the reference is too generic,
also crawl deeper product pages.

### F2 — eightsleep ingestion found 0 products

`url-ingestion.json:products` is `[]`. Schema.org `Product` JSON-LD
isn't on the homepage. The "Pod 4 Ultra" name in the captions came
from Claude's training-time knowledge + the body text, not from
structured data.

**Fix**: agent should be smart enough to either (a) crawl a deeper
product page automatically (search for `/sg/product/*` etc. in the
homepage's links) OR (b) vision-describe the page imagery to
identify the product. Both are reasonable.

### F3 — no Discord pings have actually appeared

`DISCORD_WEBHOOK_URL` is **NOT SET** in `.env.local`. Every
`notifyDiscord(...)` call in the auto-mode lifecycle (lap-start,
lap-end-{notify|review|auto-post}) currently goes to *console only*
because of the fail-soft fallback. So Ernie has never seen a single
ping in Discord even though the code is wired.

**Fix**: Ernie creates a Discord webhook (Server Settings →
Integrations → Webhooks → New) and adds `DISCORD_WEBHOOK_URL=…` to
`.env.local`. Restart dev server. Re-run a smoke and confirm pings
appear in the Discord channel.

### F4 — text-place tool: contrast-aware bg + editable, not blanket bands

The smoke compose script used to slap a black band behind every text
band. That hack is fixed (commit `15bb035`) but the proper canvas
tool needs to:
- **Sample local contrast** under the text bbox (e.g. WCAG AA: 4.5:1
  for body, 3:1 for large text)
- Add a bg color **only when contrast < threshold**
- Make the bg color **editable per tldraw shape** (props.fill,
  props.opacity)

`lib/agent/text-apply.ts` produces placement instructions. Add a
`contrastSampler` that takes (heroBytes, bbox) and returns
`{ ratio, suggestBg?: { color, opacity } }`. Stash on the layer.
Slice #5 UI renders the bg as a tldraw rect shape **only when**
suggestBg is present, and exposes its props for editing.

## Priority order

### A — P0, blocks the demo

#### A1 — Hero asset upload to Convex storage (Task #11) — ~1 hr

gpt-image-2 returns the hero as `data:image/png;base64,…`. SAM3
(Modal-hosted, external) can't fetch data URLs. Result: `masksOneShot`
+ `masksVisionGuided` are absent in every real lap → text-overlay
planner runs without forbidden regions → smart placement (F1's
"keeps text free of brand names and people's faces") DOES NOT WORK.

Convex storage is the canonical path per CLAUDE.md graph-first rule.
Implementation:

1. Add `convex/assets.ts` with two endpoints:
   ```ts
   export const generateUploadUrl = mutationGeneric({
     handler: async (ctx) => await ctx.storage.generateUploadUrl(),
   });
   export const recordAsset = mutationGeneric({
     args: { storageId: v.string(), wsId: v.optional(v.id('workspace')),
              kind: v.string(), mime: v.string() },
     handler: async (ctx, args) => {
       const url = await ctx.storage.getUrl(args.storageId);
       const id = await ctx.db.insert('asset', {
         storageId: args.storageId, wsId: args.wsId,
         kind: args.kind, mime: args.mime,
         publicUrl: url, createdAt: Date.now(),
       });
       return { id: String(id), url };
     },
   });
   ```
2. Add `lib/storage/uploadAsset.ts`:
   ```ts
   export async function uploadDataUrlAsset({
     dataUrl, kind, wsId,
   }): Promise<{ id: string; url: string }>;
   ```
   It calls `generateUploadUrl` → POSTs the bytes → `recordAsset`.
3. In `lib/agent/auto-mode.ts:runOneVariation`, after `pickHeroImageUrl`,
   if `isDataUrl(heroImageUrl)` → upload + replace with the public url.
4. Now `runOneShotSegmentationPath` and `runVisionGuidedSegmentationPath`
   stop bailing at `isDataUrl(heroUrl)`. SAM3 fetches the public url.
5. `convex/schema.ts`: add `asset` table with index by storageId + wsId.

**Acceptance**: re-run the URL trigger smoke; `masksOneShot.matched > 0`
AND `masksVisionGuided.matched > 0`; text overlay layers' bbox **moves
away from face/brand regions**; this is visible in the recomposed
multilingual mockups (run `node scripts/compose-eightsleep-mockup.mjs`
after the smoke).

**Smoke evidence required**: save the new heroes + masks JSON to
`docs/handoffs/auto-mode-evidence/eightsleep-smoke-2026-04-26-v2/`
and explain in the commit message which face/brand regions the
overlays now avoid.

#### A2 — Vision-describe references + deeper product crawl — ~1.5 hr — fixes F1 + F2

The `lib/agent/describe-image.ts` module ALREADY EXISTS (built in
slice #2). It calls Claude 4.7 vision and returns
`{ faces, products, brands, otherComponents, smallObjectGroups, background }`.

Currently `runVisionGuidedSegmentationPath` calls it AFTER hero gen
(to derive SAM3 prompts). We need ALSO to call it BEFORE hero gen,
on the user's reference images, so the prompt has a vivid description
of what's in them.

Implementation:

1. Extend `lib/ingest/url.ts` with a `crawlProductPages` helper —
   takes the homepage HTML + ingestion result, looks for anchor
   hrefs matching common product-page patterns (`/sg/product/*`,
   `/products/*`, `/shop/*`, `/p/*`), fetches the top 1-3 candidates,
   merges their JSON-LD products + body excerpts back into the
   ingestion. Cap at 2 extra fetches to keep latency sane.
2. In `lib/agent/auto-mode.ts:runAutoMode`, after `fetchUrlIngestion`,
   call `describeImage(primaryRef)` for the top reference image.
   Stash the resulting structured description on the variation.
3. Augment `buildPreHeroLayoutAwarePrompt` to include a "Reference
   image content (vision-described):" block in the layout-aware
   prompt body, listing detected products / brands / faces. Now the
   gen knows "this reference shows a Pod-style mattress cover on a
   queen bed in a chrome-walled bedroom" instead of just "use this
   image".
4. Also surface the description in the variation prompt's
   "INGESTED PAGE CONTENT" section so Claude's tool-use loop picks
   it up and weaves into captions.

**Acceptance**: run a fresh URL smoke against eightsleep, the agent's
generate_image input.prompt should include explicit Pod / mattress /
cover language derived from vision; the hero now SHOWS THE POD
PRODUCT, not just a generic bedroom; verify by eye against
`url-hero-3.png` (current generic bedroom) vs new heroes.

**Provenance trace** (per Ernie F1): the variation result now carries
`referenceDescriptions: ImageDescription[]` so the UI can display
"this hero was generated from these refs, which were vision-described
as: …". Slice #5 surfaces this in the right rail.

#### A3 — Discord webhook actually fires — DONE (2026-04-26 night)

`DISCORD_WEBHOOK_URL` is now set in `.env.local` (gitignored). Verified
end-to-end:
- direct `curl` to the webhook URL: HTTP 204 (success)
- `notifyDiscord({...})` via tsx script returned `true`; Ernie
  confirmed the test message landed in his Discord channel

**Remaining work** for the next agent: kick the dev server (kill
PID 2518 + `npm run dev` again) to make sure the running process
picks up the new env var. Next 14+ usually hot-reloads `.env.local`
but verify by running a smoke:

```bash
curl -sS -X POST http://localhost:3002/api/auto-mode/run \
  -H "Content-Type: application/json" \
  -d '{"trigger":{"kind":"text","payload":"<anything>"},
       "variationCount":1,"notifyMode":"auto-post","workspaceId":"ws-x"}'
```

The Discord channel should show:
- `▶︎ Auto Mode lap started` ping
- `🟢 Auto Mode lap completed — POSTS SCHEDULED` ping with
  scheduledPostIds listed

If only the second ping shows up: the dev server didn't pick up the
new env. Restart it.

#### A4 — scheduledPost persistence: in-memory IDs leaking out — ~30 min

The text-trigger smoke produced `scheduledPostIds: ['sp_mofoht40_1']`.
The `sp_*` prefix is from `lib/providers/publisher/memory-storage.ts`,
not Convex. But `campaignId` was a real Convex id, proving Convex was
reachable.

Root cause: `lib/convex/http.ts:recordScheduledPost` returned null. The
Convex `publisher.schedule` mutation (in `convex/publisher.ts`) has
`wsId: v.optional(v.id('workspace'))` — which is a real Convex doc
id, not the arbitrary string we pass.

Fix one of:
- (a) Drop `wsId` from the recordScheduledPost call (let it be
  optional/null). Simple but loses workspace scoping.
- (b) Create a real workspace doc on first lap from a workspaceId
  string and pass its `_id`. Right thing if we want indexing.
- (c) Change the schema to accept `wsId: v.optional(v.string())`.
  Wrong — the schema's whole point is referential integrity.

I recommend (b): add a `workspaces.ensureByExternalId(externalId)`
mutation that finds-or-creates a workspace by an external string id
+ returns the Convex `_id`. Then `recordScheduledPost` resolves the
external id to a real wsId before calling publisher.schedule.

**Acceptance**: smoke produces `scheduledPostIds: ['<convex-id>']`
where the convex id is queryable: `npx convex run publisher:list
'{wsId: "<id>"}'` returns the row.

#### A5 — Postiz per-platform OAuth + flip the seam — Ernie + ~30 min agent

**Postiz status today**: HTTP 200 at
`https://postiz-1047564447300.asia-southeast1.run.app/auth`
(verified — the prior 502 was during a Cloud Run revision boot of
postiz-00007-mvm; PM2 brought up backend/frontend/orchestrator).

To enable real IG posting:
1. Ernie logs into Postiz UI at the auth URL.
2. Postiz UI → Integrations → add Instagram → complete the OAuth
   dance. Repeat for each desired platform (FB, X, LinkedIn, TikTok,
   Pinterest, YouTube — all 7 platform OAuth client_id/secret pairs
   are env-configured per the prior handoff).
3. Postiz UI → User Settings → generate API key.
4. Add to `.env.local`:
   ```
   POSTIZ_API_KEY=<bearer>
   POSTIZ_INTEGRATION_INSTAGRAM=<integration id from Postiz UI>
   PUBLISHER_PROVIDER=postiz
   ```
5. Restart dev. The publisher seam in `lib/agent/auto-mode.ts:
   scheduleVariationPosts` will now route to
   `lib/providers/publisher/postiz.ts` instead of preview.

**The Meta App webhook config screen Ernie shared** (Callback URL +
Verify token) is for direct Graph API integration, NOT needed when
using Postiz. Skip it.

**Acceptance**: a real auto-post smoke produces `scheduledPostIds`
that resolve in the Postiz UI as queued posts; Ernie's Discord
channel shows the pings; the IG post is visible in the Postiz
schedule view (and at the scheduled time, posts to IG).

### B — P0/P1, demo-grade quality

#### B1 — WorkspaceShell UI integration — ~2-3 hr — Slice #5

`components/canvas/AutoModeToggle.tsx` and
`components/rail/sections/AutoModePanel.tsx` exist standalone.
`WorkspaceShell.tsx` is **1944 lines** — read carefully before editing.

Acceptance:
- AutoModeToggle drops in next to FloatingToolbar in canvas chrome.
- Drop-on-canvas of a URL or file with toggle on triggers
  POST `/api/auto-mode/run`.
- AutoModePanel renders in right rail when `lens === 'output'`,
  subscribed to `useQuery(api.campaigns.get, { campaignId })` + a
  list query for recent campaigns.
- Per-variation card opens the lap's `clientRunIds` in the existing
  capability-run viewer (right rail).
- Composed multilingual mockups (today via `scripts/compose-
  eightsleep-mockup.mjs`) become CANVAS-NATIVE: the hero is a
  tldraw image shape; per-locale text is N tldraw text shapes; bg
  rect (when contrast-aware) is a tldraw rect shape. All editable
  per-shape.
- Approve / reject buttons in 'review' mode lap-end ping → either
  trigger auto-post (one-click) or send back for refinement.

**Without this slice nothing of the demo is visible to a user.**

#### B2 — Slow tier: layer extraction + reposition — ~3-4 hr — Slice #3

Blocks on A1 (hero must be SAM3-fetchable). Once unblocked:
- `/api/inpaint` route (gpt-image-2 OR Seedream — both wired)
- `lib/canvas/extractLayers.ts`: SAM3 masks + source PNG → cutout
  PNGs per component (sharp installed).
- Per-format anchor reproject (`lib/canvas/cropToFormat.ts` +
  `projectLayerToCrop` helper).
- Drop helper extending `dropImageOnCanvas` to drop N tldraw image
  shapes per artboard with `props.crop` per layer.
- Smoke: 4:5 + 9:16 + 16:9 export from same hero, brand-aware crop
  choice, all variants `'fitted'` (vs current `'partial'`).

#### B3 — Cluster + moodboard surface in lap → "riff off concept" — ~2 hr

Per Ernie's pitch: "we cluster like visuals together, labelled. You
can then riff off your desired concept and hit generate."

Today:
- `cluster_references` agent tool exists (`/api/clusters/run`)
- Auto-mode lap NEVER invokes it
- No moodboard UI

Implementation:
1. Auto-mode variation prompt: after `search_signals`, **require**
   `cluster_references` on the returned image set, then have Claude
   pick one cluster as the visual concept before `generate_image`.
2. Persist clusters on the variation (`clusters: ClusterAssignment[]`).
3. Surface in the right rail (slice #5): each variation shows its
   cluster assignments + the cluster the agent picked.
4. "Riff" button on a cluster → runs a new lap with that cluster's
   top-N images as `referenceImages`.

#### B4 — Contrast-aware text placement + editable bg per shape — ~1.5 hr — F4

See F4 above. Implementation:
- Add `lib/text-overlay/contrast.ts` with
  `sampleContrast(heroBytes, normalizedBbox, textColor) →
   { ratio, suggestBg?: { color, opacity } }`. Use sharp to crop
   the bbox region, average pixel values, compute WCAG ratio.
- `applyTextOverlay` consumes contrast suggestion per layer.
- Slice #5 renders bg as tldraw rect when suggested; per-shape
  props.fill + props.opacity are editable.

### C — P1/P2, advanced demo features

#### C1 — Managed Agents fan-out for competitor analysis — ~3-4 hr — HEADLINE FEATURE

Per Ernie's pitch: "Claude Managed Agents fan out the competitor
analysis." This is the marquee Anthropic SDK feature he's calling out.

The Managed Agents pattern (Anthropic Claude API) is sub-agents
spawned in parallel from a parent agent, each with its own context
window, returning a structured summary. Use case here: parent agent
researches the brief; spawns N sub-agents to analyse specific
competitors / signals in parallel; aggregates findings into a
campaign brief.

Implementation:
1. New module `lib/agent/managed/competitor-analysis.ts` that uses
   the Anthropic SDK's managed-agent API. Read
   `docs/handoffs/HANDOFF-2026-04-26-EVENING-AUTO-MODE-MANAGED-AGENTS.md`
   for the prior agent's design notes.
2. Auto-mode lap: after `search_signals`, fan out a managed-agent
   per top reference set member to extract competitor strategies +
   visual themes.
3. Aggregate into a campaign brief that conditions hero gen.
4. Persist managed-agent runs as their own ledger entries
   (`capabilityRun` rows linked to the parent).

This is BIG — budget 3-4 hr including the SDK integration and
provenance plumbing.

#### C2 — Self-critique + N-variation selection — ~1-2 hr

Today: lap returns N variations; user picks. Add a critic pass that
scores each on:
- brand fidelity (does the hero match the brief / refs?)
- composition (rule of thirds, breathing room, focal subject)
- caption fit (does the caption pair well with the hero mood?)

Use Claude vision to score 0-10 per dimension; return ranked
variations. Optionally auto-select the top one.

#### C3 — Global vs local edit propagation — open design

Per Ernie's pitch: "changes can propagate globally or be locally
scoped." Today edits are per-shape in tldraw. Need:
- Concept of "linked groups" (semantically equivalent shapes across
  formats/locales).
- Edit-mode scope chip (already in spec — `prompt composer stays at
  the bottom with explicit scope chip global/local`).
- When in 'global' mode, edits propagate to all linked instances.

Open design — discuss with Ernie before building.

#### C4 — Monitoring loop — open design

Per Ernie's pitch: "agents monitoring the conversation regularly,
always ready to jump in." Could be a cron-triggered job that polls
scheduled posts for engagement metrics, or a webhook handler. Open.

## Smoke commands

Critical: every priority A item gets a smoke. Save evidence to
`docs/handoffs/auto-mode-evidence/<scenario>-<date>/`.

```bash
# Validation only — no LLM cost
curl -sS -X POST http://localhost:3002/api/auto-mode/run \
  -H "Content-Type: application/json" -d '{}'

# Text trigger (~150-210s, ~$0.30 OpenAI)
curl -sS -X POST http://localhost:3002/api/auto-mode/run \
  -H "Content-Type: application/json" \
  -d '{"trigger":{"kind":"text","payload":"<prompt>"},
       "variationCount":1,"notifyMode":"auto-post",
       "workspaceId":"ws-x"}'

# URL trigger — eightsleep flow (verifies F1 + F2 + A1 + A2 fixes)
curl -sS -X POST http://localhost:3002/api/auto-mode/run \
  -H "Content-Type: application/json" \
  -d '{"trigger":{"kind":"url","payload":"https://www.eightsleep.com/"},
       "variationCount":1,"notifyMode":"auto-post",
       "workspaceId":"ws-x"}'

# PDF trigger
curl -sS -X POST http://localhost:3002/api/auto-mode/run \
  -H "Content-Type: application/json" \
  -d '{"trigger":{"kind":"file","payload":"https://example.com/spec.pdf"},
       "variationCount":1,"notifyMode":"auto-post","workspaceId":"ws-x"}'

# Compose multilingual mockups from latest hero + overlays
node scripts/compose-eightsleep-mockup.mjs

# Tests + tsc
npx vitest run --reporter=dot
npx tsc --noEmit -p tsconfig.json

# Postiz health
curl -sS -o /dev/null -w "%{http_code}\n" \
  https://postiz-1047564447300.asia-southeast1.run.app/auth
```

## Hard rules — never break

1. Single synthesis-shell workspace — no per-step wizard routes.
2. Strict UI taxonomy: left rail = input, right rail =
   output+metadata, canvas chrome = tool, header = navigation.
3. Provider-agnostic AI (no hardcoded default model).
4. Typed provenance on every action (`entryRef → capabilityRun`).
5. Graph-first persistence — Convex is the truth. Hero data URLs
   are NOT graph-friendly; that's why A1 is P0.
6. Red/green TDD — failing test first, then minimal code.
7. Don't run `npx convex deploy` without Ernie's authorization
   (.env.local points at oceanic-dolphin-808; CLI auth alignment).

## Known repo state at handoff

- 16 unpushed commits on `main` (origin doesn't have any of this
  session's work).
- Vitest: 1106 passing | 1 skipped (153 files).
- TypeScript: 3 pre-existing test warnings in
  `lib/agent/auto-mode.test.ts` (`endCall is possibly undefined`).
- Smoke evidence: `docs/handoffs/auto-mode-evidence/eightsleep-smoke-2026-04-26/`
  has heroes (`hero.png`, `url-hero-{1,2,3}.png`), composed
  multilingual mockups (`composed/`), and full response JSONs.
- `.env.local` keys present: ANTHROPIC_API_KEY, OPENAI_API_KEY,
  VOLCENGINE_ARK_API_KEY, NEXT_PUBLIC_CONVEX_URL, SAM3_MODAL_URL,
  SAM3_MODAL_TOKEN, **DISCORD_WEBHOOK_URL** (added this session,
  verified working). **STILL MISSING**: POSTIZ_API_KEY,
  POSTIZ_INTEGRATION_INSTAGRAM, PUBLISHER_PROVIDER (set to `postiz`
  after Ernie completes per-platform OAuth in the Postiz UI).

## Verdict template for your final report

Write a follow-up handoff doc with:
- Per-task verdict: READY / PARTIAL / BLOCKED
- Smoke evidence (heroes + composed mockups + masks JSON)
- Vitest pass count delta + tsc state
- Discord ping screenshots (proves A3)
- Postiz schedule view screenshot (proves A5)
- What needs Ernie's hand vs what an agent can pick up next

---

**Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>**

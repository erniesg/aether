# Handoff — Power through actual posting + review-runs UI (2026-04-26 night, fourth session)

You are picking up an **aether/Berlayar** hackathon push for **Ernie**
(`hello@ernie.sg`). Hackathon-mode, exhausted, low patience for "API
responds, UX unverified" claims. **Direct tone. Evidence over claims.
End-to-end smoke before declaring done.** Conventional commit prefixes
(`feat:`/`fix:`/`test:`/`docs:`/`chore:`/`refactor:`). Every commit ends
with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
**Commit regularly** — that was an explicit reminder from Ernie.

## Why you exist

The previous session shipped X + IG direct adapters, a trace endpoint,
brand palette/fonts/logo extraction, hero Convex upload, and Discord
embed enrichment. Then Ernie ran an IKEA test and the Discord ping came
back as:

```
✅ Auto Mode lap completed — 1/1 variations ready (sequential)
Trigger: text · IKEA
  v1 ✓ <no caption>
campaign=ns7198r2g0vb0g6rf8rn72tcj985jgxj
```

His verbatim follow-up — these are your acceptance criteria:

> 1. are you getting out the brand/product masks
> 2. are we generating using these brands/products as input for various
>    dimensions
> 3. are we adding editable multilingual text for all the aspect ratios
> 4. how come im not seeing the variants of what will be posted
>
> can you power through to post on x ig and tik tok immediately with
> all the right variants and languages and captions

Your job: deliver **all four** plus an actual immediate-post smoke to
X / IG / TikTok with the demo asset stack visible to him before the
post fires.

## Read these first (in this order)

1. `CLAUDE.md` — repo guardrails (single shell, strict UI taxonomy,
   provider-agnostic, typed provenance, graph-first persistence,
   red/green TDD).
2. `AGENTS.md` — product identity + UI philosophy.
3. `docs/handoffs/HANDOFF-NEXT-DEMO-COMPLETE.md` — third session's
   handoff; covers brand-product-mask plan, A1-A5 priorities, the
   Postiz path, Modal SAM3 GPU blocker.
4. `docs/handoffs/HANDOFF-2026-04-26-NIGHT-MULTIMODAL-V1.md` — second
   session; URL/PDF/image-file ingestion + multi-image refs.
5. `docs/handoffs/HANDOFF-2026-04-26-NIGHT-FAST-TIER-AB-REGISTRY.md` —
   first session; layout-aware fast tier, auto-post, SAM3 A/B,
   tools registry.
6. `docs/handoffs/auto-mode-evidence/eightsleep-smoke-v2-2026-04-26/` —
   third-session smoke evidence: hero (`hero.png`), Convex storage id,
   `referenceDescriptions[]`.
7. `docs/handoffs/auto-mode-evidence/trace-smoke-eightsleep-v2.json` +
   `trace-smoke-ikea-with-ledger.json` — full lap traces verifying
   `GET /api/campaigns/[id]/trace` works.

## What's already shipped (don't redo)

| feat | files | last commit |
|---|---|---|
| Layout-aware hero prompt | `lib/agent/hero-prompt-layout-aware.ts`, wired in `auto-mode.ts:buildPreHeroLayoutAwarePrompt` | `5808a24` |
| Auto-post scheduling | `lib/agent/auto-mode.ts:scheduleVariationPosts` | `f309023` |
| SAM3 A/B (one-shot + vision-guided) | `lib/agent/segment-subjects.ts`, `lib/agent/describe-image.ts` | `1b851d1` |
| Agent-tools registry | `lib/agent/agent-tools/` | `272b0e2` |
| URL ingestion | `lib/ingest/url.ts` | `c482c0e` |
| Multi-image refs | `auto-mode.ts:effectiveReferenceImages` | `668c66c` |
| PDF ingestion | `lib/ingest/pdf.ts` (lazy-loaded) | `15e7def` |
| Image-file trigger | `auto-mode.ts:isImagePayload` | `5e60329` |
| Hero → Convex upload | `lib/storage/convexAsset.ts`, `convex/assets.ts` | `4efbde9` |
| Vision-describe references | `auto-mode.ts:referenceDescriptions` | `2bcc05d` |
| Brand palette + fonts + logo | `lib/ingest/url.ts:extractBrandPalette/extractFonts/extractLogo` | `eb1ff0b` |
| Trace inspection endpoint | `app/api/campaigns/[id]/trace/route.ts`, `lib/convex/trace-helpers.ts` | `d9b00b6` |
| X + IG direct adapters | `lib/providers/publisher/{x,instagram}.ts`, registry precedence | `9c073af` |
| Discord embed enrichment | `lib/notify/discord.ts` + `auto-mode.ts:buildVariationEmbed` | `9c073af` |

Vitest: 1168 passing | 1 skipped (158 files). 44 unpushed commits on
`main`. tsc clean save 3 pre-existing warnings in
`lib/agent/auto-mode.test.ts` (`endCall is possibly undefined`).

## Critical bugs Ernie called out this session

### Bug-1 — IKEA lap shipped `<no caption>` to Discord

The IKEA text-trigger ping showed `v1 ✓ <no caption>` even though
`auto-mode.ts:1503` reads `v.caption ? '"...80 chars"' : '<no caption>'`.
For comparison `trace-smoke-ikea-with-ledger.json` — a DIFFERENT IKEA
run — has caption populated correctly. So the bug is either:

- A timing race: lap-end ping fires before `parseAgentEnvelope` completes
  the variation's `caption` write, OR
- A parse failure: the agent's final assistant message didn't emit the
  `"caption"` field of the JSON envelope (model edge case), OR
- The variation that was passed to `buildVariationEmbed` is a stale
  pre-ingest snapshot.

**What to do**:

1. Add a regression test in `lib/agent/auto-mode.test.ts` that asserts
   when the agent's envelope has a populated `caption`, the lap-end
   embed AND the variationLines text both contain it.
2. Look at `auto-mode.ts:1442-1545` — the variations array passed to
   `buildVariationEmbed` is the outer-scope `variations` accumulated
   from `runOneVariation` results. Confirm the result of
   `parseAgentEnvelope` actually mutates the variation row reachable
   from this scope. If it returns a NEW object, the outer array still
   holds the stale row.
3. Fix the race / wiring + commit `fix(auto-mode): caption populated
   in lap-end Discord embed and text`.
4. Re-smoke IKEA with `notifyMode: 'review'`. Discord must show the
   caption text plus a populated embed image / fields.

### Bug-2 — Variants not visible before posting (Ernie point #4)

Discord embed today shows ONE embed per variation containing only the
1:1 hero. Ernie wants to see **all aspect-ratios × all locales**
inline so he can intercept before the post fires. He compared this to
"PR review" — see `docs/handoffs/HANDOFF-NEXT-DEMO-COMPLETE.md` F1-F4.

**What to do**:

1. Auto-mode lap currently produces a single 1:1 hero. Wire
   `cropHeroToFormats` (already in repo — see `lib/canvas/cropToFormat.ts`
   if it exists; if not, port from
   `scripts/compose-eightsleep-mockup.mjs:cropAndResize`) into the lap
   so the variation result carries `variantsByFormat: { '1:1': url, '4:5':
   url, '9:16': url, '16:9': url }`. Each variant URL must be a Convex
   public URL (not a data URL — Discord can't display data URLs).
2. Compose per-locale text overlay onto each variant via the existing
   `applyTextOverlay` + `lib/text-overlay/place.ts`. Persist the
   composed result back to Convex storage. Surface as
   `variantsByFormatAndLocale: { '1:1': { 'en-SG': url, 'zh-Hans-SG':
   url, ... }, '4:5': {...}, ... }` — 4 formats × 4 locales = 16 URLs
   per variation.
3. Discord embed: instead of one embed per variation, build one embed
   per `(format, locale)` pair (16 embeds per variation). Discord
   allows up to 10 embeds per message; if you overflow, paginate by
   sending a follow-up ping per variation. Each embed sets
   `image.url` to the composed variant URL, and the title is
   `v{idx} {format} {locale}`.
4. Save smoke evidence under
   `docs/handoffs/auto-mode-evidence/<smoke>/variants/{1x1,4x5,9x16,16x9}/{en-SG,zh-Hans-SG,ms-SG,ta-SG}.png`.
5. Acceptance: the Discord ping for the next IKEA + eightsleep smoke
   contains visible thumbnails for each (format, locale) pair, and
   each thumbnail shows the layout-correct text overlay.

### Bug-3 — Brand/product masks (Ernie point #1) — BLOCKED on Modal GPU

Modal `berlayar-ai` workspace has hit the 10-GPU plan limit so SAM3
runs return 500. Ernie's action: kill old apps in the Modal dashboard.
Until then, every smoke runs without `masksOneShot` / `masksVisionGuided`.
Code path is otherwise correct (verified by both vision-guided and
one-shot test fixtures).

**What you can still do without GPU**:

- Wire mask consumption end-to-end: when masks come back, pass the
  forbidden regions into the text-overlay placer so per-format text
  bbox can dodge them. Verify the contract in
  `lib/agent/auto-mode.ts` and `lib/text-overlay/place.ts`.
- Add a fallback strategy when `mask.matched === 0`: use
  `referenceDescriptions[0].faces` + `.brands` bounding-box hints from
  Claude vision describe (already populated) to seed forbidden
  regions. Now SAM3 not being available doesn't completely defeat
  smart placement.
- Smoke test the fallback: temporarily set `SAM3_MODAL_URL=` (empty)
  in `.env.local`, run a smoke, confirm overlays still avoid faces/
  brands using the vision-derived regions.

### Bug-4 — Brand-conditioned generation across dimensions (Ernie point #2)

Today the lap calls `generate_image` once at 1:1, then crops to other
formats. The crops can clip the subject. Per the demo pitch, ideal is
generating **per-format** with a brand-conditioned prompt rooted in
the same semantic creative components.

**What to do**:

1. After the 1:1 hero is up, in `runOneVariation`, after ledger write
   for image-gen, call `generate_image` **three more times** at 4:5,
   9:16, 16:9 with the same `referenceImages` + a per-format addition
   to the prompt: `"Compose for {format} portrait/landscape; subject
   anchor stays centered, layout-aware safe zones reserved for text."`
2. Persist all 4 heroes to Convex storage. `variantsByFormat` is now
   populated with native renders, not crops.
3. Caveat: this multiplies OpenAI cost ×4. Add a feature flag
   `AUTO_MODE_NATIVE_PER_FORMAT=1` (default off; on for the demo) so
   the smoke can be reproduced cheaply.
4. Acceptance: the 4 hero PNGs for the same variation should each
   show the brand subject framed correctly for that aspect — no head
   crops, no chopped logos.

### Bug-5 — Editable multilingual text for ALL aspect ratios (Ernie point #3)

Today the per-locale captions exist in `captionsByLocale`. They're
rendered via the offline `scripts/compose-eightsleep-mockup.mjs` only
(SVG composition with sharp). They are NOT yet:

- Rendered onto the per-format heroes inside the lap
- Persisted to Convex
- Editable on the canvas

**What to do**:

1. Inside `runOneVariation`, after `variantsByFormat` is populated
   (Bug-4), call a new `composeOverlay(heroBuf, format, locale,
   captionsByLocale[locale], placement)` per (format, locale).
   Reuse the SVG layout logic from `scripts/compose-eightsleep-mockup.mjs`
   but as a library: `lib/text-overlay/compose.ts:composeForLocale`.
2. Upload each composed PNG to Convex; populate
   `variantsByFormatAndLocale[format][locale] = publicUrl`.
3. Slice #5 (WorkspaceShell UI — see B1 below) renders these on the
   tldraw canvas as per-shape text instances, each editable. Use
   `lib/canvas/dropImageOnCanvas.ts` to drop the hero rect; per-locale
   text shapes layered on top.
4. Acceptance: each variation in the lap result carries 4 × 4 = 16
   composed URLs; the canvas can be opened and the en-SG text edited
   without touching the others; right-rail "scope: global" propagates
   the edit to the other 3 locales.

### Bug-6 — Discord embed shows ONE hero only (Ernie point #4 cont.)

See Bug-2. The Discord lap-end ping must surface every variant
(format × locale) so Ernie can review BEFORE auto-post fires. Today
he can't, which is why he asked: "I dun see what you scheduled +
allow me to edit or intercept or sth just like w PRs."

This is the same PR-review surface he's been asking for; trace
endpoint covers JSON-shape inspection, but visual review needs the
embed thumbnails too.

## Priority order (this session)

### A — Ship today, blocks the demo (~5-7 hr)

#### A1 — IKEA `<no caption>` regression test + fix — ~30 min
See Bug-1. Smallest, ship first.

#### A2 — `variantsByFormat` (4 native crops or 4 native renders) — ~2 hr
See Bug-4. Choose: cheap (crop) or premium (re-render). For the demo,
do native render with the `AUTO_MODE_NATIVE_PER_FORMAT` flag default
on. Persist to Convex. Update `auto-mode.test.ts` envelope assertions.

#### A3 — `variantsByFormatAndLocale` composer — ~2 hr
See Bug-5. Library port of the compose script's SVG logic. 16 PNGs
per variation, all to Convex. Add unit tests for the composer (rough:
"composes 4 locales × 4 formats from a hero + captions ledger,
returns 16 publicUrls").

#### A4 — Discord embed surfaces all 16 variants — ~1 hr
See Bug-2 / Bug-6. Multi-embed per variation; pagination if >10.
Run a smoke against IKEA and eightsleep; capture the Discord
screenshot to evidence dir.

#### A5 — Power-through immediate post smoke to X / IG / TikTok — ~1-2 hr
Ernie: "can you power through to post on x ig and tik tok immediately
with all the right variants and languages and captions."

**Required env** — Ernie must paste these into `.env.local`. The X +
IG + TikTok adapters are coded and merged but need credentials. Ask
him explicitly which platforms are ready before you fire:

```bash
# X (developer.x.com → Project → Keys & tokens)
X_API_KEY=
X_API_KEY_SECRET=
X_ACCESS_TOKEN=
X_ACCESS_TOKEN_SECRET=

# Instagram (Graph API Explorer → long-lived page token)
IG_ACCESS_TOKEN=
IG_USER_ID=                    # the IG Business account user id
IG_GRAPH_VERSION=v22.0         # default

# TikTok via social-auto-upload sidecar
SOCIAL_AUTO_UPLOAD_URL=
SOCIAL_AUTO_UPLOAD_TOKEN=

# Optional override: PUBLISHER_PROVIDER=x|instagram|postiz|social-auto-upload|preview
```

Currently set in `.env.local`: ANTHROPIC_API_KEY, OPENAI_API_KEY,
VOLCENGINE_ARK_API_KEY, NEXT_PUBLIC_CONVEX_URL,
SAM3_MODAL_URL+TOKEN (broken — GPU limit), DISCORD_WEBHOOK_URL,
APIFY_API_TOKEN, RAPIDAPI_KEY, REPLICATE_API_TOKEN,
GOOGLE_GEMINI_API_KEY, CLIP_MODAL_URL+TOKEN, SEGMENTATION_PROVIDER,
SIGNALS_EXECUTION_MODE, SIGNALS_SCRAPER_INSTAGRAM, SIGNALS_XHS_PROVIDERS,
SPATIAL_PROVIDER. **Missing** for posting: all X_*, IG_*,
SOCIAL_AUTO_UPLOAD_*, POSTIZ_*.

**Don't fake the smoke**: if Ernie hasn't pasted tokens, surface that
clearly and don't claim the post fired. The `preview` provider is
fine for demo-shape visibility but won't actually post.

**Smoke command** (once env is set):

```bash
# Schedule 60 seconds in the future so the immediate-post path fires
curl -sS -X POST http://localhost:3002/api/auto-mode/run \
  -H 'Content-Type: application/json' \
  -d '{
    "trigger": {"kind":"url","payload":"https://www.eightsleep.com/"},
    "variationCount": 1,
    "notifyMode": "auto-post",
    "workspaceId": "<a-real-convex-workspace-id>"
  }'
```

The `auto-post` lap-end ping should now show:
- Title: `🟢 Auto Mode lap completed — POSTS SCHEDULED`
- 16 embed thumbnails (or paginated) per variation
- Real platform-provider URLs (e.g. `https://twitter.com/i/web/status/...`)
  in the scheduledPosts list

**Save evidence**:
`docs/handoffs/auto-mode-evidence/auto-post-smoke-2026-04-26-night/`
- `lap-response.json` (raw response with scheduledPostIds + provider responses)
- `discord-screenshot.png` (visible variants × locales)
- `x-tweet-link.txt` / `ig-post-link.txt` / `tiktok-post-link.txt`

### B — P0/P1, demo-grade quality (~4-6 hr)

#### B1 — WorkspaceShell review surface — ~3-4 hr — Slice #5

The 1944-line `components/workspace/WorkspaceShell.tsx` has zero
references to `AutoModePanel` or `AutoModeToggle`. The standalone
components exist in `components/canvas/AutoModeToggle.tsx` and
`components/rail/sections/AutoModePanel.tsx`. Wire them in.

Acceptance:
- Drop a URL or file on canvas → POST /api/auto-mode/run
- AutoModePanel in right rail (when `lens === 'output'`) subscribed
  to `useQuery(api.campaigns.get, { campaignId })`
- Per-variation card: clicking "inspect" opens the ledger at
  `clientRunIds[i]` (or a drawer that calls the trace endpoint and
  renders the entries).
- "Review" button on review-mode laps lists the 16 variants per
  variation with thumbnails + edit + approve / reject.
- Approve button → triggers `POST /api/scheduled-posts/[id]/publish`
  (build this endpoint if missing — see registry precedence in
  `lib/providers/publisher/registry.ts`).

#### B2 — Provenance traceability surface — ~1-2 hr
The trace endpoint exists. The right-rail observer needs to show:
- For each variation: chain of `entryRef → capabilityRun` rows from
  the trace JSON
- Reference image gallery: original ingested → vision-described
  output → SAM3 mask viz (when GPU is back)
- "Re-render" button on any step → re-runs from that step

#### B3 — Editable per-shape text on canvas — Slice #5 dependency
After A3 produces 16 composed PNGs, the canvas needs to render each
one as a hero rect + per-locale text shapes (NOT baked PNGs).
Implementation:
- `lib/canvas/dropVariantSet.ts:dropVariantSet(canvas, variant)`
  drops 4 frames per locale, each frame contains: image shape (hero
  for that format) + text shape per overlay layer
- Text shape props: `font`, `size`, `align`, `color`, `bg` (with
  contrast-aware default)
- Edit propagation via tldraw + a "scope: global" prompt-composer
  chip that batches the text update across all 16 frames

### C — P1/P2 (ship if time)

#### C1 — Cluster + moodboard surface — ~2 hr — see prior handoff B3
#### C2 — Managed Agents fan-out — ~3-4 hr — see prior handoff C1
#### C3 — Layer extraction + reposition (slow tier) — ~3-4 hr — see prior handoff B2
#### C4 — Self-critique + N-variation selection — ~1-2 hr — see prior handoff C2
#### C5 — Global vs local edit propagation — open design — see prior handoff C3
#### C6 — Pod identification fix (vision priors + deeper crawl) — ~2 hr — see prior handoff F1+F2

## Hard rules — never break

1. Single synthesis-shell workspace — no per-step wizard routes.
2. Strict UI taxonomy: left rail = input, right rail =
   output+metadata, canvas chrome = tool, header = navigation.
3. Provider-agnostic AI (no hardcoded default model).
4. Typed provenance on every action (`entryRef → capabilityRun`).
5. Graph-first persistence — Convex is the truth. Don't ship features
   that depend on data URLs leaking outside the lap.
6. Red/green TDD — failing test first, then minimal code.
7. Don't run `npx convex deploy` without Ernie's authorization
   (.env.local points at oceanic-dolphin-808; CLI auth alignment).
8. Don't push to `origin/main` without Ernie's say-so. 44 unpushed
   commits already accumulated; don't make it worse.

## Smoke checklist

Per priority A item:

```bash
# 1) IKEA caption regression
npx vitest run lib/agent/auto-mode.test.ts -t 'caption appears in lap-end embed'

# 2) Multi-format hero
curl -sS -X POST http://localhost:3002/api/auto-mode/run \
  -H 'Content-Type: application/json' \
  -d '{"trigger":{"kind":"text","payload":"IKEA sustainable furniture"},
       "variationCount":1,"notifyMode":"notify",
       "workspaceId":"<real-convex-id>"}'

# 3) Multi-format × multi-locale composer
node scripts/compose-eightsleep-mockup.mjs   # offline visual verification

# 4) Discord embed visibility — eyeball the channel after a smoke

# 5) Real auto-post (only if Ernie has set X/IG/TT tokens)
curl -sS -X POST http://localhost:3002/api/auto-mode/run \
  -H 'Content-Type: application/json' \
  -d '{"trigger":{"kind":"url","payload":"https://www.eightsleep.com/"},
       "variationCount":1,"notifyMode":"auto-post",
       "workspaceId":"<real-convex-id>"}'

# 6) Trace endpoint
curl -sS http://localhost:3002/api/campaigns/<id>/trace | jq

# 7) Tests + tsc
npx vitest run --reporter=dot
npx tsc --noEmit -p tsconfig.json
```

## Verdict template for your final report

Write a follow-up handoff doc with:
- Per-task verdict: READY / PARTIAL / BLOCKED (with reason)
- Smoke evidence (per-format heroes, composed mockups, masks JSON
  when SAM3 is back, Discord screenshot, post URLs)
- Vitest pass count delta + tsc state
- What needs Ernie's hand vs what an agent can pick up next
- Updated env-var checklist with which platforms are unblocked

## One-line reminder

Ernie's verbatim: **"can you power through to post on x ig and tik
tok immediately with all the right variants and languages and
captions"** — that's the bar. Anything less is not done.

---

**Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>**

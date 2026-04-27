# Handover — fully-local stack + remaining issues

**Date:** 2026-04-27 12:00 SGT · **From:** Claude Opus 4.7 (1M ctx) · **To:** next session

## TL;DR

Aether's auto-mode lap now runs almost entirely on the local machine: CLIP + SAM3 are FastAPI servers on localhost (the Mac fork of SAM3 + Apple Silicon MPS for CLIP), the Anthropic Managed Agents API is bypassed, OpenAI is the only remaining cloud dep for image generation, and Convex still runs in the cloud (local Convex is a known unfinished item).

23 commits sitting locally on `main` ahead of `origin/main` (= `1caaeb7`). User has not yet asked for them to be pushed; **do not push without explicit go**.

## What's running right now

| Service | Endpoint | Status |
|---|---|---|
| aether dev | `localhost:3030` | up (started w/ env that points at local CLIP + SAM3) |
| CLIP cluster | `localhost:8002/cluster` | up on MPS (~3-5s per call) |
| SAM3 segment | `localhost:8001/segment` | up on **CPU** (~5-10s per call) |
| Convex | `https://fiery-opossum-632.convex.cloud` | cloud (local not yet wired — see Open issues §1) |
| `/runs` page | `localhost:3030/runs` | live, auto-refreshes |
| `/inspect/<id>` | `localhost:3030/inspect/<id>` | live, auto-refreshes every 5s while running |

Local SAM3/CLIP venv lives at `.venv-local-models/` (gitignored). Bring up with `bash scripts/serve-local.sh` after `source .venv-local-models/bin/activate`.

## What shipped this session (23 commits since 8am)

```
7994f1a feat(inspect): show input references panel + persist them on campaign row
a92c114 fix(api/auto-mode/run): accept referenceImages plural array
b9985bf fix(auto-mode/ingest): UploadAssetInput field is wsId not workspaceId
0108546 feat(auto-mode/ingest): brand refs uploaded to Convex before lap continues
395b145 fix(scripts/fire-debut-lap): disable fetch headers timeout
ae4f330 feat(scripts): fire-debut-lap — auto-mode lap with local editorial refs
6618d80 fix(image/openai): fail-soft per ref so one stale URL doesn't kill the call
711c1db chore(gitignore): exclude local SAM3/CLIP venv + python caches
86e7b81 feat(inspect,auto-mode): live auto-refresh + AUTO_MODE_USE_MANAGED_AGENTS env
dd42758 fix(modal/local/sam3): SAM3_DEVICE env override + default to cpu on Mac
404cf41 fix(image/openai): server-side fetch URL refs so /edits actually receives them
3e4633b feat(runs): /runs history page + ↗ all runs link in workspace header
49d6779 feat(modal/local): pure-FastAPI ports of SAM3 + CLIP for local dev
07a2677 feat(workspace): CampaignSwitcher header chip — toggle between concurrent laps
d4cb3d3 feat(auto-mode): multi-platform fan-out — X + IG + LinkedIn per variation
20e6abd feat(scripts): test-immediate-post — single-platform publish smoke test
2f9e033 feat(storage,ig): R2 staging for Convex URLs unblocks IG posting
7e1a5de feat(per-format-render): hero-anchor mode for cross-aspect identity
e2dfc63 fix(workspace): drop check survives Convex sync re-seed wipes
5823084 fix(signoff): anchor 36h auto-post window on server-supplied now
4c7b7ba fix(compose): strip emoji before SVG so Pango cannot abort the process
70ab29b feat(safe-zones): add IG square + IG profile-grid crop presets
0d14f93 fix(canvas): align seed artboards with auto-mode format frames
```

Major themes:

1. **Visual identity across aspects**: hero-anchored per-format rendering (`7e1a5de`) + `openai.ts` URL-fetch path (`404cf41`) + per-ref fail-soft (`6618d80`). Same magazine cover across 1:1 / 4:5 / 9:16 / 16:9 instead of 4 different shoots.
2. **Brand-ref durability**: ingest-to-Convex (`0108546`) + R2 staging for IG (`2f9e033`). No more "stale URL kills the lap" failures.
3. **Local stack**: pure FastAPI ports (`49d6779`) + Mac-friendly SAM3 fork wiring (`dd42758`) + managed-agents env override (`86e7b81`) + Convex env override.
4. **UI affordances**: campaign switcher chip (`07a2677`), `/runs` history page (`3e4633b`), `/inspect` auto-refresh (`86e7b81`), input-refs panel (`7994f1a`).
5. **Multi-platform**: X + IG + LinkedIn fan-out per variation (`d4cb3d3`), per-platform native-aspect hero, R2-unblocked IG (`2f9e033`).

## env state (`.env.local`)

User-facing toggles set this session:

```bash
AUTO_MODE_USE_SIGNOFF=0           # signoff date bug worked around (commit 5823084 fixes it; can flip to 1)
AUTO_MODE_USE_MANAGED_AGENTS=0    # forces messages.create instead of Anthropic Managed Agents API
AUTO_MODE_PLATFORMS=instagram,linkedin,x   # fan-out enabled
SEGMENTATION_PROVIDER=sam3
SAM3_MODAL_URL=http://127.0.0.1:8001/segment   # was Modal cloud
CLIP_MODAL_URL=http://127.0.0.1:8002/cluster   # was Modal cloud
```

R2 storage (for IG staging) **not yet configured** — these are still placeholder values:

```bash
R2_ACCOUNT_ID=…    # need
R2_ACCESS_KEY_ID=…
R2_SECRET_ACCESS_KEY=…
R2_BUCKET=aether-public
R2_PUBLIC_BASE_URL=https://pub-<hash>.r2.dev
```

Without R2, IG posts fail-soft per `2f9e033`'s `maybeStageForMeta` warning, and Meta returns the documented `error_subcode 2207052`. X + LinkedIn work without R2 (they fetch our URL server-side themselves).

LinkedIn auth is partly set:
- `LINKEDIN_ACCESS_TOKEN` provided by user mid-session
- `LINKEDIN_MEMBER_ID` **NOT resolved** — user's token only has `w_member_social` scope, not `openid profile email`, so `/v2/userinfo` returned 401. Need user to either (a) regenerate the token with `openid profile email w_member_social` scopes, or (b) hand over the MEMBER_ID directly. **Until that, LinkedIn posting will fail.**

## Open issues (priority order)

### 1. Local Convex (parked)

User asked twice. Tried `npx convex dev --local` (didn't bind a port — exits after typecheck). Tried `npx convex dev --configure new --dev-deployment local` — fails with `Cannot prompt for input in non-interactive terminals`.

**Resolution requires user to run interactively in their own terminal:**

```bash
cd /Users/erniesg/code/erniesg/aether
npx convex dev --configure new --dev-deployment local --typecheck=disable
```

Then the user updates `.env.local`:

```bash
NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:<port>
NEXT_PUBLIC_CONVEX_SITE_URL=http://127.0.0.1:<port>
CONVEX_DEPLOYMENT=local:<deployment-id>
```

…and restarts `next dev`. Local DB starts empty — historical campaigns disappear from `/runs`. New laps land in local. **DO NOT proactively switch this without user nod** — their cloud Convex has all the demo's historical campaigns.

### 2. Brand-ref ingestion validation in flight

`0108546` adds the proper fix (auto-mode fetches each upstream ref, uploads to Convex storage, and uses our durable URL downstream). **Has not yet been observed end-to-end on a fresh lap** — every recent test lap used `triggerKind: 'text'` and bypassed URL ingestion entirely. Next URL-trigger lap will exercise it.

A regression test would be valuable: spin up an http server that returns a 404 for one ref + a real PNG for another, fire a lap with that as the trigger URL, assert the lap completes with one ref staged + the 404 dropped + lap.status=completed.

### 3. Agent prompt still hardcodes `platform: instagram`

`auto-mode.ts:693` hardcodes `"platform": "instagram"` in the agent's hero prompt. The fan-out (`d4cb3d3`) re-routes a single variation to all platforms in `AUTO_MODE_PLATFORMS`, but the variation still records `schedulePlatform=instagram` internally. Cosmetically inconsistent with the multi-platform reality. Fix: change to a placeholder or array, let the agent pick or have the lap fan-out override per platform.

### 4. SAM3 device-mismatch on MPS

The MaximeLglr/sam3-apple-silicon fork solves Triton import but doesn't patch every device-mismatch in the inference path. Currently SAM3 runs on **CPU** via `SAM3_DEVICE=cpu` (~5-10s per call). MPS works for boot/load but throws `RuntimeError: Expected all tensors to be on the same device` mid-inference under `PYTORCH_ENABLE_MPS_FALLBACK=1`. The fix needs upstream patches per HF discussion #11 (the `pin_memory()` removal in `processing_sam3_video.py:343`, plus similar fixes to `sam3_image_processor`). Worth opening a PR upstream when time permits.

### 5. /inspect → live useQuery (vs. router.refresh polling)

Current `/inspect` is server-rendered + auto-refreshes every 5s via `AutoRefresh.tsx`. Snappier alternative: convert to a client component using `useQuery(campaigns:get)` + `useQuery(campaigns:listVariations)` + `useQuery(lapEvent:listByCampaign)`. ~30-45 min refactor, gives WebSocket-style live updates instead of 5s polling. Tradeoff: loses the trace API's extra enrichment (agent run details, scheduled posts) unless those are also added as Convex queries.

### 6. Push state

24 commits ahead of `origin/main` (`1caaeb7`). User explicitly said "push commits made before 8am only" earlier in session — I pushed `1caaeb7:main` per that instruction. The 24 newer commits are local. **User has not asked to push them.** Confirm before pushing.

### 7. Text overlay rendering on canvas (FIXED in `<HEAD>` — verify on next lap)

Pre-fix bug: `lib/auto-mode/canvas.ts` was creating geo (rectangle) shapes for the text-overlay positioning, but never set the `text` prop on them, so the overlays appeared as invisible / empty rectangles on `/workspace`. The user noticed: "text overlays are not added into the canvas".

Fix shipped this session: every overlay now produces TWO shapes —
- A geo rectangle (dashed white outline as a positioning guide).
- An editable `text` shape on top with the actual copy. Double-click to edit. Carries the same overlay meta so the global-text propagator (in the same file) fans edits across sibling frames.

Verify on next lap drop: open `/workspace/<wsId>?campaign=<id>` and you should see the headline + caption text visible in the 1:1 frame, with all 4 locale overlays present (en-SG / zh-Hans-SG / ms-SG / ta-SG). Double-clicking should let you edit.

### 8. Refs flow confirmed

`a92c114` route fix + `404cf41` URL-fetch + `7e1a5de` hero-anchor combine to make this real. Latest dev log shows `firing renderPerFormatHeroes — 2 brand refs + HERO-ANCHORED` for both v1 and v2 of the in-flight DEBUT lap (`jx7dv8a3bysjwfe3jgk7j62r2x85mjnt`). When that lap settles, its 4 native heroes per variation should show the dingman + joe duo (not synthetic East Asian models).

## How to fire a fresh lap

```bash
# Text trigger with local refs (the DEBUT magazine demo):
npx tsx scripts/fire-debut-lap.ts

# URL trigger:
curl -X POST http://localhost:3030/api/auto-mode/run \
  -H 'content-type: application/json' \
  -d '{"workspaceId":"my-ws","trigger":{"kind":"url","payload":"https://www.eightsleep.com/"},"notifyMode":"notify"}'

# Smoke single-platform post immediate:
npx tsx scripts/test-immediate-post.ts --platform=x
npx tsx scripts/test-immediate-post.ts --platform=instagram   # needs R2 to actually post
npx tsx scripts/test-immediate-post.ts --platform=linkedin    # needs MEMBER_ID
```

## Reference points

- GOOD baseline (pre-anchor, but native dims correct): http://localhost:3030/inspect/jx70m3jx394z129f7snae91swn85k7v3
- Hero-anchored proof-of-concept (lap=failed, v1 ready): http://localhost:3030/inspect/jx7djgp21dtaads8hyrz8vtv6585m7n5
- DEBUT laps (text-only, no actual refs because they predate `a92c114`): http://localhost:3030/inspect/jx7bxyny0bjbzh3568p61w1mb585m3kk
- DEBUT lap WITH refs in flight: http://localhost:3030/inspect/jx7dv8a3bysjwfe3jgk7j62r2x85mjnt
- All runs index: http://localhost:3030/runs

Local PNGs:
- `/tmp/aether-demo-runs/probe-1x1.png` etc — verified-correct heroes from the GOOD baseline
- `/tmp/aether-demo-runs/shanghai/` — the original ground-truth fashion editorial (hero-anchor predecessor)
- `/tmp/aether-demo-runs/debut/` — 8 PNGs from `scripts/recordings/debut-magazine-editorial.mjs` (with/without text)
- `~/Downloads/dingman4k.png` + `~/Downloads/joe_glasses.png` — brand refs the lap is being asked to anchor on

## Where to start next session

1. **Push the 23 commits** (after user nod) — `git push origin main`. They're a coherent block: local stack + visual identity + posting fan-out + UI affordances.
2. **Confirm refs reached OpenAI** on the `jx7dv8a3…` lap once it lands (or a fresh fire-debut lap). Look for `2 brand refs + HERO-ANCHORED` in the dev log; the `/inspect` refs panel will show the dingman + joe thumbnails.
3. **R2 + LinkedIn creds** — these need user input. R2: bucket+keys. LinkedIn: token rescope or MEMBER_ID. Without them, IG posts and LinkedIn posts won't fire.
4. **Convex local** — only worth doing once user wants the fully-air-gapped demo. Cloud Convex is fast and reliable; not blocking.
5. **Agent prompt platform-pick** — small change, fixes the cosmetic inconsistency.

— Opus 4.7, 2026-04-27 12:00 SGT

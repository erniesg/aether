# Handoff — SAM3 grounding + auto-mode UX + provider perf

**Date:** 2026-04-27 14:30 SGT · **From:** Claude Opus 4.7 (1M ctx) · **To:** next session

## TL;DR

Today's session shipped ~50 commits on top of the prior handoff. Auto-mode laps now persist URL ingestion + cluster bundle + reference images so `/runs` expand can show what was scraped + how refs grouped. Drag-drop generations also persist as synthetic campaigns and ping Discord with a "Post now" button. SAM3 grounding has a friendly 422 path. Several real bugs remain — biggest are SAM3 grounding silently failing on photographic heroes (lap shows `masksOneShotMatched: 0`) and gpt-image-2 occasional 600s+ tail latency.

50+ commits on `main` ahead of `origin/main` (= prior handoff baseline). User has NOT asked to push; do not push without explicit go.

## Tech states / what's running

| Service | Endpoint | Notes |
|---|---|---|
| aether dev | `localhost:3030` | Hot-reloaded multiple times this session |
| SAM3 local | `localhost:8001/segment` | CPU-pinned (`SAM3_DEVICE=cpu`); ~135s+ on cold call (slow even after warm) |
| CLIP local | `localhost:8002/cluster` | MPS, ~3-5s per call |
| Convex | `https://fiery-opossum-632.convex.cloud` | Cloud; multiple `npx convex dev --once` schema pushes today |

## What shipped this session (newest commits first)

```
4e73f53  fix(workspace): URL-typed prompt → auto-mode lap when auto is on
22065e6  fix(convex/creatorContext): strip client-side id before insert
ee726ec  fix(sam3,research): friendly grounding-no-match + research empty diag
d72b5c0  feat(runs,inspect): persist + surface URL ingestion + cluster bundle
474d088  fix(auto-mode): stage data-URL refs + actually USE the staged result
810d407  feat(generate): persist drag-drop as synth campaign + Discord post-now
6e00e06  fix(canvas): SegmentationPanel + FloatingToolbar z-[1000] + diag log
e6b92d1  fix(composer): only intercept file drops over composer footprint
c3f665b  feat(action-log): expand-inline + load-cached-run-to-canvas
ec0ed6c  fix(text-overlay-bridge): drop translucent bg panel behind overlays
a964a9a  fix(ui/opacity): every menu/popover/dialog → z-[1000] + opacity-100
2fd4a6e  fix(generate): SSE keepalive every 20s + 30min client stale ceiling
13ff605  fix(convex/textOverlay): omit nullable snapshot refs vs inserting null
7ce307c  feat(runs,logging,hydration): inline-expandable + lap-trace + ssr fix
d6ff101  fix(canvas): switch to AetherTextShape (geo.text rejected too)
843935c  fix(canvas,openai): geo+text-label + bump 240s→600s timeout
0fcea87  fix(convex/schema): add campaign.referenceImages — startCampaign was throwing
35c8988  fix(text-overlay,canvas): drop bg rect + loosen wsId + saved heroes + direct-gen script
56ff611  chore(logs): per-hop reference-image logging — agent dispatch, openai entry, edits multipart
d49260a  feat(segment): wire bg-inpainting alongside SAM3 cutout (LAMA via Replicate)
1b5909a  feat(ui): post-now button on variation card + click-anywhere on /runs row
1cb962a  fix(ui/opacity): replace bg-surface-2 + bump rail/menu z-index
```

## Active issues — ordered by user priority

### 1. SAM3 grounding silently fails on photographic heroes ⊕

- Eight Sleep auto-mode lap shows `masksOneShotMatched: 0` AND `masksVisionGuidedMatched: 0` on the v1 hero
- SAM3 server returns 422 `{"code":"grounding_no_match","message":"text prompt … did not match any region"}` for many text prompts
- Lap continues without masks → `cropAndResize` defaults to centre-crop instead of mask-aware crop
- Same root cause as the SegmentationPanel "isn't connected" toast the user saw (`sam3: 500 {detail:"sam3 grounding returned no masks"}` — now wrapped to a friendly 422)
- Files: `modal/local/sam3_local.py` (raises `GroundingFailedError`), `lib/agent/segment-subjects.ts` (ONE_SHOT_PROMPTS), `lib/agent/auto-mode.ts` (calls `segmentSubjects` in `runPostHeroPipeline`)
- **Fix path:**
  - Try multiple prompts in parallel and accept any non-empty result
  - Fall back to SAM2 (`men1scus/birefnet`, salient-object detector — needs no prompt) whenever SAM3 grounding returns 422
  - Log per-prompt grounding outcome so the lap log shows which prompts hit

### 2. SAM3 perf — 135s+ per call ⊕

- Per the prior handoff, SAM3 was supposed to run 5–10s on CPU (Mac MPS device-mismatch makes MPS unusable; CPU-pinned via `SAM3_DEVICE=cpu`)
- 135s is too slow even for cold start
- Verify in `bash modal/local/serve-local.sh` log: 1st call slow (cold), 2nd call should be <10s
- Profile candidates:
  - Image preprocess size — resize source to 1024px max edge before sending
  - `processor.set_image` cost — cache per-imageUrl
  - MPS fallback patches (HF discussion #11 — `pin_memory()` removal in `processing_sam3_video.py:343`)

### 3. Canvas SegmentationPanel — add "auto-segment all" path ⊕

- Today: SAM3 default needs text prompt OR FG/BG points OR box. SAM2 (`men1scus/birefnet`) auto-segments the salient subject — no prompt needed.
- User wants a single button that applies the `ONE_SHOT_PROMPTS` catalogue (the auto-mode lap's catalogue) to the selected canvas image and drops EVERY detected mask as its own cutout layer + a single inpainted bg layer.
- Also: switch panel default provider to SAM2 for `remove bg` (no prompt needed); keep SAM3 only when user wants prompted segmentation.
- Files: `components/canvas/SegmentationPanel.tsx` (UX), `components/canvas/CanvasSubstrate.tsx` (`handleApproveSegmentation`), `lib/agent/segment-subjects.ts`.

### 4. gpt-image-2 600s+ tail latency ⊕ (NEW)

- Sequential Eight Sleep lap from this session: v1 ready in ~5min, v2 failed with `openai: request timed out after 600s` (the bumped ceiling from commit 843935c).
- gpt-image-2 + 11MB ref bytes occasionally exceeds the 600s ceiling.
- Options:
  - Bump `OPENAI_IMAGE_TIMEOUT_MS` to 1200s (20min)
  - Resize refs server-side before forwarding to /v1/images/edits (sharp resize to ≤2048 longest edge — keeps identity hints, drops upload+process tail)
  - Switch provider to Flux+PuLID via Replicate for the slow case (image provider registry already supports this; env-toggle)

### 5. Auto-mode research returns 0/0/0

- Diag now logs: `[research/tool-use] brand="…" blocks={"text":N,"tool_use":M} finalTextLen=… preview="…"`
- Read on next lap. If `M=0` web_search not invoked (rate limit, key access). If `M>0` + text empty, Claude didn't synthesize JSON — tighten prompt.
- File: `lib/agent/managed/research.ts (runViaToolUse)`

### 6. Discord "Post now" RE-FIRES the lap

- Button (commit 810d407) links to `/api/auto-mode/approve` → synth POST with `notifyMode=auto-post` + `forcePostNow=true` → calls `/api/auto-mode/run` AGAIN with the hero URL as a NEW trigger → re-research, re-cluster, re-render. Wasteful + slow.
- Add `/api/auto-mode/post-now?c=&v=` that calls `scheduleVariationPosts` directly on the existing variation row.
- Files: `lib/agent/auto-mode.ts` (`scheduleVariationPosts`), `app/api/auto-mode/approve/route.ts`.

### 7. Per-platform creds blocking actual posting

- IG needs `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL` for staging Convex URLs to a public CDN
- LinkedIn needs MEMBER_ID resolved (token currently `w_member_social` only, missing `openid profile email` — `/v2/userinfo` returns 401)
- X works without R2 (fetches our URL itself)

### 8. Auto-fire stacking (UX) ⊕

- When the auto chip is on, every URL paste/drop/type fires a lap. User had 3+ Eight Sleep laps stacked when typing fast.
- Consider a debounce / "are you sure?" if a lap was fired within 30s for the same workspace + same URL.

## Provider cheat sheet

- **gpt-image-2** `/v1/images/edits` — image-to-image with 1+ refs. Identity preservation is unreliable; refs = style/composition hints, not face clones. For true identity, swap to Replicate Flux+PuLID or InstantID (provider registry already supports this; env-toggle).
- **SAM3** (modal/local at `:8001`) — text-prompted segmentation. Brittle on photographic heroes. Requires prompt OR interactive points/box.
- **SAM2** (Replicate `men1scus/birefnet`) — fully automatic salient-object detector. No prompt, no points, no box. Best for "just remove the background."
- **LAMA** (Replicate `cjwbw/lama`) — content-aware fill, no prompt. Wired to fire alongside SAM3/SAM2 cutout for two-layer flow (commit d49260a).
- **Anthropic web_search_20250305** — research path, currently returning 0 hits. Diag log will reveal why on next lap.

## Test fires

```bash
# auto-mode lap with local PNG refs
npx tsx scripts/fire-debut-lap.ts --brief=kfc

# mirror UI drag-drop /api/generate (no agent loop, short prompt + refs)
npx tsx scripts/fire-debut-direct.ts

# direct curl
curl -X POST localhost:3030/api/auto-mode/run \
  -H 'content-type: application/json' \
  -d '{"workspaceId":"demo-ws","trigger":{"kind":"url","payload":"https://www.eightsleep.com/sg/"},"variationCount":2,"notifyMode":"notify","concurrency":"sequential"}'
```

## Logging in /tmp/aether-dev.log

```
[lap-trace] cid=… input-refs=N payload="…"
[lap-trace] cid=… v<i> status=… hero=… formats=4x5,9x16,16x9
[openai/edits] POST → … image[]=N (bytes per ref: …) prompt[0..120]=…
[auto-mode v<i>] firing renderPerFormatHeroes — N brand refs + HERO-ANCHORED
[auto-mode v<i>] saved hero / saved 4x5 → /tmp/aether-demo-runs/heroes/…
[research/tool-use] brand="…" blocks={…} finalTextLen=…
[segmentation/providers] loaded: sam3=AVAILABLE · sam2=AVAILABLE
[openai/generate] model=… size=… refs=N promptLen=…
```

Saved heroes always land in `/tmp/aether-demo-runs/heroes/v<i>-<format>-<ts>.png`.

## Ground rules (per `CLAUDE.md` + user reminders)

- Single synthesis-shell route. No wizard splits.
- NO bg color panels behind text overlays (user has said this 3+ times this session).
- All menus / popovers / dialogs at `z-[1000] opacity-100`. `bg-surface-2` is undefined Tailwind utility — use `bg-surface-panel-muted`.
- tldraw 3.x text shape rejects flat `text` prop — use `AetherTextShape` (custom util at `components/canvas/shapes/AetherTextShape.tsx`).
- Convex `wsId` on most tables loosened to `v.string()` (route slug, not doc id).
- Commit frequently with conventional prefixes; user wants "git add commit progress" between fixes.
- NEVER push without user nod.

## Start here

1. `cat docs/handoffs/HANDOFF-2026-04-27-AFTERNOON-LOCAL-STACK.md` (prior handoff)
2. `git log --since='15 hours ago' --oneline` to catch up on every commit
3. `tail -300 /tmp/aether-dev.log` for live state
4. Ask the user what to attack first; if they say "you decide" go after **issue 1** (SAM3 grounding fallback to SAM2 — biggest UX win, smallest scope, unblocks the auto-mode lap's mask-aware cropping).

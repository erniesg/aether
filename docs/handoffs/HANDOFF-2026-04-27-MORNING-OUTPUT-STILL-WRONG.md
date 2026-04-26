# Handover — outputs "still wrong and not giving me what i want"

**Date:** 2026-04-27 morning · **From:** Claude Opus 4.7 (1M ctx) · **To:** next session

## The ask in one line

User said: _"can u commit progress so far and gimme a handover prompt to investigate this issue: [Image #17] [Image #18] still wrong and not giving me what i want"_.

The screenshots are **not in this doc** — please ask Ernie to re-share or describe them on the first turn so you can pin down which delta is biting. Possibilities ranked by likelihood:

1. **Subject placement / framing per aspect** is still off — the gpt-image-2 generation honours the canvas size now (no letterbox), but the model is still putting subjects dead-centre regardless of the aspect cue, so wide / tall canvases look "wrong".
2. **Atlas tiles still feel cropped** even with variable rows (1×1=380 / 4×5=475 / 9×16=676 / 16×9=214). Maybe the row gaps or vertical alignment inside each row look stitched.
3. **Brand-identity drift** — Eight Sleep / IKEA laps return generic stock-style imagery instead of recognisable brand frames. Research bundle isn't shaping the prompt enough.
4. **Text overlay placement** — headline/caption/cta land in awkward spots on portrait / wide aspects.
5. **Canvas drop on /workspace** — tldraw IndexSizeError was fixed at HEAD (`616fce3`), but the user's screenshot may still show the broken state from a stale tab.
6. **Publish failure** — IG Graph API rejects Convex storage URLs (Meta media-puller can't fetch them), so the lap notifies-success but nothing lands on IG.

**Do not guess which one — get the screenshots first.**

---

## What's been shipped (10 commits this session, all on `main`)

```
b9261ab chore(recordings): cached-run index, shanghai editorial, text-prop fix
616fce3 fix(canvas): asset dims match source intrinsic — no more IndexSizeError
3e3d837 feat(image): aspect-aware composition cues + recompose hint per format
7ee393a fix(image): exact-aspect dims for 9:16 + 16:9 — kill the 1% letterbox
4c08686 chore: bundle prior-session lap scaffolding + evidence artifacts
00555a3 chore(recordings): playwright walkthroughs for /inspect + /workspace
14ab2fe feat: ?campaign= deep link + /inspect 500 fix + research fallback
7fedddd feat(discord): approve / reject / review link buttons on lap-end embed
84ffe6a fix(text-overlay): variable atlas row heights + trailing-punct wrap
3926a91 feat(image): gpt-image-2 native sizes — drop gpt-image-1 and dall-e-3
```

`npm test` and `npm run typecheck` were green at the last run.

---

## "This works" vs "this is still off" — your reference points

### THIS WORKS — Shanghai fashion editorial (ground truth for native aspect + composition)

- `/tmp/aether-demo-runs/shanghai/4x5-without-text.png` — 1024×1280, full-figure both subjects, breathing room above/below.
- `/tmp/aether-demo-runs/shanghai/9x16-without-text.png` — 1152×2048, Bund clock tower + Pearl Tower environment.
- `/tmp/aether-demo-runs/shanghai/16x9-without-text.png` — 2048×1152, Pudong skyline cinematic landscape.
- (1×1 was retrying when the session ended; check `/tmp/aether-demo-runs/shanghai/1x1-without-text.png`.)

These were produced via `scripts/recordings/shanghai-fashion-editorial.mjs` — direct gpt-image-2 `/v1/images/edits` calls per aspect with `~/Downloads/dingman4k.png` + `~/Downloads/joe_glasses.png` as references and aspect-specific composition cues. **This is the bar — every aspect is a distinct composition that fits its canvas natively.**

### THIS IS STILL OFF — brand laps (Eight Sleep / IKEA)

Cached campaigns to compare against:

| When | wsId | campaignId | brand |
|---|---|---|---|
| 2026-04-26 night | `demo-eightsleep-final` | `jx70m3jx394z129f7snae91swn85k7v3` | Eight Sleep |
| 2026-04-26 late | `demo-eightsleep-fixes` | `jx7218553a71zqdpn5wsn15ebs85k68v` | Eight Sleep |
| 2026-04-26 evening | `demo-eightsleep-v3` | `jx70avqwdx7j48g6fdcshbe02585kvrh` | Eight Sleep |
| (full index) | — | — | `/tmp/aether-demo-runs/all-runs.md` |

Open in browser: `http://localhost:3030/inspect/<campaignId>` and `http://localhost:3030/workspace/<wsId>?campaign=<campaignId>`.

To regenerate the index after any new lap:

```bash
node scripts/recordings/list-cached-runs.mjs > /tmp/aether-demo-runs/all-runs.md
```

---

## Demo recordings — where they live

- `/Users/erniesg/code/erniesg/aether/scripts/recordings/out/inspect-walkthrough-v2.mp4` — /inspect page tour (expanded sections).
- `/Users/erniesg/code/erniesg/aether/scripts/recordings/out/workspace-auto-mode-v3.mp4` — `/workspace/...?campaign=...` cached lap drops onto canvas.
- `/Users/erniesg/code/erniesg/aether/scripts/recordings/out/canvas-text-propagation/` — global-scope text propagation across the 4 frames.

The driving scripts are checked in under `scripts/recordings/`.

---

## Files most likely to be relevant when triaging

| File | What it does | Likely-suspect lines |
|---|---|---|
| `lib/agent/per-format-render.ts` | Builds the prompt sent to gpt-image-2 per aspect | `withAspectComposition`, `ASPECT_COMPOSITION_CUE` map |
| `lib/providers/image/openai.ts` | gpt-image-2 adapter | `fitToGptImage2Size` (multiples of 16, pixel-range clamping), `pickOpenAISize` (passes through reqW/H) |
| `lib/providers/image/util.ts` | aspect → dims | `dimsFromAspect` — exact aspects: 9:16 = 1152×2048, 16:9 = 2048×1152, 4:5 = 1024×1280, 1:1 = 1024×1024 |
| `lib/text-overlay/compose.ts` | Atlas (4-tile) compositor + text overlay | `rowImageH` map, `ASCII_TRAILING_PUNCT` set, `composeVariantSet` returns `atlasWidth/Height/RowHeights` |
| `lib/text-overlay/cjk-wrap.ts` | Tamil/Latin/CJK line-break logic | `isAsciiTrailingPunct`, Intl.Segmenter token loop |
| `lib/auto-mode/canvas.ts` | Drops variation onto tldraw canvas | `assetDims` (per-format frame dims, fixes IndexSizeError) |
| `lib/agent/auto-mode.ts` | The lap orchestrator | `buildLapEndActionRows`, atlas upload uses composed dims |
| `lib/agent/managed/research.ts` | Research enrichment via Anthropic Managed Agents | empty-bundle fallback to `runViaToolUse` |
| `lib/notify/discord.ts` | Lap-start / lap-end pings | `components`, `DiscordLinkButton`, `DiscordActionRow` |
| `app/api/auto-mode/approve/route.ts` | GET + POST approve handler | **BUG: GET passes `variation.heroImageUrl` as trigger.payload — agent re-fires and hallucinates "possums" because the URL contains "fiery-opossum"** |
| `app/api/auto-mode/reject/route.ts` | GET reject handler | calls `convex.mutation('campaigns:rejectVariation')` |
| `app/inspect/[campaignId]/page.tsx` | Read-only campaign trace | origin defaults to `localhost:${PORT ?? 3030}` |
| `components/workspace/WorkspaceShell.tsx` | Reads `?campaign=<id>` URL param on mount | calls `setInFlightCampaignId` |
| `lib/store/editor-ref.tsx` | Exposes editor as `window.__aetherEditor` (dev) | used by canvas-text-propagation walkthrough |

---

## Open bugs (in priority of "blocks the demo")

### 1. Possum hallucination in `/api/auto-mode/approve` (GET)

`app/api/auto-mode/approve/route.ts` synthesises a POST body and uses `variation.heroImageUrl` as the trigger payload. That URL is the Convex storage URL on `https://fiery-opossum-632.convex.cloud/...` — when the auto-post lap re-runs, the research agent reads "opossum" as a brand cue and writes a post about possums.

**Fix sketch:** pass through the original campaign's `triggerPayload` (it's already on the campaign doc) instead of inventing one from the hero URL. Or use the variation's text overlays as the payload.

### 2. IG Graph API rejects Convex storage URLs

Meta's media-puller (the IG `/media` endpoint that fetches the URL you give it) returns 400 _"Only photo or video can be accepted as media type"_ for every Convex URL. `curl -I` against the same URL works fine — Meta is doing something Cloudflare blocks (User-Agent? Range header? `cache-control: private`?).

**Fix sketch:** stage the image to S3 (or any URL Meta will fetch from) before calling `/media`. There's a `wanx/` precedent of S3-staging videos for HeyGen / Argil.

Posting to **X works fine** through the same lap — only IG is blocked.

### 3. OpenAI 500 wave (upstream flake, retry-only)

~80% of `/v1/images/generations` calls returned 500 during the late-night window. Saved 4 unique request IDs to `/tmp/aether-demo-runs/openai-errors.log`. Eventually retries succeeded. **Don't fix — observe.**

### 4. Signoff agent date misinterpretation

The signoff agent thinks "scheduled post date 2026-04-27 is far beyond the 36-hour auto-post window". Today literally _is_ 2026-04-27. Worked around with `AUTO_MODE_USE_SIGNOFF=0` in `.env.local`. Real fix is to ground the signoff agent on a server-supplied `now` instead of letting the model compute relative dates.

### 5. (Maybe-fixed-but-verify) tldraw IndexSizeError

Fixed in `616fce3` by matching asset w/h to format frame dims. **Verify by running a fresh lap end-to-end and watching `/workspace/<wsId>?campaign=<id>` drop without throwing.**

---

## How to start triaging

1. Get the screenshots from Ernie (#17 / #18) — that pins the diagnosis.
2. Pull the latest Eight Sleep run on `/inspect/jx70m3jx394z129f7snae91swn85k7v3` and compare its 4 hero frames against the Shanghai PNGs side-by-side. The deltas are your bug list.
3. If the issue is composition / framing per aspect, look at `lib/agent/per-format-render.ts` `ASPECT_COMPOSITION_CUE` — the cues are there, but the model may need the cue at the **front** of the prompt instead of the end. Per OpenAI's prompting guide, gpt-image-2 weights early tokens more.
4. If the issue is brand identity drift, look at how the research bundle is being mixed into the per-format prompt. The bundle is passed to `runRender` in `lib/agent/managed/research.ts` outputs but might be diluted by the brand-mood description.
5. If the issue is atlas tiles, check `lib/text-overlay/compose.ts` `rowImageH` and the y-offset accumulation loop — verify each tile centres correctly inside its variable-height row.
6. **Don't refactor anything until the screenshots are interpreted.** Past sessions of this codebase have churned because we fixed perceived issues that weren't the actual user complaint.

---

## Environment ground truth

- Dev server: `npm run dev` on `:3030`. **Not 3000.**
- Convex: `npx convex dev` against `dev:fiery-opossum-632` (project `aether-fea34`).
- `.env.local` already has every key the lap needs (Anthropic, OpenAI, Apify, RapidAPI, Gemini, Replicate, Volcengine, Discord webhook, X tokens, IG token, Pinterest, TikTok, Modal CLIP/SAM3, agent IDs).
- `AUTO_MODE_USE_SIGNOFF=0` (workaround for #4 above) — flip to 1 once #4 is fixed.
- `AUTO_MODE_NATIVE_PER_FORMAT=1` — generates each aspect natively, not via crop.
- `SEGMENTATION_PROVIDER=sam2` — sam3 has been flaky; sam2 is the demo-safe pick.

---

## Key incantations

```bash
# fire a fresh lap
curl -X POST http://localhost:3030/api/auto-mode/run \
  -H 'content-type: application/json' \
  -d '{"workspaceId":"demo-ws","triggerPayload":"<your brand prompt>","notifyMode":"notify"}'

# regenerate cached-run index after a new lap
node scripts/recordings/list-cached-runs.mjs > /tmp/aether-demo-runs/all-runs.md

# regenerate Shanghai (skips already-rendered files)
node scripts/recordings/shanghai-fashion-editorial.mjs

# inspect / workspace deep links
open http://localhost:3030/inspect/<campaignId>
open "http://localhost:3030/workspace/<wsId>?campaign=<campaignId>"
```

---

**Last word:** Ernie has been burned by past sessions claiming "fixed" without visual evidence. Whatever you change, screenshot the before/after of an actual lap output (not just unit tests passing) before declaring victory.

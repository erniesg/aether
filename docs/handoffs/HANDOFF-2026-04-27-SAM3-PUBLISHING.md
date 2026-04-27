# Handoff — SAM3 reliability + publishing requirements (focused)

**Date:** 2026-04-27 evening SGT · **From:** Claude Opus 4.7 (1M ctx) · **To:** next session

This is a **scoped** handoff — pair with `HANDOFF-2026-04-27-EVENING-SAM3-AUTOMODE.md` for full context. The user wants two threads driven to completion in the next session:

1. **SAM3 works reliably** — both the auto-mode pipeline (lap fires it server-side) AND the canvas SegmentationPanel (creator-driven manual click).
2. **Publishing path is real** — auto-mode lap variations + drag-drop generations both have a toggle for {post-now / review / schedule}, surfaced in the right rail, posting respects whatever's on the canvas at post time (not the original render).

## Thread 1 — SAM3 reliability

### Current state

- Local server: `localhost:8001/segment`, healthz returns `{"ok":true,"device":"cpu","model":"sam3"}`
- CPU-pinned via `SAM3_DEVICE=cpu` (MPS still throws device-mismatch on inference paths — HF discussion #11)
- **Cold start ~2min, warm calls observed at 135s+** (bad)
- **Grounding fails silently on photographic heroes** — the auto-mode lap's `runPostHeroPipeline → segmentSubjects` returns `masksOneShotMatched: 0` AND `masksVisionGuidedMatched: 0` for Eight Sleep / KFC / dingman+joe outputs
- Server returns 422 `{"code":"grounding_no_match","message":"text prompt … did not match any region"}`. Wrapped to friendly hint in `lib/providers/segmentation/modal.ts` 422 handler (commit ee726ec)

### Concrete failures observed today

```
[auto-mode v1] variation.ready  masksOneShotMatched: 0  masksVisionGuidedMatched: 0
sam3: 500 {"detail":"sam3 grounding returned no masks"}  // canvas panel, before 422 wrap
[auto-mode v2] variation.failed  openai: request timed out after 600s   // gpt-image-2 tail
[auto-mode v2] variation.failed  fetch failed                           // Anthropic SDK transient
```

### Fix options (in priority)

**A. SAM3 grounding fallback chain**
Make the `segmentSubjects` call try multiple prompts in parallel and accept any non-empty result. Today a single failed prompt makes the entire one-shot pass return empty. Skeleton:

```ts
// lib/agent/segment-subjects.ts
const ONE_SHOT_PROMPTS = ['person', 'product', 'logo', 'face'];
const settled = await Promise.allSettled(
  ONE_SHOT_PROMPTS.map(p => segmentOne({...input, textPrompt: p}))
);
const matched = settled
  .filter(r => r.status === 'fulfilled' && r.value.maskUrl)
  .map(r => r.value);
// Return whichever subset matched, with the prompt label preserved
```

**B. Auto-fallback to SAM2 (`men1scus/birefnet`) when SAM3 returns 422**
`men1scus/birefnet` is a salient-object detector — no text prompt needed. When SAM3 grounding fails, route the same source URL through SAM2 silently and use that mask. Files: `lib/providers/segmentation/registry.ts` + the `runPostHeroPipeline` call site.

**C. Canvas SegmentationPanel — add "auto-segment all" button**
A single button that runs the ONE_SHOT_PROMPTS catalogue on the selected canvas image and drops every detected mask as its own cutout layer (each with bg-inpaint behind). Switch panel default verb to `remove bg` + provider to SAM2 (auto, no prompt). Files: `components/canvas/SegmentationPanel.tsx`, `components/canvas/CanvasSubstrate.tsx`.

**D. SAM3 perf**
135s+ on warm calls is unacceptable. Profile `modal/local/sam3_local.py`:
- Image preprocess size — resize source to ≤1024px max edge before `processor.set_image`
- Cache `processor.set_image` result by source URL hash so repeat segmentations on the same image share state
- MPS fallback patches per HF discussion #11 (`pin_memory()` removal in `processing_sam3_video.py:343`, plus parallels in `sam3_image_processor`) — would unlock GPU on Apple Silicon

### How to verify

```bash
# Check server up
curl -s localhost:8001/healthz

# Hit segment with a known-good salient image
curl -s -X POST localhost:8001/segment \
  -H 'authorization: Bearer ' \
  -H 'content-type: application/json' \
  -d '{"image_url":"https://res.cloudinary.com/eightsleep/image/upload/v1747147611/Homepage_c0dril.png","mode":"cutout","text_prompt":"person"}'

# Auto-mode lap that exercises segmentSubjects
curl -X POST localhost:3030/api/auto-mode/run \
  -H 'content-type: application/json' \
  -d '{"workspaceId":"demo-ws","trigger":{"kind":"url","payload":"https://www.eightsleep.com/sg/"},"variationCount":1,"notifyMode":"notify","concurrency":"sequential"}'
# Watch /tmp/aether-dev.log for masksOneShotMatched count
```

Restart SAM3 if needed: `bash modal/local/serve-local.sh` (kills + relaunches).

## Thread 2 — Publishing requirements

### What works today

| Path | State |
|---|---|
| `/api/auto-mode/run` with `notifyMode: 'auto-post'` + `forcePostNow: true` | ✅ X works; IG + LinkedIn blocked by creds |
| `/api/auto-mode/run` with `notifyMode: 'review'` (default) + UI approve | ✅ button on variation card fires `/api/auto-mode/approve` |
| `/api/auto-mode/run` with `notifyMode: 'notify'` + manual schedule | ✅ schedule date picker on variation card |
| Drag-drop generation persists as synthetic campaign + Discord ping | ✅ commit 810d407 (Discord embed + post-now button) |

### What's missing / broken

**1. Discord "Post now" button RE-FIRES the lap.**
Today's button (`commit 810d407`) links to `/api/auto-mode/approve?c=&v=1` — that route's GET handler synthesizes a POST → `runAutoMode` → re-research, re-cluster, re-render. The user clicks "Post now" and pays for a whole new lap.

**Fix**: Add `/api/auto-mode/post-now?c=&v=` that:
- Loads the existing campaign + variation row from Convex
- Calls `scheduleVariationPosts` directly with `forcePostNow: true`
- Returns a small HTML confirmation
- Files: `app/api/auto-mode/post-now/route.ts` (new), reuse `lib/agent/auto-mode.ts:scheduleVariationPosts`

**2. Drag-drop generation has only a "Post now" Discord button — no review or schedule path.**
The synthetic campaign DOES persist with `notifyMode: 'review'` as default. The Discord ping only offers `Post now to all platforms` and `Review in Aether ↗`. Add three buttons matching the auto-mode flow:
- 🚀 *Post now* → `/api/auto-mode/post-now?c=&v=1` (after fix #1)
- ✅ *Approve for review queue* → existing approve route with `notifyMode='review'` (no posting yet, just acknowledged)
- 📅 *Schedule* → opens an Aether route with a date picker; on submit calls `/api/auto-mode/schedule?c=&v=&when=` (new) which patches `scheduleWhenLocal` and lets the existing scheduler fire it

**3. Right rail post/review/schedule for ANY campaign or generation.**
Today the AutoModePanel right-rail variation card has `approve` / `post now` / `schedule` buttons but ONLY for the in-flight lap. The user wants the same actions exposed on:
- Any row in `/runs` expand
- Any item in the "all generations" right rail (ActionLog)

Files: `app/runs/page.tsx` (ExpandedRow), `components/rail/ActionLog.tsx` (run expand body), `components/rail/sections/AutoModePanel.tsx` (already has the buttons — extract to a shared `<VariationActions>` component for reuse).

**4. Canvas is the source of truth at post time.**
Today: lap renders the atlas via sharp + SVG, persists `atlasUrl`. If creator edits a text overlay on canvas, the edit is captured (now that commit f85ed68 fixed the propagator) and persisted to Convex `textOverlay` rows BUT the atlas PNG doesn't re-render. So `scheduleVariationPosts` posts the OLD atlas with stale text.

**Fix path**: at post time (post-now or scheduler trigger), re-render the atlas server-side using the LATEST text-overlay rows from Convex (not the snapshot from when the lap fired). Or: fall back to canvas-snapshot export — capture the canvas frames as PNGs via tldraw's export API, post those instead of the pre-rendered atlas. The capture-from-canvas approach handles ANY edit (text, image moves, segmented layer reorders), not just text overlays.

Files: `lib/agent/auto-mode.ts:scheduleVariationPosts`, `lib/text-overlay/compose.ts`, `lib/canvas/render-mode.ts`. Look at how `composeVariantSet` builds atlas — make it re-runnable from Convex state.

### Per-platform creds — what the user needs to provide

**R2 (for Instagram staging)**
Meta's Graph API rejects Convex storage URLs (Cloudflare-fronted). We stage to R2 first, then pass the R2 public URL to Meta. Required env in `.env.local`:

```bash
R2_ACCOUNT_ID=<your Cloudflare account id>
R2_ACCESS_KEY_ID=<R2 API token: access key>
R2_SECRET_ACCESS_KEY=<R2 API token: secret>
R2_BUCKET=aether-public
R2_PUBLIC_BASE_URL=https://pub-<random>.r2.dev   # public bucket URL or custom domain
```

**How to grab them:**
1. dash.cloudflare.com → R2 → Create Bucket `aether-public` (Public access ON, set up `pub-<random>.r2.dev` domain)
2. R2 → Manage R2 API Tokens → Create API token → Object Read & Write → scope to bucket → copy access key + secret
3. Account ID is in the right sidebar of the dashboard

After setting, restart Next dev. IG posts will then route through `lib/providers/storage/r2.ts:maybeStageForMeta`.

**LinkedIn MEMBER_ID** ✅ *resolved 2026-04-27 evening — `LINKEDIN_MEMBER_ID=46862439` is in `.env.local`*
Token however still has only `w_member_social`. For `/v2/userinfo` we need `openid profile email` scopes too. The MEMBER_ID is set so posting can proceed once a fresh token with full scopes is pasted into `LINKEDIN_ACCESS_TOKEN`.

**Two options:**

*Option A — Regenerate the token with full scopes:*
1. linkedin.com/developers/apps → your app
2. Auth tab → request `openid`, `profile`, `email`, `w_member_social` on Sign In with LinkedIn product
3. Authorization URL flow: visit
   ```
   https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=<id>&redirect_uri=<uri>&scope=openid%20profile%20email%20w_member_social
   ```
4. Exchange code for token at `/oauth/v2/accessToken`
5. Hit `/v2/userinfo`:
   ```bash
   curl -H "Authorization: Bearer <token>" https://api.linkedin.com/v2/userinfo
   # response includes "sub": "<member-id>"
   ```
6. Set in `.env.local`:
   ```bash
   LINKEDIN_ACCESS_TOKEN=<new token>
   LINKEDIN_MEMBER_ID=<sub from userinfo>
   ```

*Option B — Skip /v2/userinfo and grab the member ID a different way:*
- linkedin.com → your profile → page source → search for `urn:li:member:` or `urn:li:person:` — the numeric/alphanumeric ID after that is the MEMBER_ID
- Or use a 3rd-party LinkedIn URN extractor

Option A is the canonical path; Option B is the "I just want it working" hack.

## Start here

1. Read `docs/handoffs/HANDOFF-2026-04-27-EVENING-SAM3-AUTOMODE.md` for the broader session context
2. Get user to set R2 + LinkedIn creds (per above) — without these, posting is X-only
3. Pick one of: SAM3 grounding fallback (Thread 1, option A or B) OR `/api/auto-mode/post-now` route + canvas-source-of-truth (Thread 2, fixes 1 + 4)
4. Commit frequently, conventional prefixes, NEVER push without user nod

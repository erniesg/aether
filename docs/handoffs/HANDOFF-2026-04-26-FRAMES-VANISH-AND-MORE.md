# Handoff — frames-vanish + drag-drop + ingest UX (2026-04-26 ~01:20 SGT)

The previous agent (me) has been patching symptoms instead of finding root causes. Ernie is frustrated and has correctly demanded a fresh agent with a real-debug-first mandate. **Read this entire file before touching anything.**

## The user

**Ernie** (hello@ernie.sg). Hackathon-mode, exhausted, minimal patience for "API responds, UX unverified" claims. Specifically called out:

- "test locally first then the staging site"
- "validate your own work before calling it done"
- "I want screenshots / logs / evidence before you say a fix landed"

If you can't reproduce a bug locally, **say so explicitly**. Do not deploy a guess.

## Repo state at handoff

- **main HEAD:** `a2b84a6 fix(canvas): register frame-loss listener INSIDE onMount, not in a useEffect`
- **Working dir:** `/Users/erniesg/code/erniesg/aether` (you are here)
- **Stg deployed:** Version `d3cc8fa0-3609-4461-9c46-c8f09ec835d9` (Cloudflare Worker)
- **Stg URL:** `https://aether-stg.berlayar.ai/workspace/demo-ws`
- **Stg Convex backend:** `https://oceanic-dolphin-808.convex.cloud`
- **Stg Convex confirmed live for:** `runs:abortStuck`, `creatorContext:saveOffer` with `id` field
- **Local Convex dev:** `careful-ermine-104` (per `.env.local`) — different from stg's

## Locked context — do NOT re-derive

The 2026-04-25 demo thesis is **"creative is responsive by default."** Single hero render → multilingual editable text overlays → format crops. SAM3 dropped. See `~/.claude/projects/-Users-erniesg-code-erniesg-aether/memory/project_demo_thesis.md` and `AGENTS.md` + `CLAUDE.md`.

The aether **product** is a creator-first canvas tool with strict UI taxonomy: `input` (left rail), `output | metadata` (right rail), `tool` (canvas + composer chrome), `navigation` (header). Single synthesis-shell route. **Do not re-architect.**

## Open bugs Ernie is hitting — in priority order

### P0.1 — Format artboards disappear seconds after page load

**Symptom (her screenshots, 2026-04-26 01:17):** Page loads with 4 artboards (IG Post, Story, Reel cover, LinkedIn) visible. **A few seconds later, all 4 are gone.** Canvas is empty. No user action between the two states.

**What I tried (and why each failed or is unverified):**

1. **First fix:** `useEffect([])` in `TldrawCanvas` registering a `store.listen` callback that re-seeds if frames hit zero.
   **Bug in my fix:** `useEffect([])` runs synchronously after first render. `editorRef.current` is `null` at that point because tldraw's `onMount` is async. The early-return killed listener registration. Re-seed never fired.

2. **Second fix (current main):** Moved listener registration **inside** `onMount`. Added `console.log` for `[aether/canvas]` events: `onMount · initial frames`, `commit · frame count`, `+1s check`, `re-seeding artboards`.
   **Status:** Deployed in Version `d3cc8fa0`. Per Ernie's most recent screenshots the artboards STILL vanish. **You must check the console logs to see what the actual state transition looks like.** I have not seen the logs.

**What you do next:**

1. `npm run dev` locally. Open `http://localhost:3000/workspace/demo-ws`. Open DevTools Console. Reload.
2. Watch the `[aether/canvas]` log stream as the page loads + sits idle 30s. You will see one of these patterns:
   - `commit · frame count: 4` then later `commit · frame count: 0` → some commit deletes them. Look at the commit's call stack (DevTools Sources tab → break on store mutations) to find which code path.
   - Frames stay at 4 in logs but visually disappear → tldraw is hiding them via CSS / camera / page swap. Different bug class.
   - `+1s check · frame count: 4` then page goes blank without further commit logs → the entire React tree is re-mounting (look for unmount + remount).
   - `re-seeding artboards` fires but next `commit` shows `frame count: 0` again → seed-and-delete loop, find the deleter.
3. Once you have the actual transition, fix the **deleter** (likely candidate: brand-propose worker calling `editor.replacePage()` or similar; check `lib/brand/propose.ts` + any code that uses `editor.deleteShapes` / `editor.replacePageContents` / `loadSnapshot`).

Files to inspect:
- `components/canvas/TldrawCanvas.tsx` — current fix attempt
- `lib/canvas/seedArtboards.ts` — seed logic, uses `editor.selectAll() → zoomToSelection → setSelectedShapes([])`. Maybe selectAll-then-deselect is racing with something.
- `components/canvas/CanvasSubstrate.tsx:235` — uses `getCurrentPageShapes()`, check if it mutates
- `components/workspace/WorkspaceShell.tsx` — the `auto-abort on mount` I added, check for any re-render side effects
- `lib/brand/propose.ts` — propose worker, may touch editor

**Hard validation requirement:** Before you say it's fixed, reproduce the issue locally, fix it, and watch the console for **30+ seconds idle** showing `frame count: 4` stable. Then deploy stg and repeat. Screenshot before/after.

### P0.2 — Stuck Convex runs persist on every page load

**Symptom:** Page loads with `error · aborted: run exceeded inactivity threshold` red bar at the bottom — even on a fresh tab, even after clearing localStorage. Multiple Convex runs accumulate in `running` state and `ComposerStatus` reads the most recent as the live state.

**What I tried:**

1. Tightened the abort-button threshold in `ComposerStatus.tsx` so early-pipeline steps (`prepared`/`sending`/`received`/`parsing`) show abort at 15s instead of 180s. **Deployed.**
2. Added `abortStuckRuns(120_000)` on `WorkspaceShell` mount. **Deployed.**
3. Manually cleared 3 stuck runs via `curl POST oceanic-dolphin-808.convex.cloud/api/mutation` to `runs:abortStuck`. **Worked at the time.**

**Why it persists:** Likely the brand-propose worker (and possibly other agents) kicks off a `capabilityRun` row that **never reaches `done`/`error` status** — it just sits in `running` until the universal abort fires. So every brand ingest leaves a fresh stuck run. The auto-abort on mount kills runs >120s old, but a run created 30s ago by your most recent ingest is still showing.

**What you do next:**

1. Read `lib/brand/propose.ts` end-to-end. Trace the `capabilityRun` lifecycle: who calls `startRun`, who calls `finishRun`/`failRun`. **Find the path that doesn't close.**
2. Likely fix: in `app/api/brand/propose/route.ts`, ensure every code path (success, error, partial) emits a terminal step.
3. Or shorter fix: lower the auto-abort threshold to 60s and reduce the legitimate `awaiting` step expectation (currently brand-propose can take 60-90s for the 3-worker plan, so 60s might catch legit runs — needs care).

Validation: hit `curl https://oceanic-dolphin-808.convex.cloud/api/query -d '{"path":"runs:list","args":{}}'` after a brand ingest and confirm the new run reaches `status: "ok"` or `"error"` within X seconds, **never `"running"` for >X**.

### P0.3 — Drag-drop reference image into composer doesn't work

**Symptom:** Ernie drags an image from her desktop onto the composer area / canvas / anywhere. No reference tile appears. She's reported this **at least 4 times across the night**.

**What I tried:**

1. Read `PromptComposer.tsx` drop handlers — code looks correct (handleDragEnter / handleDragOver / handleDrop wired on the form).
2. Confirmed tldraw is bounded to `.tl-container` and shouldn't intercept document-level drops.
3. **Latest attempt (deployed in `6abdfaa`):** added **window-level capture-phase** dragenter/dragover/drop listeners in `PromptComposer.tsx`. Idea: catch the drop on `window` before it bubbles to tldraw, route to `ingestFiles`. **Has not been verified by Ernie — she still says drag-drop doesn't work in latest screenshots.**

**Two possibilities I have NOT ruled out:**

- The window-level handlers ARE working but `ingestFiles` errors silently (e.g., file size > 8MB → silent skip, or `readFileAsDataUrl` throws). Check console for any error.
- The window-level handlers ARE NOT firing because tldraw 4.5.10 (per the script log earlier) hooks `dragover` at `document` with capture too, racing my `window` listener. Check by adding `console.log('[aether/composer] window dragenter')` etc.

**What you do next:**

1. Local dev. Open DevTools. Drag a small JPG (<1MB) from desktop into the page.
2. Console should show window-level events firing. If yes but no ref tile appears, debug `ingestFiles`.
3. If window events DON'T fire → tldraw is racing. Switch to `document.addEventListener` instead of `window.addEventListener`, or use a `dragover` capture on a wrapping div around `<Tldraw>` inside `CanvasSubstrate`.

### P1 — Brand-propose mis-routes its proposals (UX)

**Ernie's exact complaint:**
> "your offers and campaigns are on other pages shouldnt u like ingest only what is applicable to the current context + pre-populate stuff on other pages and make it editable then on the other pages allow users to 'smartly' have ai regenrate defaults for them also"

**Current behavior:** User pastes a URL into the **brand source field**. The 3-worker brand-propose runs (brand follow-up + offer drafts + campaign drafts + coverage notes). All proposals — including offer cards and campaign cards — surface in the **brand flyout** as accept/reject cards.

**Correct behavior:**
- The brand flyout should only show brand-shape data (palette, voice, type, knowledge sources, brand name).
- Offer drafts should auto-populate the **Offer rail** (with an "AI-suggested" badge so creators know).
- Campaign drafts should auto-populate the **Campaign rail** (same badge).
- Each rail (brand/offer/campaign) should have a "regenerate from brand" button that re-runs JUST that worker for that rail's context.

**Files involved:**
- `lib/brand/propose.ts` — the 3-worker (brand follow-up + offer + campaign + reviewer). Proposals are returned together.
- `app/api/brand/propose/route.ts` — the API route. Currently returns the bundle.
- `components/rail/sections/BrandSection.tsx:434` — currently shows the whole `BrandFollowups` in the brand flyout.
- `components/rail/sections/OfferSection.tsx` — needs to receive `proposed: OfferDraft[]` from brand-propose; render with accept/reject + "regenerate".
- `components/rail/sections/CampaignSection.tsx` — same shape for campaign drafts.

**Suggested approach:**
1. Add `proposedOffers: OfferDraft[]` and `proposedCampaigns: CampaignDraft[]` to the workspace context (Convex tables `proposedOffers`, `proposedCampaigns` keyed by `wsId`).
2. After brand-propose completes, write proposals to those tables.
3. OfferSection / CampaignSection subscribe via Convex `useQuery` and render the proposals as accept/reject cards (matching the existing accept/reject UX on the brand panel).
4. Brand panel only shows brand-shape stuff.

This is a 30-60min UX rework. **Do not start until P0.1 / P0.2 / P0.3 are verified fixed.**

### P2 — Save doesn't work (claim, currently unverified)

Ernie said "save doesn't work" but her screenshot showed `solstice collective / test` — looks like brand name "test" did save. **Confirm with her** which exact field she means before fixing. Likely either:
- The "save" indicator isn't showing post-save → minor UX bug
- Or the saved field reverts on next focus → check rail's two-phase hydration (BrandSection.tsx already has it; OfferSection.tsx + CampaignSection.tsx also have it per `bc49d53`).

## Convex deployment quirk (worth understanding before you push)

The repo has **TWO Convex deployments** under one project:
- `dev:careful-ermine-104` (set in `.env.local`)
- `oceanic-dolphin-808` (used by stg per `wrangler.jsonc`)

`npm run deploy:stg` runs `convex deploy --yes` first (which uses `.env.local` → dev), then `wrangler deploy` (which sets `NEXT_PUBLIC_CONVEX_URL` in the Worker env to `oceanic-dolphin-808`). **Functionally things work** — fixes I deployed land on `oceanic-dolphin-808` (verified via `curl POST .../api/mutation`). But the mechanism is unclear. Possibilities:

1. `CONVEX_DEPLOY_KEY` env var in Ernie's shell that overrides `.env.local`.
2. Convex project-level schema sync between dev and prod.
3. `convex deploy` in CI somewhere (haven't found one).

**Don't get stuck on this.** Test on stg via the live URL. If your fix doesn't show up on stg, then dig in.

## Recent commits to read before touching code

```
a2b84a6 fix(canvas): register frame-loss listener INSIDE onMount, not in a useEffect
6abdfaa fix(canvas,composer,workspace): three regressions Ernie hit on stg tonight
d58cb72 fix(composer): show abort button at 15s for early-pipeline steps
419b552 test(e2e): cross-platform clear in offer/campaign persistence spec
6080926 feat(agent,api): applyTextOverlay multilingual planner + /api/text-overlay/apply route (#90 part 1)
8b97477 fix(convex): offer + campaign profiles missing id field caused silent save failures
9d9e4d0 feat(agent): applyComponentEdit (#108)
d5cf568 feat(agent): sketch → SemanticCreativeComponent (#107)
1cc7de0 feat(canvas): crop-from-hero utility (#106)
cfb2949 T1: text-overlay schema + text-apply capability (#74)
d7ec852 feat(prompt): layout-aware prompt construction (#109)
c034fc1 fix(convex): drop oversized imageUrl from runs:finish (#102)
```

## Hard validation script — RUN BEFORE YOU SAY ANYTHING IS FIXED

Local first:

```bash
cd /Users/erniesg/code/erniesg/aether
git pull origin main --quiet
npm run typecheck         # must be clean
npm test                  # 700+ tests, must all pass
npm run dev               # http://localhost:3000

# In a real browser at /workspace/demo-ws with DevTools open:
# 1. Reload, watch [aether/canvas] logs for 30s. Frames stay at 4? Yes/no.
# 2. Drag a small JPG onto the page. Reference tile appears? Yes/no.
# 3. Open brand flyout, type into brand source: https://stripe.com, click ingest.
#    Wait 30s. Status bar at bottom: any stuck "generating" indicator? Yes/no.
# 4. Click rail icons in sequence: brand, offer, campaign, references.
#    Each opens cleanly? Yes/no.
```

After local passes, deploy:

```bash
npm run deploy:stg
# wait for completion, get Version ID
/usr/bin/curl -sS -X POST https://oceanic-dolphin-808.convex.cloud/api/mutation \
  -H "Content-Type: application/json" \
  -d '{"path":"runs:abortStuck","args":{"olderThanMs":10000},"format":"json"}'
# → should return {"aborted":N} or 0

AETHER_BASE_URL=https://aether-stg.berlayar.ai \
  npx playwright test tests/e2e/phase0-stg-evidence.spec.ts \
  tests/e2e/offer-campaign-persistence.spec.ts \
  --project=chromium --workers=1
# all should pass
```

**Then load stg in a real browser, repeat the manual checks above.** No "API works UX unverified" — Ernie has called this out three times tonight.

## Tone guidelines

- Direct. No padding. No apologies — just diagnose and fix.
- "I cannot reproduce X" is a perfectly valid answer; "I think X is fixed" is not.
- Show evidence before claiming. Screenshots, console logs, curl output.
- If a fix needs Ernie's eyes (like drag-drop), explicitly request it.
- Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com> on every commit.
- Conventional commit prefixes: `fix:`, `feat:`, `test:`, `chore:`, `docs:`.

Good luck. The frames-vanish bug is the demo blocker — start there.

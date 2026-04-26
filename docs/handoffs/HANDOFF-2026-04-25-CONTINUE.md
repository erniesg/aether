# Handoff — continue Aether demo work

**Date:** 2026-04-25 SGT
**Repo:** `/Users/erniesg/code/erniesg/aether`, branch `main`
**Stg:** `https://aether-stg.berlayar.ai/workspace/demo-ws` (last shipped version `62d941b3`)
**Convex prod deployment:** `oceanic-dolphin-808.convex.cloud`

You are picking up cold. **Read this whole doc + `AGENTS.md` + `CLAUDE.md` before touching anything.**

The user (Ernie) is running a hackathon demo. He has minimal confidence in the prior agent's claims because too much was shipped as "API responds" without end-to-end UX verification. Your job: **earn that confidence back by validating end-to-end before claiming anything works, and by minimising his test burden — he should only test final, meaningful things when each demo question (Q1–Q7) lands.**

## Hard rules from Ernie

1. **Auto-merge for chore/docs/test PRs.** Wired at `.github/scripts/route-review-verdict.mjs` (commit `17b48c5`). Don't override unless asked.
2. **Evidence in Discord on APPROVE.** Reviewer's "Acceptance items" + PR body's "## Validation" sections are embedded. Confirm this fires correctly when PR #101 lands.
3. **Don't ping Ernie until the demo path works end-to-end.** API-passing isn't enough. Need: stg URL works in browser, the user-facing flow is recorded, copy is editable, etc.
4. **Provider mandate** (live on stg via wrangler.jsonc):
   - Claude Opus 4.7 = agentic planner everywhere
   - Voice = `gemini-live` + `gemini-3.1-flash-live-preview` (default; OpenAI Realtime fallback only)
   - Image = OpenAI only (default)
   - Segmentation = SAM3 Modal direct (no Claude in loop yet — see #100 for adoption)
5. **Provider settings live per-workspace** at the header `Settings` chip (commit `385d50e`). Convex `workspaceProviderPrefs` table.
6. **Don't force-push main.** Worktrees for parallel work.

## Honest state of each demo question

Use this table as the truth source. Update it as you ship.

| Q | Promise | API live? | UX live on stg? | E2E browser-verified? | Demo-ready? |
|---|---|---|---|---|---|
| **Q1** | Brand ingest → autonomous offers/goals + edit, persist | ✅ `/api/brand-ingest` + `/api/brand/propose` | ✅ BrandSection + propose cards | ❓ **NOT verified** by Ernie or me | 🟡 verify in browser |
| **Q2** | Research → cluster → moodboard + visual edits + segment-aware text | ✅ `/api/research`, `/api/clusters/*` | ✅ ClusterLens + moodboard wand | ❓ **NOT verified** end-to-end | 🟡 multi-agent enrichment in flight via #98 |
| **Q3** | Fan-out + editable text vectors + multilingual | ⛔ text-apply is stub only | ⛔ no real text overlays | ⛔ blocked on issue #90 + PR #74 + #88 | ❌ **NOT demoable** today |
| **Q4** | Capability factory authoring novel skills | ✅ `/api/capability/factory` plan endpoint | 🟡 toolbar reserves chip slots; live authoring loop not recorded | ⛔ never end-to-end recorded | 🟡 needs Skills format (issue #99) |
| **Q5** | Auto-schedule + post to social | ✅ preview path; ⛔ real Postiz | 🟡 schedule endpoint returns `preview-only` | ⛔ no UI button to trigger schedule | 🟡 needs UI + PR #84 decision |
| **Q6** | Hackathon pitch | ✅ `docs/SUBMISSION-BUILD-FOR-WHATS-NEXT.md` | n/a | n/a | ✅ ready to record |
| **Q7** | Eyes-closed sketch + voice → multiformat + post | 🟡 only on `feat/airbrush-voice-calibration` worktree | ⛔ NOT on main / stg | ⛔ never end-to-end | 🟡 B-roll only |

**Translation: Q1, Q2, Q4 are plausibly demoable but unverified. Q3 + Q5 + Q7 are NOT demoable today. Q6 is just a record-and-edit task.**

## What the prior agent shipped (commits + verification level)

| Commit | What | Verified how |
|---|---|---|
| `248db74` | Voice mandate config (gemini-live default + model) | curl `/api/voice/session` GET ✅ |
| `385d50e` | Provider settings UI + Convex prefs table | unit + component tests ✅; **NOT browser-tested** |
| `30068ab` | Stream B: brand → offers/goals 3-worker planner | curl POST works, returns coverage notes ✅; **UI cards in BrandSection NOT browser-tested** |
| `3d40c86` | Brand persistence Convex round-trip | live curl saveBrand → getBrand round-trip with custom name ✅ |
| `5bdd2de` | Convex schema widening for legacy artifactKind | convex deploy succeeded ✅ |
| `0fd0c0f` | Restore convex-aware deploy:stg script | next deploy actually pushed convex functions ✅ |
| `31549f4` | Brand auto-save + type font preview + artboard re-seed | unit tests pass ✅; **NOT browser-tested** |
| `75aadcb` | Stale-SSE-stream timeout (120s + AbortController) | unit tests; **NOT triggered live** to verify abort fires |
| `17b48c5` | Auto-merge safelist + evidence-rich Discord on APPROVE | unit tests ✅; **never exercised live** (no PR has hit APPROVE since) |
| `c489ec9` | Auto-queue workflow (`.github/workflows/auto-queue.yml`) | **never exercised live** (no PR has merged since) |
| (in flight) | PR #101 — Managed Agents foundation (issue #100) | rebased + CI running; **reviewer not yet returned** |

## Open PRs you inherit

```
#101  Managed Agents foundation         CI running, reviewer running on 5e36b4b
#84   Postiz/SAU sidecar (codex/...)    CONFLICTING; product decision pending Ernie
#74   text-overlay schema               CONFLICTING (rebased base); ready-for-ernie
#72   image visual-only composition     MERGEABLE; ready-for-ernie
#33   selected-image creative-control   MERGEABLE; ready-for-ernie
```

## Open issues that matter

| # | What | Status |
|---|---|---|
| #100 | Managed Agents adoption (Q1+Q2+Q3+Q5) | claude-run; PR #101 is its agent output |
| #99 | Skills format + SkillRef emission | depends-on-pr (#100 → auto-queue) |
| #98 | Q2 multi-agent research orchestrator | depends-on-pr (#100 → auto-queue) |
| #90 | Real text-apply executor (Q3 core) | depends-on-pr; demo-blocker for Q3 |
| #88 | Toolbar grouping (Q3 helper) | depends-on-pr |
| #89 | Raster text lift (Q3 stretch) | depends-on-pr |
| #56/#57 | Postiz / SocialAutoUpload adapters | depends-on-pr |
| #66, #67, #68 | Text-overlay umbrella + sub-issues | track-text-overlay |

The dispatch chain is wired via `.github/workflows/auto-queue.yml`. When a PR merges, dependent issues with `depends-on-pr` + `Blocked-by: #N` markers get their `claude-run` label added → harness fires the agent.

**This chain has never been exercised live.** Validate it works on the first PR merge.

## Discord state

Configured (per `notify-discord-human-review.mjs`):
- Webhook: `DISCORD_WEBHOOK_URL` or bot token + channel id
- Embed colors per verdict
- Link buttons: "Open PR", "Review diff", choice buttons for BLOCK with packet
- Evidence fields embedded on APPROVE (commit `17b48c5`)

**Missing (Ernie flagged this):**
1. **No interaction "Merge" button** — only link buttons. Ernie wants one-tap merge from Discord.
2. **No thread support** — every notification posts to the main channel. Ernie wants per-PR threads for back-and-forth.

To fix:
- Add custom_id button (style 1) to the embed for `merge_pr_<n>`
- Extend `app/api/route-human/discord-interaction/route.ts` to verify signature + call `gh pr merge`
- Add `thread_id` param to webhook posts (Discord supports it for thread-targeted webhook messages)

## What you should do, in order

### Phase 0 — Validate what's already shipped (~30 min)

Browser-test stg `https://aether-stg.berlayar.ai/workspace/demo-ws`:

1. **Brand persistence** — open Brand rail → change name → reload → does it stick? If not, debug Convex query path.
2. **Brand auto-propose** — paste a real brand URL (your own site / `https://stripe.com` / etc.) → does ingest succeed? Do offer/campaign cards appear under Offer/Campaign rails? Are they accept-able?
3. **Type font preview** — does `editorial serif` actually render in Fraunces? Does `mono caption` render in JetBrains Mono?
4. **Format artboards** — delete one of the seeded frames → reload → does it re-seed?
5. **Settings popover** — click `providers` chip in header → does the popover open? Switch voice to openai-realtime → reload → does the choice persist? Switch back to gemini-live.
6. **Generate** — type a prompt in the composer → press enter → does an image land on the canvas? If it hangs, the stale-stream timeout (commit `75aadcb`) should abort after 120s.

**Capture screenshots or short clips of each.** That's your evidence packet.

### Phase 1 — Land #101 cleanly (1–2 hr)

PR #101 is the Managed Agents foundation. After CI + reviewer:
- If APPROVE → harness adds `ready-for-ernie` + Discord pings Ernie. **Embed should have evidence fields** (verify `reviewer acceptance` + `validation evidence` are present).
- If REQUEST_CHANGES → harness re-dispatches the agent. Should fix automatically.
- If BLOCK without packet → harness re-dispatches.
- If BLOCK with packet → Discord pings Ernie with reason + options.

When #101 merges → auto-queue workflow fires `claude-run` on #99 (Q4 Skills) + #98 (Q2 multi-agent) + #56/#57 (Postiz). Watch the Actions tab to confirm the chain works.

### Phase 2 — Fix Discord UX (Ernie's flagged this — 1–2 hr)

1. Add merge interaction button to APPROVE embed (custom_id: `merge_pr_<n>`).
2. Extend `app/api/route-human/discord-interaction/route.ts` to handle merge clicks. Verify `Ed25519` signature, call `gh pr merge --squash`.
3. Add per-PR thread support: open a Discord thread on first notification for that PR, post follow-ups (BLOCK packets, retries) to that thread.
4. Test by triggering a fake APPROVE and confirming the click merges.

### Phase 3 — Q3 (real text-apply executor) (half-day to 1 day)

The biggest demo gap. See `docs/handoffs/Q3-fan-out-editable-text-multilingual.md`. Tasks:
1. Replace `lib/text-overlay/capability.ts` stub with real Claude planner (segment-aware placement + BCP47 multilingual).
2. Wire the planner into a new `/api/text-overlay/apply/route.ts`.
3. Build the canvas selection toolbar UI (issue #88).
4. Per-aspect override scope.
5. End-to-end test: drop hero on canvas → composer "tonight only" → fan-out → 4 artboards each with editable English + zh-Hans text vectors.

### Phase 4 — Q5 (real schedule UI + Convex persistence) (~half-day)

See `docs/handoffs/Q5-auto-schedule-and-post.md`. Either:
- A) Preview-only path: build the Schedule button + Convex persistence; demo "the seam is real, status: preview-only".
- B) Real Postiz: stand up sidecar + set wrangler secrets + merge PR #84.

Ask Ernie which.

### Phase 5 — Demo polish + recording (~half-day)

After Q1, Q2 are browser-verified and Q3 + Q5 land:
- Run through `docs/SUBMISSION-BUILD-FOR-WHATS-NEXT.md` 3-min script
- Record on stg, narrate, edit
- Q7 (eyes-closed) only as B-roll opener if camera is stable on the day

## Acceptance gates per demo question

**Do NOT ping Ernie ready-for-ernie until each gate is met.** API-responds is not enough.

### Q1
- ☐ Brand persistence verified live in browser (name sticks across reload)
- ☐ Brand ingest → autonomous propose → offer card visible in BrandSection
- ☐ Acceptance card transitions to "saved" once user accepts
- ☐ Convex `brandProfile` + `offerProfile` rows visible in Convex dashboard after accept

### Q2
- ☐ Research scout button → cluster lens opens with labelled clusters
- ☐ Wand on cluster → moodboard panel renders with tweak chips
- ☐ Generate from moodboard → image lands on canvas
- ☐ Multi-agent path (after #98 lands): supervisor + 3 subagents visible in Convex `agentSession` rows

### Q3
- ☐ Editable text layer renders on top of generated image as a vector
- ☐ Text avoids segmentation-derived faces/products
- ☐ Per-aspect override scope works (story-only edit doesn't propagate)
- ☐ At least 2 locales in BCP47 map populated correctly

### Q4
- ☐ Live demo: ask for "neon drench wash" → factory plans `author-skill` → SKILL.md draft visible → user accepts → chip on toolbar
- ☐ Re-running pinned skill on a different layer works

### Q5
- ☐ Schedule UI shows pack of N variants → click Schedule → status pills appear
- ☐ Convex `scheduledPost` rows persist
- ☐ At least preview-only or real-Postiz works end-to-end

### Q6
- ☐ 3-min recording exists; no devtools / raw JSON visible
- ☐ Captions or clear narration

### Q7
- ☐ Optional B-roll only; not a blocker

## Known broken / unverified

- **PR #84 decision** — unresolved. Either close it (preview-only is enough) or merge it (needs Postiz sidecar). Ask Ernie.
- **Auto-queue workflow never fired** — first merge will exercise it.
- **Auto-merge harness never exercised** — first APPROVE since `17b48c5` will exercise it.
- **Stale-stream abort** (`75aadcb`) — never triggered live.
- **Discord interaction merge button** — not built.
- **Discord per-PR threads** — not built.

## How to communicate with Ernie

- Be direct. Don't bury the lede. Don't sound confident about things you haven't verified.
- If you ship something, attach a screenshot or curl-output. Otherwise say "API works, UX unverified".
- Use the auto-merge for trivial things; only ask Ernie for runtime/UI changes.
- Update this handoff doc as you ship — keep the table accurate.
- For multi-step tasks, dispatch sub-agents in parallel (the existing claude-run workflow + auto-queue chain make this trivial).

## Validation script

Before claiming anything is "done", run this:

```bash
cd /Users/erniesg/code/erniesg/aether
git fetch origin --prune --quiet
git log --oneline -10 main
npm run typecheck
npm test
# Smoke endpoints
for path in /api/health /api/voice/session ; do
  /usr/bin/curl -sS "https://aether-stg.berlayar.ai$path" | head -c 200
  echo
done
# Stg URL must serve workspace
/usr/bin/curl -sS -o /dev/null -w "%{http_code}\n" https://aether-stg.berlayar.ai/workspace/demo-ws
```

If any of those fail → fix before doing anything else.

## Repo invariants

- `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` on every commit
- Conventional-commit prefixes
- Don't force-push main
- Worktrees for parallel work
- Read `AGENTS.md` + `CLAUDE.md` before touching architecture

Good luck. Don't oversell. Show evidence.

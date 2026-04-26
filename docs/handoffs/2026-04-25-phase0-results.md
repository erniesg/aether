# 2026-04-25 — Phase 0 results + state when handed back to Ernie

Picking up the HANDOFF-2026-04-25-CONTINUE.md baton. This is what I verified, shipped, and found broken end-to-end. Don't trust any of it without re-running the validation specs in `tests/e2e/phase0-stg-evidence.spec.ts` against stg.

## Updated truth table (replaces the one in HANDOFF-2026-04-25-CONTINUE.md)

| Q | Promise | API live? | UX live on stg? | E2E browser-verified? | Demo-ready? |
|---|---|---|---|---|---|
| **Q1** | Brand ingest → autonomous offers/goals + edit, persist | ✅ | ✅ | ✅ **VERIFIED** — name/hex round-trip across reload; `https://stripe.com` → real offer cards (payments, connect) | ✅ |
| **Q2** | Research → cluster → moodboard + edits | ✅ | ✅ | ⚠️ not re-run as part of phase 0 — depends on PR #98 multi-agent enrichment | 🟡 |
| **Q3** | Fan-out + editable text + multilingual | ⛔ stub only | ⛔ | ⛔ | ❌ blocked on PR #74 + issues #88/#90 |
| **Q4** | Capability factory authoring | ✅ plan endpoint | 🟡 | ⛔ | 🟡 needs Skills format (#99) |
| **Q5** | Auto-schedule + post | ✅ preview only | 🟡 | ⛔ | 🟡 awaiting Ernie's preview-vs-real-Postiz call |
| **Q6** | Pitch | n/a | n/a | n/a | ✅ |
| **Q7** | Eyes-closed sketch + voice | 🟡 worktree only | ⛔ | ⛔ | 🟡 B-roll only |
| **Generate (cross-Q)** | Composer prompt → image fan-out | ✅ backend | ❌ **BROKEN** before fix in PR #102 | ❌ | 🔴 fix in flight |

## What I shipped (PR #102 — fix/convex-imageurl-sanitize)

1. **`fix(convex)`** — root cause for the "generate hangs forever" symptom. Convex `runs:finish` mutation was choking on the multi-MB base64 data URLs OpenAI gpt-image-1 returns. Run record never transitioned to `step:'done'`, so the composer status indicator stayed in `generating · placing on canvas` indefinitely. Sanitizer in `lib/convex/sanitize.ts` drops `data:` URLs and strings >256KB before they hit Convex; the image still lives on the canvas as a tldraw asset.
2. **`feat(harness)`** — Phase 2 part 1. `route-review-verdict.mjs` APPROVE manual-ack path now emits both link buttons (Open PR / Review diff / Comment) and interaction buttons (`✓ merge` / `↻ request changes` / `✗ block`). `merge_<n>` → onMerge → `gh pr merge --squash`. Custom-id format matches `BUTTON_PREFIX` in `lib/route-human/types.ts`.
3. **`test(brand-ingest)`** — fixes the `getByLabel('brand type')` strict-mode violation that was failing e2e on PR #101 (and would have broken every other PR's e2e too — type fields became indexed `'brand type 1' / '2' / …`). Same pattern applied to my new phase 0 specs.
4. **Phase 0 evidence harness** — `tests/e2e/phase0-stg-evidence.spec.ts` + `phase0-generate-debug.spec.ts`. Skip when `AETHER_BASE_URL` not pointed at stg, so safe in default CI runs. Screenshots in `docs/handoffs/phase0-evidence/` are the actual proof packet.
5. **Cosmetic** — `D1 — brand auto-ingest` → `Q1 — brand auto-ingest` to match Q1..Q7 convention everywhere else.

## What's blocked on Ernie

- **PR #102** itself — runtime files (`lib/convex/*`, `lib/store/*`) outside the auto-merge safelist. CI is green; needs your Discord ack (or merge from GitHub directly).
- **PR #101** (Managed Agents foundation) — reviewer APPROVED, but e2e is FAILURE for the same brand-ingest selector reason. Once #102 lands, rebase #101 onto new main → e2e re-runs → green → merge → auto-queue chain fires on #98 / #99 / #56 / #57.
- **PR #74** (text-overlay schema) — ready-for-ernie. **Q3 cannot start until this lands.**
- **PR #72** (image visual-only composition) — ready-for-ernie. Independent.
- **PR #33** (selected-image creative-control) — ready-for-ernie. Independent.
- **PR #84** (Postiz sidecar) — needs your preview-vs-real-Postiz product call before Q5 work continues.

## What I filed for follow-up

- **Issue #103** — Per-PR Discord threads (Phase 2 part 2). Deferred from this PR because thread creation requires bot API + persistence of PR → thread_id mapping (likely a `discord-thread:<id>` PR label). Scoped acceptance in the issue body.

## Things I observed but didn't fix

- **Stale-stream abort (commit `75aadcb`) is doing nothing in the failure mode I hit.** Captured a status bar reading `generating · placing on canvas · 5478s` — the timer is named `stale-event timer` and only fires when no events arrive for 120s. In the actual symptom, all four `frame.completed` events arrived; the failure happened in the post-stream Convex mutation. So the timer behaves correctly per its design, but the design doesn't catch this class of bug. Worth a separate ticket if you want a "no run.completed within 60s of last frame.completed" timer.
- **Tldraw 3.x license warning** spams every page load (no LICENSE_KEY env var). Cosmetic for hackathon; real for prod.
- **OpenAI `b64_json` is the only inline-base64 path.** Volcengine has the same shape (`lib/providers/image/volcengine.ts`). Replicate / Gemini return https URLs. So the Convex breakage was OpenAI-specific, but the sanitizer is provider-agnostic and protects future regressions too.

## Suggested next steps after you ack #102

1. Merge #102 (unblocks generate on stg + adds the merge button + fixes brand-ingest e2e for everyone).
2. Use the new ✓ merge button on **the next** APPROVE notification to verify it round-trips correctly.
3. Rebase PR #101 onto new main. Watch e2e go green. Merge. Confirm the auto-queue workflow fires `claude-run` on #98/#99/#56/#57 (it has never been exercised live — this is the test).
4. Triage the rest of the ready-for-ernie backlog (#74, #72, #33) — particularly **#74 unblocks all of Q3**.
5. Decide preview-vs-real-Postiz on #84 so Q5 can move.

## Reproducing the evidence

```bash
# Smoke
curl -sS https://aether-stg.berlayar.ai/api/health
curl -sS https://aether-stg.berlayar.ai/api/voice/session

# Browser evidence (regenerates docs/handoffs/phase0-evidence/*.png)
AETHER_BASE_URL=https://aether-stg.berlayar.ai \
  npx playwright test tests/e2e/phase0-stg-evidence.spec.ts \
  --project=chromium --workers=1

# The bug, before/after fix
AETHER_BASE_URL=https://aether-stg.berlayar.ai \
  npx playwright test tests/e2e/phase0-generate-debug.spec.ts \
  --project=chromium --workers=1
# Pre-fix: [outcome] timeout-180s, [final-images] 0, [CONVEX M(runs:finish)] Server Error
# Post-fix (expected after #102 deploys): [outcome] placed, [final-images] >0
```

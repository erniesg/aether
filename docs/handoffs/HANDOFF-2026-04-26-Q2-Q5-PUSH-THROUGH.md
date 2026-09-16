# Handoff — push items 2 and 5 to "fully ready" (2026-04-26)

You're picking up two unfinished demo tracks for **Ernie** (hello@ernie.sg). Hackathon-mode, exhausted, low patience for "API responds, UX unverified" claims. Direct tone, evidence over claims. Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>. Conventional commit prefixes (feat/fix/test/chore).

## What "fully ready" means by Ernie's bar

Not "code exists and tests pass." It means: **a creator can drive the full flow in a real browser against real APIs and see real content come back**. Synthetic fallbacks and mock fixtures are not acceptable as the primary path — they're acceptable only as a safety net when keys/hosts are absent, with clear UI surfacing.

- **Item 2 — Research → moodboard → visuals**: scout button hits real platform APIs (Pinterest / Instagram / TikTok / Xiaohongshu), real images come back, cluster lens populates with real refs, moodboard generates from those, visuals pass through the existing fan-out + multilingual text overlay path.
- **Item 5 — Auto-schedule + post**: Postiz instance hosted on Cloud Run, at least one platform (recommend Instagram or X, fastest OAuth) connected with a real integration ID, "schedule pack" click → Postiz UI reflects the scheduled post → cancel from aether → Postiz UI confirms cancellation.

## Repo state at handoff (2026-04-26 14:00 SGT)

- **`origin/main` HEAD:** `c51e796` — `feat(agent/managed): land agentSession ledger + SessionManager (#101)`. Major overnight work landed (PRs #119, #120, #121, #84, #130, #131, #132, #133, #134, #101). All vitest (1022 tests) + critical Playwright e2e green on origin/main.
- **Shared local checkout `/Users/erniesg/code/erniesg/aether`:** **another agent is actively working here**. State as of handoff: 1 commit ahead (`35cb062 fix: stabilize canvas composer p0s` — license, drag-drop, abort filter, optimistic state, opaque flyouts), 16 commits behind origin/main, **44 uncommitted files** with `+2551/-226` lines.
- **The 736-line `lib/research/signals.ts` exists in that uncommitted tree** — it has live Instagram/TikTok/XHS adapters, Apify + Instagram Graph backends, mode switching (`live | mock | preflight`). Plus brand ingest improvements, `lib/signals/convex.ts` updates, test scaffolding.
- **DO NOT touch the shared checkout directly.** That's the other agent's working tree. Coordinate by reading-only.

## Critical: worktree hygiene

You work in **a fresh worktree branched off `origin/main`**, NOT in the shared checkout. Before any edit:
```bash
pwd
git branch --show-current
git status -sb
```
If `pwd` is `/Users/erniesg/code/erniesg/aether` — STOP, save `git diff --binary > /tmp/agent-q2q5-recovery.patch`, and report.

Forbidden git operations: `git checkout` to a different branch, `git switch`, `git reset --hard`, `git cherry-pick` from other branches into yours. Stay on your worktree's branch the entire run. Push your branch + open a PR via `gh pr create` from inside the worktree.

## Coordination with the other agent

The other agent is reshaping `lib/research/signals.ts`, `lib/brand/{ingest,propose,extract}.ts`, `app/api/brand/propose/route.ts`, `app/api/research/route.ts`, `lib/context/creator-store.ts`, `components/rail/sections/{Brand,Offer,Campaign}Section.tsx`, and tests for those areas.

Your work must NOT touch those files. If you find you need to change one of them, STOP and write a note in your final report. There are plenty of edges to land work on without colliding.

## Track 2A — Wire RapidAPI signal scout into the research path

**Status of work already done elsewhere:**
- `lib/research/orchestrator.ts` (PR #119) — 3-subagent supervisor (researcher / clusterer / aesthetic-analyzer). 2-phase orchestration, fail-soft, fallback to single-pass under `MIN_REFS_FOR_MULTI_AGENT`. Already merged.
- `lib/research/signals.ts` — drafted in the other agent's WIP (Apify + Instagram Graph backends, ~736 lines). Not pushed yet. **Don't touch.**

**Architecture mandate from Ernie:** use **RapidAPI** as the primary scrape backend across platforms. RapidAPI hosts unofficial scrapers per platform that bypass the OAuth gauntlet entirely — single env var (`RAPIDAPI_KEY`), per-host route (`X-RapidAPI-Host`), pay-per-call. Tong uses this pattern. **No direct Pinterest API, no Instagram Graph API, no TikTok dev portal.**

**Your scope:**

You can't push the other agent's `signals.ts` (they own that file). Instead, **complement** it with these self-contained additions on `origin/main`:

1. **Shared RapidAPI client** in `lib/signals/rapidapi/client.ts`. Single fetch wrapper with `RAPIDAPI_KEY` env, `X-RapidAPI-Host` per-call, exponential backoff on 429, 30s timeout. Server-only — never imported by browser bundles. Tests in `lib/signals/rapidapi/client.test.ts`.
2. **Per-platform scrape modules** under `lib/signals/rapidapi/`:
   - `pinterest.ts` — RapidAPI host candidates: `pinterest-scraper.p.rapidapi.com` or `pinterest-data1.p.rapidapi.com`. Search by keyword/board. Returns image URLs + metadata.
   - `instagram.ts` — `instagram-scraper-api2.p.rapidapi.com` or `instagram-data1.p.rapidapi.com`. Hashtag + user feed.
   - `tiktok.ts` — `tiktok-scraper7.p.rapidapi.com` or `tiktok-data.p.rapidapi.com`. Hashtag/user search → video covers + metadata.
   - `xiaohongshu.ts` — `xiaohongshu-data.p.rapidapi.com` or `xhs.p.rapidapi.com`. Note thumbnails — XHS has watermark policies; respect.
   Each module: tiny (~80-150 LOC), normalizes RapidAPI's per-host shapes into a shared `SignalScrapeResult` type, returns `{ records: ReferenceRecord[], warnings: string[] }`. Per-module unit test with `vi.fn()` fetch mocks.
3. **Cassette tests** in `tests/fixtures/signals-cassettes/{pinterest,instagram,tiktok,xiaohongshu}.json` — recorded realistic RapidAPI responses (one per platform). `tests/integration/signals-rapidapi-shape.test.ts` plays them back through each adapter and asserts the resulting `ReferenceRecord[]` shape matches what cluster + moodboard expect downstream.
4. **`/api/signals/scout` server route** that takes `{ platform, query, limit }`, dispatches to `lib/signals/rapidapi/<platform>.ts`, returns `{ records, warnings, provider: 'rapidapi' }`. Adds `provider` field on each record for rail provenance pills.
5. **Secret doc** `docs/SIGNALS-SECRETS.md`:
   ```
   wrangler secret put RAPIDAPI_KEY --env staging
   wrangler secret put RAPIDAPI_KEY --env production
   ```
   Plus a "host overrides" section so Ernie can swap RapidAPI host per platform via `RAPIDAPI_PINTEREST_HOST` etc. without code change. Default hosts hardcoded in module files. Reference Tong ONLY as documentation — never import from it at runtime.
6. **Smoke harness** `scripts/smoke-signals.mjs` — runs each platform against real RapidAPI with the configured key. Prints record counts, errors out if any platform returns zero. Output structured (table) so Ernie can paste it into a PR comment.

**Forbidden files for Track 2A:**
- `lib/research/signals.ts` (other agent owns — uses Apify + Graph; your work is parallel via RapidAPI)
- `lib/research/research.ts` (other agent owns)
- `lib/research/orchestrator.ts` (PR #119 territory; keep stable)
- `lib/brand/`, `app/api/brand/` (other agent)
- `app/api/research/route.ts` (other agent)
- `components/canvas/` (PR #133 land zone)
- `components/rail/sections/{Brand,Offer,Campaign}Section.tsx` (other agent)

**Validation:**
- `npm run typecheck`
- `npm test` (full suite must stay green — 1022 tests passing currently)
- `npx vitest run tests/integration/signals-real-shape.test.ts lib/signals/pinterest.test.ts`
- E2E: extend `tests/e2e/research-moodboard.spec.ts` (or add a new `tests/e2e/signals-scout.spec.ts`) that mocks the adapter and validates the rail populates with provenance pills.

## Track 5A — Push real Postiz integration to demo-defensible

**Status of work already done:**
- `lib/providers/publisher/postiz.ts` (PR #84 + cancel-fix) — HTTP client. `POSTIZ_API_URL` + per-platform `POSTIZ_INTEGRATION_<PLATFORM>` env contract. `cancel()` actually deletes externally now.
- `infra/postiz/{deploy.sh,service.yaml,.env.postiz.example}` (PR #121) — Cloud Run deploy scaffolding. `deploy.sh` generates DB password idempotently and pushes everything to Secret Manager.
- `tests/integration/postiz-sidecar.test.ts` + `tests/fixtures/postiz-mock-server.ts` (PR #130) — mock fixture proves the seam.
- `docs/DEPLOY-PUBLISHERS.md` (PR #121) — full ops checklist.

**Your scope:**

You can't run gcloud or set up OAuth apps — that's manual ops Ernie has to do. What you CAN do:

1. **Pre-flight validator** `scripts/preflight-postiz.mjs` that runs through the deploy checklist:
   - Checks `gcloud` CLI is on PATH and authenticated (`gcloud auth list --filter=status:ACTIVE`)
   - Checks `infra/postiz/.env.postiz` exists and has the required keys filled (not the example placeholders)
   - Pings `https://api.upstash.com/` style health for `REDIS_URL` if set
   - Validates each `*_CLIENT_ID` is non-empty
   - Reports a clear pass/fail table so Ernie knows what's missing before calling `deploy.sh`
2. **Live Postiz contract test** `tests/integration/postiz-live.contract.test.ts` — gated behind `POSTIZ_API_URL` env var. When that var is set (i.e. real instance is up), the test does:
   - `POST /upload-from-url` with a placeholder image URL
   - `POST /posts` to schedule against `POSTIZ_INTEGRATION_INSTAGRAM` (or whichever single platform is set)
   - `GET /posts` to verify the row exists
   - `DELETE /posts/{id}` to cancel
   - All assertions on real Postiz responses. Skip cleanly when env unset so CI stays green.
3. **Smoke script** `scripts/smoke-postiz.mjs` — invokable after deploy. Hits `POSTIZ_API_URL/health`, lists integrations, prints integration IDs (which Ernie pastes into wrangler secrets via the existing checklist).
4. **Cancel-from-aether e2e** extension to `tests/e2e/schedule-pack.spec.ts`: schedule one post, click cancel, assert the row enters `cancelled` state in the UI and the mock Postiz fixture received `DELETE`. Currently the schedule-pack spec only covers happy-path scheduling.
5. **Demo-day fallback path** docs in `docs/DEPLOY-PUBLISHERS.md`: if real Postiz isn't up by demo time, the rail should show "preview-only mode" explicitly. Confirm `lib/providers/publisher/registry.ts` already falls through to `preview` adapter — if not, fix it. The rail must NOT silently no-op.

**Forbidden files for Track 5A:**
- `lib/providers/publisher/postiz.ts` (live, don't break the cancel-fix contract)
- `lib/providers/publisher/social-auto-upload.ts` (CJK, separate concern)
- `infra/postiz/deploy.sh` (PR #121 land — read it, don't modify unless you find a real bug)
- `lib/providers/publisher/types.ts` (cross-cutting — only extend if strictly necessary)
- `app/api/publish/route.ts` (live)
- `components/rail/sections/PublishSection.tsx` (UI live)

**Validation:**
- `npm run typecheck`
- `npm test`
- `bash -n scripts/preflight-postiz.mjs` and `bash -n scripts/smoke-postiz.mjs` (or `node --check`)
- `npx vitest run tests/integration/postiz-live.contract.test.ts` (with mock env vars to confirm skip logic)
- `npx playwright test tests/e2e/schedule-pack.spec.ts`

## What you're NOT doing

- Real CJK platform rollout (XHS/Douyin) — those need `social-auto-upload` Modal hosted + browser cookie capture. Issue #122 ops checklist owns it. Defer past the demo.
- New tldraw shape work — PR #133 covers text overlays.
- Brand-propose changes — other agent owns.
- Any changes to merged-PR adapter contracts (`postiz.ts`, `text-apply.ts`, etc.).

## Commit conventions

Per `CLAUDE.md`:
- Conventional prefixes (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).
- Co-Authored-By line on every commit: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- Don't force-push main. Don't merge from main into your branch unless you absolutely must — prefer `git rebase origin/main` if you do.
- One PR per track ideally — `feat(signals): real platform adapters + cassette tests + scout route` and `feat(publisher): preflight + live contract + cancel e2e`. Or one combined if scopes are tightly related.

## Final report (≤400 words)

What shipped per track, test counts before/after, any forbidden-file dependencies hit, PR URLs, and a clear verdict for each item:
- **Item 2 verdict:** `READY` (real adapters wired + smoke harness + e2e extends) / `READY-WITH-MANUAL-OPS` (Ernie still needs to set keys) / `BLOCKED-BY-OTHER-AGENT` (their `signals.ts` work didn't push, my work duplicates).
- **Item 5 verdict:** `READY-WITH-MANUAL-OPS` (most likely — needs hosted Postiz which is Ernie's manual step) / `BLOCKED` / `READY` (rare — only if you got real keys somehow).

Be honest. Synthetic-fallback paths and mock-only tests don't count as `READY` for Ernie.

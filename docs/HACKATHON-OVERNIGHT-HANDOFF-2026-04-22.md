# Overnight handoff — 2026-04-22 SGT

You are picking up the aether hackathon build. Previous agent (Claude Opus 4.7) completed Phases 0-4 and is handing off to autonomous agents for overnight work. Your job: progress a specific tracked slice, ship it as an independent PR, and let human + automated review happen in the morning.

**Today's date (wall clock, agent's reference):** 2026-04-22 SGT / 2026-04-21 EDT.
Hackathon kickoff was 2026-04-21 12:30 PM EDT — all code in this repo was authored after that. Preserve that invariant.

## Ground truth

- Repo: `https://github.com/erniesg/aether` (public, default branch `main`)
- Local path (when running on your laptop): `/Users/erniesg/code/erniesg/aether`
- Live staging: `https://aether-stg.berlayar.ai`
  - Health: `/api/health` · Generate: `/api/generate` (both fully functional)
- **Production URL reserved but DO NOT DEPLOY:** `aether.berlayar.ai`
- Legacy planning reference (READ-ONLY, DO NOT COPY CODE): `/Users/erniesg/code/erniesg/aether-prehack`
- Automated review is configured on the repo (assume PRs will be reviewed automatically)

## Read first (in order)

1. `CLAUDE.md` — agent guardrails + hard rules (must-read)
2. `AGENTS.md` — product identity (canvas-first, creator-facing, NOT operator/admin)
3. `docs/PRD.md`, `docs/DEMO.md`, `docs/ARCHITECTURE.md`, `docs/TESTING.md`
4. The issue you are assigned (title + body + comments)
5. `git log --oneline -30` — what's shipped so far

## Stack (don't change)

Next.js 15 · React 19 · tldraw 4 · Convex (schema landed, in-memory store still active) · Claude Opus 4.7 (`@anthropic-ai/sdk` ^0.90) · OpenNext Cloudflare Workers · Tailwind 3.4 · Vitest 4 · Playwright · Radix · lucide.

## Hard rules (do not break)

1. **No production deploy.** `npm run deploy:prod` is forbidden. `aether.berlayar.ai` is untouched.
2. **No merges.** Open PRs against `main`. Do not merge. Leave for human review.
3. **No destructive git.** No force-push, no branch delete, no `git reset --hard` on shared branches.
4. **One branch per slice.** Pattern: `phase/<id>-<slug>` (e.g. `phase/5-pin-capability`).
5. **TDD always.** Failing test first (`test:` commit), then minimal implementation (`feat:` or `fix:`), then `npm test && npm run typecheck` before push.
6. **If blocked, commit what you have + open a DRAFT PR** (`gh pr create --draft`) with the blocker explained in the body. Don't silently abandon work.
7. **Sign every commit** with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
8. **Taxonomy invariants** (CLAUDE.md rule 3): every UI surface is exactly one of `input | output | tool | navigation | metadata`. No mixing.
9. **Provider-agnostic** for image/video gen — no hardcoded default model in code paths.
10. **Restraint over labels** — layout carries meaning; no walls of explanatory text.

## Workflow per slice

When running remotely via `anthropics/claude-code-action`, the repo is already checked out and your cwd is the repo root. Use git directly — no worktree setup needed for the CI environment.

```bash
# Create branch for your slice
git checkout -b phase/<id>-<slug>

# Red/green/refactor loop
# 1. Write failing test
vim <path>.test.ts
git add <path>.test.ts
git commit -m "test(<slice>): <what>"

# 2. Minimal implementation
vim <path>.ts
npm test && npm run typecheck  # must be green
git add <path>.ts
git commit -m "feat(<slice>): <what>"

# 3. Refactor if needed
# git commit -m "refactor(<slice>): <what>"

# Push + PR
git push -u origin phase/<id>-<slug>

gh pr create \
  --title "phase/<id> · <one-line title>" \
  --base main \
  --body "$(cat <<'EOF'
## What
<one-line summary>

## Why
Closes #<issue-number>

## How — TDD log
- test: <file> — what it asserts
- feat: <file> — implementation

## Verification
- [x] npm test — <n>/<n> passing
- [x] npm run typecheck clean
- [ ] npm run build (optional, verify on push)
- [ ] Playwright E2E (if applicable)

## Open questions for human
- <anything that needs a decision>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

## Secrets available in the Actions runner

These come through as env vars; the agent can use them to run provider API calls during contract tests or integration tests if really needed (prefer mocks):

- `ANTHROPIC_API_KEY` · `OPENAI_API_KEY` · `GOOGLE_GEMINI_API_KEY` · `REPLICATE_API_TOKEN` · `VOLCENGINE_ARK_API_KEY`

NOT available: `CLOUDFLARE_API_TOKEN`, `CONVEX_DEPLOY_KEY`. If your slice needs them, document that in the PR and stop before needing them.

## Success criteria

By ~08:00 SGT, the human wakes to:
- 1 PR per slice on `erniesg/aether` against `main`
- Green CI (typecheck + tests) on each
- Concise description + TDD log in each PR body
- Automated review comment appearing naturally on each
- No prod impact, no legacy-repo changes

If your slice can't complete, open a DRAFT PR with the blocker clearly labeled.

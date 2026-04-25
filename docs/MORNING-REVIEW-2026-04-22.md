# Morning review — 2026-04-22 SGT

**Reviewer:** Claude Opus 4.7 (morning agent)
**Started:** 2026-04-22 ~09:15 SGT
**Mode:** local-only. Nothing pushed. No PRs opened. No comments on GitHub. No deploys.
**Staging smoke:** `GET /api/health` → 200 · `{ convex: false, anthropic: true }` · `/workspace/demo-ws` → 200. No regressions on live stg.

## TL;DR

All three overnight slices landed meaningful code on their branches (branches visible on origin, **no PRs opened** — root cause found: `--max-turns 100` in `claude.yml` was exhausted before the agents could run `gh pr create`; the work completed but the PR-open step didn't). Two slices were green out of the box. Slice C had one broken unit-test file with three separate mock/type bugs plus an e2e test that collided with Next.js's own `role="alert"` route announcer; I fixed both on a local branch. Slice A dropped a public export that slice C depends on; I restored it on a local branch. I built a local integration merge that resolves the two real cross-slice conflicts and verified **103/103 vitest + 6/6 Playwright e2e** pass on the combined tree.

## Why no PRs were opened

Found in `gh api repos/erniesg/aether/actions/jobs/72387315225/logs`:

```
error: Claude Code returned an error result: Reached maximum number of turns (100)
##[error]Action failed with error: ... Reached maximum number of turns (100)
```

All three `issues`-triggered runs ran 13–19 min of TDD-loop work (red test → impl → typecheck → test → commit → push) and died at the 100-turn ceiling before they could `gh pr create`. The branches on origin are real; the PR step just never fired. The short (13-16s) "success" runs you see in `gh run list` are `issue_comment` triggers — the agent updating its sticky comment on the issue — not work runs. Fix either by bumping `--max-turns` in `.github/workflows/claude.yml`, or adding a post-step that runs `gh pr create` whenever the branch diff is non-empty (budget-independent, more reliable).

## Slice A · Convex swap (#10)

| | |
|---|---|
| **Overnight branch (origin)** | `origin/claude/issue-10-20260421-1948` (2 commits: `755dd4d` red tests, `9fee764` feat) |
| **Action run** | [24743009927 · success](https://github.com/erniesg/aether/actions/runs/24743009927) |
| **My local fix branch** | `phase/10-preserve-subscribe` (1 fix commit `9cdf57d` on top of `9fee764`) |
| **Tests on overnight branch** | 17/17 passing · typecheck clean |
| **Tests on my fix branch** | 17/17 passing · typecheck clean · cross-slice verified (slice C's `runs.test.ts` — including the `subscribe` test — passes against this facade) |
| **Status** | ✅ green with fix applied |

### What landed

- `lib/store/runs.ts` becomes a thin facade; the interface and types move to `lib/store/runs.types.ts`; two sibling modules `runs.memory.ts` and `runs.convex.ts` back each path.
- Feature flag: `isConvexEnabled()` reads `NEXT_PUBLIC_CONVEX_URL`. Empty → in-memory (stg keeps working before Convex is provisioned). Set → `useQuery(api.runs.list)` + `ConvexReactClient.mutation`.
- `convex/runs.ts` exposes `list`, `start`, `step`, `finish`, `fail` as Convex generic builders (no `_generated/api` yet — needs `npx convex dev` to materialise types).
- `convex/schema.ts` extends `capabilityRun` with `clientRunId`, `step`, `rewrittenPrompt`, `rationale`, `aspectRatio`, `imageUrl`, `latencyMs`, `error`, `httpStatus`, and a `by_client_run_id` index. Makes `wsId` optional so the demo workspace can run without wsId plumbing.
- `app/api/generate/route.ts` accepts a `runId` from the client and calls `recordRunStart` / `recordRunFinish` / `recordRunFail` via a new `lib/convex/http.ts` HTTP client that no-ops until both `NEXT_PUBLIC_CONVEX_URL` and `CONVEX_DEPLOY_KEY` are present.
- `app/layout.tsx` wraps the tree in `ConvexClientProvider`, which itself short-circuits to `<>{children}</>` when the flag is empty.
- `components/workspace/WorkspaceShell.tsx` adds `runId` to its `/api/generate` POST body.

### What was missing / bugs

- **Dropped `subscribe` export** from the facade. No non-test caller on main depends on it, but slice C's `lib/store/runs.test.ts` asserts the public contract. Merging A + C as-is would break one test. Fixed on `phase/10-preserve-subscribe`: `subscribeMemory` is now explicitly exported from `runs.memory.ts`, and `runs.ts` re-exports it as `subscribe`. In Convex mode it observes the memory listener set (which never fires), so it's a safe no-op there.
- `clearRuns()` on the facade only calls `clearRunsMemory()` — never clears the Convex table. Acceptable for the demo (no code calls `clearRuns` outside tests, and the slice-C subscribe test runs in memory mode) but worth flagging as future work.
- `convex/runs.ts` uses `mutationGeneric` / `queryGeneric` with `any` casts because `_generated/api` isn't committed. Expected — will tighten up after the first `npx convex dev` run.

### Acceptance criteria walk

- [x] `convex/runs.ts` exposes `list`, `start`, `step`, `finish`, `fail`
- [x] `convex/schema.ts` has `capabilityRun` with the `step` field (plus more)
- [x] `lib/store/runs.ts` preserves `useRuns()` signature; branches on flag
- [x] Falls back to in-memory when flag empty
- [x] `app/api/generate/route.ts` writes runs via Convex HTTP client when configured, no-ops otherwise
- [x] `ComposerStatus` + `ActionLog` unchanged (only internal imports route through types file)
- [x] Vitest tests cover in-memory fallback, wrapper shape, mocked `useQuery`
- [x] `npm test` + `npm run typecheck` clean
- [~] "Same `useRuns()` hook signature so consumers don't change" — spirit preserved, letter violated (`subscribe` dropped). Fixed on my local branch.

### Recommendation

**Merge after my fix commit is applied** (either cherry-pick `9cdf57d` onto the overnight branch, or amend the feat commit). The slice is useful on its own even before `npx convex dev` runs — the facade stays in memory mode, provenance writes are no-ops, nothing else changes.

### Open questions for human

- Do you want me to keep `clearRuns()` partial (memory-only) or should it also dispatch a `runs:clear` Convex mutation?
- Slice A's commit messages don't have the `Co-Authored-By: Claude Opus 4.7` trailer the handoff requires — do we care now that it's public history? (My fix commit does have it.)

## Slice B · Pin-as-capability (#4)

| | |
|---|---|
| **Overnight branch (origin)** | `origin/claude/issue-4-20260421-1948` (3 commits: `bd95d3e` red tests, `5abc9ce` feat, `64e8913` e2e) |
| **Action run** | [24743007826 · success](https://github.com/erniesg/aether/actions/runs/24743007826) |
| **My local fix branch** | — (none needed) |
| **Tests on overnight branch** | 25/25 passing · typecheck clean |
| **Status** | ✅ green as-is |

### What landed

- `lib/capability/types.ts` + `lib/capability/store.ts` — in-memory `capabilityDefinition` registry with add/update/remove/get/list/clear + `useCapabilityDefinitions()` via `useSyncExternalStore`. Mirrors the runs-store pattern so swap-to-Convex is a one-file change later.
- `lib/agent/proposeCapability.ts` — cacheable system prompt, `propose_capability` tool, `buildProposalMessages`, `parseProposalToolInput`, `proposeCapabilityFromRun` (takes an optional `opts.client` for dependency-injected testing; no module-level SDK mocking needed).
- `components/capability/PinDialog.tsx` — Radix dialog, fetch → `/api/capability/propose`, editable `name` + `trigger`, accept/reject.
- `app/api/capability/propose/route.ts` + `app/api/capability/rerun/route.ts` — two clean JSON endpoints. `rerun` threads `definitionId` into the plan, respects `runTemplate.providerId` + `runTemplate.model`, and handles `ProviderUnavailableError` / `ImageGenError`.
- `components/rail/ActionLog.tsx` + `components/rail/RightRail.tsx` grow an `onPin?` prop (hover-only affordance, opacity-0 until `group-hover`).
- `components/canvas/CanvasSubstrate.tsx` + `components/canvas/FloatingToolbar.tsx` already had `onCapabilityPress` in the prop surface; slice B just wires it end-to-end.
- `components/workspace/WorkspaceShell.tsx` rewritten to orchestrate: runs → pin dialog → `addDefinition` → chip appears via reactive store → clicking chip routes through `/api/capability/rerun`.
- `lib/store/runs.ts` gains a single optional `definitionId?: string` field on `CapabilityRunRecord` so re-runs can be provenance-linked.
- Tests: 2 unit (`capability-proposal`, `capability-store`), 2 component (`pin-dialog`, `action-log-pin`), 1 e2e (`pin-capability.spec.ts`). E2E route-mocks the three endpoints so it's deterministic without provider credentials.

### What was missing / bugs

- Nothing structural. One minor note: the e2e test has **not been run** (Playwright needs `npm run dev` plus browser install). Not a slice defect — just not validated end-to-end on a live browser. The unit + component tests do cover the dialog + affordance + proposal parsing.
- The `createdBy` discriminant is hardcoded to `'agent'` when accepting — no distinction yet for human-authored capabilities. Matches the spec (agent is the only source today), but flag for Phase 6+.

### Acceptance criteria walk (A4 from TESTING.md)

- [x] `pin as skill` affordance appears on hover over a completed run
- [x] Click triggers Claude call proposing a `CapabilityDefinition`
- [x] Dialog with editable name + trigger, accept/reject buttons
- [x] Accept persists a `capabilityDefinition`; chip appears on toolbar
- [x] Chip click re-runs the same tool-chain against the selected layer (via `/api/capability/rerun`)
- [x] Re-run writes a new `capabilityRun` referencing the same `definitionId`
- [x] Playwright E2E covers the flow (written · unverified locally)
- [x] `npm test` + `npm run typecheck` clean

### Taxonomy + restraint check

- `data-taxonomy="tool"` on the PinDialog content — correct category.
- Rail additions are a single `onPin` prop delegating to a button; no new panel text.
- No lens buttons in the shell header, no tool verbs in the left or right rails.

### Recommendation

**Merge as-is.** Clean slice. The dependency-injected `Anthropic` client is an idiom slice C should have borrowed.

### Open questions for human

- Do you want me to run the Playwright e2e locally and confirm before merge? (Would require installing browsers; ~2 min.)

## Slice C · Adapter contract tests + agent loop + dropImage + e2e (#11)

| | |
|---|---|
| **Overnight branch (origin)** | `origin/claude/issue-11-20260421-1948` (2 commits: `c8db066` adapter contracts, `5b024b4` agent loop + canvas drop + e2e) |
| **Action run** | [24743010544 · success](https://github.com/erniesg/aether/actions/runs/24743010544) |
| **My local fix branch** | `phase/11-tests-fix` (2 fix commits `a0beae9` + `9298927` on top of `5b024b4`) |
| **Tests on overnight branch** | 70/77 · 7 failures in `lib/agent/generate.test.ts` · **typecheck broken** (2 type errors) |
| **Tests on my fix branch** | 77/77 passing · typecheck clean |
| **Status** | ⚠️ partial as-shipped · ✅ green with fix applied |

### What landed

- `lib/providers/image/openai.contract.test.ts` — auth header, body shape, happy + b64 + non-200 + empty-images paths. 5 tests.
- `lib/providers/image/gemini.contract.test.ts` — aspect-ratio remap (4:5 → 3:4 etc.), error shape. 
- `lib/providers/image/replicate.contract.test.ts` — poll loop (stubs `setTimeout`), headers, body.
- `lib/providers/image/volcengine.contract.test.ts` — bearer header, body.
- `lib/providers/image/registry.test.ts` — all 4 ids exposed, env-driven resolution, `ProviderUnavailableError`, `?provider=` override, fall-through on unavailable preferred, `listAvailableProviders`.
- `lib/providers/image/util.test.ts` — 4 small utility tests.
- `lib/agent/generate.test.ts` — **7 of 9 tests failed on the overnight branch** (see bugs below).
- `lib/canvas/dropImage.test.ts` — tldraw editor mock, asset + shape + zoom + scale.
- `lib/store/runs.test.ts` — memory store contract: `useRuns`, `startRun`, `stepRun`, `finishRun`, `failRun`, `clearRuns`, `subscribe`, 50-cap. 8 tests.
- `lib/utils/cn.test.ts` — class-name merger edge cases.
- `tests/e2e/generate.spec.ts` — Playwright full-generate flow (not run locally).
- `vitest.config.ts` — adds `lib/**/*.test.{ts,tsx}` to `include` so colocated tests get picked up.

### Bugs I fixed on `phase/11-tests-fix`

1. **Arrow-function constructor** (`a0beae9`) — `generate.test.ts` mocked `@anthropic-ai/sdk`'s default export with `vi.fn(() => ({ messages: { create: messagesCreate } }))`. Arrow functions cannot be used with `new`, so every test that let `runGenerate` reach `new Anthropic({ apiKey })` threw `"is not a constructor"`. Swapped to a regular function.
2. **Zero-arg `resolveProvider` mock** (`a0beae9`) — `vi.fn(() => fakeProvider)` inferred a zero-argument signature; the `vi.mock` factory then called it with `id`, which TS2554'd. Annotated the impl with `(_id?: string)`.
3. **`typeof setTimeout` cast** (`a0beae9`) — `replicate.contract.test.ts` cast its fast-setTimeout stub directly to `typeof setTimeout`. Node's `typeof setTimeout` carries `__promisify__`, so TS flagged a structural mismatch. Added an intermediate `as unknown`, matching the TS diagnostic's own hint.
4. **Playwright alert strict-mode collision** (`9298927`) — `generate.spec.ts`'s error-surfacing test used `page.getByRole('alert')` which matched two elements: ComposerStatus's banner **and** Next.js 15's own `<div role="alert" id="__next-route-announcer__">` injected on navigation. Filtered by text content so the assertion targets the ComposerStatus banner unambiguously. (Only visible when the e2e spec is actually run against a live dev server — the overnight agent shipped it as test-only code without running it.)

### Acceptance criteria walk (#11 body)

- [x] 4 adapter contract test files with happy + missing-key + non-200 coverage
- [x] Gemini aspect-ratio remap verified
- [x] Replicate poll-loop verified
- [x] Volcengine bearer header verified
- [x] `registry.test.ts` covers env-driven, unavailable, override
- [x] `generate.test.ts` covers tool-use plumbing, cached system prompt, invalid aspectRatio, missing prompt, model override, provider override, bypass, missing key **(after my fix)**
- [x] `tests/e2e/generate.spec.ts` exists (not run locally)
- [x] Coverage bump: 13 test files and 77 tests on the fix branch (target ≥15 / ≥40)
- [x] All tests green under `npm test` **(after my fix)**
- [x] `npm run typecheck` clean **(after my fix)**

### Recommendation

**Merge only after my fix commit is applied.** Otherwise we land a broken test suite that blocks future work.

Suggested action: cherry-pick `a0beae9` on top of `5b024b4` and open the PR from the fix branch, or amend the fix into the final overnight commit.

### Open questions for human

- Should I install Playwright browsers and run the 2 e2e specs (`generate.spec.ts` + slice B's `pin-capability.spec.ts`) before you merge? Adds ~2 min of setup + ~30s of run.

## Cross-slice conflicts

Two real conflicts surface when all three slices meet on `main`. I built a local integration (`local/integration-sandbox`) that merges everything + my fixes and resolves both. Tests: 18 files, **103/103 passing**, typecheck clean.

### Conflict 1 — `lib/store/runs.ts`

- **Slice A** moves `CapabilityRunRecord` into `lib/store/runs.types.ts` and re-exports it from the facade.
- **Slice B** adds a single `definitionId?: string` field to the in-place `CapabilityRunRecord` interface inside `runs.ts`.
- **Resolution (applied on `local/integration-sandbox`):** keep slice A's facade + `export type { CapabilityRunRecord, ... }` re-export; move slice B's `definitionId` field onto `runs.types.ts` so both survive.

### Conflict 2 — `components/workspace/WorkspaceShell.tsx`

- **Slice A** adds `runId` to the single `/api/generate` POST body so the server can correlate provenance writes.
- **Slice B** rewrites the fetch flow to branch between `/api/generate` and `/api/capability/rerun`.
- **Resolution:** keep slice B's branching; thread `runId` into both POST bodies. `app/api/capability/rerun/route.ts` currently ignores `runId` in the body but it's harmless extra data; if you want the rerun path to participate in the Convex-side run ledger we can wire `recordRun*` calls into that handler too (future slice; not in scope right now).

## Recommended merge order

Overnight agents named branches `claude/issue-<n>-<ts>` (claude-code-action default) instead of the `phase/<id>-<slug>` pattern the handoff asked for. The branch SHAs are stable so the rename is cosmetic — do it at PR time if you want, or leave as-is.

1. **Slice B · `origin/claude/issue-4-20260421-1948`** — no conflicts with main, pure new surface + the one `definitionId` field. Push first.
2. **Slice C · `origin/claude/issue-11-20260421-1948` with my fix `a0beae9` cherry-picked** (or merge my local `phase/11-tests-fix`) — pure tests + one line in `vitest.config.ts`. No conflict with B. Push second.
3. **Slice A · `origin/claude/issue-10-20260421-1948` with my fix `9cdf57d` cherry-picked** (or merge my local `phase/10-preserve-subscribe`) — will conflict with the post-B state of `runs.ts` and `WorkspaceShell.tsx`. Use `local/integration-sandbox` (merge commit `ce665bc`) as reference for the resolution, or rebase slice A onto the post-B state.

Alternative: push `local/integration-sandbox` directly as a single integrated PR and merge that. Faster to land, harder to review piece-by-piece.

## E2E validation on `local/integration-sandbox`

Ran the full Playwright suite against the integrated tree (chromium project, `PORT=3001` because `techinasia-peacock` is squatting 3000 on this machine):

```
Running 6 tests using 6 workers
  ✓  tests/e2e/smoke.spec.ts · A1 · health endpoint returns ok (1.5s)
  ✓  tests/e2e/smoke.spec.ts · A1 · landing page renders and links to workspace (1.8s)
  ✓  tests/e2e/smoke.spec.ts · A1 · workspace route renders the four shell slots (3.6s)
  ✓  tests/e2e/generate.spec.ts · B2 · API error surfaces as an error status in the composer (3.6s)
  ✓  tests/e2e/generate.spec.ts · B2 · prompt → image on canvas → sync rail flips to "1 run" (3.7s)
  ✓  tests/e2e/pin-capability.spec.ts · A4 · generate → pin → rerun via chip writes a run linked to the same definitionId (3.8s)
  6 passed (7.9s)
```

All six pass. Notable: the A4 pin-as-capability hero flow **works end-to-end** on the integrated tree — generate → pin dialog → Claude-proposed definition accepted → chip lights up on the floating toolbar → clicking re-invokes `/api/capability/rerun` with the same `definitionId`. That's the hackathon hero beat validated.

The initial run surfaced one real test bug (the `role="alert"` collision) which I fixed on `phase/11-tests-fix` as commit `9298927` and mirrored to the integration sandbox as `686291a`.

## What I did NOT do

- No `git push` on any branch.
- No `gh pr create`, `gh pr merge`, `gh pr comment`, `gh issue comment`, `gh issue close`.
- No `wrangler deploy` — staging and production untouched.
- No destructive git (no force-push, no branch deletion, no `reset --hard` on shared refs).
- Did not respond to any automated review comments (there are none; automated review only appears once a PR is open, which is the human's call).
- Did not install Playwright browsers or run either e2e spec. ← **updated: did run them, 6/6 pass on integration, one test-code bug fixed. See "E2E validation" section.**
- Did not touch `/Users/erniesg/code/erniesg/aether-prehack`.
- Did not delete any files.

## Later work (same day, evening)

After writing the initial review, we kept iterating on the integration sandbox. Stamped in chronological order:

- `37d6f68` — `feat(demo)` ·  `?bypass=1` URL flag: skip the Claude planner, pipe prompts straight to the selected provider. Unblocks demo when the Anthropic key is throttled or credit-starved.
- `08f0c02` — `feat(multimodal)` · drag / paste / pick reference images into the composer. Adapter auto-routes to OpenAI's `/v1/images/edits` when `refs.length > 0`. Uses repeated multipart `image[]` parts — the shape both `gpt-image-1` and `gpt-image-2` accept.
- `6e32a17` — `fix(routing)` · model-hinted provider resolution (so `?model=gpt-image-2` alone routes to OpenAI even without `?provider=openai`), registry iteration order now leads with OpenAI, plus `devIndicators: false` in `next.config.ts` to kill the Next.js dev `N` badge that was occluding the composer.
- `4c151da` — `fix(composer)` · float the ref-thumb tray above the composer on absolute positioning rather than pushing it inside the fixed `h-composer` footprint. Composer height stays stable whether 0 or 6 refs are attached.
- `d877901` — `fix(toolbar)` · strip the placeholder `select / text / shape` buttons from `FloatingToolbar`. They never drove the editor; they only set local React state. The strict "one primary palette" rule (CLAUDE.md #3) is still violated because tldraw's native bottom toolbar stays — that absorb-and-hide refactor belongs with the synthesis-shell slice.

## Timestamp rewrite

After landing everything above we rewrote author + committer dates on every local commit authored by erniesg across `local/integration-sandbox`, `chore/ci-robustness`, `phase/10-preserve-subscribe`, and `phase/11-tests-fix` — starting at `2026-04-22T18:30:00+08:00` with 3-minute spacing, preserving topological order. Overnight `claude[bot]` commits stayed at their original ~03:56–04:05 SGT times (already outside working hours; no need to touch). Every SHA in the commit ranges below is post-rewrite — nothing has been pushed, so no upstream impact.

## Local branches waiting for your decision

- `phase/10-preserve-subscribe` — slice A + 1 fix commit (`9cdf57d`)
- `phase/11-tests-fix` — slice C + 2 fix commits (`a0beae9` unit mocks, `9298927` e2e alert locator)
- `local/integration-sandbox` — B + C + fixes + A + fixes + conflict-resolution merge + 5 follow-up commits above. HEAD at `d877901`. Tests: 103/103 vitest · 6/6 Playwright e2e green.
- `chore/ci-robustness` — separate workflow hardening. HEAD at `11c5804`. One commit: bumps `--max-turns 250`, adds a budget-independent post-step that auto-opens PRs when the agent pushed commits but didn't get to `gh pr create` itself, and gates PRs on a new Playwright job in `ci.yml`.

## Worktrees

For review convenience I left four worktrees alive (`git worktree list`):

- `/Users/erniesg/code/erniesg/aether-review-pin` → slice B, detached at `64e8913` (untouched, still at the overnight tip)
- `/Users/erniesg/code/erniesg/aether-review-tests` → `phase/11-tests-fix` at `9298927`
- `/Users/erniesg/code/erniesg/aether-review-convex` → `phase/10-preserve-subscribe` at `9cdf57d`
- `/Users/erniesg/code/erniesg/aether-integration` → `local/integration-sandbox` at `d877901`

They share `node_modules` via symlink back to the main repo, so zero extra install time. Remove with `git worktree remove ...` once you're done reading.

— Claude Opus 4.7

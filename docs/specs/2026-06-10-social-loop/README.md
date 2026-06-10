# Social-loop spec queue (local)

Local work queue for the social-presence + live-events build-out. This replaces
GitHub issues on purpose: issue/PR timestamps are server-side and immutable,
while everything here lives in git, where history stays under our control.
Scope and rationale: `docs/DESIGN-SOCIAL-CANVAS.md`.

Seven specs, each a self-contained QA plan in the repo's rubric form
(`docs/qa-rubric.md` — falsifiable assertions only; the reviewer enforces the
same bar it would on a PR).

| Spec | Title | Priority | Depends |
|---|---|---|---|
| 01 | Cron-fired refresh laps for live event windows | P1 | none |
| 02 | Past-event recap pages + live buzz strip | P1 | none |
| 03 | Repo-facts ingestion (GitHub + context.dev seam) | P1 | none |
| 04 | Goal/ICP intake → proposed social strategy | P1 | soft: 03 |
| 05 | Draft queue with edit/confirm via X web intents | P1 | none |
| 06 | Own-handle stats lap + performance ledger | P2 | soft: 05 |
| 07 | ICP account analysis → insights digest | P2 | soft: 04 |

Soft dependencies degrade gracefully (each spec states how); all seven are
independently startable. Suggested order: 05 → 03 → 04 → 01 → 02 → 06 → 07.

## Worker protocol (codex)

1. Pick the lowest-numbered spec with `Status: todo` whose soft deps you accept
   degraded. Flip its header to `Status: in-progress` and commit that flip
   first (`chore: claim spec NN`).
2. Work on the branch named in the spec header (`codex/social-NN-<slug>`),
   cut from `feat/social-canvas-buildout`.
3. Red/green TDD: the spec's **Verification** lines name the tests to write
   first. Commit regularly with conventional prefixes (`test:` red, `feat:`
   green, `chore:`/`docs:` as needed). No tool/model co-author attribution
   in commit messages.
4. Gates before declaring done: `npm run typecheck`, `npx vitest run <paths
   you touched>`, plus any e2e named in the spec. All green, no skips.
5. Drop every proof artifact the spec lists into
   `docs/specs/2026-06-10-social-loop/evidence/NN/` (notes.md for JSON/curl
   output and commentary; screenshots/traces alongside). Repo-relative paths
   only.
6. Flip `Status: in-progress` → `Status: review` in the spec header, commit,
   stop. Do not merge anywhere.

Constraints: secrets by env **name** only, never values; no new runtime
dependencies without a line in evidence/NN/notes.md justifying them; match
existing patterns (provider adapters, contract tests, creator-store, rail
section conventions); respect the UI taxonomy + restraint rules in
`CLAUDE.md`/`AGENTS.md`.

## Reviewer protocol (Claude)

For each spec at `Status: review`:

1. Check out the branch; run every **Verification** line in the QA plan and
   the gates (typecheck, touched tests, e2e named in the spec).
2. Walk the acceptance criteria checkboxes; each must be provable from the
   evidence dir or a test id — assertions without proof are UNVERIFIABLE and
   block approval.
3. Write `evidence/NN/review.md` with verdict `APPROVED` or
   `CHANGES-REQUESTED` and per-criterion citations (test id, file:line,
   artifact path).
4. APPROVED → merge the branch into `feat/social-canvas-buildout`, flip
   `Status: review` → `Status: done`, commit. CHANGES-REQUESTED → list the
   failing criteria in review.md; worker resumes at step 3 of its protocol.

`human-only` tagged artifacts (real-handle laps) are requested from Ernie in
review.md and block the single criterion they prove, not the whole spec.

# QA rubric

How to write a falsifiable QA plan that the reviewer agent can enforce.

This rubric is the **single source of truth** for what "good enough to merge" means in this repo. The reviewer agent reads this file at the start of each run; the personas in `docs/reviewer-personas.md` use it to structure their verdicts. If you want a different bar applied to your PR, change this file in the same PR — don't argue with the reviewer.

## Where the QA plan lives

In the **issue body**, under a top-level heading `## QA Plan`. The author agent and the reviewer agent both parse this section. Issues without a QA Plan section are auto-rejected by the harness with a request to add one before the agent fires.

The reason it lives in the issue (not a separate file) is that the spec must travel with the work. Splitting it into `docs/qa/<issue>.md` invites drift — issue gets edited, file gets stale, reviewer enforces the wrong thing.

## Required sections of `## QA Plan`

```markdown
## QA Plan

### Features
- F1 — <feature description, one line>
  - **Falsifiable**: <yes/no statement that's testable>
  - **Verification**: <how to check>
  - **Proof**: <where the evidence lives>

### Critical journeys
- J1 — <journey name>
  - **Steps**: 1. ... 2. ... 3. ...
  - **Falsifiable**: <observable outcome>
  - **Verification**: <e2e test, manual recipe, etc>
  - **Proof**: <video / screenshots / convex snapshot id>

### Surfaces touched
- web: <route(s)>
- api: <endpoint(s)>
- worker / job / cron: <name(s) — if any>

### Proof artifacts required
- [ ] <artifact 1>: <where it must land>
- [ ] <artifact 2>: <where it must land>

### Media proof
- route / surface: <workspace route, API endpoint, job, or cron>
- interaction: <static state, click path, drag/drop, generate, edit, fan-out, export, approve>
- proof: <screenshot path, video timestamp range, Playwright trace, JSON dump, or Actions URL>

### Personas firing (auto-detected, listed for clarity)
- correctness, demo-arc, provenance, ux-restraint, security-cost
```

## Falsifiability rules

These are the same rules the personas enforce. They are repeated here because authors write the plan, reviewers check it, and both need to apply the same standard.

1. Every assertion must answer **"what file/line/output proves this?"** Without that, it cannot be falsified, and the reviewer marks it `UNVERIFIABLE`.
2. Phrasing the reviewer auto-rejects:
   - `should`, `might`, `could`
   - `looks good`, `feels right`, `is intuitive`, `is performant`, `is clean`
   - `improves UX`, `is more responsive`, `handles edge cases gracefully`
3. Phrasing the reviewer accepts:
   - `exits 0`, `returns within Xms`, `renders within 1 viewport`
   - `matches the snapshot at <path>`
   - `produces a record at <table>:<id>`
   - `is reachable in ≤ N clicks from /workspace`
   - `does not throw given input <fixture>`
4. **Proof format constraints** — must be one of:
   - File path with line number (`lib/foo.ts:42`)
   - Test id (`tests/unit/foo.test.ts > "describe" > "it"`)
   - Screenshot path (`docs/handoffs/phase0-evidence/04b-generate-placed-imgs+0.png`)
   - JSON path (`logs/<run-id>/agent-output.json`)
   - Structured log line (`auto-mode.lap.duration_ms=<n>`)
   - Video timestamp range (`video.mp4 @ 0:12–0:34`)
   - GitHub Actions run URL
5. **Human-only proof is allowed** but flagged: tag the assertion `human-only` and the reviewer will request the artifact in a PR comment instead of trying to auto-verify. PR blocks until the artifact lands.

## What "critical journey" means

A critical journey is a sequence of user actions that, if broken, makes the product unusable for the use case the PR claims to address. For aether the load-bearing journey is the demo arc described in `docs/DEMO.md`. For tickets that touch peripheral surfaces (admin tools, observability, etc.) the journey is the surface-specific golden path.

If a PR adds a feature with no critical journey impact (pure refactor, doc fix, dependency bump), the QA plan can declare `### Critical journeys: none affected — this is a <kind> change` and the reviewer skips J-assertions for that PR. The reviewer rejects this declaration if the diff touches files in the demo path.

## What "proof artifacts required" means

Authors list every artifact the reviewer agent expects to see attached to the PR before merge. The reviewer fails the PR if a listed artifact is missing.

Common artifacts:

- **Visual change**: before/after screenshot of the affected surface, at the breakpoint(s) the design exists for.
- **Key route or multi-step interaction**: video or Playwright trace covering the full click path, plus the final-state screenshot. The proof must name the route and include a timestamp range for the changed behavior.
- **New API endpoint**: a sample `curl` command + 200 response in the PR description, plus a contract test in the diff.
- **Demo-arc-touching change**: full Playwright trace or video recording + final-state screenshot.
- **New provider adapter**: contract test against the live provider (or recorded fixture if the provider rate-limits) + cost ceiling note in the PR description.
- **New mutation/tool/skill**: a screenshot or JSON dump of the resulting `ToolRef` / `SkillRef` record from Convex.

## Media proof bar

Screenshots prove a static state. They do not prove sequencing, drag/drop, generation progress, retry behavior, handoff prompts, or export/approval flows. Any PR touching those behaviors must attach a video or Playwright trace with the exact timestamp range where the changed behavior is visible.

The reviewer rejects media proof when:

1. The route or workspace id is unnamed.
2. The changed interaction is not visible in the recording or trace.
3. The final state is hidden behind a debug drawer, devtools pane, loading spinner, or raw payload view.
4. The media only covers an API response while the PR claims a creator-facing route or canvas behavior changed.

## How the reviewer enforces this

For each PR, the reviewer:

1. Reads the parent issue's `## QA Plan` section. Missing → rejects with `REQUEST_CHANGES`.
2. Routes personas by touched paths (see `docs/reviewer-personas.md`).
3. For each persona, walks its falsifiable assertions and emits PASS / FAIL / UNVERIFIABLE.
4. Cross-checks the QA plan's claims against the diff: every listed `Falsifiable` claim must have a corresponding piece of evidence in the diff or a linked artifact.
5. Confirms every "Proof artifacts required" checkbox is satisfied.
6. Merges persona verdicts into a single `verdict` (BLOCK > REQUEST_CHANGES > APPROVE).

## Examples

### Good: a feature with a clear falsifiable claim

```markdown
### Features
- F1 — Add cropping lens to canvas floating toolbar
  - **Falsifiable**: When an image is selected, a "Crop" button is rendered in the floating toolbar; clicking it activates a crop overlay; confirming the crop replaces the selected shape with the cropped variant.
  - **Verification**: `tests/e2e/crop-lens.spec.ts > "crop activates and applies"`.
  - **Proof**: Playwright trace + screenshot `tests/e2e/__screenshots__/crop-applied.png`.
```

### Good: a critical journey with measurable outcome

```markdown
### Critical journeys
- J1 — Hero scene → cropped variant → fan-out
  - **Steps**:
    1. Open `/workspace/<wsId>`.
    2. Generate hero image from prompt "still life of hands".
    3. Activate crop, confirm 4:5 crop.
    4. Trigger fan-out via composer.
  - **Falsifiable**: All four format variants (1:1, 4:5, 9:16, 16:9) are present on the canvas within 30s of fan-out trigger; each carries a `WorkflowRef` linked to the same hero `ToolRef`.
  - **Verification**: `tests/e2e/hero-crop-fanout.spec.ts`.
  - **Proof**: Playwright video `video.mp4 @ 0:12–0:34` + Convex snapshot diff.
```

### Bad: unfalsifiable

```markdown
- F2 — Improve onboarding flow.
  - **Falsifiable**: Onboarding feels more intuitive.
  - **Verification**: Manual review.
  - **Proof**: User feedback.
```

The reviewer rejects this with `REQUEST_CHANGES` and a comment naming the unfalsifiable phrasing (`feels more intuitive`, `manual review`, `user feedback`).

### Bad: missing proof

```markdown
- F3 — Add subscription gating to /api/agent/run.
  - **Falsifiable**: Unauthenticated requests return 401.
  - **Verification**: Curl test.
  - **Proof**: TBD.
```

`Proof: TBD` triggers `UNVERIFIABLE`. The reviewer comments asking for either the curl-test transcript or a contract test id, and blocks merge until provided.

## When this rubric is wrong

If you hit a case where the rubric blocks a legitimate change, **edit the rubric in the same PR** that includes the change. Don't argue with the reviewer — change the rule. The PR description must include a `Rubric change` section explaining what rule changed and why.

The reviewer treats rubric edits with extra scrutiny (the `correctness` persona reads `docs/qa-rubric.md` and `docs/reviewer-personas.md` as load-bearing files, same as `AGENTS.md`).

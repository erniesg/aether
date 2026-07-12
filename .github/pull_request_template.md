<!--
Use docs/qa-rubric.md and docs/reviewer-personas.md to make each claim
falsifiable. Remove placeholders. Mark non-applicable gates as N/A with a
concrete reason rather than inventing evidence.
-->

## Summary

<One-line description of the observable change.>

Related: <#issue, PR, or `none`>

## QA Plan compliance

- [ ] The linked issue's `## QA Plan` is complete, or this PR explains why no issue is required.
- [ ] Every falsifiable claim has corresponding evidence in this PR or a linked artifact.
- [ ] Every required proof artifact is present.
- [ ] Claims use observable outcomes rather than phrases such as *looks good* or *feels right*.

## Risk surfaces

List the personas that apply based on touched paths. This is a review aid; it does not trigger automation.

- `correctness` — every PR
- `demo-arc` — creator-loop routes, canvas, or auto-mode behavior
- `provenance` — agents, capabilities, tools, or Convex state
- `ux-restraint` — creator-facing components and routes
- `security-cost` — providers, APIs, environment settings, or paid calls

## Verification

- [ ] `npm run typecheck` exits 0, or N/A with reason — proof: <output or Actions URL>
- [ ] Relevant focused tests exit 0 — proof: <test id and output or Actions URL>
- [ ] Broader unit/build gate appropriate to the diff exits 0 — proof: <output or Actions URL>
- [ ] Affected browser journey passes, or N/A with reason — proof: <test/trace/URL>
- [ ] Visible behavior has human evidence, or N/A with reason — proof: <screenshot/video/trace>

## Media proof

Name every changed route or interaction. A screenshot proves static state; use a recording or Playwright trace for sequencing, drag/drop, generation, fan-out, editing, approval, or export.

- route / surface: <path, API, workflow, or `none`>
- interaction: <changed behavior or `none`>
- proof: <path, comment URL, timestamp range, JSON, or Actions URL>

## Notes for reviewer

<Constraints, known non-goals, or follow-up work that is not obvious from the diff.>

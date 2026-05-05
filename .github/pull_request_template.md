<!--
The reviewer agent reads this template against `docs/qa-rubric.md` and
`docs/reviewer-personas.md`. Empty sections are flagged. Phrases like
"should", "looks good", or "feels right" are auto-rejected as unfalsifiable.
-->

## Summary

<One-line description of the change. User-facing — what changes for the creator.>

Closes #<issue>

## QA Plan compliance

- [ ] The linked issue's `## QA Plan` section is filled in (no placeholders).
- [ ] Every `Falsifiable` claim has corresponding evidence in this PR or as a linked artifact.
- [ ] Every `Proof artifacts required` checkbox is satisfied.
- [ ] Phrases banned by `docs/qa-rubric.md` (should / looks good / feels right / manual review / TBD) do not appear in this PR description or the issue body.

## Personas firing (auto-detected — reference only)

Read-only reference list. The reviewer determines which personas fire based on the touched paths in the diff; ticking these boxes does not change which assertions get applied.

- `correctness` — fires on every PR
- `demo-arc` — fires when the diff touches `app/workspace/**`, `components/canvas/**`, or `lib/agent/auto-mode*`
- `provenance` — fires when the diff touches `lib/agent/**`, `lib/capability/**`, or `convex/**`
- `ux-restraint` — fires when the diff touches `components/**` or `app/**` (non-API)
- `security-cost` — fires when the diff touches `lib/providers/**`, `convex/**`, `app/api/**`, `.env*`, or adds an LLM/image/video adapter

## Verification

- [ ] `npm run typecheck` exits 0 — proof: <actions run URL or local terminal output>
- [ ] `npm test` exits 0 — proof: <actions run URL or local terminal output>
- [ ] E2E test for the affected journey passes — proof: <test id + actions run URL>
- [ ] Visual proof attached for any UI change — proof: <screenshot path or comment URL>

## Notes for reviewer

<Anything the reviewer should know but won't infer from the diff. Keep brief.>

---

🤖 If this PR was opened by Claude Code, the agent's TDD log lives on the linked issue as a sticky comment.

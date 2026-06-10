# Spec 08 — Presence draft-generation lap (strategy → queue)

- Status: review
- Priority: P1 · Track: presence
- Branch: codex/social-08-draft-generation
- Depends: hard: 04 (profiles + accepted strategy are the input), 05 (queue is the output; gains optional profileId here); soft: 03/06/07 (evidence facts, ledger, insights enrich the prompt when present)
- Evidence dir: docs/specs/2026-06-10-social-loop/evidence/08/

## Summary

The brain of the presence loop: one action per presence profile turns that profile's accepted strategy into pillar-tagged post drafts and reply candidates sitting in the publish queue — every draft grounded in a receipt (a repo fact or a real ICP thread). Nothing auto-posts; the queue's edit/confirm gate (spec 05) stays the only way out.

## QA Plan

### Features

- F1 — `POST /api/presence/drafts` (new): the planner (Anthropic client, mocked in tests per the `tests/unit/api-clusters-label.test.ts` pattern) receives a `profileId` and that profile's accepted strategy (positioning, pillars, icpAccounts, cadence, skipList) plus — when present — repo facts (spec 03), the insights digest (spec 07), the performance ledger (spec 06), and recent ICP posts; it returns drafts `{ kind: 'post'|'reply', text, pillar, targetUrl?, receipt: { kind: 'evidence-fact'|'signal-post', ref } }`
  - **Falsifiable**: with a mocked planner response, the route returns 200 and every draft's `pillar` is a member of the accepted strategy's pillars; every draft carries a non-empty `receipt.ref`; a fixture response containing a 300-weighted-char draft is rejected server-side (`getXWeightedLength` from `lib/publish/x-intent.ts`) and reported in the response `rejected[]`, not silently dropped
  - **Verification**: route unit tests with mocked Anthropic client + schema-violation fixtures
  - **Proof**: test ids in the new route test file
- F2 — Prompt grounding: the outgoing planner prompt contains the strategy pillars block and the draft-shape rules from `references/strategy-exemplar.md` always, the facts block / insights block / ledger block exactly when their sources exist, and omits each cleanly when absent
  - **Falsifiable**: prompt captured via the mocked client contains the fixture pillar names verbatim; with no repo facts seeded, the prompt has no facts block and the route still returns 200
  - **Verification**: prompt-capture assertions in the route unit tests (both enriched and bare fixtures)
  - **Proof**: test ids; captured prompt excerpts in evidence/08/notes.md
- F3 — Accepted drafts land in the spec-05 queue: each generated draft becomes a `publishDraft` row (status `draft`) with pillar, the generating `profileId` (new optional column on the spec-05 table — additive migration), and, for replies, `targetUrl`; a `lapId` stamped on the batch makes re-running idempotent
  - **Falsifiable**: invoking generation twice with the same `lapId` yields the same queue row count (no duplicates); rows render in the publish rail exactly like hand-written drafts
  - **Verification**: unit test on the persistence step; component test asserting generated rows render in the existing queue UI
  - **Proof**: test ids
- F4 — Rail affordance: a "generate drafts" action in the presence section with a one-line result (`n posts · m replies`); disabled with a single hint line when no accepted strategy exists
  - **Falsifiable**: without an accepted strategy the button is disabled and one hint line renders; with one (fixture), clicking calls the route and the result line shows the returned counts
  - **Verification**: component test with mocked route
  - **Proof**: component test ids + screenshot

New files to add: `app/api/presence/drafts/route.ts` + route tests, generation lib under `lib/presence/` + tests, rail wiring in the presence section (spec 04's component), evidence under `evidence/08/`

### Critical journeys

- J1 — Goal-grounded drafts, end to end
  - **Steps**: 1. Seed an accepted strategy fixture 2. Click "generate drafts" (mocked planner) 3. Open the publish rail 4. Confirm one generated draft via the intent link
  - **Falsifiable**: the queue shows the generated drafts with pillar chips matching the strategy's pillars; the confirmed draft opens the exact intent URL containing its (possibly edited) text; the receipt ref renders on the row
  - **Verification**: Playwright e2e with route-stubbed planner and `x.com/**` stub (pattern: `tests/e2e/publish-draft-queue.spec.ts`)
  - **Proof**: e2e test id + trace + screenshot saved under evidence/08/

### Surfaces touched

- **Web**: `/workspace/[wsId]` (presence section button; publish rail rows)
- **API**: `POST /api/presence/drafts` (new)
- **Worker / job / cron**: none in this spec (cron wiring follows the spec-01 pattern later)

### Proof artifacts required

- [ ] route test output incl. prompt-capture assertions — evidence/08/notes.md
- [ ] captured planner prompts (enriched + bare) — evidence/08/notes.md
- [ ] Playwright trace + screenshot of generated drafts in the queue — saved under evidence/08/
- [ ] idempotency proof: row counts before/after duplicate lapId run — evidence/08/notes.md

### Media proof

- route / surface: presence section + publish rail on `/workspace/[wsId]`, `POST /api/presence/drafts`
- interaction: generate → review queue → confirm one via intent
- proof: trace + screenshots + JSON dumps

### Personas firing (auto-detected, listed for clarity)

- correctness, demo-arc, provenance, ux-restraint, security-cost

## Acceptance criteria

- [ ] Every generated draft's pillar ∈ accepted strategy pillars; every draft has a receipt ref (test ids)
- [ ] Over-weighted drafts are rejected server-side and surfaced in `rejected[]` (test id)
- [ ] Prompt contains pillars + exemplar draft-shape rules always; evidence/insights/ledger blocks appear iff their sources exist (prompt-capture test ids)
- [ ] Duplicate `lapId` runs add zero new rows (test id + notes proof)
- [ ] Generation never transitions a draft to `posted` — grep proof: no `markDraftPosted`/`markPosted` call in the generation path (evidence/08/notes.md)
- [ ] Queue rows from generation are indistinguishable in behavior from hand-written ones (component test reusing spec-05 assertions)
- [ ] Generation is profile-scoped: two profiles generating in the same workspace produce disjoint draft sets, each tagged with its profileId (test id)

## Context / references

- Linked branches: codex/social-05-draft-queue (merged)
- Related docs: `docs/DESIGN-SOCIAL-CANVAS.md`, `lib/publish/x-intent.ts`, `lib/publish/draft-store.ts`, spec 04 (profiles + strategy shape), spec 07 (insights digest shape), `references/strategy-exemplar.md` (quality bar)
- External: none

# Spec 07 — ICP account analysis — learn what the room rewards

- Status: done
- Priority: P2 · Track: presence
- Branch: codex/social-07-icp-insights
- Depends: soft: 04 (falls back to signalSubscription accounts without an accepted strategy); digest rows scoped by profileId
- Evidence dir: docs/specs/2026-06-10-social-loop/evidence/07/

## Summary

Aether studies the reference/ICP accounts in a presence profile's accepted strategy — what formats, hooks, and timing actually earn engagement for them — and produces a "what works" digest that strategy generation and draft optimization consume. Self-metrics (own-handle ledger) say how we did; this says what the room rewards.

## QA Plan

### Features

- F1 — Reference-account lap: `lib/research/account-analysis.ts` collects recent posts + metrics for each handle in the profile's accepted strategy `icpAccounts` (and any `signalSubscription` accounts) via the existing `lib/research/event-recap/xquik.ts` adapter, persisting per-account corpora in a new convex table (`referenceAccountPost`: handle, postUrl, text, postedAt, metrics, capturedAt)
  - **Falsifiable**: given fixture xquik payloads for 3 handles, the lap persists one row per post with numeric metrics; re-running appends new snapshots for changed metrics, never duplicates a (handle, postUrl, capturedAt) triple
  - **Verification**: unit tests with recorded fixtures (no live scrape in tests)
  - **Proof**: test ids in `lib/research/account-analysis.test.ts`
- F2 — Feature extraction: each post is classified on deterministic dimensions — format (thread/single/media/link), hook shape (number-led, question, claim, story), length bucket, posting hour (UTC) — as pure functions over the post record
  - **Falsifiable**: 12 fixture posts classify to the expected labels exactly (table-driven test); classification of the same input is stable across runs
  - **Verification**: table-driven unit test
  - **Proof**: test ids
- F3 — "What works" digest: `GET /api/presence/insights` (new) returns per-dimension engagement stats across the analyzed corpus (e.g. median engagement by format, by hook shape, top-quartile posting hours) plus the 5 highest-engagement exemplar post URLs
  - **Falsifiable**: digest JSON for the fixture corpus matches a stored snapshot; quartile math is unit-tested against hand-computed values
  - **Verification**: route unit test + snapshot test
  - **Proof**: test ids; digest JSON in evidence/07/notes.md
- F4 — Consumption: `POST /api/presence/strategy` includes the digest in its planner context when one exists (graceful without); the draft queue renders a one-line insight hint per draft's pillar (metadata styling)
  - **Falsifiable**: with a fixture digest present, the strategy route's outgoing planner prompt contains the digest block (asserted via mocked Anthropic client capture); with none, the prompt omits it and the route still returns 200
  - **Verification**: route unit test with prompt capture (pattern: `tests/unit/api-clusters-label.test.ts`)
  - **Proof**: test ids

New files to add: `lib/research/account-analysis.ts` + tests, convex table + functions, `app/api/presence/insights/route.ts` + test, digest wiring in the presence strategy route and publish-section hint line

### Critical journeys

- J1 — ICP corpus → digest → grounded strategy
  - **Steps**: 1. Seed fixture corpora for 3 reference handles 2. Hit `GET /api/presence/insights` 3. Generate a strategy
  - **Falsifiable**: the digest lists ≥2 dimensions with numeric stats; the captured planner prompt for strategy generation contains the digest block verbatim
  - **Verification**: unit/route tests as above; curl recipe in evidence/07/notes.md
  - **Proof**: digest JSON + captured prompt excerpt in evidence/07/notes.md

### Surfaces touched

- **Web**: `/workspace/[wsId]` (publish-section hint line; right rail)
- **API**: `GET /api/presence/insights` (new); lap trigger route (new, secret-gated, same pattern as refresh-due)
- **Worker / job / cron**: lap invocable by the shared cron pattern (separate workflow, weekly cadence)

### Proof artifacts required

- [ ] fixture-driven test run output (all green) — evidence/07/notes.md
- [ ] digest JSON for the fixture corpus — evidence/07/notes.md
- [ ] captured planner prompt showing digest inclusion — evidence/07/notes.md
- [ ] one real lap over 3 actual ICP handles with rows persisted (content redacted ok) — evidence/07/notes.md, tagged human-only (Ernie supplies)

### Media proof

- route / surface: `GET /api/presence/insights`, publish-section hint on `/workspace/[wsId]`
- interaction: run lap → read digest → generate strategy with digest context
- proof: JSON dumps + screenshot of the hint line

### Personas firing (auto-detected, listed for clarity)

- correctness, provenance, ux-restraint, security-cost

## Acceptance criteria

- [ ] Lap persists fixture corpora for 3 handles without duplication, scoped to the requesting profile (test ids)
- [ ] 12-post classification table passes exactly (test id)
- [ ] Digest JSON snapshot-stable with hand-verified quartile math (test ids)
- [ ] Strategy prompt contains the digest when present, omits cleanly when absent (test ids)
- [ ] Scrape volume bounded: ≤50 posts per handle per lap, logged as `account-analysis.lap.posts=<n>` (structured log line)

## Context / references

- Linked branches: none
- Related docs: `docs/DESIGN-SOCIAL-CANVAS.md`, `lib/research/event-recap/xquik.ts`, `lib/signals/store.ts`
- External: none

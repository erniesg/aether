# Spec 06 — Own-handle stats lap + per-pillar performance ledger

- Status: todo
- Priority: P2 · Track: presence
- Branch: codex/social-06-presence-ledger
- Depends: soft: 05 (permalink join degrades to pillar=untagged); handle + profileId from 04
- Evidence dir: docs/specs/2026-06-10-social-loop/evidence/06/

## Summary

Aether reads the creator's own X handle on a lap and keeps a per-pillar performance ledger — which content pillars earn engagement — surfaced in the right rail and exported as structured context for the next strategy generation.

## QA Plan

### Features

- F1 — Own-handle metrics lap: a new `lib/research/presence-metrics.ts` collects recent posts + metrics for a presence profile's handle (spec 04) via the existing `lib/research/event-recap/xquik.ts` adapter, storing snapshots in a new convex table (`presencePostMetric`: profileId, postUrl, capturedAt, likes, reposts, replies, impressions, pillar?)
  - **Falsifiable**: given a fixture xquik payload, the lap persists one snapshot row per post with numeric metrics; re-running appends a new snapshot (time series), never overwrites
  - **Verification**: unit test with recorded fixture (no live scrape in tests); idempotency-of-shape test
  - **Proof**: test ids in `lib/research/presence-metrics.test.ts`
- F2 — Pillar attribution: snapshots join to posted drafts by permalink (from the draft-queue issue); matched rows carry the draft's pillar tag, unmatched rows carry `pillar: untagged`
  - **Falsifiable**: fixture with 2 matched + 1 unmatched permalink yields exactly 2 tagged + 1 `untagged` rows
  - **Verification**: unit test on the join
  - **Proof**: test id
- F3 — Per-pillar rollup surfaced in the right rail (metadata taxonomy): pillar → posts, median engagement; plus `GET /api/presence/ledger` returning the rollup JSON consumed by strategy generation
  - **Falsifiable**: the endpoint returns deterministic rollup JSON for the fixture set (snapshot match); the rail renders one line per pillar, counts only
  - **Verification**: route unit test + component test
  - **Proof**: test ids + screenshot

New files to add: `lib/research/presence-metrics.ts` + test, convex table + functions, `app/api/presence/ledger/route.ts` + test, right-rail rollup lines

### Critical journeys

- J1 — Lap → ledger → visible rollup
  - **Steps**: 1. Seed fixture snapshots 2. Open `/workspace/demo-ws` right rail 3. Hit `GET /api/presence/ledger`
  - **Falsifiable**: rail lines match the endpoint JSON exactly (same pillar names and counts)
  - **Verification**: component test + curl recipe
  - **Proof**: screenshot + JSON in evidence/06/notes.md

### Surfaces touched

- **Web**: `/workspace/[wsId]` (right rail, metadata)
- **API**: `GET /api/presence/ledger` (new); lap trigger route (new, secret-gated like refresh-due)
- **Worker / job / cron**: lap can be invoked by the cron pattern from the events-refresh issue (shared approach, separate workflow)

### Proof artifacts required

- [ ] fixture-driven test run output (all green) — evidence/06/notes.md
- [ ] ledger JSON + matching rail screenshot — evidence/06/notes.md
- [ ] one real lap against one profile's handle with metrics rows persisted (numbers redacted ok) — evidence/06/notes.md, tagged human-only (Ernie supplies)

### Media proof

- route / surface: right rail rollup on `/workspace/[wsId]`, `GET /api/presence/ledger`
- interaction: run lap → view rollup
- proof: screenshot + JSON dump

### Personas firing (auto-detected, listed for clarity)

- correctness, provenance, security-cost

## Acceptance criteria

- [ ] Fixture lap persists profile-scoped time-series snapshots with numeric metrics; two profiles never mix rows (test ids)
- [ ] Pillar join: matched permalinks tagged, unmatched `untagged` (test id)
- [ ] `GET /api/presence/ledger` returns snapshot-stable rollup JSON (test id)
- [ ] Rail rollup matches endpoint output (screenshot + JSON)
- [ ] One real-handle lap recorded (human-only artifact in PR comment)

## Context / references

- Linked branches: none
- Related docs: `docs/DESIGN-SOCIAL-CANVAS.md`, `lib/research/event-recap/xquik.ts`
- External: none

# Spec 04 — Goal/ICP intake → proposed social strategy (propose→accept)

- Status: todo
- Priority: P1 · Track: presence
- Branch: codex/social-04-presence-strategy
- Depends: soft: 03 (degrades to brand/offer context without repo facts)
- Evidence dir: docs/specs/2026-06-10-social-loop/evidence/04/

## Summary

A creator states a presence goal ("build an X following to be seen for FDE/AI-engineering roles") and aether proposes a complete social strategy — ICP account list, content pillars, cadence, goal metric — as an accept/reject proposal, following the existing proposedCampaign pattern.

## QA Plan

### Features

- F1 — Presence intake in the left rail (creator-context section): goal text + target metric + **the creator's X handle**, persisted per workspace. The handle is the "connect my X" of this loop — it is the read-side identity specs 06 (own-handle lap) and 08 (generation lap) consume; posting stays intent-link only, so no OAuth/token is collected
  - **Falsifiable**: entering goal and handle and reloading the workspace shows both (Convex round-trip); handle is normalized to `@handle` form (`x.com/...` URLs and bare names both accepted — unit-tested normalizer); empty state is a single hint line
  - **Verification**: component test with the existing creator-store pattern; normalizer unit test; reload e2e
  - **Proof**: component + unit test ids + before/after-reload screenshots
- F2 — `POST /api/presence/strategy` (new): agent drafts `{ icpAccounts[], pillars[], cadence, goalMetric }` from goal + brand/offer context + repo facts when present (graceful without them), stored as a proposal row with `status: proposed`
  - **Falsifiable**: the endpoint returns 200 with a strategy containing ≥5 ICP accounts and 3–5 pillars, each pillar referencing at least one workspace fact or repo; a proposal row exists with `status: proposed`
  - **Verification**: route unit test with mocked Anthropic client (pattern: `tests/unit/api-clusters-label.test.ts`)
  - **Proof**: test ids; JSON response in evidence/04/notes.md
- F3 — Accept/reject UI mirroring the `proposedCampaign` accept/reject UX; accepting persists the strategy as the workspace's active presence strategy
  - **Falsifiable**: clicking accept flips the row to `status: accepted` and the rail summary chip shows the pillar count; reject removes the proposal
  - **Verification**: component test driving accept and reject
  - **Proof**: component test ids + screenshot

New files to add: `app/api/presence/strategy/route.ts`, presence section component under `components/rail/sections/`, convex table + functions for presence strategy (mirroring `proposedCampaign` in `convex/schema.ts`), tests

### Critical journeys

- J1 — Goal → accepted strategy
  - **Steps**: 1. Open `/workspace/demo-ws` 2. Enter presence goal 3. Generate strategy 4. Accept it
  - **Falsifiable**: an accepted strategy row exists for the workspace and survives reload; the rail shows pillars as chips (progressive disclosure, no walls of text)
  - **Verification**: e2e with mocked agent response
  - **Proof**: e2e test id + screenshots (proposed state, accepted state, after reload)

### Surfaces touched

- **Web**: `/workspace/[wsId]` (left rail)
- **API**: `POST /api/presence/strategy` (new)
- **Worker / job / cron**: none

### Proof artifacts required

- [ ] JSON of a generated strategy (mocked agent) — evidence/04/notes.md
- [ ] screenshots: proposal rendered, accepted state, after reload — evidence/04/notes.md
- [ ] convex row dump showing `status` transition proposed→accepted — evidence/04/notes.md

### Media proof

- route / surface: left rail presence section on `/workspace/[wsId]`
- interaction: enter goal → generate → accept
- proof: screenshots + component/e2e test ids

### Personas firing (auto-detected, listed for clarity)

- correctness, provenance, ux-restraint

## Acceptance criteria

- [ ] Goal and normalized X handle persist across reload (screenshots + normalizer test ids)
- [ ] Strategy generation returns ≥5 ICP accounts + 3–5 pillars grounded in workspace facts (JSON proof, test id)
- [ ] Accept/reject transitions are persisted and reflected in the rail (test ids + screenshots)
- [ ] Works with no repo facts ingested — degrades to brand/offer context without error (test id)

## Context / references

- Linked branches: none
- Related docs: `docs/DESIGN-SOCIAL-CANVAS.md`, `convex/schema.ts` (`proposedCampaign` pattern, `campaignProfile`)
- External: none

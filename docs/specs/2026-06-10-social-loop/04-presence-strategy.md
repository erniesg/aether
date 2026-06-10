# Spec 04 — Presence profiles + goal intake → proposed social strategy (propose→accept)

- Status: review
- Priority: P1 · Track: presence
- Branch: codex/social-04-presence-strategy
- Depends: soft: 03 (degrades to brand/offer context without evidence sources)
- Evidence dir: docs/specs/2026-06-10-social-loop/evidence/04/

## Summary

A workspace holds one or more **presence profiles** — a creator may run their personal account, a product account, and client-brand accounts side by side, even multiple goals for the same brand. Each profile carries a label, an X handle, and a goal; per profile, aether proposes a complete social strategy — positioning, ICP account list with reasons, evidence-mapped content pillars, mechanics, skip list, 90-day metric — as an accept/reject proposal following the existing proposedCampaign pattern. Quality bar: `references/strategy-exemplar.md`.

## QA Plan

### Features

- F1 — Presence profiles in the left rail (creator-context section): zero-to-many per workspace, each `{ label, xHandle, goal, targetMetric }`; one row per profile (progressive disclosure), an add affordance, and an active-profile selection that downstream sections (publish queue, ledger) read
  - **Falsifiable**: adding two profiles ("personal", "product") and reloading shows both rows with their handles; the active selection survives reload; handle input is normalized to `@handle` form (`x.com/...` URLs and bare names both accepted — unit-tested normalizer); empty state is a single hint line
  - **Verification**: component test with the existing creator-store pattern; normalizer unit test; reload e2e
  - **Proof**: component + unit test ids + before/after-reload screenshots
- F2 — `POST /api/presence/strategy` (new): given a `profileId`, the agent drafts `{ positioning, icpAccounts[{ handle, reason }], pillars[{ name, evidenceRefs[], exampleFormats[] }], cadence, replyPlaybook{ dailyMinutes, accountListSize }, skipList[], goalMetric90d }` from the profile's goal + brand/offer context + evidence sources when present (graceful without them), stored as a proposal row with `status: proposed` scoped to the profile. The planner prompt embeds the reasoning shape from `references/strategy-exemplar.md`
  - **Falsifiable**: the endpoint returns 200 with ≥5 ICP accounts each carrying a non-empty `reason`, 3–5 pillars each carrying ≥1 `evidenceRefs` entry, a non-empty `skipList`, and a `goalMetric90d` that is not a follower count; a proposal row exists with `status: proposed` and the requesting `profileId`; the captured planner prompt contains the exemplar's reasoning-shape block
  - **Verification**: route unit test with mocked Anthropic client + prompt capture (pattern: `tests/unit/api-clusters-label.test.ts`)
  - **Proof**: test ids; JSON response + captured prompt excerpt in evidence/04/notes.md
- F3 — Accept/reject UI mirroring the `proposedCampaign` accept/reject UX; accepting persists the strategy as that profile's active strategy (other profiles unaffected)
  - **Falsifiable**: with two profiles each holding a proposal, accepting profile A's flips only A's row to `status: accepted`; B's remains `proposed`; the rail summary chip shows A's pillar count under A
  - **Verification**: component test driving accept and reject across two profiles
  - **Proof**: component test ids + screenshot

New files to add: `app/api/presence/strategy/route.ts`, presence section component under `components/rail/sections/`, convex tables + functions for `presenceProfile` and per-profile strategy (mirroring `proposedCampaign` in `convex/schema.ts`), handle-normalizer lib + test, tests

### Critical journeys

- J1 — Two profiles, two strategies, independent accept
  - **Steps**: 1. Open `/workspace/demo-ws` 2. Add profiles "personal" and "product" with different handles + goals 3. Generate a strategy for each (mocked agent) 4. Accept only "personal"
  - **Falsifiable**: after reload, "personal" shows an accepted strategy with its pillar chips; "product" still shows a proposal; both handles render normalized
  - **Verification**: e2e with mocked agent responses
  - **Proof**: e2e test id + screenshots (both profiles, accepted vs proposed, after reload)

### Surfaces touched

- **Web**: `/workspace/[wsId]` (left rail)
- **API**: `POST /api/presence/strategy` (new)
- **Worker / job / cron**: none

### Proof artifacts required

- [ ] JSON of a generated strategy (mocked agent) showing the full shape incl. positioning/skipList/goalMetric90d — evidence/04/notes.md
- [ ] captured planner prompt containing the exemplar reasoning-shape block — evidence/04/notes.md
- [ ] screenshots: two profiles, proposal rendered, accepted state, after reload — evidence/04/notes.md
- [ ] convex row dump showing per-profile `status` transition proposed→accepted — evidence/04/notes.md

### Media proof

- route / surface: left rail presence section on `/workspace/[wsId]`
- interaction: add profiles → enter goals → generate → accept one
- proof: screenshots + component/e2e test ids

### Personas firing (auto-detected, listed for clarity)

- correctness, provenance, ux-restraint

## Acceptance criteria

- [ ] Multiple profiles per workspace persist with normalized handles across reload (screenshots + normalizer test ids)
- [ ] Strategy shape complete per F2: ICP reasons, pillar evidenceRefs, skipList, non-follower goalMetric90d (JSON proof, test ids)
- [ ] Planner prompt embeds the exemplar reasoning shape (prompt-capture test id)
- [ ] Accept/reject is profile-scoped — accepting one profile's strategy leaves siblings untouched (test ids + screenshots)
- [ ] Works with no evidence sources ingested — degrades to brand/offer context without error (test id)

## Context / references

- Linked branches: none
- Related docs: `docs/DESIGN-SOCIAL-CANVAS.md`, `convex/schema.ts` (`proposedCampaign` pattern, `campaignProfile`), `references/strategy-exemplar.md`
- External: none

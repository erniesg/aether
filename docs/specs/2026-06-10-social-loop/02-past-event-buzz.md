# Spec 02 — Past-event recap pages + live buzz strip

- Status: done
- Priority: P1 · Track: vibes
- Branch: codex/social-02-past-event-buzz
- Depends: none (pairs with 01 for live cadence)
- Evidence dir: docs/specs/2026-06-10-social-loop/evidence/02/

## Summary

Creators can spin up a recap page for a past event (e.g. AIE World's Fair 2025) from the vibes workbench, and `/events/[eventId]` gains a live buzz strip that updates while a refresh lap runs.

## QA Plan

### Features

- F1 — Creating an event with explicit past dates produces scrape windows bracketing those dates, not today
  - **Falsifiable**: `POST /api/events` with `startsAt: 2025-06-03`, `endsAt: 2025-06-05`, `daysBefore: 7`, `daysAfter: 14` yields runs whose `windowStart >= 2025-05-27` and `windowEnd <= 2025-06-19` in the bundle JSON
  - **Verification**: unit test on window derivation; curl recipe with mock mode
  - **Proof**: test id in `lib/research/event-recap/` window test; bundle JSON snippet in evidence/02/notes.md
- F2 — The vibes workbench create flow accepts past dates (date inputs, not just "now"-anchored windows)
  - **Falsifiable**: submitting the workbench form with a 2025 date range creates an event whose record carries those `startsAt`/`endsAt`; the new event row appears in the workbench list
  - **Verification**: component test on the form; Playwright e2e against mock mode
  - **Proof**: e2e test id + final screenshot
- F3 — Buzz strip on `/events/[eventId]`: the latest `runEvents` render as a live-updating line (newest first) while a run is in progress, within 5s of the event being written
  - **Falsifiable**: with a mock-mode refresh dispatched, the strip shows a new `collect.*` line within 5s without a page reload
  - **Verification**: Playwright e2e — dispatch refresh, await strip text change with 5s timeout
  - **Proof**: Playwright trace + screenshot; e2e test id

New files to add: buzz strip component under `app/events/[eventId]/` (wired into `EventRecapClient.tsx`), e2e spec under `tests/e2e/`

### Critical journeys

- J1 — Past event recap end-to-end
  - **Steps**: 1. Open `/vibes` 2. Create "AIE World's Fair 2025" with 2025 dates, `liveMode: mock` 3. Run refresh 4. Open `/events/[eventId]`
  - **Falsifiable**: the page renders ≥1 theme, ≥1 post, and the voices list from the mock corpus; the buzz strip shows the completed run timeline
  - **Verification**: Playwright e2e in mock mode (deterministic, no credits)
  - **Proof**: e2e test id + final screenshot + trace

### Surfaces touched

- **Web**: `/vibes`, `/events/[eventId]`
- **API**: `POST /api/events` (existing — past-date handling), `GET /api/events/[eventId]` (existing)
- **Worker / job / cron**: none

### Proof artifacts required

- [ ] bundle JSON for a past-dated mock event showing bracketed windows — evidence/02/notes.md
- [ ] Playwright trace + final screenshot of the past-event page with buzz strip — saved under evidence/02/
- [ ] screenshot of the workbench create form with past dates — evidence/02/notes.md

### Media proof

- route / surface: `/vibes` create flow, `/events/[eventId]` buzz strip
- interaction: create past event → run mock refresh → watch strip update
- proof: Playwright trace + screenshots

### Personas firing (auto-detected, listed for clarity)

- correctness, demo-arc, ux-restraint

## Acceptance criteria

- [ ] Past-dated event creation produces correctly bracketed scrape windows (unit test + JSON proof)
- [ ] `/events/[eventId]` renders the mock past event with themes/posts/voices (e2e screenshot)
- [ ] Buzz strip updates within 5s of a runEvent write, no reload (Playwright trace)
- [ ] Strip follows restraint rules: single line per event, no panel of raw payloads (`docs/qa-rubric.md` ux-restraint)

## Context / references

- Linked branches: none
- Related docs: `docs/DESIGN-SOCIAL-CANVAS.md` §1, `docs/playbooks/event-recap/SKILL.md`
- External: none

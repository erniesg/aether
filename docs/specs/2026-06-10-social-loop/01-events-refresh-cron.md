# Spec 01 — Cron-fired refresh laps for live event windows

- Status: review
- Priority: P1 · Track: vibes
- Branch: codex/social-01-events-refresh-cron
- Depends: none
- Evidence dir: docs/specs/2026-06-10-social-loop/evidence/01/

## Summary

Events with a live or recent window refresh themselves on a schedule — creators see buzz update on `/events/[eventId]` without pressing refresh.

## QA Plan

### Features

- F1 — New `POST /api/events/refresh-due` endpoint refreshes every event whose `nextRefreshAt <= now`, guarded by a bearer secret (env name `CRON_REFRESH_SECRET`)
  - **Falsifiable**: with the secret, returns 200 and a JSON array of `{ eventId, runId }` for due events; without it, returns 401; events with `nextRefreshAt` in the future are excluded
  - **Verification**: unit test on the due-selection function with three fixture events (due / not-due / budget-exhausted); curl recipe in evidence/01/notes.md
  - **Proof**: test id `tests/unit/api-events-refresh-due.test.ts > "due selection"`; curl + JSON response pasted into evidence/01/notes.md
- F2 — Refresh laps respect `monthlyCreditBudget`: a due event whose `usedCredits >= monthlyCreditBudget` is skipped and reported as `skipped: budget`
  - **Falsifiable**: response JSON marks the over-budget fixture event `{ skipped: "budget" }`; no scrape run is created for it
  - **Verification**: unit test with over-budget fixture
  - **Proof**: test id in `tests/unit/api-events-refresh-due.test.ts`
- F3 — A scheduled GitHub Actions workflow hits the endpoint on a cron (15-min cadence) against the staging deployment
  - **Falsifiable**: a workflow run completes with HTTP 200 logged; the refreshed event's `lastRunAt` advances in the bundle JSON
  - **Verification**: manually dispatch the workflow once (`gh workflow run events-refresh-cron.yml`) and read the run log
  - **Proof**: GitHub Actions run URL in evidence/01/notes.md

New files to add: `app/api/events/refresh-due/route.ts`, `tests/unit/api-events-refresh-due.test.ts`, `.github/workflows/events-refresh-cron.yml`

### Critical journeys

- J1 — Live event refreshes hands-free
  - **Steps**: 1. Create an event with `refreshIntervalHours` set and `liveMode: mock` 2. Dispatch the cron workflow 3. Load `/events/[eventId]`
  - **Falsifiable**: the bundle shows a new `eventScrapeRun` with `status: completed` created by the cron lap (not by a UI click), and `nextRefreshAt` is rescheduled to a future timestamp
  - **Verification**: curl `GET /api/events/[eventId]` before/after dispatch; diff `runs.length` and `nextRefreshAt`
  - **Proof**: before/after JSON snippets in evidence/01/notes.md

### Surfaces touched

- **Web**: none
- **API**: `POST /api/events/refresh-due` (new)
- **Worker / job / cron**: `.github/workflows/events-refresh-cron.yml` (new)

### Proof artifacts required

- [ ] curl + 200 JSON for the new endpoint (with secret) and 401 (without) — evidence/01/notes.md
- [ ] Actions run URL for one successful cron dispatch — evidence/01/notes.md
- [ ] before/after bundle JSON showing `nextRefreshAt` rescheduled — evidence/01/notes.md

### Media proof

- route / surface: `POST /api/events/refresh-due`, Actions workflow `events-refresh-cron.yml`
- interaction: cron dispatch → lap runs → bundle updates
- proof: Actions URL + JSON dumps in evidence/01/notes.md

### Personas firing (auto-detected, listed for clarity)

- correctness, security-cost

## Acceptance criteria

- [ ] `POST /api/events/refresh-due` exists, secret-gated, with due/not-due/budget unit tests green (`tests/unit/api-events-refresh-due.test.ts`)
- [ ] Cron workflow dispatches and logs HTTP 200 against staging (Actions run URL)
- [ ] A due mock-mode event gains a completed run and a future `nextRefreshAt` after one cron tick (JSON proof)
- [ ] No secret value appears in code, logs, or workflow file — env name only (`CRON_REFRESH_SECRET`)

## Context / references

- Linked branches: none
- Related docs: `docs/DESIGN-SOCIAL-CANVAS.md`, `lib/research/event-recap/types.ts` (`nextRefreshAt`, `refreshIntervalHours`, `monthlyCreditBudget`)
- External: none

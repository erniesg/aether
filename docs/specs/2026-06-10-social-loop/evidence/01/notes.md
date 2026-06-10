# Spec 01 evidence

## Protocol

Claim commit:

```text
git checkout -b codex/social-01-events-refresh-cron
git commit -m "chore: claim spec 01"
```

Red run before implementation:

```text
npx vitest run tests/unit/api-events-refresh-due.test.ts

Failed to resolve import "@/lib/research/event-recap/refresh-due"
```

## Commands

```text
npx vitest run tests/unit/api-events-refresh-due.test.ts

Test Files  1 passed (1)
Tests       4 passed (4)
```

```text
npx vitest run tests/unit/api-events-refresh-due.test.ts tests/unit/api-events-auth.test.ts tests/unit/api-events.test.ts tests/unit/event-recap-pipeline-events.test.ts

Test Files  4 passed (4)
Tests       16 passed (16)
```

```text
npm run typecheck
> tsc --noEmit
exit 0
```

## Endpoint curl proof

Local dev server command used for route proof:

```text
PORT=3001 CRON_REFRESH_SECRET=$CRON_REFRESH_SECRET VIBES_DAILY_CALL_LIMIT=200 npm run dev -- -p 3001
```

Unauthorized request:

```text
curl --request POST --write-out "\nHTTP %{http_code}\n" http://localhost:3001/api/events/refresh-due

{"ok":false,"error":"unauthorized"}
HTTP 401
```

Authorized request against an empty local event store:

```text
curl --request POST --header "Authorization: Bearer $CRON_REFRESH_SECRET" --write-out "\nHTTP %{http_code}\n" http://localhost:3001/api/events/refresh-due

[]
HTTP 200
```

## JSON proof

`tests/unit/api-events-refresh-due.test.ts` fixture response for a due event:

```json
[{ "eventId": "due-event", "runId": "run_due_1" }]
```

Budget-exhausted due event response:

```json
[{ "eventId": "budget-event", "skipped": "budget" }]
```

Due selection fixture:

```json
[
  { "eventId": "due-event" },
  { "eventId": "budget-event", "skipped": "budget" }
]
```

The future fixture is excluded because `nextRefreshAt > now`.

## Proof ids

- Due/not-due/budget selection: `tests/unit/api-events-refresh-due.test.ts`.
- Missing bearer secret returns 401 and does not list or refresh events:
  `tests/unit/api-events-refresh-due.test.ts`.
- Due event invokes `refreshEventRecap` and returns `{ eventId, runId }`:
  `tests/unit/api-events-refresh-due.test.ts`.
- Budget-exhausted due event returns `{ skipped: "budget" }` and does not call
  `refreshEventRecap`: `tests/unit/api-events-refresh-due.test.ts`.
- Route integration with existing event auth/bundle/run-event behavior was
  checked by the focused event recap gate above.

## Workflow proof

Proposed workflow file: `.github/workflows-proposed/events-refresh-cron.yml`.

It dispatches every 15 minutes and on `workflow_dispatch`, posting to:

```text
https://aether-stg.berlayar.ai/api/events/refresh-due
```

Secret env name only:

```text
CRON_REFRESH_SECRET
```

Staging dispatch URL is blocked by GitHub token permissions on this VM:
`git push` rejected creation of `.github/workflows/events-refresh-cron.yml`
because the OAuth token does not have the `workflow` scope. The workflow is
therefore proposed under `.github/workflows-proposed/` per repo convention and
must be promoted by a human or a credential with workflow-write permission. No
secret value is committed or printed.

## Before/after bundle proof

The unit route fixture proves a due event becomes a refresh call and reports
the returned run id. A live before/after `GET /api/events/[eventId]` staging
bundle proof is pending with the workflow dispatch, because it requires a
staging event with `nextRefreshAt <= now` and `CRON_REFRESH_SECRET` configured.

## Dependency note

No new runtime dependencies were added.

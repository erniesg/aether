# Spec 02 evidence

## Commands

Red run before implementation:

```text
npx vitest run lib/research/event-recap/window.test.ts

AssertionError: expected '2026-05-16T01:30:00.000Z' to be '2025-06-03'
```

Green unit/component-adjacent gates:

```text
npx vitest run lib/research/event-recap/window.test.ts tests/unit/api-vibes.test.ts tests/unit/api-vibes-run.test.ts

Test Files  3 passed (3)
Tests       9 passed (9)
```

```text
npm run typecheck
> tsc --noEmit
exit 0
```

Browser proof:

```text
npx playwright test tests/e2e/past-event-buzz.spec.ts --trace on --output docs/specs/2026-06-10-social-loop/evidence/02/playwright-output

1 passed
```

## Window JSON

Fixture from `lib/research/event-recap/window.test.ts`:

```json
{
  "eventId": "aie-worlds-fair-2025-window",
  "startsAt": "2025-06-03",
  "endsAt": "2025-06-05",
  "daysBefore": 7,
  "daysAfter": 14,
  "run": {
    "windowStart": "2025-05-27T00:00:00.000Z",
    "windowEnd": "2025-06-19T00:00:00.000Z"
  }
}
```

## Media proof

- Scope form with past dates: `docs/specs/2026-06-10-social-loop/evidence/02/past-date-scope.png`.
- Past event report with buzz strip: `docs/specs/2026-06-10-social-loop/evidence/02/past-event-buzz.png`.
- Playwright trace: `docs/specs/2026-06-10-social-loop/evidence/02/playwright-output/e2e-past-event-buzz-Spec-0-84056-he-buzz-strip-on-the-report-chromium/trace.zip`.

## Proof ids

- Past-dated window bracketing: `lib/research/event-recap/window.test.ts`.
- `/api/vibes` passes `startsAt`/`endsAt` through create and refresh:
  `tests/unit/api-vibes.test.ts`.
- Mock event renders themes/posts/voices and sanitized bundle:
  `tests/unit/api-vibes-run.test.ts`.
- Workbench past-date create flow and event-page buzz strip:
  `tests/e2e/past-event-buzz.spec.ts`.

## UX restraint

The buzz strip is a single metadata line under the event header. It shows only
safe run-event tags/messages, newest first; raw payloads stay in the existing
debug/source-pack surfaces.

## Dependency note

No new runtime dependencies were added.

# Spec 07 evidence

## Protocol note

The first 07 pass was present before this review lap and did not include a
claim/commit protocol. This refresh adds the missing lap route, Xquik-backed
collector, secret gate, 50-post cap, count log, and corrected quartile math.

## Commands

```text
npx vitest run tests/unit/account-analysis.test.ts tests/unit/convex-presence-insights.test.ts tests/unit/api-presence-insights.test.ts tests/unit/api-presence-insights-lap.test.ts tests/unit/api-presence-strategy.test.ts

Test Files  5 passed
Tests       13 passed
```

```text
npm run typecheck
> tsc --noEmit
exit 0
```

## Proof ids

- 12-post deterministic classification table:
  `tests/unit/account-analysis.test.ts:26`.
- Hand-checked quartile math: `tests/unit/account-analysis.test.ts:43`
  proves 3 top posts from 12, not a top third.
- Snapshot-stable digest JSON: `tests/unit/account-analysis.test.ts:48`.
- Profile-scoped corpus persistence and duplicate `(handle, postUrl, capturedAt)`
  skip: `tests/unit/convex-presence-insights.test.ts:45`.
- `GET /api/presence/insights` digest route:
  `tests/unit/api-presence-insights.test.ts:30`.
- Secret-gated lap route, `maxPostsPerHandle` capped to 50, Convex persistence,
  and `account-analysis.lap.posts=<n>` log:
  `tests/unit/api-presence-insights-lap.test.ts:46`.
- Unauthorized lap rejection: `tests/unit/api-presence-insights-lap.test.ts:108`.
- Strategy prompt consumption of digest:
  `tests/unit/api-presence-strategy.test.ts:345`.

## Digest JSON

Fixture digest from `tests/unit/account-analysis.test.ts:48`:

```json
{
  "postCount": 12,
  "medianEngagementByFormat": {
    "link": 6,
    "media": 63,
    "single": 37,
    "thread": 33
  },
  "medianEngagementByHook": {
    "claim": 50,
    "number-led": 52,
    "question": 25.5,
    "story": 19
  },
  "medianEngagementByLength": {
    "medium": 39,
    "short": 35
  },
  "topQuartilePostingHoursUtc": [10, 12, 13],
  "exemplarPostUrls": [
    "https://x.com/c/status/12",
    "https://x.com/c/status/9",
    "https://x.com/c/status/11",
    "https://x.com/c/status/10",
    "https://x.com/a/status/3"
  ]
}
```

## Lap trigger proof

Route under test: `POST /api/presence/insights/lap`.

Required header: `Authorization: Bearer $PRESENCE_LAP_SECRET` or
`x-aether-lap-secret: $PRESENCE_LAP_SECRET`; `CRON_SECRET` is accepted as the
secondary env name. Test proof at `tests/unit/api-presence-insights-lap.test.ts:46`
asserts:

- request body `maxPostsPerHandle: 80` reaches collector as `50`
- persisted rows are sent to `presenceInsights.upsertReferencePosts`
- log line includes `account-analysis.lap.posts=1`

## Human-only artifact

The spec asks for one real lap over 3 actual ICP handles. That was not run in
this repo session because it depends on live Xquik credentials and Ernie-owned
target handles. The fixture-backed lap route and collector are complete; the
real-handle corpus remains a human-only review artifact.

## Dependency note

No new runtime dependencies were added.

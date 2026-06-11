# Spec 06 evidence — Own-handle metrics ledger

Branch: `codex/social-06-presence-ledger`

## Commands

```bash
npm run typecheck
```

Result: passed (`tsc --noEmit`).

```bash
npx vitest run lib/research/presence-metrics.test.ts tests/unit/convex-presence-ledger.test.ts tests/unit/api-presence-ledger.test.ts tests/unit/api-presence-ledger-lap.test.ts tests/component/right-rail.sections.test.tsx
```

Result: passed, 5 files / 13 tests.

```bash
git diff --check
```

Result: passed.

## Test ids

- `lib/research/presence-metrics.test.ts`: pillar attribution joins posted draft permalinks to metric rows and falls back to `untagged`.
- `lib/research/presence-metrics.test.ts`: deterministic per-pillar rollup sorted by median engagement.
- `tests/unit/convex-presence-ledger.test.ts`: appends profile-scoped time-series snapshots; same post with a later `capturedAt` is a new row; sibling profiles do not mix.
- `tests/unit/api-presence-ledger.test.ts`: `GET /api/presence/ledger` returns snapshot-stable rollup JSON.
- `tests/unit/api-presence-ledger-lap.test.ts`: `POST /api/presence/ledger/lap` is secret-gated, caps own-handle laps to 50 posts, persists snapshots, and logs only counts/profile ids.
- `tests/component/right-rail.sections.test.tsx`: right rail renders compact metadata lines matching the fixture rollup.

## Ledger JSON

Fixture response asserted by `tests/unit/api-presence-ledger.test.ts`:

```json
{
  "ok": true,
  "workspaceId": "demo-ws",
  "profileId": "profile_personal",
  "ledger": [
    {
      "pillar": "agent harnesses",
      "posts": 2,
      "medianEngagement": 28
    },
    {
      "pillar": "untagged",
      "posts": 1,
      "medianEngagement": 15
    }
  ]
}
```

Matching right-rail screenshot: `docs/specs/2026-06-10-social-loop/evidence/06/presence-ledger-right-rail.png`.

## Curl recipes

Rollup read:

```bash
curl "https://aether-stg.berlayar.ai/api/presence/ledger?workspaceId=demo-ws&profileId=profile_personal"
```

Own-handle lap, secret-gated. Do not paste secret values into logs or PRs:

```bash
curl -X POST "https://aether-stg.berlayar.ai/api/presence/ledger/lap" \
  -H "authorization: Bearer $PRESENCE_LAP_SECRET" \
  -H "content-type: application/json" \
  --data '{
    "workspaceId": "demo-ws",
    "profileId": "profile_personal",
    "handle": "@example",
    "maxPosts": 50
  }'
```

Expected lap shape:

```json
{
  "ok": true,
  "workspaceId": "demo-ws",
  "profileId": "profile_personal",
  "postsCollected": 1,
  "persistence": {
    "inserted": 1
  }
}
```

## Security notes

- No X credentials are added. Collection reuses the existing Xquik adapter and reads only `XQUIK_API_KEY` from the environment.
- Lap invocation requires `PRESENCE_LAP_SECRET` or `CRON_SECRET`; tests assert unauthenticated requests return 401.
- Logs include row counts plus workspace/profile ids only. No raw post text, secrets, or API responses are logged.

## Human-only caveat

The spec asks for one real lap against an Ernie-owned profile handle. I did not run that from the VM because it requires real Xquik credentials and the selected real profile handle. Fixture-backed collection, persistence, attribution, rollup, API, and rail rendering are complete; the real-handle row dump remains a human-only PR artifact.

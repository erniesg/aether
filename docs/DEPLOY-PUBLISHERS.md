# Publisher deployment & validation

The publisher seam ships with three adapters:

| id | what it does | when it runs |
|---|---|---|
| `preview` | persists scheduled posts locally and deep-links to a preview overlay | always — fallback when no real publisher is configured |
| `postiz` | uploads media + creates scheduled posts via the Postiz public API | when `POSTIZ_API_KEY` and at least one `POSTIZ_INTEGRATION_<PLATFORM>` are present |
| `social-auto-upload` | future second adapter | tracked in #84 |

## Selecting a provider

Resolution order (`lib/providers/publisher/registry.ts:39`):

1. explicit `preferredId` on the call
2. env `PUBLISHER_PROVIDER`
3. fallback to `preview`

If a preferred provider is missing its credentials, the route falls through to `preview` so the demo never breaks.

## Postiz environment

```bash
PUBLISHER_PROVIDER=postiz
POSTIZ_API_KEY=<key>
POSTIZ_API_URL=https://api.postiz.com/public/v1   # override for self-hosted

# one per platform you want to fan out to
POSTIZ_INTEGRATION_INSTAGRAM=<integration-id>
POSTIZ_INTEGRATION_X=<integration-id>
POSTIZ_INTEGRATION_LINKEDIN=<integration-id>
POSTIZ_INTEGRATION_PINTEREST=<integration-id>
POSTIZ_INTEGRATION_TIKTOK=<integration-id>
POSTIZ_INTEGRATION_YOUTUBE_SHORTS=<integration-id>

# pinterest extras
POSTIZ_PINTEREST_BOARD_ID=<board-id>
POSTIZ_PINTEREST_LINK_URL=https://aether.berlayar.ai
```

## Validation gate (no real Postiz required)

The fan-out / cancellation seam is validated end-to-end against an in-process
mock so the demo claim "schedule + post to social" stays defensible even when
no real Postiz instance is hosted.

| layer | test | what it proves |
|---|---|---|
| HTTP surface | `tests/fixtures/postiz-mock-server.ts` | the Postiz endpoints `lib/providers/publisher/postiz.ts` calls (`POST /upload-from-url`, `POST /upload`, `POST /posts`, `GET /posts`, `DELETE /posts/:id`) round-trip with realistic shapes |
| schedule fan-out + DELETE | `tests/integration/postiz-sidecar.test.ts` | a 4-platform pack hits the route, the mock records 4 schedule POSTs, and a DELETE on one cancels it |
| UI fan-out | `tests/e2e/schedule-pack.spec.ts` | the publish lens turns 4 selected platforms into 4 scheduled rows, each with a `scheduled` status pill |

Run the full validation locally:

```bash
npm run typecheck
npm test
npx vitest run tests/integration/postiz-sidecar.test.ts
npx playwright test tests/e2e/schedule-pack.spec.ts
```

When a real Postiz instance comes online, point `POSTIZ_API_URL` at it and the
same integration test will exercise the same code path against the live
service.

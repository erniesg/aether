# Event recap — Context.dev provider

[Context.dev](https://context.dev) (X: [@getcontextdev](https://x.com/getcontextdev)) is a
web search + scrape API. In the recap pipeline it serves two roles:

1. **Past-event backfill.** Unlike the official X API (7-day recent-search window),
   Context.dev search accepts Google-style `after:`/`before:` operators, so it can
   surface posts for events that ended months or years ago — without an Apify paid
   plan or an Xquik key.
2. **Source-page scraping.** `scrapeUrlViaContextDev` fetches any URL as clean
   markdown (schedules, speaker pages, recap blogs) for frontier building and
   enrichment.

## Configuration

```bash
# .env.local / .dev.vars — key from https://context.dev (free tier, no card)
CONTEXT_DEV_API_KEY=ctxt_secret_...
```

`isContextDevConfigured` also accepts the SDK fallback `CONTEXT_API_KEY`.

## Usage

- **Explicit:** `refresh_event_recap` / `POST /api/events/:eventId/refresh` with
  `xProvider: "contextdev"` or `linkedinMode: "contextdev"`.
- **Automatic fallback:** for X, contextdev is tried after official/Apify/Xquik
  when configured and the earlier providers return nothing (or are skipped
  because the window is outside the official 7-day span).

## Contract & caveats

- `POST https://api.context.dev/v1/web/search` with `includeDomains`
  (`x.com`/`twitter.com` or `linkedin.com`), date-bounded query, and
  `markdownOptions.enabled` so post content arrives in one call.
- Results are whatever the web index holds: treat as a **lower-bound sample**.
  No engagement metrics, `postedAt` usually unavailable — enrichment (Apify by
  URL, capture screenshots) still applies downstream.
- Only post permalinks are kept (`/status/`, `/posts/`, `/feed/update/`,
  `/pulse/`); profiles and search pages are counted as `skippedInvalid` in `raw`.
- Credits consumed per run are summed into `raw.creditsConsumed`.

Implementation: `lib/research/event-recap/contextdev.ts` (tests alongside).

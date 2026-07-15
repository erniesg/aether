# Event recap — running past events (backfill)

The pipeline is event-date-anchored, so a past event (e.g. an earlier AI Engineer
summit) works through the same `/api/vibes` + `/api/events` surface as a live one.
What changes is **which providers can actually reach the window**.

## How the window is derived

`eventWindow` (`lib/research/event-recap/utils.ts`) computes
`[startsAt - daysBefore, endsAt + daysAfter]` from the event's **resolved dates**
(TinyFish resolution in live mode), not from the current time. A past event
therefore produces a past window automatically.

Estimates are the exception: `/api/vibes/estimate` defaults to a now-anchored
window. For past events pass the window explicitly:

```jsonc
POST /api/vibes/estimate
{
  "brief": "Recap AI Engineer World's Fair 2025 across X and LinkedIn",
  "platforms": ["x", "linkedin"],
  "windowStart": "2025-06-02T00:00:00.000Z",
  "windowEnd": "2025-06-08T00:00:00.000Z"
}
```

## Provider reachability for past windows

| Provider | Past windows? | Notes |
|---|---|---|
| Official X API | **No** — 7-day recent-search only | The pipeline now skips it automatically when the window ends outside the span (`isRecentSearchWindowReachable`). |
| Apify (X + LinkedIn) | Yes — arbitrary `start`/`end` | Needs a paid Apify plan. |
| Xquik | Yes — `sinceDate`/`untilDate` | Needs `XQUIK_API_KEY`. |
| **Context.dev** | Yes — `after:`/`before:` operators | Needs `CONTEXT_DEV_API_KEY` (free tier works). See `docs/event-recap-contextdev.md`. |
| TinyFish LinkedIn search-fetch | Partial — index recall, not date-bounded | Lower-bound sample. |
| YouTube Data API | Yes — `publishedAfter/Before` | Needs `YOUTUBE_API_KEY`. |

## Runbook: backfill a past AIE event

1. **Create + refresh** (auth: `vibes_` API key or Logto bearer):

```jsonc
POST /api/events
{
  "eventId": "aie-worlds-fair-2025",
  "name": "AI Engineer World's Fair 2025",
  "contextHint": "San Francisco AI engineering conference by @aiDotEngineer",
  "platforms": ["x", "linkedin", "youtube"],
  "daysBefore": 2,
  "daysAfter": 4,
  "liveMode": "tinyfish",
  "xProvider": "contextdev",       // or "apify" with a paid plan
  "linkedinMode": "contextdev",    // or "search-fetch" via TinyFish
  "targetItemsPerPlatform": 100
}
```

2. **Review the run** at `/events/aie-worlds-fair-2025` (run-event timeline shows
   resolve → budget → collect → cluster stages).

3. **Iterate** with `POST /api/events/aie-worlds-fair-2025/refresh` using
   `extraQuerySet` from the expansion plan; dedupe is automatic
   (`dedupeAgainstExisting` defaults to on).

4. **Curate (optional).** Story overrides / atlas lanes live in an `EventConfig`
   (`lib/research/event-recap/event-config.ts`). Unregistered events run with
   generic clustering; register a config only when you want curated stories like
   `aie-2026`.

5. **Publish.** Generic serving needs no bespoke worker: push
   `event-recap-<eventId>/public.json` to R2 and `workers/event-recap-vibes.ts`
   serves `/vibes/<eventId>`. Bespoke treatment → clone `workers/aie2026-vibes.ts`.

## Known limits

- Posts recovered via Context.dev carry no engagement metrics and usually no
  `postedAt`; relevance/story assignment still works off text, but reach-weighted
  ranking will undercount them until enriched (e.g. Apify by URL).
- LinkedIn recall for old windows is a lower bound on every provider.
- X official counts (`/api/vibes/estimate`) cannot cover past windows; expect
  estimate warnings for X on old events.
